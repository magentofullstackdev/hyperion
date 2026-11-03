<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Source;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory;
use Magento\Framework\Data\OptionSourceInterface;
use Psr\Log\LoggerInterface;

/**
 * Every category as an option, the label indented by level ("- - Tops"),
 * roots included (they are the import roots of a group).
 */
class Categories implements OptionSourceInterface
{
    /** @var array<int, array{value: int|string, label: string}>|null */
    private ?array $options = null;

    public function __construct(
        private readonly CollectionFactory $collectionFactory,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return array<int, array{value: int|string, label: string}>
     */
    public function toOptionArray(): array
    {
        if ($this->options !== null) {
            return $this->options;
        }
        $this->options = [['value' => '', 'label' => (string) __('-- Please Select --')]];
        try {
            $collection = $this->collectionFactory->create();
            $collection->addAttributeToSelect('name');
            $collection->addFieldToFilter('level', ['gt' => 0]);
            $collection->addAttributeToSort('path', 'ASC');
            foreach ($collection->getItems() as $category) {
                /** @var Category $category */
                $level = max(0, (int) $category->getLevel() - 1);
                $this->options[] = [
                    'value' => (int) $category->getId(),
                    'label' => str_repeat('- ', $level) . (string) $category->getName() . ' (' . (int) $category->getId() . ')',
                ];
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: category options failed: ' . $e->getMessage());
        }

        return $this->options;
    }
}
