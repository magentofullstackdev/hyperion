// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Totals + total-segment shapes.
 *
 * Reference reading:
 *   vendor/magento/module-quote/Api/Data/TotalSegmentInterface.php
 *   vendor/magento/module-quote/Api/Data/TotalsInterface.php
 *
 * Fixture basis: checkoutConfig.guest.json -> totalsData (4 segments:
 * subtotal, shipping, tax, grand_total). Virtual cart fixture drops
 * the shipping segment. Extensions insert additional segments with
 * arbitrary codes and their own `extension_attributes` shapes --
 * `summary-totals` (P2) iterates positionally and renders every
 * segment without filtering.
 *
 * Magento monetary fields are serialized as decimal strings (see
 * `common.ts` notes). Parse in `utils/currency.ts` at display time.
 */
import type { Decimal, ExtensionAttributes } from './common.js';

/**
 * One row in `totalsData.total_segments`. Many extensions emit their
 * own segments; we don't enumerate codes here because the contract is
 * "render everything in order".
 */
export interface TotalSegment {
    code: string;
    title: string;
    value: Decimal;
    /** `null` | `"body"` | `"footer"` in stock Magento. */
    area: string | null;
    extension_attributes?: ExtensionAttributes;
}

/**
 * The full `totalsData` payload. Listed fields are those actually
 * read by the Lit bundle; Magento emits many more (base_* duplicates,
 * per-tax-rate breakdowns) that we keep untyped via the index signature.
 */
export interface Totals {
    grand_total: Decimal;
    base_grand_total: Decimal;
    subtotal: Decimal;
    base_subtotal: Decimal;
    discount_amount: Decimal;
    base_discount_amount: Decimal;
    subtotal_with_discount: Decimal;
    subtotal_incl_tax: Decimal;
    shipping_amount: Decimal;
    shipping_tax_amount: Decimal;
    shipping_incl_tax: Decimal;
    shipping_discount_amount: Decimal;
    tax_amount: Decimal;
    coupon_code: string | null;
    items_qty: Decimal;
    items: readonly unknown[];
    total_segments: readonly TotalSegment[];
    quote_currency_code: string;
    base_currency_code: string;
    extension_attributes?: ExtensionAttributes;
    [key: string]: unknown;
}
