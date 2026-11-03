<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Block\Cart;

use Magentofullstackdev\HyperionCheckout\ViewModel\CartData;
use Magento\Framework\View\Element\Template;
use Psr\Log\LoggerInterface;

/**
 * Server-rendered cart totals card.
 *
 * Emits `#hyperion-cart-totals` so every HTMX cart mutation (coupon
 * apply/remove, qty update, item delete) can ship an OOB
 * `hx-swap-oob="outerHTML"` replacement that keeps the sidebar in sync
 * without a full page reload.
 */
class Totals extends Template
{
    public function __construct(
        Template\Context $context,
        private readonly CartData $cartData,
        private readonly LoggerInterface $logger,
        array $data = []
    ) {
        parent::__construct($context, $data);
    }

    /**
     * The wrapping id must match the HTMX OOB target in
     * Magentofullstackdev\HyperionCore\Plugin\Checkout\Controller\Cart\* plugins.
     */
    public function getTargetId(): string
    {
        return 'hyperion-cart-totals';
    }

    /**
     * Totals rows that follow the store's tax display settings.
     *
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>
     */
    public function getRows(): array
    {
        return $this->cartData->getTotalsRows();
    }

    public function getCheckoutUrl(): string
    {
        try {
            return $this->cartData->getCheckoutUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Cart\Totals::getCheckoutUrl failed', ['exception' => $e]);
            return '/checkout';
        }
    }

    public function getCacheLifetime(): ?int
    {
        return null;
    }
}
