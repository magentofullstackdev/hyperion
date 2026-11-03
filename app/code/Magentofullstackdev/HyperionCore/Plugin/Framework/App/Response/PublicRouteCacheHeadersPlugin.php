<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Plugin\Framework\App\Response;

use Magento\Framework\App\Response\Http as HttpResponse;
use Psr\Log\LoggerInterface;

/**
 * Belt-and-braces guarantee that public HTMX fragment responses leave the
 * origin with a strict `Cache-Control: public, s-maxage=...` and nothing else.
 *
 * The session cache_limiter bypass in
 * Magentofullstackdev\HyperionCore\Plugin\Framework\Session\PublicRouteCacheLimiterPlugin is
 * sufficient in isolation, but defense in depth matters here -- if a third
 * party extension adds a post-session hook that re-emits nocache headers,
 * or a deploy accidentally resets session.cache_limiter, we do NOT want
 * Varnish to silently start passing on every category filter request.
 *
 * The controller signals "this response is publicly cacheable" by emitting
 * the `X-Hyperion-Public-Cache: <ttl>` marker header (set by
 * Magentofullstackdev\HyperionCore\Model\CacheHeaders::applyPublic()). This plugin reads the
 * marker at sendResponse time and:
 *
 *   1. Clears any competing Pragma / Expires / Cache-Control values that
 *      Magento's own layers have stacked onto the response (Laminas
 *      headers AND PHP's internal header() buffer).
 *   2. Writes the single authoritative Cache-Control + Pragma: cache pair.
 *   3. Strips the internal marker so it never leaks to the client.
 */
class PublicRouteCacheHeadersPlugin
{
    private const MARKER_HEADER = 'X-Hyperion-Public-Cache';

    public function __construct(
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Runs immediately before the response bytes are written to the wire.
     *
     * @param HttpResponse $subject
     * @return array<int, mixed>
     */
    public function beforeSendResponse(HttpResponse $subject): array
    {
        try {
            $marker = $subject->getHeader(self::MARKER_HEADER);
            if (!$marker) {
                return [];
            }

            $ttl = (int) $marker->getFieldValue();
            if ($ttl <= 0) {
                $subject->clearHeader(self::MARKER_HEADER);
                return [];
            }

            // PHP's internal header buffer -- header_remove() is the only way
            // to drop PHP-set headers that Laminas does not know about.
            if (!headers_sent()) {
                header_remove('Pragma');
                header_remove('Expires');
                header_remove('Cache-Control');
            }

            // Laminas header collection -- clearHeader then setHeader(replace)
            // guarantees a single authoritative value on the response.
            $subject->clearHeader('Pragma');
            $subject->clearHeader('Expires');
            $subject->clearHeader('Cache-Control');

            $subject->setHeader(
                'Cache-Control',
                sprintf('public, max-age=%d, s-maxage=%d', $ttl, $ttl),
                true
            );

            // Internal marker is not part of the API surface; strip it.
            $subject->clearHeader(self::MARKER_HEADER);
        } catch (\Throwable $e) {
            // Never break response send -- worst case the client sees a
            // mixed Cache-Control which Varnish will treat as uncacheable.
            $this->logger->warning(
                'Hyperion PublicRouteCacheHeadersPlugin failed -- ' . $e->getMessage()
            );
        }

        return [];
    }
}
