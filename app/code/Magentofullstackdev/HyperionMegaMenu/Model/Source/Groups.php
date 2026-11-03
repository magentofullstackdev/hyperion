<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Framework\Data\OptionSourceInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\ResourceModel\Group\CollectionFactory;

/**
 * The menu groups by identifier (the widget's "Menu group" parameter).
 */
class Groups implements OptionSourceInterface
{
    public function __construct(
        private readonly CollectionFactory $collectionFactory
    ) {
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    public function toOptionArray(): array
    {
        $options = [];
        foreach ($this->collectionFactory->create()->setOrder('title', 'ASC')->getItems() as $group) {
            $options[] = ['value' => $group->getIdentifier(), 'label' => $group->getTitle() . ' (' . $group->getIdentifier() . ')'];
        }

        return $options;
    }
}
