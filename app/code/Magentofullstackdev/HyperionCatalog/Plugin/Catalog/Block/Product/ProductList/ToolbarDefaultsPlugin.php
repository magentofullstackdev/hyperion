<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Plugin\Catalog\Block\Product\ProductList;

use Magento\Catalog\Block\Product\ListProduct;
use Magento\Catalog\Block\Product\ProductList\Toolbar;
use Psr\Log\LoggerInterface;

/**
 * The toolbar decides the current sort order the first time a collection is
 * handed to it and never again. Core's list block configures the toolbar
 * (available orders, default order and direction: "relevance" on the search
 * page) right before it sets the collection, but core's layered navigation
 * block also sets the collection, in its own render hook, with no
 * configuration at all. Hyperion renders the navigation before the product
 * list (inline filters above the grid), so without this plugin the search
 * results page sorts by category position instead of relevance and the
 * "Relevance" option never becomes the selected one.
 *
 * Before any collection reaches the toolbar, the sort defaults of the list
 * block in the layout (search or category) are applied to it; afterwards
 * the list block's own configuration is a no-op repeat.
 */
class ToolbarDefaultsPlugin
{
    private const LIST_BLOCKS = ['search_result_list', 'category.products.list', 'product_list'];

    public function __construct(
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param Toolbar $subject
     * @param mixed $collection
     * @return array{0: mixed}
     */
    public function beforeSetCollection(Toolbar $subject, mixed $collection): array
    {
        try {
            if (!$subject->getData('_current_grid_order')) {
                $list = $this->listBlock($subject);
                if ($list !== null) {
                    // Magic data of the list block (set by the layout actions and prepareSortableFieldsByCategory).
                    $orders = $list->getData('available_orders');
                    if (is_array($orders) && $orders !== []) {
                        $subject->setAvailableOrders($orders);
                    }
                    $sort = $list->getData('sort_by') ?: $list->getData('default_sort_by');
                    if (is_string($sort) && $sort !== '') {
                        $subject->setDefaultOrder($sort);
                    }
                    $direction = $list->getData('default_direction');
                    if (is_string($direction) && $direction !== '') {
                        $subject->setDefaultDirection($direction);
                    }
                }
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion toolbar defaults not applied: ' . $e->getMessage());
        }

        return [$collection];
    }

    private function listBlock(Toolbar $toolbar): ?ListProduct
    {
        $layout = $toolbar->getLayout();
        foreach (self::LIST_BLOCKS as $name) {
            $block = $layout->getBlock($name);
            if ($block instanceof ListProduct) {
                return $block;
            }
        }

        return null;
    }
}
