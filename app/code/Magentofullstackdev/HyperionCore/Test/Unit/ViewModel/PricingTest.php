<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Catalog\Pricing\Price\RegularPrice;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Pricing\Amount\AmountInterface;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\Pricing\PriceInfoInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\ViewModel\Pricing;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCore\ViewModel\Pricing
 */
class PricingTest extends TestCase
{
    public function testAFailingPriceIsLoggedAndDegradesTheRequest(): void
    {
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn('simple');
        $product->method('getPriceInfo')->willThrowException(new \RuntimeException('pricing down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');
        $degraded = new DegradedResponse();

        $html = $this->viewModel($degraded, null, $logger)->getProductPriceHtml($product);

        self::assertSame('<span class="price">--</span>', $html);
        self::assertTrue($degraded->isDegraded());
    }

    public function testADiscountedSimpleProductRendersTheFinalAndTheStruckRegularPrice(): void
    {
        $product = $this->product('simple', $this->amount(15.0), $this->amount(20.0));
        $degraded = new DegradedResponse();

        $html = $this->viewModel($degraded)->getProductPriceHtml($product);

        self::assertStringContainsString('>15.00</span> <span class="text-muted line-through font-normal">20.00<', $html);
        self::assertFalse($degraded->isDegraded());
    }

    public function testThePriceIsTheTaxAdjustedAmountOfThePriceInfoFormattedWithoutConversion(): void
    {
        // 34.00 excluding tax, 36.81 with the 8.25 % adjustment of an including-tax catalog display.
        $product = $this->product('simple', $this->amount(36.805, 34.0), $this->amount(36.805, 34.0));
        $product->method('getFinalPrice')->willReturn(34.0);
        $product->method('getPrice')->willReturn(34.0);
        $priceCurrency = $this->createMock(PriceCurrencyInterface::class);
        $priceCurrency->expects(self::once())->method('format')->with(36.805, false)->willReturn('36.81');
        $priceCurrency->expects(self::never())->method('convert');
        $priceCurrency->expects(self::never())->method('convertAndFormat');
        $priceCurrency->expects(self::never())->method('convertAndRound');

        $html = (new Pricing(
            $priceCurrency,
            $this->createStub(LoggerInterface::class),
            new DegradedResponse(),
            $this->scopeConfig(2)
        ))->getProductPriceHtml($product);

        self::assertSame('<span class="hyperion-price">36.81</span>', $html);
    }

    public function testBothTaxDisplayAddsTheExcludingAmount(): void
    {
        $product = $this->product('simple', $this->amount(36.81, 34.0), $this->amount(36.81, 34.0));

        $html = $this->viewModel(new DegradedResponse(), 3)->getProductPriceHtml($product);

        self::assertStringContainsString('<span>36.81</span>', $html);
        self::assertStringContainsString('Excl. Tax: 34.00', $html);
    }

    public function testAConfigurableTileReadsTheMinimalPriceAndLoadsNoChild(): void
    {
        $product = $this->createMock(Product::class);
        $product->method('getTypeId')->willReturn('configurable');
        $product->method('getPriceInfo')->willReturn(
            $this->priceInfo($this->amount(99.0), $this->amount(22.0), $this->amount(22.0))
        );
        $product->expects(self::never())->method('getTypeInstance');
        $product->expects(self::never())->method('getFinalPrice');

        $html = $this->viewModel(new DegradedResponse())->getProductPriceHtml($product);

        self::assertSame('<span class="hyperion-price">22.00</span>', $html);
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('compositeTypes')]
    public function testGroupedAndBundleProductsShowTheirMinimalPriceBehindTheLabel(string $type, string $label): void
    {
        $product = $this->product($type, $this->amount(0.0), $this->amount(0.0), $this->amount(14.0));

        $html = $this->viewModel(new DegradedResponse())->getProductPriceHtml($product);

        self::assertStringContainsString($label . '</span> <span>14.00</span>', $html, 'a space separates label and amount');
        self::assertStringNotContainsString('0.00', $html);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function compositeTypes(): array
    {
        return [
            'grouped' => ['grouped', 'Starting at'],
            'bundle' => ['bundle', 'From'],
        ];
    }

    public function testAGroupedProductWithoutAnIndexedPriceStillRendersWithoutFailing(): void
    {
        $product = $this->product('grouped', $this->amount(0.0), $this->amount(0.0), $this->amount(0.0));
        $degraded = new DegradedResponse();

        $html = $this->viewModel($degraded)->getProductPriceHtml($product);

        self::assertStringContainsString('0.00', $html);
        self::assertStringNotContainsString('Starting at', $html);
        self::assertFalse($degraded->isDegraded());
    }

    private function viewModel(DegradedResponse $degraded, ?int $taxDisplayType = null, ?LoggerInterface $logger = null): Pricing
    {
        $priceCurrency = $this->createStub(PriceCurrencyInterface::class);
        $priceCurrency->method('format')->willReturnCallback(
            static fn ($amount): string => number_format((float) $amount, 2)
        );

        return new Pricing(
            $priceCurrency,
            $logger ?? $this->createStub(LoggerInterface::class),
            $degraded,
            $this->scopeConfig($taxDisplayType)
        );
    }

    private function scopeConfig(?int $taxDisplayType): ScopeConfigInterface&Stub
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturn($taxDisplayType === null ? null : (string) $taxDisplayType);

        return $scopeConfig;
    }

    /**
     * An amount whose value without the tax adjustment is `$excludingTax`.
     */
    private function amount(float $value, ?float $excludingTax = null): AmountInterface&Stub
    {
        $amount = $this->createStub(AmountInterface::class);
        $amount->method('getValue')->willReturnCallback(
            static fn ($exclude = null): float => $exclude === null ? $value : ($excludingTax ?? $value)
        );

        return $amount;
    }

    private function priceInfo(AmountInterface $final, AmountInterface $regular, ?AmountInterface $minimal = null): PriceInfoInterface&Stub
    {
        $finalPrice = $this->createStub(FinalPrice::class);
        $finalPrice->method('getAmount')->willReturn($final);
        $finalPrice->method('getMinimalPrice')->willReturn($minimal ?? $final);
        $regularPrice = $this->createStub(RegularPrice::class);
        $regularPrice->method('getAmount')->willReturn($regular);
        $priceInfo = $this->createStub(PriceInfoInterface::class);
        $priceInfo->method('getPrice')->willReturnMap([
            ['final_price', $finalPrice],
            ['regular_price', $regularPrice],
        ]);

        return $priceInfo;
    }

    private function product(
        string $type,
        AmountInterface $final,
        AmountInterface $regular,
        ?AmountInterface $minimal = null
    ): Product&Stub {
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn($type);
        $product->method('getPriceInfo')->willReturn($this->priceInfo($final, $regular, $minimal));

        return $product;
    }
}
