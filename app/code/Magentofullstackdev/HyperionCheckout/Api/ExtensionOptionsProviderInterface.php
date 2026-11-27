<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Api;

use Magento\Quote\Api\Data\CartInterface;

/**
 * Computes the `options` an extension element of the checkout receives on
 * top of the static `options` of its pool entry.
 *
 * Named by the `options_provider` item of a pool entry (a class name string,
 * resolved when the checkout configuration is built). A provider that throws
 * drops its entry for that page; the checkout and the other entries are not
 * affected.
 *
 * @api
 * @since 0.9.0
 */
interface ExtensionOptionsProviderInterface
{
    /**
     * Options merged over the entry's static `options`.
     *
     * JSON serializable. They are printed into the page: never a secret.
     *
     * @param CartInterface $quote
     * @return array<string, mixed>
     */
    public function getOptions(CartInterface $quote): array;
}
