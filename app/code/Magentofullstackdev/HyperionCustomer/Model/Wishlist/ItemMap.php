<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCustomer\Model\Wishlist;

use Magento\Catalog\Model\Indexer\Category\Product\TableMaintainer;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Wishlist\Model\ResourceModel\Item as ItemResource;

/**
 * Product id => wishlist item id of one wishlist, read with a single select
 * on `wishlist_item` (no product collection, no item models).
 *
 * The rows match what core's wishlist item collection keeps with its default
 * visibility filter: items of the wishlist's shared stores whose product is
 * listed under the current store's root category with a visibility shown on
 * the storefront (the category product index, as the collection joins it).
 * A product present more than once (different options) maps to its newest item.
 */
class ItemMap
{
    /**
     * @param ItemResource $itemResource
     * @param TableMaintainer $tableMaintainer
     * @param Visibility $visibility
     * @param StoreManagerInterface $storeManager
     */
    public function __construct(
        private readonly ItemResource $itemResource,
        private readonly TableMaintainer $tableMaintainer,
        private readonly Visibility $visibility,
        private readonly StoreManagerInterface $storeManager
    ) {
    }

    /**
     * @param int $wishlistId
     * @param int[] $storeIds stores whose items are shared with the current one
     * @return array<int, int>
     */
    public function get(int $wishlistId, array $storeIds): array
    {
        if ($wishlistId <= 0 || $storeIds === []) {
            return [];
        }
        $store = $this->storeManager->getStore();
        if (!$store instanceof Store) {
            return [];
        }
        $connection = $this->itemResource->getConnection();
        $select = $connection->select()
            ->from(['item' => $this->itemResource->getMainTable()], ['product_id', 'wishlist_item_id'])
            ->join(
                ['cat_index' => $this->tableMaintainer->getMainTable((int) $store->getId())],
                implode(' AND ', [
                    'cat_index.product_id = item.product_id',
                    $connection->quoteInto('cat_index.category_id = ?', (int) $store->getRootCategoryId()),
                    $connection->quoteInto('cat_index.visibility IN (?)', $this->visibility->getVisibleInSiteIds()),
                ]),
                []
            )
            ->where('item.wishlist_id = ?', $wishlistId)
            ->where('item.store_id IN (?)', array_map('intval', $storeIds))
            ->order('item.wishlist_item_id ASC');

        $map = [];
        foreach ($connection->fetchPairs($select) as $productId => $itemId) {
            $map[(int) $productId] = (int) $itemId;
        }
        return $map;
    }
}
