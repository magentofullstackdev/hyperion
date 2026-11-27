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
 * The list is the `paths` argument, declared in etc/frontend/di.xml only
 * (an argument of the same name in another scope would replace it), so a new
 * htmx endpoint opts in with one item. A prefix matches on a path segment
 * boundary: `/hyperion/category/filter` matches itself and
 * `/hyperion/category/filter/id/5`, never `/hyperion/category/filterx`.
 *
 * @api
 * @since 0.9.0
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
     * Returns true when the given request path is a registered prefix or
     * continues it with a new path segment. Empty or invalid input returns
     * false defensively.
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
            if ($this->matchesPrefix($pathInfo, $prefix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * The registered path prefixes.
     *
     * @return string[]
     */
    public function getPaths(): array
    {
        return array_values(array_filter($this->paths, 'is_string'));
    }

    /**
     * A prefix ending with "/" is a segment boundary already; any other one
     * matches the exact path or the path followed by "/".
     *
     * @param string $pathInfo
     * @param string $prefix
     * @return bool
     */
    private function matchesPrefix(string $pathInfo, string $prefix): bool
    {
        if (str_ends_with($prefix, '/')) {
            return str_starts_with($pathInfo, $prefix);
        }

        return $pathInfo === $prefix || str_starts_with($pathInfo, $prefix . '/');
    }
}
