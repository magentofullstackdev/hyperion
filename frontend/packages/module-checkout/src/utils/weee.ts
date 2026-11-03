// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Fixed Product Tax (FPT / Weee) lines of a quote item.
 *
 * `Magento_Weee` stores the applied taxes on the item as `weee_tax_applied`,
 * a serialized list the config island carries verbatim, so the summary can
 * show them without another request. Each entry has `title`, the unit
 * `amount` and the `row_amount` (plus `*_incl_tax` variants); the store's
 * `tax/weee/display` setting decides which pair the review shows and
 * `includeTaxInGrandTotal`-like flags do not apply here.
 */
import type { CartItem } from '../types/quote.js';

export interface WeeeLine {
    title: string;
    amount: number;
    rowAmount: number;
}

export function parseWeeeLines(item: CartItem, inclTax = false): readonly WeeeLine[] {
    const raw = item['weee_tax_applied'];
    if (raw === null || raw === undefined || raw === '') return [];
    let list: unknown;
    try {
        list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return [];
    }
    if (!Array.isArray(list)) return [];
    const lines: WeeeLine[] = [];
    for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const amount = Number(inclTax ? e['amount_incl_tax'] ?? e['amount'] : e['amount']);
        const rowAmount = Number(inclTax ? e['row_amount_incl_tax'] ?? e['row_amount'] : e['row_amount']);
        if (!Number.isFinite(rowAmount) || rowAmount <= 0) continue;
        lines.push({
            title: typeof e['title'] === 'string' && e['title'] !== '' ? e['title'] : 'FPT',
            amount: Number.isFinite(amount) ? amount : 0,
            rowAmount,
        });
    }
    return lines;
}
