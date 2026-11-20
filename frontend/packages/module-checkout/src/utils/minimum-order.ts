// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The minimum order amount rule, evaluated from the totals on screen.
 *
 * Same comparison as the quote address makes on the server: the subtotal in
 * the base currency, after the discount when the rule says so, plus the tax
 * when the rule says so, against the threshold with a small tolerance for
 * float noise. The totals payload carries no discount tax compensation, so
 * a store that includes tax in the rule AND applies discounts on prices
 * including tax can differ from the server by that amount; the server
 * check at Place Order stays authoritative.
 *
 * Without the numeric rule in the config (`hyperion.minimumOrder` absent)
 * the answer is the one Magento computed for the page (`cartData`).
 */
import type { CheckoutConfig } from '../types/config.js';
import type { Totals } from '../types/totals.js';
import { t } from './i18n.js';

/** `x > y - TOLERANCE` stands for `x >= y` on floats. */
const TOLERANCE = 0.0001;

function amountOf(value: unknown): number {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    return Number.isFinite(n) ? n : 0;
}

/** The message to show while the order is below the minimum amount; null when it is not. */
export function minimumOrderError(totals: Totals | null, config: CheckoutConfig): string | null {
    const rule = config.hyperion?.minimumOrder;
    if (rule === undefined) {
        const cartData = config.cartData;
        if (cartData?.isMinimumAmountValid !== false) return null;
        return cartData.minimumAmountDescription || t('Hyperion_Checkout::min_order_amount_invalid');
    }
    if (rule === null || totals === null) return null;
    const subtotal = rule.includeDiscount
        ? amountOf(totals.base_subtotal_with_discount ?? amountOf(totals.base_subtotal) + amountOf(totals.base_discount_amount))
        : amountOf(totals.base_subtotal);
    const tax = rule.includeTax ? amountOf(totals.base_tax_amount) : 0;
    if (subtotal + tax > amountOf(rule.amount) - TOLERANCE) return null;
    return rule.description || t('Hyperion_Checkout::min_order_amount_invalid');
}
