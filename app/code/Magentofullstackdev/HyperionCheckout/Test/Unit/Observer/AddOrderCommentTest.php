<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Observer;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Event;
use Magento\Framework\Event\Observer;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Status\History;
use Magentofullstackdev\HyperionCheckout\Model\OrderComment\Config;
use Magentofullstackdev\HyperionCheckout\Model\OrderExtras;
use Magentofullstackdev\HyperionCheckout\Observer\AddOrderComment;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Observer\AddOrderComment
 */
class AddOrderCommentTest extends TestCase
{
    private function observer(OrderExtras $extras, bool $enabled, ?LoggerInterface $logger = null): AddOrderComment
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturn($enabled);
        return new AddOrderComment(
            $extras,
            new Config($scopeConfig),
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }

    private function event(Order $order): Observer
    {
        $event = new Event(['order' => $order]);
        return new Observer(['event' => $event]);
    }

    public function testTheCommentIsAddedVisibleOnTheStorefrontWithoutNotifyingTheCustomer(): void
    {
        $extras = new OrderExtras();
        $extras->setComment('Leave it at the door');
        $history = $this->createMock(History::class);
        $history->expects(self::once())->method('setIsCustomerNotified')->with(0)->willReturnSelf();
        $order = $this->createMock(Order::class);
        $order->method('getStoreId')->willReturn(1);
        $order->expects(self::once())->method('addCommentToStatusHistory')
            ->with('Leave it at the door', false, true)
            ->willReturn($history);

        $this->observer($extras, true)->execute($this->event($order));

        self::assertNull($extras->getComment());
    }

    public function testNoCommentAddsNothing(): void
    {
        $order = $this->createMock(Order::class);
        $order->expects(self::never())->method('addCommentToStatusHistory');

        $this->observer(new OrderExtras(), true)->execute($this->event($order));
    }

    public function testACommentIsIgnoredWhileTheFeatureIsOffForTheOrderStore(): void
    {
        $extras = new OrderExtras();
        $extras->setComment('Leave it at the door');
        $order = $this->createMock(Order::class);
        $order->expects(self::never())->method('addCommentToStatusHistory');

        $this->observer($extras, false)->execute($this->event($order));
    }

    public function testAFailureIsLoggedAndNeverThrown(): void
    {
        $extras = new OrderExtras();
        $extras->setComment('Leave it at the door');
        $order = $this->createStub(Order::class);
        $order->method('addCommentToStatusHistory')->willThrowException(new \RuntimeException('db'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');

        $this->observer($extras, true, $logger)->execute($this->event($order));
    }
}
