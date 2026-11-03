<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model;

use Magento\Framework\Controller\Result\Raw;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;

/**
 * Applies cache-control headers to Raw HTMX fragment responses.
 *
 * Session-specific fragments (cart count, mini-cart, add-to-cart response) must
 * never be stored by shared caches such as Varnish or a CDN. A stale, shared
 * mini-cart would leak another customer's data.
 */
class CacheHeaders
{
    public function __construct(
        private readonly DegradedResponse $degradedResponse
    ) {
    }

    /**
     * Mark the response as private and non-cacheable.
     *
     * Used for anything that depends on the current session: cart count,
     * mini-cart contents, customer dashboard fragments, etc.
     */
    public function applyPrivate(Raw $result): Raw
    {
        $result->setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate', true);
        $result->setHeader('Pragma', 'no-cache', true);
        $result->setHeader('Expires', '0', true);
        return $result;
    }

    /**
     * Mark the response as publicly cacheable at Varnish/CDN for the given TTL (seconds).
     *
     * Used for session-agnostic fragments such as navigation menus, category listings,
     * PDPs, and CMS content.
     *
     * The `X-Hyperion-Public-Cache` marker is the internal signal read by
     * Magentofullstackdev\HyperionCore\Plugin\Framework\App\Response\PublicRouteCacheHeadersPlugin
     * just before sendResponse, which strips any competing Pragma/Expires
     * and asserts the final Cache-Control so Magento session middleware
     * cannot override us. The marker is stripped before the response hits
     * the wire.
     */
    public function applyPublic(Raw $result, int $ttlSeconds): Raw
    {
        // A fragment that printed a fallback is shown once and never stored.
        if ($this->degradedResponse->isDegraded()) {
            return $this->applyPrivate($result);
        }
        $result->setHeader(
            'Cache-Control',
            sprintf('public, max-age=%d, s-maxage=%d', $ttlSeconds, $ttlSeconds),
            true
        );
        // Internal marker read by
        // Magentofullstackdev\HyperionCore\Plugin\Framework\App\Response\PublicRouteCacheHeadersPlugin
        // just before sendResponse.
        $result->setHeader('X-Hyperion-Public-Cache', (string) $ttlSeconds, true);
        // Diagnostic marker of a public Hyperion fragment (the origin's
        // Cache-Control is authoritative for Varnish). The VCL unsets it in
        // vcl_deliver, together with the other internal headers, unless the
        // exchange is a debug one (X-Magento-Debug on the request or the
        // response), so it never leaks to the public wire.
        $result->setHeader('X-Hyperion-Edge-Cache', '1', true);
        return $result;
    }
}
