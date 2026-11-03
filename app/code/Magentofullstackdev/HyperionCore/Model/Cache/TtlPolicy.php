<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Model\Cache;

/**
 * Central TTL registry for Hyperion ESI fragment caching.
 *
 * A TTL of 0 means the fragment must never enter a shared cache (private data).
 * Pass the constant to CacheHeaders::applyPrivate() for those fragments, and
 * CacheHeaders::applyPublic($ttl) for any positive TTL value.
 */
class TtlPolicy
{
    public const FRAGMENT_PDP          = 'pdp';
    public const FRAGMENT_CATEGORY     = 'category';
    public const FRAGMENT_CMS          = 'cms';
    public const FRAGMENT_SEARCH       = 'search';
    public const FRAGMENT_NAVIGATION   = 'navigation';
    public const FRAGMENT_CART_COUNT     = 'cart_count';
    public const FRAGMENT_MINI_CART      = 'mini_cart';
    public const FRAGMENT_ACCOUNT_MENU   = 'account_menu';
    public const FRAGMENT_WISHLIST_COUNT = 'wishlist_count';
    public const FRAGMENT_COMPARE_COUNT   = 'compare_count';

    /**
     * TTL in seconds for each fragment type.
     * 0 = private / must not be shared-cached.
     */
    private const TTL_MAP = [
        self::FRAGMENT_PDP => 1800,
        self::FRAGMENT_CATEGORY => 900,
        self::FRAGMENT_CMS => 86400,
        self::FRAGMENT_SEARCH => 300,
        self::FRAGMENT_NAVIGATION => 3600,
        self::FRAGMENT_CART_COUNT => 0,
        self::FRAGMENT_MINI_CART => 0,
        self::FRAGMENT_ACCOUNT_MENU => 0,
        self::FRAGMENT_WISHLIST_COUNT => 0,
        self::FRAGMENT_COMPARE_COUNT => 0,
    ];

    /**
     * Return the cache TTL in seconds for the given fragment identifier.
     *
     * @throws \InvalidArgumentException When the fragment key is unknown.
     */
    public function getTtl(string $fragment): int
    {
        if (!array_key_exists($fragment, self::TTL_MAP)) {
            throw new \InvalidArgumentException(
                sprintf('Unknown fragment type "%s" in TtlPolicy.', $fragment)
            );
        }

        return self::TTL_MAP[$fragment];
    }

    /**
     * Return true when the fragment must be treated as private (TTL = 0).
     */
    public function isPrivate(string $fragment): bool
    {
        return $this->getTtl($fragment) === 0;
    }
}
