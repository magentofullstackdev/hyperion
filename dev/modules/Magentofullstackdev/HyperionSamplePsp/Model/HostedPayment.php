<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSamplePsp\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Sales\Api\OrderRepositoryInterface;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Payment;

/**
 * What the fake hosted page reports back: the payment was made (an invoice
 * is registered as a gateway notification would) or the shopper canceled.
 */
class HostedPayment
{
    /**
     * @param OrderRepositoryInterface $orderRepository
     */
    public function __construct(
        private readonly OrderRepositoryInterface $orderRepository
    ) {
    }

    /**
     * Register the payment of the whole order and invoice it.
     *
     * @param Order $order
     * @return void
     * @throws LocalizedException when the order has no payment
     */
    public function pay(Order $order): void
    {
        $payment = $order->getPayment();
        if (!$payment instanceof Payment) {
            throw new LocalizedException(__('The sample payment could not be registered.'));
        }
        $payment->setTransactionId('sample-' . bin2hex(random_bytes(8)));
        $payment->setIsTransactionClosed(true);
        $payment->registerCaptureNotification((float) $order->getBaseGrandTotal(), true);
        $this->orderRepository->save($order);
    }

    /**
     * Cancel the order the shopper did not pay.
     *
     * @param Order $order
     * @return void
     */
    public function cancel(Order $order): void
    {
        if (!$order->canCancel()) {
            return;
        }
        $order->cancel();
        $order->addCommentToStatusHistory((string) __('The shopper canceled the sample payment.'));
        $this->orderRepository->save($order);
    }
}
