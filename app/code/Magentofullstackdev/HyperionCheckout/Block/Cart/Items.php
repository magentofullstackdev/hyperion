<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Block\Cart;

use Magentofullstackdev\HyperionCheckout\ViewModel\CartData;
use Magento\Framework\Data\Form\FormKey;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Template;
use Psr\Log\LoggerInterface;

class Items extends Template
{
    /**
     * @param Template\Context $context
     * @param CartData $cartData
     * @param FormKey $formKey
     * @param UrlInterface $urlBuilder
     * @param LoggerInterface $logger
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        private readonly CartData $cartData,
        private readonly FormKey $formKey,
        private readonly UrlInterface $urlBuilder,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * @return array
     */
    public function getItems(): array
    {
        try {
            return $this->cartData->getItems();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getItems -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return string
     */
    public function getFormattedSubtotal(): string
    {
        try {
            return $this->cartData->getFormattedSubtotal();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getFormattedSubtotal -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getFormattedGrandTotal(): string
    {
        try {
            return $this->cartData->getFormattedGrandTotal();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getFormattedGrandTotal -- ' . $e->getMessage());
            return '';
        }
    }

    public function getDiscountAmount(): float
    {
        try {
            return $this->cartData->getDiscountAmount();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getDiscountAmount failed', ['exception' => $e]);
            return 0.0;
        }
    }

    public function getFormattedDiscount(): string
    {
        try {
            return $this->cartData->getFormattedDiscount();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getFormattedDiscount failed', ['exception' => $e]);
            return '';
        }
    }

    public function getAppliedCoupon(): string
    {
        try {
            return $this->cartData->getAppliedCoupon();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getAppliedCoupon failed', ['exception' => $e]);
            return '';
        }
    }

    public function getShippingAmount(): float
    {
        try {
            return $this->cartData->getShippingAmount();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getShippingAmount failed', ['exception' => $e]);
            return 0.0;
        }
    }

    public function getFormattedShipping(): string
    {
        try {
            return $this->cartData->getFormattedShipping();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getFormattedShipping failed', ['exception' => $e]);
            return '';
        }
    }

    public function getTaxAmount(): float
    {
        try {
            return $this->cartData->getTaxAmount();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getTaxAmount failed', ['exception' => $e]);
            return 0.0;
        }
    }

    public function getFormattedTax(): string
    {
        try {
            return $this->cartData->getFormattedTax();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getFormattedTax failed', ['exception' => $e]);
            return '';
        }
    }

    /**
     * @return string
     */
    public function getFormKey(): string
    {
        try {
            return $this->formKey->getFormKey();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getFormKey -- ' . $e->getMessage());
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
            $this->logger->error('Cart\Items::getCartUrl -- ' . $e->getMessage());
            return '';
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
            $this->logger->error('Cart\Items::getCheckoutUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getUpdateCartUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('checkout/cart/updatePost');
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getUpdateCartUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param int $itemId
     * @return string
     */
    public function getRemoveItemUrl(int $itemId): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('checkout/cart/delete', ['id' => $itemId]);
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getRemoveItemUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return string
     */
    public function getContinueShoppingUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('');
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::getContinueShoppingUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return bool
     */
    public function hasItems(): bool
    {
        try {
            return $this->cartData->hasItems();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Items::hasItems -- ' . $e->getMessage());
            return false;
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
