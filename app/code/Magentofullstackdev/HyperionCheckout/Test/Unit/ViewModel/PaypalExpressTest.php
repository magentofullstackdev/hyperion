<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\ViewModel;

use Magento\Catalog\Model\ProductTypes\ConfigInterface as ProductTypeConfig;
use Magento\Checkout\Helper\Data as CheckoutHelper;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Framework\UrlInterface;
use Magento\Payment\Helper\Data as PaymentHelper;
use Magento\Quote\Model\QuoteIdToMaskedQuoteIdInterface;
use Magentofullstackdev\HyperionCheckout\ViewModel\PaypalExpress;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The smart buttons placement reserves the height the SDK will render: fixed
 * button height, one row per stacked funding source, the SDK's row gap.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\ViewModel\PaypalExpress
 */
class PaypalExpressTest extends TestCase
{
    private const SDK = 'https://www.paypal.com/sdk/js?client-id=X&currency=EUR&enable-funding=venmo%2Cpaylater'
        . '&disable-funding=card%2Cbancontact%2Ceps&components=messages%2Cbuttons';

    public function testStylesGetTheFixedHeightAndAHorizontalRowDropsTheTagline(): void
    {
        $express = $this->express();

        self::assertSame(
            ['layout' => 'vertical', 'color' => 'gold', 'height' => 45],
            $express->normalizeStyles(['layout' => 'vertical', 'color' => 'gold'])
        );
        self::assertSame(
            ['layout' => 'horizontal', 'height' => 55, 'tagline' => false],
            $express->normalizeStyles(['layout' => 'horizontal', 'height' => '80'])
        );
    }

    public function testTheReservedHeightCountsTheStackedRowsAndTheGap(): void
    {
        $express = $this->express();

        // PayPal + Pay Later (the card button is disabled): a typical product page.
        self::assertSame(104, $express->getReservedHeight(['styles' => ['layout' => 'vertical', 'height' => 45], 'sdkUrl' => self::SDK]));
        self::assertSame(127, $express->getReservedHeight(['styles' => ['layout' => 'vertical', 'height' => 55], 'sdkUrl' => self::SDK]), 'measured: two 55 px buttons, 17 px apart');
        // Nothing disabled: PayPal, Pay Later and the card button.
        self::assertSame(163, $express->getReservedHeight(['styles' => ['height' => 45], 'sdkUrl' => 'https://www.paypal.com/sdk/js?client-id=X']));
        // Pay Later and card disabled: one button.
        self::assertSame(45, $express->getReservedHeight(['styles' => ['height' => 45], 'sdkUrl' => 'https://www.paypal.com/sdk/js?disable-funding=paylater%2Ccard']));
        // A horizontal layout is one row whatever the funding.
        self::assertSame(45, $express->getReservedHeight(['styles' => ['layout' => 'horizontal', 'height' => 45], 'sdkUrl' => 'https://www.paypal.com/sdk/js?client-id=X']));
        // No styles at all: the fixed default height.
        self::assertSame(163, $express->getReservedHeight(['sdkUrl' => 'https://www.paypal.com/sdk/js?client-id=X']));
    }

    public function testSerializeAnswersNothingWithoutAnSdkUrl(): void
    {
        $express = $this->express();

        self::assertSame('', $express->serialize([]));
        self::assertSame('', $express->serialize(['sdkUrl' => '']));
        self::assertSame('{"sdkUrl":"https:\/\/www.paypal.com\/sdk\/js"}', $express->serialize(['sdkUrl' => 'https://www.paypal.com/sdk/js']));
    }

    private function express(): PaypalExpress
    {
        return new PaypalExpress(
            $this->createStub(ModuleManager::class),
            $this->createStub(ObjectManagerInterface::class),
            $this->createStub(CheckoutSession::class),
            $this->createStub(CheckoutHelper::class),
            $this->createStub(PaymentHelper::class),
            $this->createStub(ProductTypeConfig::class),
            $this->createStub(HttpContext::class),
            $this->createStub(QuoteIdToMaskedQuoteIdInterface::class),
            $this->createStub(UrlInterface::class),
            new Json(),
            $this->createStub(LoggerInterface::class)
        );
    }
}
