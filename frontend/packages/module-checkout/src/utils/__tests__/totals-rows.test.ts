// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, expect, it } from 'vitest';

import type { Totals } from '../../types/totals.js';
import { buildTotalsRows, pickByMode } from '../totals-rows.js';

const labels = {
    exclTax: (title: string): string => `${title} (Excl. Tax)`,
    inclTax: (title: string): string => `${title} (Incl. Tax)`,
};

const totals = {
    subtotal: 100,
    subtotal_incl_tax: 122,
    shipping_amount: 10,
    shipping_incl_tax: 12.2,
    tax_amount: 24.2,
    grand_total: 134.2,
    total_segments: [
        { code: 'subtotal', title: 'Subtotal', value: 100, area: null },
        { code: 'giftwrap', title: 'Gift wrap', value: 3, area: null },
        { code: 'shipping', title: 'Shipping', value: 10, area: null },
        {
            code: 'tax', title: 'Tax', value: 24.2, area: 'taxes',
            extension_attributes: {
                tax_grandtotal_details: [{ amount: 24.2, rates: [{ percent: '22', title: 'IT VAT' }] }],
            },
        },
        { code: 'grand_total', title: 'Grand Total', value: 134.2, area: 'footer' },
    ],
} as unknown as Totals;

describe('buildTotalsRows', () => {
    it('shows amounts excluding tax by default and keeps unknown segments in place', () => {
        const rows = buildTotalsRows(totals, {}, labels);
        expect(rows.map((r) => [r.code, r.value])).toEqual([
            ['subtotal', 100], ['giftwrap', 3], ['shipping', 10], ['tax', 24.2], ['grand_total', 134.2],
        ]);
        expect(rows.at(-1)?.kind).toBe('grand');
    });

    it('shows amounts including tax', () => {
        const rows = buildTotalsRows(
            totals, { reviewTotalsDisplayMode: 'including', reviewShippingDisplayMode: 'including' }, labels,
        );
        expect(rows.find((r) => r.code === 'subtotal')?.value).toBe(122);
        expect(rows.find((r) => r.code === 'shipping')?.value).toBe(12.2);
    });

    it('shows both amounts with labelled rows', () => {
        const rows = buildTotalsRows(
            totals, { reviewTotalsDisplayMode: 'both', reviewShippingDisplayMode: 'both' }, labels,
        );
        expect(rows.filter((r) => r.code.startsWith('subtotal')).map((r) => [r.label, r.value])).toEqual([
            ['Subtotal (Excl. Tax)', 100], ['Subtotal (Incl. Tax)', 122],
        ]);
        expect(rows.filter((r) => r.code.startsWith('shipping')).map((r) => r.value)).toEqual([10, 12.2]);
    });

    it('splits the grand total when tax is included in it', () => {
        const rows = buildTotalsRows(totals, { includeTaxInGrandTotal: true }, labels);
        expect(rows.find((r) => r.code === 'grand_total_excl')?.value).toBeCloseTo(110);
        expect(rows.find((r) => r.code === 'grand_total')?.label).toBe('Grand Total (Incl. Tax)');
    });

    it('lists tax rates for the full summary and hides a zero tax row unless configured', () => {
        const full = buildTotalsRows(totals, { isFullTaxSummaryDisplayed: true }, labels);
        expect(full.find((r) => r.code === 'tax_rate')).toMatchObject({ label: 'IT VAT (22%)', value: 24.2 });

        const zero = { ...totals, total_segments: [{ code: 'tax', title: 'Tax', value: 0, area: null }] } as unknown as Totals;
        expect(buildTotalsRows(zero, {}, labels)).toEqual([]);
        expect(buildTotalsRows(zero, { isZeroTaxDisplayed: true }, labels)).toHaveLength(1);
    });
});

describe('pickByMode', () => {
    it('returns the excl. tax amount only in excluding mode', () => {
        expect(pickByMode('excluding', 10, 12)).toBe(10);
        expect(pickByMode('including', 10, 12)).toBe(12);
        expect(pickByMode('both', 10, 12)).toBe(12);
        expect(pickByMode(undefined, 10, 12)).toBe(12);
    });
});
