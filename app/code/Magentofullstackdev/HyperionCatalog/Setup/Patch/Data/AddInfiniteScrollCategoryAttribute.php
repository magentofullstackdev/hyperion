<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Setup\Patch\Data;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Setup\CategorySetupFactory;
use Magento\Eav\Model\Entity\Attribute\ScopedAttributeInterface;
use Magento\Framework\Setup\ModuleDataSetupInterface;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magentofullstackdev\HyperionCatalog\Model\Category\Attribute\Source\InfiniteScroll as Source;
use Magentofullstackdev\HyperionCatalog\Model\InfiniteScroll;

/**
 * The `hyperion_infinite_scroll` category attribute: a per
 * category override of the listing's infinite loading mode, shown in the
 * category form's Display Settings group with "Use Default Value" per store view.
 */
class AddInfiniteScrollCategoryAttribute implements DataPatchInterface
{
    public function __construct(
        private readonly ModuleDataSetupInterface $moduleDataSetup,
        private readonly CategorySetupFactory $categorySetupFactory
    ) {
    }

    /**
     * @return string[]
     */
    public static function getDependencies(): array
    {
        return [];
    }

    /**
     * @return string[]
     */
    public function getAliases(): array
    {
        return [];
    }

    public function apply(): self
    {
        $setup = $this->categorySetupFactory->create(['setup' => $this->moduleDataSetup]);
        $setup->addAttribute(Category::ENTITY, InfiniteScroll::CATEGORY_ATTRIBUTE, [
            'type' => 'varchar',
            'label' => 'Infinite Scroll',
            'input' => 'select',
            'source' => Source::class,
            'required' => false,
            'sort_order' => 55,
            'global' => ScopedAttributeInterface::SCOPE_STORE,
            'group' => 'Display Settings',
            'user_defined' => true,
            'visible' => true,
            'default' => '',
            'note' => 'Overrides Stores > Configuration > Hyperion Theme > Catalog > Infinite Scroll for this category; "Please select" follows the configuration.',
        ]);

        return $this;
    }
}
