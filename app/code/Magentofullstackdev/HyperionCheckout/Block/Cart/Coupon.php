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
 *
 * After a refused code the plugin sets the block data `coupon_attempt`
 * and `coupon_error`; the template hands them to the form, which stays
 * open with the code and the reason.
 *
 * Children are printed inside the form: the layouts add core's CAPTCHA
 * block (`captcha`, form id `sales_rule_coupon_request`) and, when the
 * module is installed, the coupon reCAPTCHA.
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

    /**
     * The code of a refused apply request, empty otherwise.
     *
     * @return string
     */
    public function getAttemptedCode(): string
    {
        $code = $this->getData('coupon_attempt');

        return is_string($code) ? $code : '';
    }

    /**
     * Why the attempted code was refused, as plain text.
     *
     * @return string
     */
    public function getAttemptError(): string
    {
        $error = $this->getData('coupon_error');

        return is_string($error) ? $error : '';
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
