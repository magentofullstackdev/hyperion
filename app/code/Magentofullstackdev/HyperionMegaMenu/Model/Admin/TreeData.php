<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Admin;

use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item\CollectionFactory as ItemCollectionFactory;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\ItemStore;
use Magentofullstackdev\HyperionMegaMenu\Model\Source\ItemType;

/**
 * The builder's tree for a group and a store view: every item (active or
 * not) with the values the store sees, which of them the store overrides,
 * whether the item is a store only one, nested in position order. Two
 * queries (items, store rows).
 */
class TreeData
{
    public function __construct(
        private readonly ItemCollectionFactory $itemCollectionFactory,
        private readonly ItemStore $itemStore,
        private readonly ItemType $itemType
    ) {
    }

    /**
     * @return array<string, mixed> {store_id, nodes}
     */
    public function get(int $groupId, int $storeId): array
    {
        $rows = $storeId > 0 ? $this->itemStore->getRowsForGroup($groupId, $storeId) : [];
        $nodes = [];
        $byParent = [];
        foreach ($this->itemCollectionFactory->create()->addGroupFilter($groupId)->getItems() as $item) {
            $id = (int) $item->getId();
            $store = $rows[$id] ?? [];
            $overrides = [];
            foreach (ItemStore::VALUE_COLUMNS as $column) {
                if (array_key_exists($column, $store) && $store[$column] !== null) {
                    $overrides[] = $column;
                }
            }
            $storeIds = $item->getStoreIds();
            $effective = static fn (string $column) => in_array($column, $overrides, true) ? $store[$column] : $item->getData($column);
            $nodes[$id] = [
                'id' => $id,
                'parent_id' => $item->getParentId(),
                'level' => $item->getLevel(),
                'position' => (int) $effective('position'),
                'title' => (string) $effective('title'),
                'type' => $item->getItemType(),
                'type_label' => $this->itemType->getShortLabel($item->getItemType()),
                'target' => (string) $effective('item_target_value'),
                'active' => (bool) $effective('is_active'),
                'badge' => trim((string) $effective('badge_text')) === '' ? null
                    : ['text' => (string) $effective('badge_text'), 'color' => (string) ($effective('badge_color') ?: 'primary')],
                'width' => $item->getDropdownWidth(),
                'overrides' => $overrides,
                'store_only' => $storeIds !== [],
                'store_ids' => $storeIds,
                'hidden_in_store' => $storeId > 0 && $storeIds !== [] && !in_array($storeId, $storeIds, true),
                'children' => [],
            ];
            $byParent[$item->getParentId()][] = $id;
        }

        return ['store_id' => $storeId, 'nodes' => $this->assemble(0, $nodes, $byParent)];
    }

    /**
     * @param array<int, array<string, mixed>> $nodes
     * @param array<int, int[]> $byParent
     * @return array<int, array<string, mixed>>
     */
    private function assemble(int $parentId, array $nodes, array $byParent): array
    {
        $children = [];
        foreach ($byParent[$parentId] ?? [] as $id) {
            $node = $nodes[$id];
            $node['children'] = $this->assemble($id, $nodes, $byParent);
            $children[] = $node;
        }
        usort($children, static fn (array $a, array $b): int => [$a['position'], $a['id']] <=> [$b['position'], $b['id']]);

        return $children;
    }
}
