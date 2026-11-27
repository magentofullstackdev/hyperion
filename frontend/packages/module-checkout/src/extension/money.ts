// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The confirmed totals of the quote as the two `MoneyTotals` of the
 * extension API: `display` in the quote currency, `base` in the base
 * currency (what a gateway charges). Every amount comes from the server's
 * totals; when one of the base amounts is missing the pair is null, never
 * a value converted here.
 */
import type { MoneyTotals } from '../../extension-api.js';
import type { Totals } from '../types/totals.js';

/** A server amount (a number or a decimal string) as a number; null when it is not one. */
export function amountOf(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

const FIELDS = ['grandTotal', 'subtotal', 'shipping', 'tax', 'discount'] as const;
const DISPLAY_KEYS = ['grand_total', 'subtotal', 'shipping_amount', 'tax_amount', 'discount_amount'] as const;

function money(totals: Totals, currency: unknown, prefix: '' | 'base_'): MoneyTotals | null {
    if (typeof currency !== 'string' || currency === '') return null;
    const out: Record<string, unknown> = { currency };
    for (let i = 0; i < FIELDS.length; i += 1) {
        const value = amountOf(totals[`${prefix}${DISPLAY_KEYS[i]}`]);
        if (value === null) return null;
        out[FIELDS[i]!] = value;
    }
    return Object.freeze(out) as unknown as MoneyTotals;
}

/** The display and base totals; null without totals or when an amount is missing. */
export function moneyTotalsOf(totals: Totals | null): { display: MoneyTotals; base: MoneyTotals } | null {
    if (totals === null) return null;
    const display = money(totals, totals.quote_currency_code, '');
    const base = money(totals, totals.base_currency_code, 'base_');
    return display === null || base === null ? null : Object.freeze({ display, base });
}
