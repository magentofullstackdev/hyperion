# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
vcl 4.1;

# =============================================================================
# Hyperion reference Varnish VCL (Varnish 6.x / 7.x, Magento 2.4)
#
# Based on the VCL Magento generates for Varnish 6+ and extended for
# Hyperion's edge composition:
#
#   * Surrogate-Capability is advertised to the backend so
#     Magentofullstackdev\HyperionCore\Block\EsiFragment emits <esi:include>
#     instead of rendering inline.
#   * ESI parsing is enabled for responses flagged X-Esi: 1 by
#     Magentofullstackdev\HyperionCore\Plugin\Framework\App\Response\EsiMarkerPlugin
#     (and, like stock Magento, for any text response).
#   * Hyperion's private fragment endpoints (/hyperion/minicart/fragment,
#     /hyperion/header/state) are passed through; its public fragments
#     (/hyperion/navigation/menu, /hyperion/category/filter,
#     /hyperion/catalog/search, /hyperion/search/suggest) are cached with the TTL their Cache-Control
#     carries, and the query string is sorted before hashing.
#   * Tag-based BAN purging keyed on X-Magento-Tags (Magento's
#     X-Magento-Tags-Pattern PURGE, sent by core's CacheInvalidate observer
#     on every clean_cache_by_tags: product, category and CMS saves,
#     repository writes, cache:clean full_page).
#   * Stale objects are served for at most 300 s past their TTL while the
#     origin is healthy (vcl_hit, same shape as Magento's VCL); the whole
#     grace of 3 days is used only while the health probe marks it sick.
#   * The cache verdict (X-Magento-Cache-Debug, Grace) and Hyperion's
#     internal markers (X-Hyperion-Fragment, X-Hyperion-Edge-Cache,
#     X-Hyperion-Suggest-Cache, X-Magento-Cache-Control) reach the client
#     only on a debug exchange: the origin flagged the response
#     X-Magento-Debug: 1 (Magento developer mode) or the request carried an
#     X-Magento-Debug header. The e2e scripts in frontend/e2e send that
#     request header to verify the cache layers; every other response
#     leaves vcl_deliver without those headers, so a visitor learns neither
#     which URLs are fragments nor whether an object was a hit.
#
# Before use: adapt `backend default` (host, port) to your origin and add
# your Magento hosts to the `purge` ACL. Magento must run with
# system/full_page_cache/caching_application = 2 and http_cache_hosts
# pointing at this Varnish.
#
# Browsers never cache HTML or fragments served through this VCL: only
# Varnish keeps them, so a BAN takes effect for every visitor at once.
# =============================================================================

import std;

# ADAPT: host and port of the web server that runs Magento. "web" / "8080"
# are example values (the service name and port of a docker compose stack).
backend default {
    .host = "web";
    .port = "8080";
    .first_byte_timeout = 600s;
    .probe = {
        .url = "/health_check.php";
        .timeout = 2s;
        .interval = 5s;
        .window = 10;
        .threshold = 5;
        .initial = 2;
    }
}

# Hosts allowed to send PURGE (cache BAN) requests. List ONLY the hosts that
# run Magento (PHP), one address per line. Never add a whole private range
# and never add the TLS proxy / load balancer in front of Varnish: requests
# relayed by it carry its address, which would let any visitor wipe the cache.
# Also reject the method at the edge, for nginx:
#     if ($request_method = PURGE) { return 405; }
acl purge {
    "localhost";
    "127.0.0.1";
    # ADAPT: your Magento hosts, for example:
    # "192.0.2.10";
}

