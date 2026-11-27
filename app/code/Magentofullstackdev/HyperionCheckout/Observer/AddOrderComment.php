<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Sales\Model\Order;
use Magentofullstackdev\HyperionCheckout\Model\OrderComment\Config;
use Magentofullstackdev\HyperionCheckout\Model\OrderExtras;
use Psr\Log\LoggerInterface;

/**
 * Adds the shopper's order comment to the order history
 * (`sales_model_service_quote_submit_before`): visible on the storefront
 * order view, the customer is not notified. The comment is used once.
 */
class AddOrderComment implements ObserverInterface
{
    /**
     * @param OrderExtras $extras
     * @param Config $config
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly OrderExtras $extras,
        private readonly Config $config,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @inheritdoc
     */
    public function execute(Observer $observer): void
    {
        $comment = $this->extras->getComment();
        if ($comment === null) {
            return;
        }
        try {
            $order = $observer->getEvent()->getData('order');
            if (!$order instanceof Order || !$this->config->isEnabled($order->getStoreId())) {
                return;
            }
            $this->extras->setComment(null);
            $order->addCommentToStatusHistory($comment, false, true)->setIsCustomerNotified(0);
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion checkout: the order comment could not be added', ['exception' => $e]);
        }
    }
}
