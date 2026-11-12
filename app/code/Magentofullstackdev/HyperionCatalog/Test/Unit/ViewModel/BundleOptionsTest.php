<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Bundle\Model\Option;
use Magento\Bundle\Pricing\Price\BundleOptionPrice;
use Magento\Bundle\Pricing\Price\FinalPrice as BundleFinalPrice;
use Magento\Catalog\Model\Product;
use Magento\Framework\DataObject;
use Magento\Framework\Locale\ResolverInterface as LocaleResolver;
use Magento\Framework\Pricing\Amount\AmountInterface;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\Pricing\PriceInfoInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCatalog\ViewModel\BundleOptions;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The bundle option form preselects what the buy request of an edited item
 * chose (cart line "Edit"); without a buy request the admin defaults apply.
 * Its amounts come from the bundle's price info (tax display applied, display
 * currency) and are never converted again.
 */
class BundleOptionsTest extends TestCase
{
    private BundleOptions $viewModel;

    protected function setUp(): void
    {
        $this->viewModel = new BundleOptions(
            $this->createStub(PriceCurrencyInterface::class),
            $this->createStub(StoreManagerInterface::class),
            $this->createStub(LocaleResolver::class),
            $this->createStub(LoggerInterface::class)
        );
    }

    public function testNoBuyRequestMeansDefaults(): void
    {
        $bundle = $this->createStub(Product::class);
        $bundle->method('hasData')->willReturn(false);

        self::assertNull($this->viewModel->getPreselectedSelectionIds($bundle, $this->option(5)));
        self::assertNull($this->viewModel->getPreselectedQty($bundle, $this->option(5)));
    }

    /**
     * @return array<string, array{int, string[], float|null}>
     */
    public static function buyRequestProvider(): array
    {
        return [
            'radio with a quantity' => [5, ['12'], 2.0],
            'checkboxes' => [6, ['20', '21'], null],
            'option the shopper left out' => [7, [], null],
            'select answered with an empty value' => [8, [], null],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('buyRequestProvider')]
    public function testTheBuyRequestDecidesSelectionsAndQuantities(int $optionId, array $ids, ?float $qty): void
    {
        $bundle = $this->createStub(Product::class);
        $bundle->method('hasData')->willReturnCallback(static fn (string $key): bool => $key === 'preconfigured_values');
        $bundle->method('getPreconfiguredValues')->willReturn(new DataObject([
            'bundle_option' => [5 => '12', 6 => ['20', '21'], 8 => ''],
            'bundle_option_qty' => [5 => '2', 6 => '0'],
        ]));

        self::assertSame($ids, $this->viewModel->getPreselectedSelectionIds($bundle, $this->option($optionId)));
        self::assertSame($qty, $this->viewModel->getPreselectedQty($bundle, $this->option($optionId)));
    }

    public function testTheSelectionPriceIsTheOptionPriceAmountWithItsAdjustment(): void
    {
        // 34.00 excluding tax, 36.805 with the tax adjustment of an including-tax catalog display.
        $amount = $this->createStub(AmountInterface::class);
        $amount->method('getValue')->willReturn(36.805);
        $selection = $this->createStub(Product::class);
        $selection->method('getData')->willReturnMap([['selection_qty', null, '2.0000']]);
        $selection->method('getFinalPrice')->willReturn(34.0);
        $optionPrice = $this->createMock(BundleOptionPrice::class);
        $optionPrice->expects(self::once())
            ->method('getOptionSelectionAmount')
            ->with($selection)
            ->willReturn($amount);
        $priceInfo = $this->createStub(PriceInfoInterface::class);
        $priceInfo->method('getPrice')->willReturnMap([['bundle_option', $optionPrice]]);
        $bundle = $this->createStub(Product::class);
        $bundle->method('getPriceInfo')->willReturn($priceInfo);
        $priceCurrency = $this->createMock(PriceCurrencyInterface::class);
        $priceCurrency->expects(self::never())->method('convertAndRound');
        $priceCurrency->expects(self::never())->method('convert');
        $viewModel = new BundleOptions(
            $priceCurrency,
            $this->createStub(StoreManagerInterface::class),
            $this->createStub(LocaleResolver::class),
            $this->createStub(LoggerInterface::class)
        );

        self::assertEqualsWithDelta(73.61, $viewModel->getSelectionPrice($bundle, $selection), 0.00001);
    }

    public function testAmountsAreFormattedWithoutASecondConversion(): void
    {
        $priceCurrency = $this->createMock(PriceCurrencyInterface::class);
        $priceCurrency->expects(self::once())->method('format')->with(36.805, false)->willReturn('$36.81');
        $priceCurrency->expects(self::never())->method('convertAndFormat');
        $viewModel = new BundleOptions(
            $priceCurrency,
            $this->createStub(StoreManagerInterface::class),
            $this->createStub(LocaleResolver::class),
            $this->createStub(LoggerInterface::class)
        );

        self::assertSame('$36.81', $viewModel->format(36.805));
    }

    public function testAFixedPriceBundleStartsFromItsPriceWithoutOptionsAndADynamicOneFromZero(): void
    {
        $amount = $this->createStub(AmountInterface::class);
        $amount->method('getValue')->willReturn(108.25);
        $finalPrice = $this->createStub(BundleFinalPrice::class);
        $finalPrice->method('getPriceWithoutOption')->willReturn($amount);
        $priceInfo = $this->createStub(PriceInfoInterface::class);
        $priceInfo->method('getPrice')->willReturnMap([['final_price', $finalPrice]]);
        $fixed = $this->createStub(Product::class);
        $fixed->method('getData')->willReturnMap([['price_type', null, '1']]);
        $fixed->method('getPriceInfo')->willReturn($priceInfo);
        $dynamic = $this->createStub(Product::class);
        $dynamic->method('getData')->willReturnMap([['price_type', null, '0']]);

        self::assertSame(108.25, $this->viewModel->getBasePrice($fixed));
        self::assertSame(0.0, $this->viewModel->getBasePrice($dynamic));
    }

    private function option(int $id): Option
    {
        $option = $this->createStub(Option::class);
        $option->method('getOptionId')->willReturn($id);

        return $option;
    }
}
