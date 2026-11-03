<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel;

use Magento\Framework\App\ResourceConnection;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item;

/**
 * The per store view values of the items (`hyperion_megamenu_item_store`):
 * one row per item and store, every value column nullable, null meaning
 * "use the default scope value". A row whose values are all null is deleted.
 */
class ItemStore
{
    public const TABLE = 'hyperion_megamenu_item_store';
    public const VALUE_COLUMNS = ['title', 'badge_text', 'badge_color', 'item_target_value', 'is_active', 'position'];

    public function __construct(
        private readonly ResourceConnection $resource
    ) {
    }

    /**
     * @return array<string, mixed> the row's value columns (absent columns null)
     */
    public function getValues(int $itemId, int $storeId): array
    {
        $connection = $this->resource->getConnection();
        $select = $connection->select()
            ->from($this->resource->getTableName(self::TABLE), self::VALUE_COLUMNS)
            ->where('item_id = ?', $itemId)
            ->where('store_id = ?', $storeId);
        $row = $connection->fetchRow($select);
        $values = [];
        foreach (self::VALUE_COLUMNS as $column) {
            $values[$column] = is_array($row) && array_key_exists($column, $row) ? $row[$column] : null;
        }

        return $values;
    }

    /**
     * Merges the given values into the store row (null clears a value, "use default").
     *
     * @param array<string, mixed> $values
     */
    public function saveValues(int $itemId, int $storeId, array $values): void
    {
        $current = $this->getValues($itemId, $storeId);
        foreach ($values as $column => $value) {
            if (in_array($column, self::VALUE_COLUMNS, true)) {
                $current[$column] = $value === '' ? null : $value;
            }
        }
        $connection = $this->resource->getConnection();
        $table = $this->resource->getTableName(self::TABLE);
        $where = ['item_id = ?' => $itemId, 'store_id = ?' => $storeId];
        if (array_filter($current, static fn ($v) => $v !== null) === []) {
            $connection->delete($table, $where);
            return;
        }
        $connection->delete($table, $where);
        $connection->insert($table, array_merge(['item_id' => $itemId, 'store_id' => $storeId], $current));
    }

    /**
     * The store rows of every item of a group, keyed by item id.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getRowsForGroup(int $groupId, int $storeId): array
    {
        $connection = $this->resource->getConnection();
        $select = $connection->select()
            ->from(['s' => $this->resource->getTableName(self::TABLE)], array_merge(['item_id'], self::VALUE_COLUMNS))
            ->join(['i' => $this->resource->getTableName(Item::TABLE)], 'i.item_id = s.item_id', [])
            ->where('i.group_id = ?', $groupId)
            ->where('s.store_id = ?', $storeId);
        $rows = [];
        foreach ($connection->fetchAll($select) as $row) {
            $rows[(int) $row['item_id']] = $row;
        }

        return $rows;
    }

    public function deleteValues(int $itemId, int $storeId): void
    {
        $this->resource->getConnection()->delete(
            $this->resource->getTableName(self::TABLE),
            ['item_id = ?' => $itemId, 'store_id = ?' => $storeId]
        );
    }
}
