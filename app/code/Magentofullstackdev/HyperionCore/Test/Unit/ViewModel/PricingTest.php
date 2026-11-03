<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Framework\Pricing\Amount\AmountInterface;
use Magento\Framework\Pricing\PriceInfoInterface;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\ViewModel\Pricing;
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
        $product->method('getPrice')->willThrowException(new \RuntimeException('pricing down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');
        $degraded = new DegradedResponse();

        $html = (new Pricing($this->createStub(PricingHelper::class), $logger, $degraded))->getProductPriceHtml($product);

        self::assertSame('<span class="price">--</span>', $html);
        self::assertTrue($degraded->isDegraded());
    }

    public function testASimpleProductRendersItsPrice(): void
    {
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn('simple');
        $product->method('getPrice')->willReturn(20.0);
        $product->method('getFinalPrice')->willReturn(15.0);
        $helper = $this->createStub(PricingHelper::class);
        $helper->method('currency')->willReturnCallback(static fn (float $amount): string => number_format($amount, 2));
        $degraded = new DegradedResponse();

        $html = (new Pricing($helper, $this->createStub(LoggerInterface::class), $degraded))->getProductPriceHtml($product);

        self::assertStringContainsString('15.00', $html);
        self::assertStringContainsString('20.00', $html);
        self::assertFalse($degraded->isDegraded());
    }

    /**
     * @dataProvider compositeTypes
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('compositeTypes')]
    public function testGroupedAndBundleProductsShowTheirMinimalPrice(string $type, string $label): void
    {
        $amount = $this->createStub(AmountInterface::class);
        $amount->method('getValue')->willReturn(14.0);
        $finalPrice = $this->createStub(FinalPrice::class);
        $finalPrice->method('getMinimalPrice')->willReturn($amount);
        $priceInfo = $this->createStub(PriceInfoInterface::class);
        $priceInfo->method('getPrice')->willReturnMap([['final_price', $finalPrice]]);
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn($type);
        $product->method('getPrice')->willReturn(0.0);
        $product->method('getFinalPrice')->willReturn(0.0);
        $product->method('getPriceInfo')->willReturn($priceInfo);
        $helper = $this->createStub(PricingHelper::class);
        $helper->method('currency')->willReturnCallback(static fn (float $amount): string => number_format($amount, 2));

        $html = (new Pricing($helper, $this->createStub(LoggerInterface::class), new DegradedResponse()))->getProductPriceHtml($product);

        self::assertStringContainsString('14.00', $html);
        self::assertStringContainsString($label, $html);
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
        $finalPrice = $this->createStub(FinalPrice::class);
        $amount = $this->createStub(AmountInterface::class);
        $amount->method('getValue')->willReturn(0.0);
        $finalPrice->method('getMinimalPrice')->willReturn($amount);
        $priceInfo = $this->createStub(PriceInfoInterface::class);
        $priceInfo->method('getPrice')->willReturn($finalPrice);
        $product = $this->createStub(Product::class);
        $product->method('getTypeId')->willReturn('grouped');
        $product->method('getPriceInfo')->willReturn($priceInfo);
        $product->method('getPrice')->willReturn(0.0);
        $product->method('getFinalPrice')->willReturn(0.0);
        $helper = $this->createStub(PricingHelper::class);
        $helper->method('currency')->willReturnCallback(static fn (float $amount): string => number_format($amount, 2));
        $degraded = new DegradedResponse();

        $html = (new Pricing($helper, $this->createStub(LoggerInterface::class), $degraded))->getProductPriceHtml($product);

        self::assertStringContainsString('0.00', $html);
        self::assertFalse($degraded->isDegraded());
    }
}
