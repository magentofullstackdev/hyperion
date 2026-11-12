<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Admin;

use Magento\Framework\Exception\LocalizedException;
use Magentofullstackdev\HyperionMegaMenu\Model\Cache\Flusher;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionMegaMenu\Model\ItemFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item as ItemResource;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\ItemStore;

/**
 * The builder's writes with the scope rules:
 *  - Default Config (store 0) edits everything, including the structure
 *    (parent, order) and the per item lists (stores, customer groups);
 *  - a store view edits the store values of a shared item (title, badge,
 *    target, status, order) behind "Use Default Value" checkboxes, and
 *    owns the items limited to that store alone (full edit); it never
 *    moves a shared item to another parent and never deletes one.
 */
class ItemSaver
{
    private const STRUCTURE_FIELDS = [
        'title', 'is_active', 'item_type', 'url_target', 'dropdown_width', 'is_container', 'custom_class', 'nofollow',
        'badge_text', 'badge_color', 'customer_group_ids', 'store_ids', 'children_depth',
    ];
    private const STORE_FIELDS = ['title', 'badge_text', 'badge_color', 'item_target_value', 'is_active'];

    public function __construct(
        private readonly ItemFactory $itemFactory,
        private readonly ItemResource $itemResource,
        private readonly ItemStore $itemStore,
        private readonly Flusher $flusher
    ) {
    }

    public function load(int $itemId): ?Item
    {
        if ($itemId <= 0) {
            return null;
        }
        $item = $this->itemFactory->create();
        $this->itemResource->load($item, $itemId);

        return $item->getId() ? $item : null;
    }

    /**
     * Whether the store edits the item's structure and defaults (default scope, or a store only item of that store).
     */
    public function ownsItem(Item $item, int $storeId): bool
    {
        return $storeId === 0 || $item->getStoreIds() === [$storeId];
    }

    /**
     * @param array<string, mixed> $post
     * @throws LocalizedException
     */
    public function save(array $post, int $storeId): Item
    {
        $itemId = (int) ($post['item_id'] ?? 0);
        $item = $this->load($itemId);
        if ($item !== null && $item->getGroupId() !== (int) ($post['group_id'] ?? 0)) {
            throw new LocalizedException(__('The item does not belong to this menu.'));
        }
        if ($item === null) {
            $groupId = (int) ($post['group_id'] ?? 0);
            if ($groupId <= 0) {
                throw new LocalizedException(__('The menu group is missing.'));
            }
            $parentId = max(0, (int) ($post['parent_id'] ?? 0));
            if ($parentId > 0) {
                $parent = $this->load($parentId);
                if ($parent === null || $parent->getGroupId() !== $groupId) {
                    throw new LocalizedException(__('The parent item no longer exists.'));
                }
                if ($parent->getLevel() + 1 > Item::MAX_LEVEL) {
                    throw new LocalizedException(__('A menu is at most %1 levels deep.', Item::MAX_LEVEL + 1));
                }
            }
            $item = $this->itemFactory->create();
            $item->setData([
                'group_id' => $groupId,
                'parent_id' => $parentId,
                'position' => $this->itemResource->getNextPosition($groupId, $parentId),
                'is_active' => 1,
            ]);
            if ($storeId > 0) {
                // An item added from a store view belongs to that store view alone.
                $item->setData('store_ids', [$storeId]);
            }
        }
        if ($this->ownsItem($item, $storeId)) {
            if ($storeId > 0) {
                $post['store_ids'] = [$storeId];
            } elseif (array_key_exists('title', $post)) {
                // The item form always posts the title; a multiselect with nothing selected posts no key at all.
                $post['store_ids'] ??= [];
            }
            if (array_key_exists('title', $post)) {
                $post['customer_group_ids'] ??= [];
            }
            foreach (self::STRUCTURE_FIELDS as $field) {
                if (array_key_exists($field, $post)) {
                    $item->setData($field, $post[$field]);
                }
            }
            foreach (['is_container', 'nofollow', 'is_active'] as $flag) {
                $item->setData($flag, !empty($post[$flag]) ? 1 : 0);
            }
            $item->setData('item_target_value', $this->targetValue($post, (string) $item->getData('item_type')));
            if (trim((string) $item->getData('title')) === '') {
                throw new LocalizedException(__('The title is required.'));
            }
            $this->itemResource->save($item);
            $this->flusher->flushGroup($item->getGroupId());

            return $item;
        }
        // A shared item seen from a store view: store values only.
        $useDefault = (array) ($post['use_default'] ?? []);
        $values = [];
        foreach (self::STORE_FIELDS as $field) {
            if (!empty($useDefault[$field])) {
                $values[$field] = null;
                continue;
            }
            $values[$field] = match ($field) {
                'is_active' => !empty($post['is_active']) ? 1 : 0,
                'item_target_value' => $this->targetValue($post, $item->getItemType()),
                default => $post[$field] ?? null,
            };
        }
        $this->itemStore->saveValues((int) $item->getId(), $storeId, $values);
        $this->flusher->flushGroup($item->getGroupId());

        return $item;
    }

