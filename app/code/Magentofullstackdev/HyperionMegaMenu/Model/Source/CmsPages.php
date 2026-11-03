<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Cms\Model\ResourceModel\Page\CollectionFactory;
use Magento\Framework\Data\OptionSourceInterface;

/**
 * CMS pages by identifier; an inactive page is listed disabled.
 */
class CmsPages implements OptionSourceInterface
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
        foreach ($collection->getItems() as $page) {
            $option = ['value' => (string) $page->getData('identifier'), 'label' => (string) $page->getData('title') . ' (' . (string) $page->getData('identifier') . ')'];
            if (!(int) $page->getData('is_active')) {
                $option['disabled'] = true;
                $option['label'] .= ' ' . __('[inactive]');
            }
            $options[] = $option;
        }

        return $options;
    }
}
