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

/**
 * Server-rendered coupon form.
 *
 * Renders #hyperion-coupon-form -- the HTMX target for apply/cancel
 * requests via the native `checkout/cart/couponPost` route. The
 * Hyperion plugin on that controller replies with outerHTML markup of
 * THIS block plus an OOB totals update, so the form reflows to its
 * post-apply state (readonly input + "Cancel Coupon" button) without
 * a full page reload.
 */
class Coupon extends Template
{
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

    public function getAppliedCoupon(): string
    {
        try {
            return $this->cartData->getAppliedCoupon();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Coupon::getAppliedCoupon -- ' . $e->getMessage());
            return '';
        }
    }

    public function getFormKey(): string
    {
        try {
            return $this->formKey->getFormKey();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Coupon::getFormKey -- ' . $e->getMessage());
            return '';
        }
    }

    public function getActionUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('checkout/cart/couponPost');
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Coupon::getActionUrl failed', ['exception' => $e]);
            return '/checkout/cart/couponPost';
        }
    }

    public function getCacheLifetime(): ?int
    {
        return null;
    }
}