sub vcl_recv {
    # Tell the origin this edge can assemble ESI fragments.
    set req.http.Surrogate-Capability = "varnish=ESI/1.0";

    # Grace usage of this request, reported as the Grace header on debug
    # exchanges (set by vcl_hit).
    set req.http.grace = "none";

    if (req.restarts > 0) {
        set req.hash_always_miss = true;
    }

    if (req.method == "PURGE") {
        if (client.ip !~ purge) {
            return (synth(405, "Method not allowed"));
        }
        if (!req.http.X-Magento-Tags-Pattern && !req.http.X-Pool) {
            return (synth(400, "X-Magento-Tags-Pattern or X-Pool header required"));
        }
        if (req.http.X-Magento-Tags-Pattern) {
            ban("obj.http.X-Magento-Tags ~ " + req.http.X-Magento-Tags-Pattern);
        }
        if (req.http.X-Pool) {
            ban("obj.http.X-Pool ~ " + req.http.X-Pool);
        }
        return (synth(200, "Purged"));
    }

    if (req.method != "GET" && req.method != "HEAD" &&
        req.method != "PUT" && req.method != "POST" &&
        req.method != "TRACE" && req.method != "OPTIONS" &&
        req.method != "DELETE") {
        return (pipe);
    }

    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }

    # Session-bound Magento areas.
    if (req.url ~ "/customer" || req.url ~ "/checkout" || req.url ~ "^/(pub/)?admin(/|$)") {
        return (pass);
    }

    # Hyperion private fragments: session data, never shared. Their
    # Cache-Control is already private/no-store; the explicit pass saves
    # the hit-for-pass object. The search suggestions (/hyperion/search/)
    # are public and cached like the other public fragments.
    if (req.url ~ "^/(pub/)?hyperion/(minicart|header)/") {
        return (pass);
    }

    if (req.url ~ "^/(pub/)?(health_check.php)$") {
        return (pass);
    }

    set req.url = regsub(req.url, "^http[s]?://", "");
    std.collect(req.http.Cookie);

    if (req.url ~ "(\?|&)(gclid|cx|ie|cof|siteurl|zanpid|origin|fbclid|mc_[a-z]+|utm_[a-z]+|_bta_[a-z]+)=") {
        set req.url = regsuball(req.url, "(gclid|cx|ie|cof|siteurl|zanpid|origin|fbclid|mc_[a-z]+|utm_[a-z]+|_bta_[a-z]+)=[-_A-z0-9+()%.]+&?", "");
        set req.url = regsub(req.url, "[?|&]+$", "");
    }

    # One cache object per filter combination, whatever the parameter order:
    # ?color=49&size=168 and ?size=168&color=49 hash the same.
    set req.url = std.querysort(req.url);

    if (req.url ~ "^/(pub/)?(media|static)/") {
        return (pass);
    }

    if (req.url ~ "/graphql" && !req.http.X-Magento-Cache-Id && req.http.Authorization ~ "^Bearer") {
        return (pass);
    }

    return (hash);
}

sub vcl_hash {
    if ((req.url !~ "/graphql" || !req.http.X-Magento-Cache-Id) && req.http.cookie ~ "X-Magento-Vary=") {
        hash_data(regsub(req.http.cookie, "^.*?X-Magento-Vary=([^;]+);*.*$", "\1"));
    }
    if (req.http.X-Forwarded-Proto) {
        hash_data(req.http.X-Forwarded-Proto);
    }
    if (req.url ~ "/graphql") {
        if (req.http.X-Magento-Cache-Id) {
            hash_data(req.http.X-Magento-Cache-Id);
            if (req.http.Authorization ~ "^Bearer") {
                hash_data("Authorized");
            }
        }
        if (req.http.Store)            { hash_data(req.http.Store); }
        if (req.http.Content-Currency) { hash_data(req.http.Content-Currency); }
    }
}

sub vcl_hit {
    if (obj.ttl >= 0s) {
        # Hit within TTL period
        return (deliver);
    }
    if (std.healthy(req.backend_hint)) {
        if (obj.ttl + 300s > 0s) {
            # Hit after TTL expiration, but within grace period
            set req.http.grace = "normal (healthy server)";
            return (deliver);
        } else {
            # Hit after TTL and grace expiration
            return (restart);
        }
    } else {
        # server is not healthy, retrieve from cache
        set req.http.grace = "unlimited (unhealthy server)";
        return (deliver);
    }
}

