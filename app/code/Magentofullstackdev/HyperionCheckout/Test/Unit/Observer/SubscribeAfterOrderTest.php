<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Observer;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Event;
use Magento\Framework\Event\Observer;
use Magento\Sales\Api\Data\OrderInterface;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\Config;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\SubscriptionBridge;
use Magentofullstackdev\HyperionCheckout\Model\OrderExtras;
use Magentofullstackdev\HyperionCheckout\Observer\SubscribeAfterOrder;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Observer\SubscribeAfterOrder
 */
class SubscribeAfterOrderTest extends TestCase
{
    private function extras(bool $subscribe = true): OrderExtras
    {
        $extras = new OrderExtras();
        $extras->setSubscribe($subscribe);
        return $extras;
    }

    private function order(int $customerId, bool $guest, string $email = 'guest@example.com'): Observer
    {
        $order = $this->createStub(OrderInterface::class);
        $order->method('getStoreId')->willReturn(3);
        $order->method('getCustomerId')->willReturn($customerId ?: null);
        $order->method('getCustomerIsGuest')->willReturn($guest ? 1 : 0);
        $order->method('getCustomerEmail')->willReturn($email);
        return new Observer(['event' => new Event(['order' => $order])]);
    }

    private function observer(
        OrderExtras $extras,
        SubscriptionBridge $bridge,
        bool $enabled = true,
        ?LoggerInterface $logger = null
    ): SubscribeAfterOrder {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturn($enabled);
        return new SubscribeAfterOrder(
            $extras,
            new Config($scopeConfig),
            $bridge,
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    public function testACustomerOrderSubscribesTheAccount(): void
    {
        $bridge = $this->createMock(SubscriptionBridge::class);
        $bridge->method('isAvailable')->willReturn(true);
        $bridge->expects(self::once())->method('subscribeCustomer')->with(42, 3);
        $bridge->expects(self::never())->method('subscribeGuest');

        $extras = $this->extras();
        $this->observer($extras, $bridge)->execute($this->order(42, false));

        self::assertFalse($extras->shouldSubscribe());
    }

    public function testAGuestOrderSubscribesTheOrderEmailWhenGuestsMaySubscribe(): void
    {
        $bridge = $this->createMock(SubscriptionBridge::class);
        $bridge->method('isAvailable')->willReturn(true);
        $bridge->method('isGuestSubscriptionAllowed')->willReturn(true);
        $bridge->expects(self::once())->method('subscribeGuest')->with('guest@example.com', 3);

        $this->observer($this->extras(), $bridge)->execute($this->order(0, true));
    }

    public function testAGuestIsNotSubscribedWhenGuestsMayNotSubscribe(): void
    {
        $bridge = $this->createMock(SubscriptionBridge::class);
        $bridge->method('isAvailable')->willReturn(true);
        $bridge->method('isGuestSubscriptionAllowed')->willReturn(false);
        $bridge->expects(self::never())->method('subscribeGuest');

        $this->observer($this->extras(), $bridge)->execute($this->order(0, true));
    }

    public function testNothingHappensWithoutTheOptIn(): void
    {
        $bridge = $this->createMock(SubscriptionBridge::class);
        $bridge->expects(self::never())->method('subscribeCustomer');
        $bridge->expects(self::never())->method('subscribeGuest');

        $this->observer($this->extras(false), $bridge)->execute($this->order(42, false));
    }

    public function testNothingHappensWhenTheNewsletterModuleIsUnavailable(): void
    {
        $bridge = $this->createMock(SubscriptionBridge::class);
        $bridge->method('isAvailable')->willReturn(false);
        $bridge->expects(self::never())->method('subscribeCustomer');

        $this->observer($this->extras(), $bridge)->execute($this->order(42, false));
    }

    public function testASubscriptionFailureIsSwallowedAndLogged(): void
    {
        $bridge = $this->createStub(SubscriptionBridge::class);
        $bridge->method('isAvailable')->willReturn(true);
        $bridge->method('subscribeCustomer')->willThrowException(new \RuntimeException('mail down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $this->observer($this->extras(), $bridge, true, $logger)->execute($this->order(42, false));
    }
}
