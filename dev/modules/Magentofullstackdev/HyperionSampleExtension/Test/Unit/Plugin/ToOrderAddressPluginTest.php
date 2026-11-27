<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSampleExtension\Test\Unit\Plugin;

use Magento\Quote\Model\Quote\Address as QuoteAddress;
use Magento\Quote\Model\Quote\Address\ToOrderAddress;
use Magento\Sales\Model\Order\Address as OrderAddress;
use Magentofullstackdev\HyperionSampleExtension\Model\Config;
use Magentofullstackdev\HyperionSampleExtension\Plugin\ToOrderAddressPlugin;
use PHPUnit\Framework\TestCase;

class ToOrderAddressPluginTest extends TestCase
{
    public function testCopiesThePickupPointToTheOrderAddress(): void
    {
        $order = $this->orderAddress();

        $result = $this->plugin(true)->afterConvert(
            $this->createStub(ToOrderAddress::class),
            $order,
            $this->quoteAddress('HL-002')
        );

        self::assertSame($order, $result);
        self::assertSame('HL-002', $order->getData('hyperion_sample_locker_id'));
    }

    public function testLeavesAnAddressWithoutAPointUntouched(): void
    {
        $order = $this->orderAddress();

        $this->plugin(true)->afterConvert($this->createStub(ToOrderAddress::class), $order, $this->quoteAddress(null));

        self::assertFalse($order->hasData('hyperion_sample_locker_id'));
    }

    public function testCopiesNothingWhileTheModuleIsSwitchedOff(): void
    {
        $order = $this->orderAddress();

        $this->plugin(false)->afterConvert(
            $this->createStub(ToOrderAddress::class),
            $order,
            $this->quoteAddress('HL-002')
        );

        self::assertFalse($order->hasData('hyperion_sample_locker_id'));
    }

    /**
     * @param bool $enabled
     * @return ToOrderAddressPlugin
     */
    private function plugin(bool $enabled): ToOrderAddressPlugin
    {
        $config = $this->createStub(Config::class);
        $config->method('isEnabled')->willReturn($enabled);

        return new ToOrderAddressPlugin($config);
    }

    /**
     * A quote address holding the column, built without its dependencies (only its data is read).
     *
     * @param string|null $lockerId
     * @return QuoteAddress
     */
    private function quoteAddress(?string $lockerId): QuoteAddress
    {
        $address = (new \ReflectionClass(QuoteAddress::class))->newInstanceWithoutConstructor();
        if ($lockerId !== null) {
            $address->setData('hyperion_sample_locker_id', $lockerId);
        }

        return $address;
    }

    /**
     * @return OrderAddress
     */
    private function orderAddress(): OrderAddress
    {
        return (new \ReflectionClass(OrderAddress::class))->newInstanceWithoutConstructor();
    }
}
