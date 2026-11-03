<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Block\Minicart;

use Magentofullstackdev\HyperionCheckout\ViewModel\CartData;
use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Framework\DataObject\IdentityInterface;
use Magento\Framework\View\Element\Template;
use Psr\Log\LoggerInterface;

class Fragment extends Template implements IdentityInterface
{
    /**
     * @param Template\Context $context
     * @param CartData $cartData
     * @param CheckoutSession $checkoutSession
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        private readonly CartData $cartData,
        private readonly CheckoutSession $checkoutSession,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * @return int
     */
    public function getItemCount(): int
    {
        try {
            return $this->cartData->getItemCount();
        } catch (\Throwable $e) {
            $this->logger->error('Fragment::getItemCount -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * @return string
     */
    public function getSubtotalHtml(): string
    {
        try {
            return $this->cartData->getFormattedSubtotal();
        } catch (\Throwable $e) {
            $this->logger->error('Fragment::getSubtotalHtml -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return array
     */
    public function getItems(): array
    {
        try {
            return $this->cartData->getItems();
        } catch (\Throwable $e) {
            $this->logger->error('Fragment::getItems -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return string
     */
    public function getCheckoutUrl(): string
    {
        try {
            return $this->cartData->getCheckoutUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Fragment::getCheckoutUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getCartUrl(): string
    {
        try {
            return $this->cartData->getCartUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Fragment::getCartUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return array
     */
    public function getIdentities(): array
    {
        try {
            $tags = ['hyperion_minicart'];
            foreach ($this->cartData->getItems() as $item) {
                $productId = $item['product_id'] ?? 0;
                if ($productId > 0) {
                    $tags[] = 'cat_p_' . $productId;
                }
            }
            return array_values(array_unique($tags));
        } catch (\Throwable $e) {
            $this->logger->error('Fragment::getIdentities -- ' . $e->getMessage());
            return ['hyperion_minicart'];
        }
    }

    /**
     * @return array
     */
    public function getCacheKeyInfo(): array
    {
        try {
            $groupId = 0;
            $quoteId = 0;
            try {
                $quote = $this->checkoutSession->getQuote();
                $groupId = (int) $quote->getCustomerGroupId();
                $quoteId = (int) $quote->getId();
            } catch (\Throwable $e) {
                $this->logger->warning('Fragment::getCacheKeyInfo quote lookup -- ' . $e->getMessage());
            }

            $info = parent::getCacheKeyInfo();
            $info[] = 'customer_group_' . $groupId;
            $info[] = 'quote_' . $quoteId;
            return $info;
        } catch (\Throwable $e) {
            $this->logger->error('Fragment::getCacheKeyInfo -- ' . $e->getMessage());
            return parent::getCacheKeyInfo();
        }
    }

    /**
     * @return null
     */
    public function getCacheLifetime(): ?int
    {
        return null;
    }
}
