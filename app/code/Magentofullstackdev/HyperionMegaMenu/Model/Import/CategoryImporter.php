<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Import;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory as CategoryCollectionFactory;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Cache\Flusher;
use Magentofullstackdev\HyperionMegaMenu\Model\Group;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionMegaMenu\Model\ItemFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item as ItemResource;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item\CollectionFactory as ItemCollectionFactory;

/**
 * "Import from Categories": creates one category item per active category
 * shown in the menu under the group's root category (or the default store's
 * root), keeping the category hierarchy and positions, up to a depth. A
 * category that already has an item in the group (`source_category_id`) is
 * skipped, so the import can run again after new categories were added.
 */
class CategoryImporter
{
    public const MAX_DEPTH = 3;

    public function __construct(
        private readonly CategoryCollectionFactory $categoryCollectionFactory,
        private readonly StoreManagerInterface $storeManager,
        private readonly ItemFactory $itemFactory,
        private readonly ItemResource $itemResource,
        private readonly ItemCollectionFactory $itemCollectionFactory,
        private readonly Flusher $flusher
    ) {
    }

    /**
     * @return int the number of items created
     */
    public function import(Group $group, int $depth = self::MAX_DEPTH): int
    {
        $defaultStore = $this->storeManager->getDefaultStoreView();
        $rootId = $group->getRootCategoryId() ?? ($defaultStore instanceof Store ? (int) $defaultStore->getRootCategoryId() : 0);
        $depth = max(1, min(self::MAX_DEPTH, $depth));
        $root = $this->categoryCollectionFactory->create()->addIdFilter([$rootId])->getFirstItem();
        if (!(int) $root->getData('entity_id')) {
            return 0;
        }
        $rootPath = (string) $root->getData('path');
        $rootLevel = (int) $root->getData('level');
        $collection = $this->categoryCollectionFactory->create();
        $collection->setStoreId(0)
            ->addAttributeToSelect(['name', 'include_in_menu'])
            ->addIsActiveFilter()
            ->addAttributeToFilter('include_in_menu', ['eq' => 1])
            ->addPathsFilter([$rootPath . '/'])
            ->addLevelFilter($rootLevel + $depth)
            ->addAttributeToSort('level', 'ASC')
            ->addAttributeToSort('position', 'ASC');

        $existing = [];
        foreach ($this->itemCollectionFactory->create()->addGroupFilter((int) $group->getId())->getItems() as $item) {
            $sourceId = (int) $item->getData('source_category_id');
            if ($sourceId > 0) {
                $existing[$sourceId] = (int) $item->getId();
            }
        }

        $created = 0;
        $itemIdByCategory = $existing;
        foreach ($collection->getItems() as $category) {
            /** @var Category $category */
            $categoryId = (int) $category->getId();
            if (isset($existing[$categoryId])) {
                continue;
            }
            $parentCategoryId = (int) $category->getParentId();
            $parentItemId = $parentCategoryId === $rootId ? 0 : ($itemIdByCategory[$parentCategoryId] ?? null);
            if ($parentItemId === null) {
                // The parent category is hidden from the menu: its subtree is skipped.
                continue;
            }
            $item = $this->itemFactory->create();
            $item->setData([
                'group_id' => (int) $group->getId(),
                'parent_id' => $parentItemId,
                'title' => (string) $category->getName(),
                'is_active' => 1,
                'position' => $this->itemResource->getNextPosition((int) $group->getId(), $parentItemId),
                'item_type' => Item::TYPE_CATEGORY,
                'item_target_value' => (string) $categoryId,
                'source_category_id' => $categoryId,
            ]);
            $this->itemResource->save($item);
            $itemIdByCategory[$categoryId] = (int) $item->getId();
            $created++;
        }
        if ($created > 0) {
            $this->flusher->flushGroup((int) $group->getId());
        }

        return $created;
    }
}
