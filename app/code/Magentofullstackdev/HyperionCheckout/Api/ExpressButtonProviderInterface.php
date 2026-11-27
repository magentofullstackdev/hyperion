<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Api;

use Magento\Catalog\Api\Data\ProductInterface;

/**
 * Decides whether an express button of `Model\Payment\ExpressButtonPool`
 * shows in a placement and what its element receives as `options`.
 *
 * Named by the `provider` item of a pool entry (a class name string, resolved
 * when the express slot renders). An entry without a provider is always available and
 * gets its static `options` only. A provider that throws drops its entry for
 * that render; the page and the other buttons are not affected.
 *
 * Placements: `product`, `cart`, `minicart`, `checkout-top`. The product is
 * given on the `product` placement only.
 *
 * @api
 * @since 0.9.0
 */
interface ExpressButtonProviderInterface
{
    /**
     * Whether the button shows in the placement.
     *
     * On the product placement the page is edge cached and block cached: decide from store
     * configuration and the HTTP context only, never from the session.
     *
     * @param string $placement
     * @param ProductInterface|null $product
     * @return bool
     */
    public function isAvailable(string $placement, ?ProductInterface $product): bool;

    /**
     * Options merged over the entry's static `options`. JSON serializable; printed into the
     * page, so never a secret.
     *
     * @param string $placement
     * @param ProductInterface|null $product
     * @return array<string, mixed>
     */
    public function getOptions(string $placement, ?ProductInterface $product): array;
}
