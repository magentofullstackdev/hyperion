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

    it('shows both amounts with labeled rows', () => {
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

describe('buildTotalsRows: order, unknown totals and amounts that are not known yet', () => {
    /** Core's default totals sort order, with the entries of Magento_Weee. */
    const TOTALS_SORT = { discount: 20, grand_total: 100, shipping: 30, subtotal: 10, tax: 40, weee: 35, weee_tax: 35 };
    const seg = (code: string, value: unknown, title = code): unknown => ({ code, title, value, area: null });
    const quote = (segments: unknown[], extra: Record<string, unknown> = {}): Totals => ({
        subtotal: 59, subtotal_incl_tax: 59, shipping_amount: 5, shipping_incl_tax: 5, tax_amount: 4.87, grand_total: 71.37,
        ...extra,
        total_segments: segments,
    } as unknown as Totals);

    it('lists the same codes in the same order as the cart for a quote with an extension total', () => {
        const rows = buildTotalsRows(quote([
            seg('subtotal', 59), seg('shipping', 5), seg('tax', 4.87), seg('hyperion_test_fee', 2.5, 'Test fee'),
            seg('grand_total', 71.37),
        ]), {}, labels);
        expect(rows.map((r) => [r.code, r.value])).toEqual([
            ['subtotal', 59], ['shipping', 5], ['tax', 4.87], ['hyperion_test_fee', 2.5], ['grand_total', 71.37],
        ]);
    });

    it('prints a total that comes after the grand total before it', () => {
        const segments = [seg('subtotal', 59), seg('grand_total', 61.5), seg('hyperion_test_fee', 2.5)];
        expect(buildTotalsRows(quote(segments), {}, labels).map((r) => r.code))
            .toEqual(['subtotal', 'hyperion_test_fee', 'grand_total']);
        expect(buildTotalsRows(quote(segments), {}, labels, { totalsSort: TOTALS_SORT }).map((r) => r.code))
            .toEqual(['subtotal', 'hyperion_test_fee', 'grand_total']);
    });

    it('prints the fixed product tax before the tax, like the cart', () => {
        const rows = buildTotalsRows(quote([
            seg('subtotal', 59), seg('discount', -5), seg('shipping', 5), seg('tax', 4.87), seg('weee_tax', 5),
            seg('grand_total', 68.87),
        ]), {}, labels, { totalsSort: TOTALS_SORT });
        expect(rows.map((r) => r.code)).toEqual(['subtotal', 'discount', 'shipping', 'weee_tax', 'tax', 'grand_total']);
    });

    it('keeps an unlisted total behind the total collected before it, like the cart', () => {
        const withFpt = buildTotalsRows(quote([
            seg('subtotal', 59), seg('shipping', 5), seg('tax', 4.87), seg('weee_tax', 5),
            seg('hyperion_test_fee', 2.5), seg('grand_total', 76.37),
        ]), {}, labels, { totalsSort: TOTALS_SORT });
        expect(withFpt.map((r) => r.code))
            .toEqual(['subtotal', 'shipping', 'weee_tax', 'hyperion_test_fee', 'tax', 'grand_total']);

        const withoutFpt = buildTotalsRows(quote([
            seg('subtotal', 59), seg('shipping', 5), seg('tax', 4.87), seg('hyperion_test_fee', 2.5),
            seg('grand_total', 71.37),
        ]), {}, labels, { totalsSort: TOTALS_SORT });
        expect(withoutFpt.map((r) => r.code)).toEqual(['subtotal', 'shipping', 'tax', 'hyperion_test_fee', 'grand_total']);

        const early = buildTotalsRows(quote([
            seg('subtotal', 59), seg('shipping', 5), seg('hyperion_test_fee', 2.5), seg('tax', 4.87),
            seg('grand_total', 71.37),
        ]), {}, labels, { totalsSort: TOTALS_SORT });
        expect(early.map((r) => r.code)).toEqual(['subtotal', 'shipping', 'hyperion_test_fee', 'tax', 'grand_total']);
    });

    it('follows a totals sort order the store changed', () => {
        const rows = buildTotalsRows(quote([
            seg('subtotal', 59), seg('discount', -5), seg('shipping', 5), seg('tax', 4.87), seg('grand_total', 63.87),
        ]), {}, labels, { totalsSort: { ...TOTALS_SORT, tax: 15, discount: '45' } });
        expect(rows.map((r) => r.code)).toEqual(['subtotal', 'tax', 'shipping', 'discount', 'grand_total']);
    });

    it('a total that only feeds other totals does not anchor the code after it', () => {
        const rows = buildTotalsRows(quote([
            seg('subtotal', 59), seg('weee', null), seg('hyperion_test_fee', 2.5), seg('shipping', 5),
            seg('grand_total', 66.5),
        ]), {}, labels, { totalsSort: TOTALS_SORT });
        expect(rows.map((r) => r.code)).toEqual(['subtotal', 'hyperion_test_fee', 'shipping', 'grand_total']);
    });

    it('keeps the order of the payload, the grand total last, without a usable sort order', () => {
        const segments = [
            seg('subtotal', 59), seg('grand_total', 73.87), seg('weee_tax', 5), seg('shipping', 5), seg('tax', 4.87),
        ];
        for (const totalsSort of [undefined, null, [], {}, { tax: 'first', shipping: '' }]) {
            expect(buildTotalsRows(quote(segments), {}, labels, { totalsSort }).map((r) => r.code))
                .toEqual(['subtotal', 'weee_tax', 'shipping', 'tax', 'grand_total']);
        }
    });

    it('gives a negative unknown total the discount tone and no tone to the others', () => {
        const rows = buildTotalsRows(quote([
            seg('subtotal', 59), seg('discount', -5), seg('store_credit', -3), seg('giftwrap', 3), seg('grand_total', 54),
        ]), {}, labels);
        expect(rows.map((r) => [r.code, r.tone])).toEqual([
            ['subtotal', undefined], ['discount', 'discount'], ['store_credit', 'discount'], ['giftwrap', undefined],
            ['grand_total', undefined],
        ]);
    });

    it('skips an unknown total without a value or with a zero value', () => {
        const rows = buildTotalsRows(quote([
            seg('subtotal', 59), seg('reward', null), seg('giftwrap', 0), seg('fee', '0.0000'), seg('grand_total', 59),
        ]), {}, labels);
        expect(rows.map((r) => r.code)).toEqual(['subtotal', 'grand_total']);
    });

    it('skips a shipping segment without a value (a quote that does not ship)', () => {
        const rows = buildTotalsRows(quote([
            seg('subtotal', 9.99), seg('shipping', null, ''), seg('grand_total', 9.99),
        ]), {}, labels);
        expect(rows.map((r) => r.code)).toEqual(['subtotal', 'grand_total']);
    });

    it('says that shipping is not calculated yet and marks the grand total provisional', () => {
        const pending = { ...labels, shippingNotCalculated: 'Calculated at the next step', shippingTitle: 'Shipping' };
        const rows = buildTotalsRows(quote([
            seg('subtotal', 59), seg('shipping', 0, 'Shipping & Handling'), seg('grand_total', 59),
        ]), { reviewShippingDisplayMode: 'both' }, pending, { shippingPending: true });
        expect(rows.map((r) => [r.code, r.label, r.text, r.provisional])).toEqual([
            ['subtotal', 'subtotal', undefined, undefined],
            ['shipping', 'Shipping & Handling', 'Calculated at the next step', undefined],
            ['grand_total', 'grand_total', undefined, true],
        ]);
    });

    it('keeps the place of the shipping row while the payload has no shipping segment', () => {
        const pending = { ...labels, shippingNotCalculated: 'Calculated at the next step', shippingTitle: 'Shipping' };
        const rows = buildTotalsRows(
            quote([seg('subtotal', 59), seg('tax', 0), seg('grand_total', 59)]), {}, pending, { shippingPending: true },
        );
        expect(rows.map((r) => [r.code, r.label, r.text])).toEqual([
            ['subtotal', 'subtotal', undefined],
            ['shipping', 'Shipping', 'Calculated at the next step'],
            ['grand_total', 'grand_total', undefined],
        ]);
    });

    it('shows the shipping amount and a firm grand total once a method is confirmed', () => {
        const rows = buildTotalsRows(quote([seg('subtotal', 59), seg('shipping', 5), seg('grand_total', 64)]), {}, labels);
        expect(rows.find((r) => r.code === 'shipping')).toMatchObject({ value: 5 });
        expect(rows.find((r) => r.code === 'shipping')?.text).toBeUndefined();
        expect(rows.find((r) => r.code === 'grand_total')?.provisional).toBeUndefined();
    });

    it('prints one amount per tax detail and joins the rates of a compound tax', () => {
        const tax = {
            code: 'tax', title: 'Tax', value: 12.6, area: 'taxes',
            extension_attributes: {
                tax_grandtotal_details: [
                    { amount: 9.1, rates: [{ percent: '5', title: 'GST' }, { percent: '9.975', title: 'QST' }] },
                    { amount: 3.5, rates: [{ percent: null, title: 'Eco fee' }] },
                ],
            },
        };
        const rows = buildTotalsRows(
            quote([seg('subtotal', 59), tax, seg('grand_total', 71.6)]),
            { isFullTaxSummaryDisplayed: true },
            { ...labels, percent: (value: number) => `${value} pct` },
        );
        expect(rows.filter((r) => r.code === 'tax_rate').map((r) => [r.label, r.value, r.kind])).toEqual([
            ['GST (5 pct), QST (9.975 pct)', 9.1, 'detail'],
            ['Eco fee', 3.5, 'detail'],
        ]);
        expect(rows.find((r) => r.code === 'tax')?.value).toBe(12.6);
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
