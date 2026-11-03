<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model;

use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Model\AbstractModel;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group as GroupResource;

/**
 * A menu group: the tree of items rendered for the websites and devices it
 * is assigned to. Saving or deleting one cleans the `hyperion_megamenu`
 * tags (block cache, page cache and Varnish through core's
 * `clean_cache_by_tags` event).
 */
class Group extends AbstractModel implements IdentityInterface
{
    public const CACHE_TAG = 'hyperion_megamenu';
    public const GROUP_CACHE_TAG = 'hyperion_megamenu_g';

    public const TYPE_MEGA_HORIZONTAL = 'mega-horizontal';
    public const TYPE_H_LIST = 'h-list';
    public const TYPE_V_LIST = 'v-list';

    public const DEVICES_BOTH = 'both';
    public const DEVICES_DESKTOP = 'desktop';
    public const DEVICES_MOBILE = 'mobile';

    public const ALL_WEBSITES = 0;

    protected $_eventPrefix = 'hyperion_megamenu_group';

    /**
     * The default cache frontend cleans this tag on save / delete (cleanModelCache):
     * every block cache entry of a menu carries it (block_html shares the frontend).
     *
     * @var string
     */
    protected $_cacheTag = self::CACHE_TAG;

    protected function _construct(): void
    {
        $this->_init(GroupResource::class);
    }

    /**
     * @return string[]
     */
    public function getIdentities()
    {
        return [self::CACHE_TAG, self::GROUP_CACHE_TAG . '_' . (int) $this->getId()];
    }

    public function getIdentifier(): string
    {
        return (string) $this->getData('identifier');
    }

    public function getTitle(): string
    {
        return (string) $this->getData('title');
    }

    public function getMenuType(): string
    {
        $type = (string) $this->getData('menu_type');

        return in_array($type, [self::TYPE_MEGA_HORIZONTAL, self::TYPE_H_LIST, self::TYPE_V_LIST], true)
            ? $type
            : self::TYPE_MEGA_HORIZONTAL;
    }

    /**
     * @return int[] website ids, [0] for all websites
     */
    public function getWebsiteIds(): array
    {
        $raw = $this->getData('website_ids');
        $ids = is_array($raw) ? $raw : explode(',', (string) $raw);
        $ids = array_values(array_unique(array_map('intval', array_filter($ids, static fn ($id) => $id !== '' && $id !== null))));

        return $ids === [] ? [self::ALL_WEBSITES] : $ids;
    }

    public function appliesToWebsite(int $websiteId): bool
    {
        $ids = $this->getWebsiteIds();

        return in_array(self::ALL_WEBSITES, $ids, true) || in_array($websiteId, $ids, true);
    }

    public function getDevices(): string
    {
        $devices = (string) $this->getData('devices');

        return in_array($devices, [self::DEVICES_DESKTOP, self::DEVICES_MOBILE], true) ? $devices : self::DEVICES_BOTH;
    }

    public function appliesToDevice(string $device): bool
    {
        return $this->getDevices() === self::DEVICES_BOTH || $this->getDevices() === $device;
    }

    public function getRootCategoryId(): ?int
    {
        $id = (int) $this->getData('root_category_id');

        return $id > 0 ? $id : null;
    }

    public function isActive(): bool
    {
        return (bool) $this->getData('is_active');
    }

    public function getPriority(): int
    {
        return (int) $this->getData('priority');
    }
}
