<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

use Magento\Framework\App\ResourceConnection;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item as ItemResource;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\ItemStore;

/**
 * The rows of a group for a store view in ONE query: the item table left
 * joined with the store's value rows, every overridable column taken from
 * the store row when it is set (`COALESCE`), ordered by the effective
 * position. No model is instantiated: the tree builder works on arrays.
 */
class TreeLoader
{
    private const OVERRIDABLE = ['title', 'badge_text', 'badge_color', 'item_target_value', 'is_active', 'position'];

    public function __construct(
        private readonly ResourceConnection $resource
    ) {
    }

    /**
     * @return array<int, array<string, mixed>> rows keyed by item id, siblings in position order
     */
    public function load(int $groupId, int $storeId): array
    {
        $connection = $this->resource->getConnection();
        $select = $connection->select()
            ->from(
                ['i' => $this->resource->getTableName(ItemResource::TABLE)],
                [
                    'item_id', 'group_id', 'parent_id', 'level', 'item_type', 'url_target', 'dropdown_width',
                    'is_container', 'custom_class', 'nofollow', 'customer_group_ids', 'store_ids', 'children_depth',
                ]
            )
            ->joinLeft(
                ['s' => $this->resource->getTableName(ItemStore::TABLE)],
                's.item_id = i.item_id AND s.store_id = ' . $storeId,
                []
            )
            ->where('i.group_id = ?', $groupId);
        foreach (self::OVERRIDABLE as $column) {
            $select->columns([$column => new \Zend_Db_Expr('COALESCE(s.' . $column . ', i.' . $column . ')')]);
        }
        $select->order(['position ASC', 'i.item_id ASC']);

        $rows = [];
        foreach ($connection->fetchAll($select) as $row) {
            $rows[(int) $row['item_id']] = $row;
        }

        return $rows;
    }
}
