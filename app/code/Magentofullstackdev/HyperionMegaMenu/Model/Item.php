<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model;

use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\Model\AbstractModel;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item as ItemResource;

/**
 * A node of a menu group's tree (default scope values; the per store view
 * values live in `hyperion_megamenu_item_store`, see ResourceModel\ItemStore).
 */
class Item extends AbstractModel implements IdentityInterface
{
    public const TYPE_CATEGORY = 'category';
    public const TYPE_PRODUCT = 'product';
    public const TYPE_CMS_PAGE = 'cms_page';
    public const TYPE_CMS_BLOCK = 'cms_block';
    public const TYPE_CUSTOM = 'custom';
    public const TYPE_HOME = 'home';
    public const TYPE_EMPTY = 'empty';
    public const TYPE_LOGIN = 'login';
    public const TYPE_REGISTER = 'register';
    public const TYPE_ACCOUNT = 'account';
    public const TYPE_CART = 'cart';
    public const TYPE_WISHLIST = 'wishlist';
    public const TYPE_CONTACT = 'contact';

    /** Types whose target is a route of the store (no target value needed). */
    public const SYSTEM_ROUTES = [
        self::TYPE_LOGIN => 'customer/account/login',
        self::TYPE_REGISTER => 'customer/account/create',
        self::TYPE_ACCOUNT => 'customer/account',
        self::TYPE_CART => 'checkout/cart',
        self::TYPE_WISHLIST => 'wishlist',
        self::TYPE_CONTACT => 'contact',
    ];

    public const TYPES = [
        self::TYPE_CATEGORY,
        self::TYPE_PRODUCT,
        self::TYPE_CMS_PAGE,
        self::TYPE_CMS_BLOCK,
        self::TYPE_CUSTOM,
        self::TYPE_HOME,
        self::TYPE_EMPTY,
        self::TYPE_LOGIN,
        self::TYPE_REGISTER,
        self::TYPE_ACCOUNT,
        self::TYPE_CART,
        self::TYPE_WISHLIST,
        self::TYPE_CONTACT,
    ];

    public const BADGE_COLORS = ['primary', 'danger', 'success', 'warning', 'neutral'];

    public const MAX_LEVEL = 3;
    public const MAX_CHILDREN_DEPTH = 3;

    protected $_eventPrefix = 'hyperion_megamenu_item';

    /**
     * The default cache frontend cleans this tag on save / delete (cleanModelCache):
     * every block cache entry of a menu carries it (block_html shares the frontend).
     *
     * @var string
     */
    protected $_cacheTag = Group::CACHE_TAG;

    protected function _construct(): void
    {
        $this->_init(ItemResource::class);
    }

    /**
     * @return string[]
     */
    public function getIdentities()
    {
        return [Group::CACHE_TAG, Group::GROUP_CACHE_TAG . '_' . (int) $this->getData('group_id')];
    }

    public function getGroupId(): int
    {
        return (int) $this->getData('group_id');
    }

    public function getParentId(): int
    {
        return (int) $this->getData('parent_id');
    }

    public function getLevel(): int
    {
        return (int) $this->getData('level');
    }

    public function getPosition(): int
    {
        return (int) $this->getData('position');
    }

    public function getTitle(): string
    {
        return (string) $this->getData('title');
    }

    public function getItemType(): string
    {
        $type = (string) $this->getData('item_type');

        return in_array($type, self::TYPES, true) ? $type : self::TYPE_CUSTOM;
    }

    public function getItemTargetValue(): string
    {
        return trim((string) $this->getData('item_target_value'));
    }

    public function getDropdownWidth(): int
    {
        return max(0, min(12, (int) $this->getData('dropdown_width')));
    }

    public function getChildrenDepth(): int
    {
        return max(0, min(self::MAX_CHILDREN_DEPTH, (int) $this->getData('children_depth')));
    }

    /**
     * @return int[] empty = every customer group
     */
    public function getCustomerGroupIds(): array
    {
        return self::idList($this->getData('customer_group_ids'));
    }

    /**
     * @return int[] empty = every store
     */
    public function getStoreIds(): array
    {
        return self::idList($this->getData('store_ids'));
    }

    /**
     * @param mixed $raw comma separated string or array
     * @return int[]
     */
    public static function idList(mixed $raw): array
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return [];
        }
        $ids = is_array($raw) ? $raw : explode(',', (string) $raw);

        return array_values(array_unique(array_map('intval', array_filter($ids, static fn ($id) => $id !== '' && $id !== null))));
    }
}
