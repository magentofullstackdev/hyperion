<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Api;

use Magento\Quote\Api\Data\CartInterface;

/**
 * What a shipping extension already stored on the quote, handed back to
 * its element as `value` when the checkout renders, so a reload restores
 * the shopper's choice (a pickup point, a delivery slot).
 *
 * Named by the `value_provider` item of a shipping extension entry (a class
 * name string). A provider that throws drops its entry for that page.
 *
 * @api
 * @since 0.9.0
 */
interface ShippingExtensionValueProviderInterface
{
    /**
     * The stored value, null when the quote holds none.
     *
     * Keys: `address` (merged into the shipping address extension
     * attributes), `information` (merged into the shipping information
     * extension attributes), `summary` (`label` and up to three `lines`,
     * plain text) and `state` (opaque to the checkout). JSON serializable,
     * printed into the page: never a secret.
     *
     * @param CartInterface $quote
     * @return array{address?: array<string, mixed>, information?: array<string, mixed>,
     *     summary?: array{label: string, lines: string[]}, state?: mixed}|null
     */
    public function getValue(CartInterface $quote): ?array;
}
