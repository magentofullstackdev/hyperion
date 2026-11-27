<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment\Express;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Model\Product;
use Magentofullstackdev\HyperionCheckout\Model\Payment\Express\PaypalButton;
use Magentofullstackdev\HyperionCheckout\ViewModel\PaypalExpress;
use PHPUnit\Framework\TestCase;

/**
 * The PayPal express entry follows the PayPal view model: visible where the
 * merchant shows the smart buttons, configured and sized as before.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Payment\Express\PaypalButton
 */
class PaypalButtonTest extends TestCase
{
    private const CONFIG = ['context' => 'cart', 'sdkUrl' => 'https://www.paypal.com/sdk/js?client-id=X'];

    public function testTheButtonsShowWhereTheMerchantShowsThem(): void
    {
        $express = $this->createMock(PaypalExpress::class);
        $express->method('isAvailable')->willReturn(true);
        $express->expects(self::once())->method('isVisible')->with('cart', null)->willReturn(true);
        $express->expects(self::once())->method('getConfig')->with('cart')->willReturn(self::CONFIG);
        $express->method('serialize')->willReturn('{"sdkUrl":"x"}');
        $button = new PaypalButton($express);

        self::assertTrue($button->isAvailable('cart', null));
        self::assertSame(self::CONFIG, $button->getOptions('cart', null), 'the configuration is read once per placement');
    }

    public function testNoButtonWithoutMagentoPaypal(): void
    {
        $express = $this->createMock(PaypalExpress::class);
        $express->method('isAvailable')->willReturn(false);
        $express->expects(self::never())->method('getConfig');

        self::assertFalse((new PaypalButton($express))->isAvailable('minicart', null));
    }

    public function testNoButtonWhenTheConfigurationHasNoSdkUrl(): void
    {
        $express = $this->createStub(PaypalExpress::class);
        $express->method('isAvailable')->willReturn(true);
        $express->method('isVisible')->willReturn(true);
        $express->method('getConfig')->willReturn(['sdkUrl' => '']);
        $express->method('serialize')->willReturn('');

        self::assertFalse((new PaypalButton($express))->isAvailable('cart', null));
    }

    public function testTheProductPlacementNeedsTheProductAndTheTopOfTheCheckoutHasNoButton(): void
    {
        $express = $this->createMock(PaypalExpress::class);
        $express->method('isAvailable')->willReturn(true);
        $product = $this->createStub(Product::class);
        $product->method('getId')->willReturn(7);
        $express->expects(self::once())->method('isVisible')->with('product', $product)->willReturn(true);
        $express->method('getConfig')->willReturn(self::CONFIG);
        $express->method('serialize')->willReturn('{}');
        $button = new PaypalButton($express);

        self::assertFalse($button->isAvailable('product', null));
        self::assertFalse($button->isAvailable('product', $this->createStub(ProductInterface::class)));
        self::assertTrue($button->isAvailable('product', $product));
        self::assertFalse($button->isAvailable('checkout-top', null));
    }

    public function testTheReservedHeightIsTheOneOfTheSmartButtons(): void
    {
        $express = $this->createMock(PaypalExpress::class);
        $express->expects(self::once())->method('getReservedHeight')->with(self::CONFIG)->willReturn(104);

        self::assertSame(104, (new PaypalButton($express))->getReservedHeight('cart', self::CONFIG));
    }
}
