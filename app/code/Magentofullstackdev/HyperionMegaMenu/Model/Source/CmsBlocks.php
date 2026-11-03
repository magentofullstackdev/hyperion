<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Cms\Model\ResourceModel\Block\CollectionFactory;
use Magento\Framework\Data\OptionSourceInterface;

/**
 * CMS blocks by identifier; an inactive block is listed disabled.
 */
class CmsBlocks implements OptionSourceInterface
{
    public function __construct(
        private readonly CollectionFactory $collectionFactory
    ) {
    }

    /**
     * @return array<int, array{value: string, label: string, disabled?: bool}>
     */
    public function toOptionArray(): array
    {
        $options = [];
        $collection = $this->collectionFactory->create();
        $collection->addFieldToSelect(['identifier', 'title', 'is_active'])->setOrder('title', 'ASC');
        foreach ($collection->getItems() as $block) {
            $option = ['value' => (string) $block->getData('identifier'), 'label' => (string) $block->getData('title') . ' (' . (string) $block->getData('identifier') . ')'];
            if (!(int) $block->getData('is_active')) {
                $option['disabled'] = true;
                $option['label'] .= ' ' . __('[inactive]');
            }
            $options[] = $option;
        }

        return $options;
    }
}
