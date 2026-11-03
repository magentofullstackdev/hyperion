<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\ViewModel;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magentofullstackdev\HyperionCore\ViewModel\GoogleGtag;
use Psr\Log\LoggerInterface;

/**
 * GA4 payloads of the checkout page (`begin_checkout`, the current quote)
 * and of the success page (`purchase`, the last real order of the session).
 * Both pages render a `cacheable="false"` block, so the session data is live.
 */
class GtagCheckout implements ArgumentInterface
{
    /**
     * @param GoogleGtag $gtag
     * @param CheckoutSession $checkoutSession
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly GoogleGtag $gtag,
        private readonly CheckoutSession $checkoutSession,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * JSON of the `begin_checkout` event, empty when tracking is off or the quote has no item.
     *
     * @return string
     */
    public function getBeginCheckoutJson(): string
    {
        if (!$this->gtag->isEnabled()) {
            return '';
        }
        try {
            $quote = $this->checkoutSession->getQuote();
            if (!$quote->getId() || $quote->getItemsCount() < 1) {
                return '';
            }

            return $this->gtag->toJson($this->gtag->beginCheckout($quote));
        } catch (\Throwable $e) {
            $this->logger->error('GtagCheckout::getBeginCheckoutJson -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * JSON of the `purchase` event for the last placed order, empty when tracking is off or no order is known.
     *
     * @return string
     */
    public function getPurchaseJson(): string
    {
        if (!$this->gtag->isEnabled()) {
            return '';
        }
        try {
            $order = $this->checkoutSession->getLastRealOrder();
            if (!$order->getId()) {
                return '';
            }

            return $this->gtag->toJson($this->gtag->purchase($order));
        } catch (\Throwable $e) {
            $this->logger->error('GtagCheckout::getPurchaseJson -- ' . $e->getMessage());

            return '';
        }
    }
}
