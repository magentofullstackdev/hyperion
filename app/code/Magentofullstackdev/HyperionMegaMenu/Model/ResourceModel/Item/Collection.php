<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item;

use Magento\Framework\Model\ResourceModel\Db\Collection\AbstractCollection;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Item as ItemResource;

/**
 * @method Item[] getItems()
 */
class Collection extends AbstractCollection
{
    /**
     * @var string
     */
    protected $_idFieldName = 'item_id';

    protected function _construct(): void
    {
        $this->_init(Item::class, ItemResource::class);
    }

    public function addGroupFilter(int $groupId): self
    {
        $this->addFieldToFilter('group_id', ['eq' => $groupId]);

        return $this;
    }
}
