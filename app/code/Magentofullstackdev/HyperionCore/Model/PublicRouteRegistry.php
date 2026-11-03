<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model;

/**
 * Registry of request path prefixes that Hyperion considers "public" for
 * shared-cache purposes. Any request matching one of these prefixes must:
 *
 *   * NOT receive PHP's default session_cache_limiter=nocache headers
 *     (Pragma / Cache-Control: no-store / Expires: -1), because Magento
 *     session middleware otherwise overrides our controller-set
 *     `Cache-Control: public, s-maxage=...` header.
 *
 *   * Be permitted to set a public, edge-cacheable `Cache-Control` via
 *     Magentofullstackdev\HyperionCore\Model\CacheHeaders::applyPublic().
 *
 * The list is wired by DI in etc/di.xml so new HTMX endpoints can opt in
 * without code changes.
 */
class PublicRouteRegistry
{
    /**
     * @param string[] $paths Path-info prefixes (must start with "/").
     */
    public function __construct(
        private readonly array $paths = []
    ) {
    }

    /**
     * Returns true when the given request path starts with any registered
     * prefix. Empty or invalid input returns false defensively.
     *
     * @param string $pathInfo
     * @return bool
     */
    public function matches(string $pathInfo): bool
    {
        if ($pathInfo === '' || $pathInfo[0] !== '/') {
            return false;
        }
        foreach ($this->paths as $prefix) {
            if (!is_string($prefix) || $prefix === '') {
                continue;
            }
            if (str_starts_with($pathInfo, $prefix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return string[]
     */
    public function getPaths(): array
    {
        return array_values(array_filter($this->paths, 'is_string'));
    }
}
