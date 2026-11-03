<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Framework\DataObject;
use Magento\Framework\Json\EncoderInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Registry;
use Magento\Swatches\Block\Product\Renderer\Configurable as SwatchesBlock;
use Magento\Swatches\Block\Product\Renderer\ConfigurableFactory as SwatchesBlockFactory;
use Magento\Swatches\Model\SwatchAttributesProvider;
use Magentofullstackdev\HyperionCatalog\ViewModel\Stock;
use Magentofullstackdev\HyperionCatalog\ViewModel\SwatchConfig;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The swatch config carries the per variant "Only N left" notices under the
 * store's stock threshold, and the buy request's options as defaultValues.
 */
class SwatchConfigTest extends TestCase
{
    /** @var array<int, float> stock left per child id; a child missing here is above the threshold */
    private array $lowStock = [];
    private float $threshold = 0.0;
    /** @var Product[] */
    private array $children = [];
    private array $superAttribute = [];

    public function testStockNoticesListTheVariantsWithinTheThreshold(): void
    {
        $this->threshold = 5.0;
        $this->children = [$this->child(11), $this->child(12), $this->child(13)];
        $this->lowStock = [11 => 3.0, 13 => 2.5];

        $config = $this->decode($this->viewModel($this->stockStub())->getSerializedConfig($this->configurable()));

        self::assertSame([11 => 'Only 3 left', 13 => 'Only 2.5 left'], $config['stockNotices']);
    }

    public function testTheConfigCarriesTheTranslatedComponentLabels(): void
    {
        $this->children = [$this->child(11)];

        $config = $this->decode($this->viewModel($this->stockStub())->getSerializedConfig($this->configurable()));

        self::assertSame(['regularPrice' => 'Regular Price', 'clickForPrice' => 'Click for price'], $config['labels']);
    }

    public function testNoThresholdEmitsNothingAndReadsNoStock(): void
    {
        $this->threshold = 0.0;
        $this->children = [$this->child(11)];
        $stock = $this->createMock(Stock::class);
        $stock->method('getThresholdQty')->willReturn(0.0);
        $stock->expects(self::never())->method('isLowStockVisible');

        $config = $this->decode($this->viewModel($stock)->getSerializedConfig($this->configurable()));

        self::assertArrayNotHasKey('stockNotices', $config);
    }

    public function testVariantsAboveTheThresholdEmitNothing(): void
    {
        $this->threshold = 5.0;
        $this->children = [$this->child(11), $this->child(12)];
        $this->lowStock = [];

        $config = $this->decode($this->viewModel($this->stockStub())->getSerializedConfig($this->configurable()));

        self::assertArrayNotHasKey('stockNotices', $config);
    }

    public function testCompactTileConfigCarriesNoStockNotices(): void
    {
        $this->threshold = 5.0;
        $this->children = [$this->child(11)];
        $this->lowStock = [11 => 1.0];
        $stock = $this->createMock(Stock::class);
        $stock->expects(self::never())->method('getThresholdQty');

        $config = $this->decode($this->viewModel($stock)->getSerializedConfig($this->configurable(), true));

        self::assertArrayNotHasKey('stockNotices', $config);
        self::assertSame('HYP-TEE', $config['sku']);
    }

    public function testTheBuyRequestOfAnEditedItemBecomesDefaultValues(): void
    {
        $this->superAttribute = [93 => '49', 144 => '167', 150 => ''];

        $config = $this->decode($this->viewModel($this->stockStub())->getSerializedConfig($this->configurable()));

        self::assertSame(['93' => '49', '144' => '167'], $config['defaultValues']);
    }

    public function testNoBuyRequestMeansNoDefaultValues(): void
    {
        $config = $this->decode($this->viewModel($this->stockStub())->getSerializedConfig($this->configurable()));

        self::assertArrayNotHasKey('defaultValues', $config);
    }

    private function viewModel(Stock $stock): SwatchConfig
    {
        $block = $this->createStub(SwatchesBlock::class);
        $block->method('getJsonConfig')->willReturn(json_encode([
            'attributes' => ['93' => ['id' => '93', 'options' => []]],
            'optionPrices' => [],
            'images' => [],
            'index' => [],
            'currencyFormat' => '$%s',
        ]));
        $block->method('getJsonSwatchConfig')->willReturn('{}');
        $block->method('getAllowProducts')->willReturnCallback(fn (): array => $this->children);
        $factory = $this->createStub(SwatchesBlockFactory::class);
        $factory->method('create')->willReturn($block);
        $encoder = $this->createStub(EncoderInterface::class);
        $encoder->method('encode')->willReturnCallback(static fn ($data): string => (string) json_encode($data));
        $modules = $this->createStub(ModuleManager::class);
        $modules->method('isEnabled')->willReturn(false);

        return new SwatchConfig(
            $factory,
            $encoder,
            $this->createStub(Registry::class),
            $this->createStub(SwatchAttributesProvider::class),
            $this->createStub(LoggerInterface::class),
            $modules,
            $this->createStub(ObjectManagerInterface::class),
            $stock
        );
    }

    /**
     * @return Stock&Stub
     */
    private function stockStub(): Stock
    {
        $stock = $this->createStub(Stock::class);
        $stock->method('getThresholdQty')->willReturnCallback(fn (): float => $this->threshold);
        $stock->method('isLowStockVisible')->willReturnCallback(
            fn (Product $product): bool => isset($this->lowStock[(int) $product->getId()])
        );
        $stock->method('getStockQtyLeft')->willReturnCallback(
            fn (Product $product): float => $this->lowStock[(int) $product->getId()] ?? 100.0
        );

        return $stock;
    }

    private function configurable(): Product
    {
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn('configurable');
        $product->method('getId')->willReturn(1);
        $product->method('getSku')->willReturn('HYP-TEE');
        $product->method('getPreconfiguredValues')->willReturn(
            new DataObject($this->superAttribute === [] ? [] : ['super_attribute' => $this->superAttribute])
        );

        return $product;
    }

    private function child(int $id): Product
    {
        $child = $this->createStub(Product::class);
        $child->method('getId')->willReturn($id);

        return $child;
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(string $json): array
    {
        return (array) json_decode($json, true);
    }
}
