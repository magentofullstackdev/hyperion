<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Sales\Api\Data\OrderInterface;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\Config;
use Magentofullstackdev\HyperionCheckout\Model\Newsletter\SubscriptionBridge;
use Magentofullstackdev\HyperionCheckout\Model\OrderExtras;
use Psr\Log\LoggerInterface;

/**
 * Subscribes the shopper to the newsletter after the order was placed
 * (`checkout_submit_all_after`) when the opt-in was ticked: the customer
 * account for a customer order, the order email for a guest order when the
 * store lets guests subscribe. A newsletter failure is logged and never
 * fails the order.
 */
class SubscribeAfterOrder implements ObserverInterface
{
    /**
     * @param OrderExtras $extras
     * @param Config $config
     * @param SubscriptionBridge $bridge
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly OrderExtras $extras,
        private readonly Config $config,
        private readonly SubscriptionBridge $bridge,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     */
    public function execute(Observer $observer): void
    {
        if (!$this->extras->shouldSubscribe()) {
            return;
        }
        $this->extras->setSubscribe(false);
        try {
            $order = $observer->getEvent()->getData('order');
            if (!$order instanceof OrderInterface) {
                return;
            }
            $storeId = (int) $order->getStoreId();
            if (!$this->config->isEnabled($storeId) || !$this->bridge->isAvailable($storeId)) {
                return;
            }
            $customerId = (int) $order->getCustomerId();
            if ($customerId > 0 && !$order->getCustomerIsGuest()) {
                $this->bridge->subscribeCustomer($customerId, $storeId);
                return;
            }
            $email = trim((string) $order->getCustomerEmail());
            if ($email !== '' && $this->bridge->isGuestSubscriptionAllowed($storeId)) {
                $this->bridge->subscribeGuest($email, $storeId);
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: the newsletter subscription after the order failed', [
                'exception' => $e,
            ]);
        }
    }
}
