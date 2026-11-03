<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Type\AbstractType;
use Magento\CatalogInventory\Api\StockRegistryInterface;
use Magento\CatalogInventory\Api\StockStateInterface;
use Magento\CatalogInventory\Model\Stock\Item;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\Stock;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class StockTest extends TestCase
{
    private float $threshold = 0.0;
    private float $stockQty = 0.0;
    /** @var Item&Stub */
    private Item $item;
    private Stock $viewModel;

    protected function setUp(): void
    {
        $this->item = $this->createStub(Item::class);
        $this->item->method('getMinQty')->willReturn(0.0);
        $this->item->method('getManageStock')->willReturn(true);
        $registry = $this->createStub(StockRegistryInterface::class);
        $registry->method('getStockItem')->willReturnCallback(fn (): Item => $this->item);
        $state = $this->createStub(StockStateInterface::class);
        $state->method('getStockQty')->willReturnCallback(fn () => $this->stockQty);
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(fn () => $this->threshold);
        $store = $this->createStub(Store::class);
        $store->method('getWebsiteId')->willReturn(1);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $this->viewModel = new Stock($registry, $state, $scopeConfig, $storeManager, $this->createStub(LoggerInterface::class));
    }

    public function testLowStockOnlyWithinTheThresholdOnSimpleSaleableProducts(): void
    {
        $product = $this->product(false, true);
        $this->stockQty = 8.0;
        $this->assertFalse($this->viewModel->isLowStockVisible($product), 'no threshold configured');
        $this->threshold = 10.0;
        $this->assertTrue($this->viewModel->isLowStockVisible($product));
        $this->assertSame(8.0, $this->viewModel->getStockQtyLeft($product));
        $this->stockQty = 11.0;
        $this->assertFalse($this->viewModel->isLowStockVisible($product), 'above the threshold');
        $this->stockQty = 8.0;
        $this->assertFalse($this->viewModel->isLowStockVisible($this->product(true, true)), 'composite type');
        $this->assertFalse($this->viewModel->isLowStockVisible($this->product(false, false)), 'not saleable');
    }

    public function testQtyInputAttributesFollowIncrementsAndSaleLimits(): void
    {
        $product = $this->product(false, true);
        $this->item->method('getEnableQtyIncrements')->willReturn(true);
        $this->item->method('getQtyIncrements')->willReturn(2.0);
        $this->item->method('getMinSaleQty')->willReturn(3.0);
        $this->item->method('getMaxSaleQty')->willReturn(10.0);

        $this->assertSame(2.0, $this->viewModel->getQtyIncrements($product));
        $this->assertSame(['min' => 4.0, 'max' => 10.0, 'step' => 2.0, 'value' => 4.0], $this->viewModel->getQtyInputAttributes($product));
    }

    public function testIncrementsOfOneCountAsNoIncrement(): void
    {
        $product = $this->product(false, true);
        $this->item->method('getEnableQtyIncrements')->willReturn(true);
        $this->item->method('getQtyIncrements')->willReturn(1.0);
        $this->item->method('getMinSaleQty')->willReturn(1.0);
        $this->item->method('getMaxSaleQty')->willReturn(0.0);

        $this->assertSame(0.0, $this->viewModel->getQtyIncrements($product));
        $this->assertSame(['min' => 1.0, 'max' => 0.0, 'step' => 0.0, 'value' => 1.0], $this->viewModel->getQtyInputAttributes($product));
    }

    private function product(bool $composite, bool $saleable): Product
    {
        $type = $this->createStub(AbstractType::class);
        $type->method('isComposite')->willReturn($composite);
        $product = $this->createStub(Product::class);
        $product->method('getId')->willReturn(7);
        $product->method('getTypeInstance')->willReturn($type);
        $product->method('isSaleable')->willReturn($saleable);

        return $product;
    }
}
