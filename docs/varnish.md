# Varnish and caching

Hyperion is designed for Magento's full page cache in Varnish mode. The
reference VCL ships in
`app/code/Magentofullstackdev/HyperionCore/etc/varnish/default.vcl`
(`vendor/magentofullstackdev/module-hyperion-core/etc/varnish/default.vcl`
after a Composer install). It is based on the VCL Magento generates for
Varnish and extended for Hyperion's edge composition. Varnish 7.4 to 8.x tested; the VCL is `vcl 4.1` and uses only `std`; 6.0 LTS untested.

## How caching works

- **Varnish caches HTML, browsers never do.** Every cacheable page and
  fragment leaves Varnish with `Cache-Control: no-store, no-cache,
  must-revalidate, max-age=0`, `Pragma: no-cache` and `Expires: -1` (only
  responses marked `private` and `/media/`, `/static/` are exempt). Varnish
  keeps its own copy for the TTL Magento sends, so a BAN takes effect for
  every visitor at once and no browser or downstream proxy holds a stale page
  or a page rendered for another customer group.
- **`X-Magento-Vary`** is part of the cache key (`vcl_hash`), so currency,
  customer group and login state get their own cache entries, exactly like
  core. Hyperion's own controllers set the store and currency context, so
  the vary cookie survives the header state request.
- **The top menu is an ESI fragment.** The VCL advertises
  `Surrogate-Capability: varnish=ESI/1.0` to the backend on every request;
  `HyperionCore\Block\EsiFragment` then emits `<esi:include>` for the desktop
  menu, served by `/hyperion/navigation/menu` with its own TTL (3600 s) and
  `X-Magento-Tags`. Without Varnish the same block renders the menu inline.
  The header the client sends is overwritten by the VCL, so a visitor cannot
  ask the origin for an ESI response.
- **Session state is one request.** Cached pages carry empty placeholders
  for the account menu, wishlist / compare counts, mini-cart count and the
  Login as Customer banner. The header issues a single `hx-get` to
  `/hyperion/header/state`, answered `private, no-store`, and every fragment
  comes back as an out-of-band swap. Nothing session-bound is ever stored in
  Varnish.
- **Public fragments** (`/hyperion/navigation/menu`, `/hyperion/category/filter`,
  `/hyperion/catalog/search`, `/hyperion/search/suggest`) contain no session data, are registered in
  `PublicRouteRegistry`, and are cached with the TTL their `Cache-Control`
  carries (the search suggestions for an hour, keyed by the normalized query
  and the `X-Magento-Vary` cookie). Their `Set-Cookie` headers are stripped by
  the VCL.
- **Private fragments** (`/hyperion/minicart/fragment`, the mini-cart drawer
  body, and `/hyperion/header/state`) are passed straight to the backend,
  like `/customer` and `/checkout`.
- **Query string sorting** (`std.querysort`): `?color=49&size=168` and
  `?size=168&color=49` are one cache object, so filter permutations cannot
  multiply the cache entries of a category page.
- **A degraded response is never stored.** When a price cannot be rendered
  or the search engine does not answer, the request is marked degraded: the
  page or fragment leaves PHP as private, the listing fragments and the
  search suggestions answer a "try again" message, and neither Varnish, the
  block cache nor the suggest cache keeps it. The full category or search
  page with the engine fully down still answers the platform's uncached
  error page.
- **ESI parsing** is enabled for responses flagged `X-Esi: 1` by
  `EsiMarkerPlugin` and, as in stock Magento, for any text response.

## The VCL

Two places need editing before use; both are marked `ADAPT` in the file.

**Backend.** `backend default` ships with the example values `web` / `8080`
(the service name and port of a docker compose stack). Set the host and port
of the web server that runs Magento. The health probe hits
`/health_check.php` every 5 s (window 10, threshold 5) and leaves `.initial`
at Varnish's default, so one good poll after a start or a VCL load marks the
backend healthy; a probe that starts further below the threshold answers 503
for several seconds after every reload.

**Purge ACL.** The `purge` ACL decides who may send `PURGE` (a cache BAN).
It ships as:

```vcl
acl purge {
    "localhost";
    "127.0.0.1";
    # ADAPT: your Magento hosts, for example:
    # "192.0.2.10";
}
```

List only the hosts that run Magento (PHP), one address per line. Never add
a whole private range and never add the TLS proxy or load balancer in front
of Varnish: requests relayed by it carry its address, which would let any
visitor wipe the cache with `PURGE` plus `X-Magento-Tags-Pattern: .*`. Also
reject the method at the edge; for nginx:

```nginx
if ($request_method = PURGE) { return 405; }
```

With that rule a `PURGE` sent through the public host answers 405 while
purges from Magento (`cache:flush`, `cache:clean full_page`, product save)
still reach Varnish.

Give every `location` that proxies to Varnish response buffers above
nginx's default (one memory page, usually 4k): a Magento response carries
a `Content-Security-Policy` header of about 4 KB plus the session, form
key and message cookies, and a failed login or an admin page answers
`502 Bad Gateway` ("upstream sent too big header") with the default.
Magento's own `nginx.conf.sample` raises the FastCGI buffers for the same
reason; the TLS edge needs the proxy equivalent:

```nginx
proxy_buffer_size 32k;
proxy_buffers 8 32k;
proxy_busy_buffers_size 64k;
```

Magento side:

```bash
bin/magento config:set system/full_page_cache/caching_application 2
bin/magento setup:config:set --http-cache-hosts=<varnish host>:<port>
bin/magento cache:flush
```

`http-cache-hosts` is where Magento sends its `PURGE` requests.