sub vcl_backend_response {
    set beresp.grace = 3d;

    # ESI: parse objects the origin flagged, plus any text response (stock
    # Magento behaviour) so third-party ESI markup keeps working.
    if (beresp.http.X-Esi == "1" || beresp.http.content-type ~ "text") {
        set beresp.do_esi = true;
    }
    if (bereq.url ~ "\.js$" || beresp.http.content-type ~ "text") {
        set beresp.do_gzip = true;
    }
    # Debug exchange (see the header of this file): keep the origin's
    # Cache-Control visible next to the one vcl_deliver rewrites.
    if (beresp.http.X-Magento-Debug || bereq.http.X-Magento-Debug) {
        set beresp.http.X-Magento-Cache-Control = beresp.http.Cache-Control;
    }

    if ((beresp.status != 200 && beresp.status != 404) || beresp.http.Cache-Control ~ "private") {
        set beresp.uncacheable = true;
        set beresp.ttl = 86400s;
        return (deliver);
    }

    if (beresp.ttl > 0s && (bereq.method == "GET" || bereq.method == "HEAD")) {
        std.collect(beresp.http.set-cookie);
        if ((bereq.url !~ "/graphql" || !bereq.http.X-Magento-Cache-Id)
         && bereq.http.cookie !~ "X-Magento-Vary="
         && beresp.http.set-cookie ~ "X-Magento-Vary=") {
            set beresp.ttl = 0s;
            set beresp.uncacheable = true;
        }
        unset beresp.http.set-cookie;
    }

    if (beresp.ttl <= 0s ||
        beresp.http.Surrogate-control ~ "no-store" ||
        (!beresp.http.Surrogate-Control && beresp.http.Cache-Control ~ "no-cache|no-store") ||
        beresp.http.Vary == "*") {
        set beresp.ttl = 120s;
        set beresp.uncacheable = true;
    }

    if (bereq.url ~ "/graphql" && bereq.http.X-Magento-Cache-Id && bereq.http.X-Magento-Cache-Id != beresp.http.X-Magento-Cache-Id) {
        set beresp.ttl = 0s;
        set beresp.uncacheable = true;
    }
    return (deliver);
}

sub vcl_deliver {
    # Cacheable HTML and fragments live in Varnish only. Browsers and
    # downstream proxies must not store them: a BAN cannot reach those copies
    # and they do not know the X-Magento-Vary cookie.
    if (resp.http.Cache-Control !~ "private"
        && req.url !~ "^/(pub/)?(media|static)/") {
        set resp.http.Pragma = "no-cache";
        set resp.http.Expires = "-1";
        set resp.http.Cache-Control = "no-store, no-cache, must-revalidate, max-age=0";
    }

    # The cache verdict and Hyperion's internal markers are delivered only
    # on a debug exchange: the origin flagged the response X-Magento-Debug: 1
    # (Magento developer mode) or the client sent an X-Magento-Debug request
    # header (the e2e scripts in frontend/e2e do, to verify the cache
    # layers). Everyone else gets neither the verdict (timing-free cache
    # probing) nor the markers (they name the Hyperion fragment URLs).
    if (req.http.X-Magento-Debug || resp.http.X-Magento-Debug) {
        if (obj.uncacheable) {
            set resp.http.X-Magento-Cache-Debug = "UNCACHEABLE";
        } else if (obj.hits) {
            set resp.http.X-Magento-Cache-Debug = "HIT";
            set resp.http.Grace = req.http.grace;
        } else {
            set resp.http.X-Magento-Cache-Debug = "MISS";
        }
    } else {
        # Age stays: stripping it changes the browsers' freshness arithmetic for the
        # assets routed through this cache and costs a measurable layout shift on
        # warm reloads.
        unset resp.http.X-Hyperion-Fragment;
        unset resp.http.X-Hyperion-Edge-Cache;
        unset resp.http.X-Hyperion-Suggest-Cache;
        unset resp.http.X-Magento-Cache-Control;
    }

    unset resp.http.X-Magento-Debug;
    unset resp.http.X-Magento-Tags;
    unset resp.http.X-Esi;
    unset resp.http.X-Powered-By;
    unset resp.http.Server;
    unset resp.http.X-Varnish;
    unset resp.http.Via;
    unset resp.http.Link;
}
