<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment;

use Magento\Payment\Api\Data\PaymentMethodInterface;
use Magento\Payment\Api\PaymentMethodListInterface;
use Magento\Payment\Helper\Data as PaymentHelper;
use Magento\Payment\Model\MethodInterface;
use Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethods;
use Psr\Log\LoggerInterface;

/**
 * The hidden methods of a store view: active, offered in the checkout and
 * served by no renderer entry.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Payment\UnsupportedMethods
 */
class UnsupportedMethodsTest extends RendererPoolTestCase
{
    public function testCollectsActiveCheckoutMethodsWithoutARenderer(): void
    {
        $collector = $this->collector([
            'checkmo' => ['Check / Money order', true],
            'braintree_cc_vault' => ['Stored Cards', true],
            'payment_services_paypal_hosted_fields' => ['Credit Card', true],
            'amazon_payment' => ['Amazon Pay', true],
            'admin_only' => ['Admin only', false],
        ]);

        self::assertSame(
            ['amazon_payment' => 'Amazon Pay', 'payment_services_paypal_hosted_fields' => 'Credit Card'],
            $collector->collect(1)
        );
    }

    public function testInspectReportsTheEntryOfEveryActiveMethod(): void
    {
        $rows = $this->collector([
            'free' => ['No Payment Information Required', true],
            'admin_only' => ['Admin only', false],
        ])->inspect(1);

        self::assertSame('offline', $rows[0]['entry']['id'] ?? null);
        self::assertTrue($rows[0]['checkout']);
        self::assertNull($rows[1]['entry']);
        self::assertFalse($rows[1]['checkout']);
    }

    public function testAMethodThatCannotBeInspectedIsNotReported(): void
    {
        $collector = $this->collector(['broken' => ['Broken', new \RuntimeException('no config')]]);

        self::assertSame([], $collector->collect(1));
    }

    /**
     * @param array<string, array{0: string, 1: bool|\Throwable}> $methods
     */
    private function collector(array $methods): UnsupportedMethods
    {
        $active = [];
        $instances = [];
        foreach ($methods as $code => [$title, $checkout]) {
            $method = $this->createStub(PaymentMethodInterface::class);
            $method->method('getCode')->willReturn($code);
            $method->method('getTitle')->willReturn($title);
            $active[] = $method;
            $instance = $this->createStub(MethodInterface::class);
            if ($checkout instanceof \Throwable) {
                $instance->method('canUseCheckout')->willThrowException($checkout);
            } else {
                $instance->method('canUseCheckout')->willReturn($checkout);
            }
            $instances[] = [$code, $instance];
        }
        $list = $this->createStub(PaymentMethodListInterface::class);
        $list->method('getActiveList')->willReturn($active);
        $helper = $this->createStub(PaymentHelper::class);
        $helper->method('getMethodInstance')->willReturnMap($instances);

        return new UnsupportedMethods($list, $helper, $this->pool(self::FIRST_PARTY), $this->createStub(LoggerInterface::class));
    }
}
