// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * PayPal line items, a port of PayPal_Braintree
 * `view/frontend/web/js/helper/get-cart-line-items-helper.js`.
 *
 * Sent only when the PayPal method is configured to send them. Every amount
 * is in the base currency, the one the gateway charges: unit prices come
 * from `base_price` / `base_price_incl_tax` of the quote items, never from
 * the display currency prices. Child items and zero-priced items are
 * skipped, a fractional quantity collapses into one unit carrying the row
 * amount, and discount / shipping / tax / store credit / gift card / gift
 * wrapping travel as synthetic lines. With prices that include tax the unit
 * prices and the shipping line carry the tax and there is no tax line.
 *
 * No lines are sent at all when PayPal could not use them: a quote item
 * without its base price, more than 249 lines, or lines that do not add up
 * to the base grand total (PayPal refuses a payment whose breakdown differs
 * from its amount).
 *
 * The Google Pay sheet shows the same breakdown as display items
 * (`buildGooglePayDisplayItems`, port of `get-google-pay-line-items.js`):
 * one row per line with its row amount, credits negative, prices with tax
 * when the catalog prices include it.
 */
import type { CartItem } from '../../../types/quote.js';
import type { Totals } from '../../../types/totals.js';
import { t } from '../../../utils/i18n.js';
import { formatAmount } from './quote.js';
import type { GooglePayDisplayItem, PayPalLineItem } from './types.js';

const MAX_LINE_ITEMS = 249;
const MAX_TEXT_LENGTH = 127;
const RECONCILE_TOLERANCE_CENTS = 1;

function toNumber(value: unknown): number {
    const parsed = parseFloat(String(value ?? 0));
    return Number.isFinite(parsed) ? parsed : 0;
}

/** A base currency amount of a quote item, null when the item does not carry it. */
function baseAmount(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

interface BaseItem {
    item: CartItem;
    unit: number;
    qty: number;
}

/**
 * The priced top-level items with their base currency unit price, or null
 * when one of them lacks it: mixing currencies would be worse than no lines.
 */
function baseItems(items: readonly CartItem[], priceIncludesTax: boolean): BaseItem[] | null {
    const priced: BaseItem[] = [];
    for (const item of items) {
        if (item.parent_item_id !== null && item.parent_item_id !== undefined) continue;
        const net = baseAmount(item.base_price);
        if (net === null) return null;
        if (net === 0) continue;
        const unit = priceIncludesTax ? baseAmount(item.base_price_incl_tax) : net;
        if (unit === null) return null;
        priced.push({ item, unit, qty: toNumber(item.qty) });
    }
    return priced;
}

function synthetic(name: string, kind: 'debit' | 'credit', amount: number): PayPalLineItem {
    return { name, kind, quantity: '1.00', unitAmount: formatAmount(Math.abs(amount)) };
}

function sumOf(lines: readonly PayPalLineItem[]): number {
    let cents = 0;
    for (const line of lines) {
        const amount = Math.round(parseFloat(line.quantity) * parseFloat(line.unitAmount) * 100);
        cents += line.kind === 'credit' ? -amount : amount;
    }
    return cents;
}

export function buildPayPalLineItems(
    items: readonly CartItem[],
    totals: Totals | null,
    priceIncludesTax = false
): PayPalLineItem[] {
    if (!totals) return [];
    const priced = baseItems(items, priceIncludesTax);
    if (priced === null) return [];
    const lines: PayPalLineItem[] = [];

    for (const { item, unit, qty } of priced) {
        const fractional = !Number.isInteger(qty);
        lines.push({
            name: item.name.substring(0, MAX_TEXT_LENGTH),
            kind: 'debit',
            quantity: (fractional ? 1 : qty).toFixed(2),
            unitAmount: (fractional ? qty * unit : unit).toFixed(2),
            productCode: item.sku.substring(0, MAX_TEXT_LENGTH),
            description: fractional
                ? `Item quantity is ${qty.toFixed(2)} and per unit amount is ${unit.toFixed(2)}`
                : '',
        });
    }

    let storeCredit = 0;
    let giftCards = 0;
    let wrappingOrder = 0;
    let wrappingItems = 0;
    let wrappingCard = 0;
    for (const segment of totals.total_segments ?? []) {
        if (segment.code === 'customerbalance') storeCredit = Math.abs(toNumber(segment.value));
        if (segment.code === 'giftcardaccount') giftCards = Math.abs(toNumber(segment.value));
        if (segment.code === 'giftwrapping') {
            const ext = (segment.extension_attributes ?? {}) as Record<string, unknown>;
            wrappingOrder = toNumber(ext['gw_base_price']);
            wrappingItems = toNumber(ext['gw_items_base_price']);
            wrappingCard = toNumber(ext['gw_card_base_price']);
        }
    }

    const discount = Math.abs(toNumber(totals['base_discount_amount']));
    const shipping = toNumber(priceIncludesTax ? totals['base_shipping_incl_tax'] : totals['base_shipping_amount']);
    const tax = toNumber(totals['base_tax_amount']);

    if (discount > 0) lines.push(synthetic('Discount', 'credit', discount));
    if (shipping > 0) lines.push(synthetic('Shipping', 'debit', shipping));
    if (!priceIncludesTax && tax > 0) lines.push(synthetic('Tax', 'debit', tax));
    if (storeCredit > 0) lines.push(synthetic('Store Credit', 'credit', storeCredit));
    if (wrappingItems > 0) lines.push(synthetic('Gift Wrapping for Items', 'debit', wrappingItems));
    if (wrappingOrder > 0) lines.push(synthetic('Gift Wrapping for Order', 'debit', wrappingOrder));
    if (wrappingCard > 0) lines.push(synthetic('Printed Card', 'debit', wrappingCard));
    if (giftCards > 0) lines.push(synthetic('Gift Cards', 'credit', giftCards));

    if (lines.length > MAX_LINE_ITEMS) return [];
    const grandTotal = Math.round(toNumber(totals.base_grand_total) * 100);
    return Math.abs(sumOf(lines) - grandTotal) <= RECONCILE_TOLERANCE_CENTS ? lines : [];
}

function displayItem(label: string, amount: number): GooglePayDisplayItem {
    return { type: 'LINE_ITEM', label, price: formatAmount(amount) };
}

export function buildGooglePayDisplayItems(
    items: readonly CartItem[],
    totals: Totals | null,
    priceIncludesTax: boolean
): GooglePayDisplayItem[] {
    if (!totals) return [];
    const priced = baseItems(items, priceIncludesTax);
    if (priced === null) return [];
    const lines: GooglePayDisplayItem[] = [];
    for (const { item, unit, qty } of priced) {
        lines.push(displayItem(item.name, unit * qty));
    }
    const discount = Math.abs(toNumber(totals['base_discount_amount']));
    const shipping = toNumber(priceIncludesTax ? totals['base_shipping_incl_tax'] : totals['base_shipping_amount'])
        || toNumber(totals['base_shipping_amount']);
    const tax = toNumber(totals['base_tax_amount']);
    if (discount > 0) lines.push(displayItem(t('Hyperion_Checkout::braintree_line_discount'), -discount));
    if (shipping > 0) lines.push(displayItem(t('Hyperion_Checkout::shipping_heading'), shipping));
    if (!priceIncludesTax && tax > 0) lines.push(displayItem(t('Hyperion_Checkout::braintree_line_tax'), tax));
    return lines.length > MAX_LINE_ITEMS ? [] : lines;
}