    /**
     * @throws LocalizedException
     */
    public function delete(Item $item, int $storeId): void
    {
        if (!$this->ownsItem($item, $storeId)) {
            throw new LocalizedException(
                __('This item is shared by every store view: disable it for this store view, or delete it from Default Config.')
            );
        }
        $groupId = $item->getGroupId();
        foreach (array_reverse($this->itemResource->getSubtreeIds((int) $item->getId())) as $id) {
            $node = $this->load($id);
            if ($node !== null) {
                $this->itemResource->delete($node);
            }
        }
        $this->flusher->flushGroup($groupId);
    }

    /**
     * Moves an item under a parent at the given sibling order.
     *
     * @param int[] $order sibling ids under the parent, in the new order
     * @throws LocalizedException
     */
    public function move(Item $item, int $parentId, array $order, int $storeId): void
    {
        $parentId = max(0, $parentId);
        $order = array_values(array_unique(array_map('intval', $order)));
        if (!in_array((int) $item->getId(), $order, true)) {
            $order[] = (int) $item->getId();
        }
        if ($parentId !== $item->getParentId()) {
            if (!$this->ownsItem($item, $storeId)) {
                throw new LocalizedException(
                    __('The structure of a shared item is edited in Default Config; a store view only reorders its siblings.')
                );
            }
            $subtree = $this->itemResource->getSubtreeIds((int) $item->getId());
            if (in_array($parentId, $subtree, true)) {
                throw new LocalizedException(__('An item cannot be moved inside itself.'));
            }
            $level = 0;
            if ($parentId > 0) {
                $parent = $this->load($parentId);
                if ($parent === null || $parent->getGroupId() !== $item->getGroupId()) {
                    throw new LocalizedException(__('The parent item no longer exists.'));
                }
                $level = $parent->getLevel() + 1;
            }
            $depth = $this->subtreeDepth((int) $item->getId());
            if ($level + $depth > Item::MAX_LEVEL) {
                throw new LocalizedException(__('A menu is at most %1 levels deep.', Item::MAX_LEVEL + 1));
            }
            $item->setData('parent_id', $parentId);
            $this->itemResource->save($item);
            $this->itemResource->relevelSubtree((int) $item->getId(), $level);
        }
        $this->itemResource->reorder($item->getGroupId(), $parentId, $order, $storeId, $this->itemStore);
        $this->flusher->flushGroup($item->getGroupId());
    }

    /**
     * Levels below an item (0 for a leaf).
     */
    private function subtreeDepth(int $itemId): int
    {
        $ids = $this->itemResource->getSubtreeIds($itemId);
        $max = 0;
        $root = $this->itemResource->getLevelOf($itemId);
        foreach ($ids as $id) {
            $max = max($max, $this->itemResource->getLevelOf($id) - $root);
        }

        return $max;
    }

    /**
     * The target input that matches the type (`target_category`, `target_product`, ...).
     *
     * @param array<string, mixed> $post
     */
    private function targetValue(array $post, string $type): string
    {
        $value = match ($type) {
            Item::TYPE_CATEGORY => $post['target_category'] ?? '',
            Item::TYPE_PRODUCT => $post['target_product'] ?? '',
            Item::TYPE_CMS_PAGE => $post['target_cms_page'] ?? '',
            Item::TYPE_CMS_BLOCK => $post['target_cms_block'] ?? '',
            Item::TYPE_CUSTOM => $post['target_custom'] ?? '',
            default => '',
        };

        return trim((string) $value);
    }
}
