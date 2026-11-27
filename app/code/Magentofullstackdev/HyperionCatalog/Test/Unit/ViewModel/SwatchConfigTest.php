<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Framework\App\Config\ScopeConfigInterface;
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
    private const PRICE_FORMAT = [
        'pattern' => '%s €',
        'precision' => 2,
        'requiredPrecision' => 2,
        'decimalSymbol' => ',',
        'groupSymbol' => '.',
        'groupLength' => 3,
        'integerRequired' => false,
    ];

    private array $superAttribute = [];

    /** @var array<int|string, array<string, mixed>> core's attributes of the configurable */
    private array $attributes = ['93' => ['id' => '93', 'options' => []]];

    /** `catalog/frontend/swatches_per_product` (core's default is 16) */
    private string $swatchesPerProduct = '16';

    /**
     * The tiles show the first "Swatches per Product" options of every attribute, and the
     * skeleton rows that reserve the tile's height list the same options.
     */
    public function testTheTileKeepsTheConfiguredNumberOfOptionsPerAttribute(): void
    {
        $this->swatchesPerProduct = '2';
        $this->attributes = [
            '93' => ['id' => '93', 'label' => 'Color', 'position' => 0, 'options' => $this->options(4)],
            '144' => ['id' => '144', 'label' => 'Size', 'position' => 1, 'options' => $this->options(1)],
        ];
        $viewModel = $this->viewModel($this->stockStub());

        $config = $this->decode($viewModel->getSerializedConfig($this->configurable(), true));
        $rows = $viewModel->getSkeletonRows($this->configurable(), true);

        self::assertSame(['1', '2'], array_column($config['attributes']['93']['options'], 'id'));
        self::assertSame(['1'], array_column($config['attributes']['144']['options'], 'id'));
        self::assertSame(['Option 1', 'Option 2'], array_column($rows[0]['options'], 'text'));
        self::assertCount(1, $rows[1]['options']);
    }

    public function testTheProductPageKeepsEveryOption(): void
    {
        $this->swatchesPerProduct = '2';
        $this->attributes = ['93' => ['id' => '93', 'label' => 'Color', 'options' => $this->options(4)]];
        $viewModel = $this->viewModel($this->stockStub());

        $config = $this->decode($viewModel->getSerializedConfig($this->configurable()));

        self::assertCount(4, $config['attributes']['93']['options']);
        self::assertCount(4, $viewModel->getSkeletonRows($this->configurable())[0]['options']);
    }

    /**
     * @return array<string, array{string, int}>
     */
    public static function limitsThatCutNothing(): array
    {
        return [
            'core default above the option count' => ['16', 4],
            'zero' => ['0', 4],
            'empty value' => ['', 4],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('limitsThatCutNothing')]
    public function testALimitAboveTheOptionCountOrNoLimitKeepsTheTileUnchanged(string $limit, int $expected): void
    {
        $this->swatchesPerProduct = $limit;
        $this->attributes = ['93' => ['id' => '93', 'label' => 'Color', 'options' => $this->options(4)]];

        $config = $this->decode($this->viewModel($this->stockStub())->getSerializedConfig($this->configurable(), true));

        self::assertSame($this->options(4), $config['attributes']['93']['options']);
        self::assertCount($expected, $config['attributes']['93']['options']);
    }

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

    /**
     * The component rewrites a server-rendered price: it needs core's number
     * format of the store view, on the product page and on the tiles.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('configModes')]
    public function testThePriceFormatOfTheStoreViewIsForwarded(bool $compact): void
    {
        $this->children = [$this->child(11)];

        $config = $this->decode(
            $this->viewModel($this->stockStub())->getSerializedConfig($this->configurable(), $compact)
        );

        self::assertSame(self::PRICE_FORMAT, $config['priceFormat']);
        self::assertSame('%s €', $config['currencyFormat']);
    }

    /**
     * @return array<string, array{bool}>
     */
    public static function configModes(): array
    {
        return ['product page' => [false], 'tile' => [true]];
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
            'attributes' => $this->attributes,
            'optionPrices' => [],
            'images' => [],
            'index' => [],
            'currencyFormat' => '%s €',
            'priceFormat' => self::PRICE_FORMAT,
        ]));
        $block->method('getJsonSwatchConfig')->willReturn('{}');
        $block->method('getAllowProducts')->willReturnCallback(fn (): array => $this->children);
        $factory = $this->createStub(SwatchesBlockFactory::class);
        $factory->method('create')->willReturn($block);
        $encoder = $this->createStub(EncoderInterface::class);
        $encoder->method('encode')->willReturnCallback(static fn ($data): string => (string) json_encode($data));
        $modules = $this->createStub(ModuleManager::class);
        $modules->method('isEnabled')->willReturn(false);
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(
            fn (string $path): ?string => $path === 'catalog/frontend/swatches_per_product' ? $this->swatchesPerProduct : null
        );

        return new SwatchConfig(
            $factory,
            $encoder,
            $this->createStub(Registry::class),
            $this->createStub(SwatchAttributesProvider::class),
            $this->createStub(LoggerInterface::class),
            $modules,
            $this->createStub(ObjectManagerInterface::class),
            $stock,
            $scopeConfig
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

    /**
     * Text options of core's configurable config, ids from 1.
     *
     * @return array<int, array{id: string, label: string, products: string[]}>
     */
    private function options(int $count): array
    {
        $options = [];
        for ($i = 1; $i <= $count; $i++) {
            $options[] = ['id' => (string) $i, 'label' => 'Option ' . $i, 'products' => [(string) (100 + $i)]];
        }

        return $options;
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