Other behavior worth knowing: objects have a grace of 3 days (`beresp.grace`),
but `vcl_hit` serves an expired object for at most 300 s past its TTL while
the backend is healthy (the next request fetches a fresh copy); the whole
grace is used only while the health probe marks the backend sick, the same
shape as Magento's own VCL. Marketing query parameters are stripped from the
URL before hashing, so a campaign link shares the cache object of the plain
URL: `gad_source`, `gad_campaignid`, `gbraid`, `wbraid`, `_gl`, `dclid`,
`gclsrc`, `srsltid`, `msclkid`, `gclid`, `ttclid`, `twclid`, `li_fat_id`,
`igshid`, `epik`, `yclid`, `cx`, `_kx`, `ie`, `cof`, `siteurl`, `zanpid`,
`origin`, `fbclid`, `mc_*`, `utm_*` and `_bta_*` (the list of core 2.4.9 plus
`gad_campaignid`, `ttclid`, `twclid`, `li_fat_id`, `igshid`, `epik` and
`yclid`). The PHP side reads the same list
(`HyperionCore\Model\Http\MarketingParameters`, kept in step with the VCL by
a unit test), so these parameters never count against the filter guard or
the rate limiter. A store that runs a copy of the VCL regenerates it from the
shipped file after an upgrade that changes the list. Server
identification headers (`Server`, `X-Powered-By`, `Via`, `X-Varnish`,
`X-Magento-Tags`, `X-Esi`) are removed on delivery, and so are the Hyperion markers (`X-Hyperion-Fragment`, `X-Hyperion-Edge-Cache`, `X-Hyperion-Suggest-Cache`) and `X-Magento-Cache-Control`, unless the exchange is a debug one: the origin flagged the response `X-Magento-Debug: 1` (Magento developer mode) or the request carried an `X-Magento-Debug` header; the `X-Magento-Cache-Debug` verdict is only set on such an exchange. `Age` stays (stripping it changed the browsers' freshness arithmetic for assets and cost a layout shift on warm reloads). A visitor therefore learns
neither which URLs are Hyperion fragments nor whether an object was a hit;
the e2e scripts under `frontend/e2e/` send the request header to verify the
cache layers.

## What to check

```bash
curl -sI -H 'X-Magento-Debug: 1' https://your-store.example/ | grep -i x-magento-cache-debug
```

Without the `X-Magento-Debug` request header the verdict is only delivered
when Magento runs in developer mode.

| Value | Meaning |
|---|---|
| `MISS` | fetched from Magento and stored; the next request should be a `HIT` |
| `HIT` | served by Varnish |
| `UNCACHEABLE` | not stored: session pages (`/customer`, `/checkout`, cart), private fragments, POST responses, pages with a `cacheable="false"` block, error responses |

Expected: home, category, product and CMS pages `MISS` then `HIT`; cart,
checkout, account pages and `/hyperion/header/state` `UNCACHEABLE`. Check
session-bound behavior both as a guest and as a logged-in customer; a page
that looks right for guests can still be wrong for customers.

If the backend has been unavailable (deployment in progress) and Varnish
stored an error page rendered with HTTP 200 and no tags, `cache:flush`
cannot remove it: ban everything once from the Varnish host
(`varnishadm ban 'req.url ~ .'`).

Behind Varnish PHP's peer is the Varnish address, so tell the anti-abuse
shield which proxies may set `X-Forwarded-For`
(`hyperion/security/trusted_proxies`: Varnish and the TLS terminator). While
the list is empty the rate limiter keys its budget on the proxy address plus
the forwarded address left after skipping the proxy itself, the literal IPs
of `http_cache_hosts` and at most one more hop in the proxy's /24 (IPv6: /64),
and a public peer is taken as the client with the header ignored. That
fallback guesses the topology: two undeclared hops share one bucket, and a
private client talking straight to an exposed Varnish can choose its bucket
with a forged prefix. Set the list in production; see
[Configuration](./configuration.md).

## Invalidation

- Every cacheable response carries `X-Magento-Tags` (`cat_p_<id>`,
  `cat_c_<id>`, `cms_p_<id>`, ...). A `PURGE` with `X-Magento-Tags-Pattern`
  bans every object whose tags match the pattern.
- The listing fragments (`/hyperion/category/filter`,
  `/hyperion/catalog/search`) carry the identities of the list block, so the
  category's product tag (`cat_c_p_<id>`) is among them next to the product
  tags (at most 1000 `cat_p_<id>` per response): a change of the category's
  products purges the fragments with the page.
- Core's `clean_cache_by_tags` path (the `Magento_CacheInvalidate` observer)
  purges on product, category and CMS saves, including repository saves from
  imports and API writes, and on `cache:clean full_page`. Hyperion sends its
  own tags down the same path (the mega menu on a menu save, the search
  suggestions below); it never purges by any other route.
- The search suggestions (`/hyperion/search/suggest`) carry
  `HYPERION_SEARCH_SUGGEST` next to the product and category tags they show.
  That tag is cleaned in the application cache and in Varnish whenever the
  `catalogsearch_fulltext` indexer runs (a product save in "Update on Save",
  the cron in "Update by Schedule", `indexer:reindex`), when a category is
  saved or deleted, and when the Hyperion Search configuration is saved: a
  query that was answered before a product existed shows it after the
  reindex.
- Image conversion (`HyperionImage`) invalidates by product tag: at the end
  of a consumer run or of `hyperion:image:convert` the converted files are
  mapped back to their products and only `cat_p_<id>` is cleaned
  (`hyperion_image/general/invalidate_on_batch_end`, default 1). Images that
  belong to no product are picked up when the page expires. The cache is
  never flushed as a whole by a background job.
- The ESI menu fragment carries category tags, so a category save refreshes
  the menu without touching the pages that include it.
