<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel;

use Magento\Framework\Model\AbstractModel;
use Magento\Framework\Model\ResourceModel\Db\AbstractDb;
use Magentofullstackdev\HyperionMegaMenu\Model\Item as ItemModel;

class Item extends AbstractDb
{
    public const TABLE = 'hyperion_megamenu_item';

    protected function _construct(): void
    {
        $this->_init(self::TABLE, 'item_id');
    }

    /**
     * Normalizes the list columns (arrays from the admin form), clamps the
     * numeric fields and keeps the level consistent with the parent.
     *
     * @param AbstractModel $object
     * @return $this
     */
    protected function _beforeSave(AbstractModel $object)
    {
        foreach (['customer_group_ids', 'store_ids'] as $field) {
            $raw = $object->getData($field);
            if (is_array($raw)) {
                $ids = ItemModel::idList($raw);
                $object->setData($field, $ids === [] ? null : implode(',', $ids));
            } elseif ($raw !== null && trim((string) $raw) === '') {
                $object->setData($field, null);
            }
        }
        $type = (string) $object->getData('item_type');
        $object->setData('item_type', in_array($type, ItemModel::TYPES, true) ? $type : ItemModel::TYPE_CUSTOM);
        $object->setData('dropdown_width', max(0, min(12, (int) $object->getData('dropdown_width'))));
        $object->setData('children_depth', max(0, min(ItemModel::MAX_CHILDREN_DEPTH, (int) $object->getData('children_depth'))));
        $object->setData('url_target', (string) $object->getData('url_target') === '_blank' ? '_blank' : '_self');
        $badgeColor = (string) $object->getData('badge_color');
        $object->setData('badge_color', in_array($badgeColor, ItemModel::BADGE_COLORS, true) ? $badgeColor : null);
        if (trim((string) $object->getData('badge_text')) === '') {
            $object->setData('badge_text', null);
        }
        $parentId = (int) $object->getData('parent_id');
        $object->setData('parent_id', max(0, $parentId));
        $object->setData('level', $parentId > 0 ? $this->getLevelOf($parentId) + 1 : 0);

        return parent::_beforeSave($object);
    }

    public function getLevelOf(int $itemId): int
    {
        $connection = $this->getConnection();
        $select = $connection->select()->from($this->getMainTable(), 'level')->where('item_id = ?', $itemId);

        return (int) $connection->fetchOne($select);
    }

    /**
     * Next free position under a parent.
     */
    public function getNextPosition(int $groupId, int $parentId): int
    {
        $connection = $this->getConnection();
        $select = $connection->select()
            ->from($this->getMainTable(), new \Zend_Db_Expr('MAX(position)'))
            ->where('group_id = ?', $groupId)
            ->where('parent_id = ?', $parentId);
        $max = $connection->fetchOne($select);

        return is_numeric($max) ? (int) $max + 1 : 0;
    }

    /**
     * Ids of the item and every descendant (the tree is at most four levels deep).
     *
     * @return int[]
     */
    public function getSubtreeIds(int $itemId): array
    {
        $connection = $this->getConnection();
        $ids = [$itemId];
        $frontier = [$itemId];
        for ($depth = 0; $depth <= ItemModel::MAX_LEVEL && $frontier !== []; $depth++) {
            $select = $connection->select()->from($this->getMainTable(), 'item_id')->where('parent_id IN (?)', $frontier);
            $frontier = array_map('intval', $connection->fetchCol($select));
            $ids = array_merge($ids, $frontier);
        }

        return array_values(array_unique($ids));
    }

    /**
     * Rewrites `level` of every descendant after a move (one statement per level).
     */
    public function relevelSubtree(int $itemId, int $level): void
    {
        $connection = $this->getConnection();
        $frontier = [$itemId];
        for ($depth = $level + 1; $depth <= ItemModel::MAX_LEVEL + 1 && $frontier !== []; $depth++) {
            $select = $connection->select()->from($this->getMainTable(), 'item_id')->where('parent_id IN (?)', $frontier);
            $frontier = array_map('intval', $connection->fetchCol($select));
            if ($frontier !== []) {
                $connection->update($this->getMainTable(), ['level' => $depth], ['item_id IN (?)' => $frontier]);
            }
        }
    }

    /**
     * Writes the positions of the siblings of a parent in the given order
     * (default scope: the `position` column; a store view: the store rows).
     *
     * @param int[] $orderedIds
     */
    public function reorder(int $groupId, int $parentId, array $orderedIds, int $storeId, ItemStore $itemStore): void
    {
        $connection = $this->getConnection();
        $position = 0;
        foreach ($orderedIds as $id) {
            $id = (int) $id;
            if ($storeId === 0) {
                $connection->update(
                    $this->getMainTable(),
                    ['position' => $position],
                    ['item_id = ?' => $id, 'group_id = ?' => $groupId, 'parent_id = ?' => $parentId]
                );
            } else {
                $itemStore->saveValues($id, $storeId, ['position' => $position]);
            }
            $position++;
        }
    }
}
