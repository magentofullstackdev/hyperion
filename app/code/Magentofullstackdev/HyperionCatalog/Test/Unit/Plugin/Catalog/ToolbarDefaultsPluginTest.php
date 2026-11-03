<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Plugin\Catalog;

use Magento\Catalog\Block\Product\ListProduct;
use Magento\Catalog\Block\Product\ProductList\Toolbar;
use Magento\Framework\View\LayoutInterface;
use Magentofullstackdev\HyperionCatalog\Plugin\Catalog\Block\Product\ProductList\ToolbarDefaultsPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCatalog\Plugin\Catalog\Block\Product\ProductList\ToolbarDefaultsPlugin
 */
class ToolbarDefaultsPluginTest extends TestCase
{
    public function testTheListBlockDefaultsReachTheToolbarBeforeItsFirstCollection(): void
    {
        // The sort defaults are magic data getters of the block: a real instance without its
        // constructor keeps the real __call and needs no test double at all.
        $list = new class extends ListProduct {
            // phpcs:ignore Magento2.CodeAnalysis.EmptyBlock
            public function __construct()
            {
            }
        };
        $list->setData([
            'available_orders' => ['name' => 'Name', 'relevance' => 'Relevance'],
            'default_sort_by' => 'relevance',
            'default_direction' => 'desc',
        ]);
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturnCallback(static fn (string $name) => $name === 'search_result_list' ? $list : false);
        $toolbar = $this->createMock(Toolbar::class);
        $toolbar->method('getData')->with('_current_grid_order')->willReturn(null);
        $toolbar->method('getLayout')->willReturn($layout);
        $toolbar->expects(self::once())->method('setAvailableOrders')->with(['name' => 'Name', 'relevance' => 'Relevance'])->willReturnSelf();
        $toolbar->expects(self::once())->method('setDefaultOrder')->with('relevance')->willReturnSelf();
        $toolbar->expects(self::once())->method('setDefaultDirection')->with('desc')->willReturnSelf();

        self::assertSame(['collection'], (new ToolbarDefaultsPlugin($this->createStub(LoggerInterface::class)))->beforeSetCollection($toolbar, 'collection'));
    }

    public function testADecidedToolbarAndAPageWithoutListBlockAreLeftAlone(): void
    {
        $plugin = new ToolbarDefaultsPlugin($this->createStub(LoggerInterface::class));
        $decided = $this->createMock(Toolbar::class);
        $decided->method('getData')->with('_current_grid_order')->willReturn('name');
        $decided->expects(self::never())->method('setDefaultOrder');
        self::assertSame(['c'], $plugin->beforeSetCollection($decided, 'c'));

        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturn(false);
        $toolbar = $this->createMock(Toolbar::class);
        $toolbar->method('getData')->willReturn(null);
        $toolbar->method('getLayout')->willReturn($layout);
        $toolbar->expects(self::never())->method('setAvailableOrders');
        self::assertSame(['c'], $plugin->beforeSetCollection($toolbar, 'c'));
    }
}
