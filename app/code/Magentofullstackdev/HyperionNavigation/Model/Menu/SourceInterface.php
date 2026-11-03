<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionNavigation\Model\Menu;

/**
 * A source of the top navigation markup. The Topmenu block asks the pool
 * for the first source that applies to the current store and device and
 * renders the category tree when none does, so an installed source (the
 * mega menu module) replaces the navigation only where a merchant
 * configured one.
 */
interface SourceInterface
{
    public const DEVICE_DESKTOP = 'desktop';
    public const DEVICE_MOBILE = 'mobile';

    /**
     * Whether this source has a menu for the current store and the device.
     */
    public function isApplicable(string $device): bool;

    /**
     * The menu markup: the same contract as the category tree
     * (`[data-hyperion-topmenu]` root, `[data-hyperion-submenu]` nested
     * lists, the mobile toggle button), fully escaped.
     */
    public function getHtml(string $device): string;

    /**
     * Cache identities of the rendered menu (block cache tags and the
     * X-Magento-Tags of the navigation fragment). Asked of EVERY source,
     * applicable or not: a source that does not apply yet returns the tags
     * that would make it apply (a first group being saved), so the menus
     * cached without it are purged when it starts to apply.
     *
     * @return string[]
     */
    public function getIdentities(string $device): array;

    /**
     * Extra cache key parts (the group id, ...), so two sources never share a block cache entry.
     *
     * @return string[]
     */
    public function getCacheKeyInfo(string $device): array;
}
