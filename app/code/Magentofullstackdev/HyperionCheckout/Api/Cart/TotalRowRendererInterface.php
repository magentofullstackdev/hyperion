<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Api\Cart;

use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Address\Total;

/**
 * Turns one collected total of the quote into the rows the cart summary
 * prints for it.
 *
 * Registered by total code on Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool,
 * argument `renderers` in etc/frontend/di.xml, the item name being the total
 * code and the value the class name of the renderer (`xsi:type="string"`).
 * A total without a renderer prints as one plain row from its title and
 * value (a negative value as a discount); a renderer replaces that row.
 *
 * Row shape, every key a string:
 *   - `code`  identifies the row (the total code, or a variant of it);
 *   - `label` the text in front of the amount, already translated;
 *   - `note`  a short text printed in parentheses after the label, empty for none;
 *   - `value` the amount, formatted in the quote currency;
 *   - `kind`  `regular`, `detail` (a breakdown line in smaller text), `discount`
 *             or `grand` (the grand total style).
 *
 * The cart and its htmx fragments render the rows: the renderer may read the
 * quote, never write it.
 *
 * @api
 * @since 0.9.0
 */
interface TotalRowRendererInterface
{
    /**
     * The rows of this total, none when the total has nothing to show.
     *
     * @param Total $total
     * @param Quote $quote
     * @return array<int, array{code: string, label: string, note: string, value: string, kind: string}>
     */
    public function render(Total $total, Quote $quote): array;
}
