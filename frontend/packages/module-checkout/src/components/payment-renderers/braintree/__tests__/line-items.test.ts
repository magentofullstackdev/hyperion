// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import type { CartItem } from '../../../../types/quote.js';
import type { Totals } from '../../../../types/totals.js';
import { setActiveCatalogForTests } from '../../../../utils/i18n.js';
import { buildGooglePayDisplayItems, buildPayPalLineItems } from '../line-items.js';
import type { PayPalLineItem } from '../types.js';

/** Display currency = base currency x 1.09: every display amount differs from its base amount. */
const RATE = 1.09;

function display(base: number): string {
    return (base * RATE).toFixed(4);
}

function item(overrides: Record<string, unknown> = {}): CartItem {
    return {
        item_id: 1,
        sku: 'MH01-S-Black',
        name: 'Chaz Kangeroo Hoodie-S-Black',
        qty: 2,
        base_price: '52.0000',
        base_price_incl_tax: '56.2900',
        price: display(52),
        price_incl_tax: display(56.29),
        ...overrides,
    } as unknown as CartItem;
}

/** Two hoodies and a bag, 10.00 off, 5.00 shipping (5.41 with tax), 22 percent style tax split by hand. */
const ITEMS: readonly CartItem[] = [
    item(),
    item({
        item_id: 2,
        sku: '24-MB01',
        name: 'Joust Duffle Bag',
        qty: 1,
        base_price: '34.0000',
        base_price_incl_tax: '36.8100',
        price: display(34),
        price_incl_tax: display(36.81),
    }),
];

function totals(overrides: Record<string, unknown> = {}): Totals {
    // 2 x 52.00 + 34.00 = 138.00; tax 8.58 + 2.81 + 0.41 = 11.80; 138 + 5 + 11.80 - 10 = 144.80
    return {
        base_currency_code: 'EUR',
        quote_currency_code: 'USD',
        base_subtotal: '138.0000',
        base_discount_amount: '-10.0000',
        base_shipping_amount: '5.0000',
        base_shipping_incl_tax: '5.4100',
        base_tax_amount: '11.8000',
        base_grand_total: '144.8000',
        subtotal: display(138),
        discount_amount: display(-10),
        shipping_amount: display(5),
        tax_amount: display(11.8),
        grand_total: display(144.8),
        total_segments: [],
        ...overrides,
    } as unknown as Totals;
}

function sum(lines: readonly PayPalLineItem[]): number {
    const cents = lines.reduce((acc, line) => {
        const amount = Math.round(parseFloat(line.quantity) * parseFloat(line.unitAmount) * 100);
        return acc + (line.kind === 'credit' ? -amount : amount);
    }, 0);
    return cents / 100;
}

describe('buildPayPalLineItems', () => {
    it('prices every line in the base currency when the display currency differs', () => {
        const lines = buildPayPalLineItems(ITEMS, totals());

        expect(lines).toEqual([
            {
                name: 'Chaz Kangeroo Hoodie-S-Black',
                kind: 'debit',
                quantity: '2.00',
                unitAmount: '52.00',
                productCode: 'MH01-S-Black',
                description: '',
            },
            {
                name: 'Joust Duffle Bag',
                kind: 'debit',
                quantity: '1.00',
                unitAmount: '34.00',
                productCode: '24-MB01',
                description: '',
            },
            { name: 'Discount', kind: 'credit', quantity: '1.00', unitAmount: '10.00' },
            { name: 'Shipping', kind: 'debit', quantity: '1.00', unitAmount: '5.00' },
            { name: 'Tax', kind: 'debit', quantity: '1.00', unitAmount: '11.80' },
        ]);
        expect(sum(lines)).toBe(144.8);
    });

    it('carries the tax in the unit prices and the shipping line when prices include tax', () => {
        // 2 x 56.29 + 36.81 + 5.41 - 10.00 = 144.80
        const lines = buildPayPalLineItems(ITEMS, totals(), true);

        expect(lines.map((line) => [line.name, line.unitAmount])).toEqual([
            ['Chaz Kangeroo Hoodie-S-Black', '56.29'],
            ['Joust Duffle Bag', '36.81'],
            ['Discount', '10.00'],
            ['Shipping', '5.41'],
        ]);
        expect(sum(lines)).toBe(144.8);
    });

    it('sends no lines when a quote item lacks its base price', () => {
        const withoutBase = [ITEMS[0] as CartItem, item({ item_id: 2, base_price: undefined })];
        expect(buildPayPalLineItems(withoutBase, totals())).toEqual([]);
    });

    it('sends no lines when the tax inclusive base price is missing and prices include tax', () => {
        const withoutBase = [item({ base_price_incl_tax: null })];
        expect(buildPayPalLineItems(withoutBase, totals(), true)).toEqual([]);
        expect(buildPayPalLineItems(withoutBase, totals({
            base_discount_amount: '0',
            base_shipping_amount: '0',
            base_tax_amount: '8.5800',
            base_grand_total: '112.5800',
        }))).toHaveLength(2);
    });

    it('sends no lines when they do not add up to the base grand total', () => {
        expect(buildPayPalLineItems(ITEMS, totals({ base_grand_total: '150.0000' }))).toEqual([]);
    });

    it('tolerates one cent of rounding between the lines and the grand total', () => {
        expect(buildPayPalLineItems(ITEMS, totals({ base_grand_total: '144.8100' }))).toHaveLength(5);
        expect(buildPayPalLineItems(ITEMS, totals({ base_grand_total: '144.8200' }))).toEqual([]);
    });

    it('skips child items and free items, which need no base price check beyond their own', () => {
        const lines = buildPayPalLineItems(
            [
                ...ITEMS,
                item({ item_id: 3, parent_item_id: 1, base_price: undefined }),
                item({ item_id: 4, name: 'Free sample', base_price: '0.0000', base_price_incl_tax: '0.0000' }),
            ],
            totals()
        );
        expect(lines.filter((line) => line.productCode !== undefined)).toHaveLength(2);
    });

    it('collapses a fractional quantity into one unit of the row amount', () => {
        const lines = buildPayPalLineItems(
            [item({ qty: 1.5, base_price: '10.0000' })],
            totals({
                base_discount_amount: '0',
                base_shipping_amount: '0',
                base_tax_amount: '0',
                base_grand_total: '15.0000',
            })
        );
        expect(lines).toEqual([{
            name: 'Chaz Kangeroo Hoodie-S-Black',
            kind: 'debit',
            quantity: '1.00',
            unitAmount: '15.00',
            productCode: 'MH01-S-Black',
            description: 'Item quantity is 1.50 and per unit amount is 10.00',
        }]);
    });

    it('adds store credit and gift cards as credits', () => {
        const lines = buildPayPalLineItems(ITEMS, totals({
            base_grand_total: '114.8000',
            total_segments: [
                { code: 'customerbalance', title: 'Store Credit', value: -20 },
                { code: 'giftcardaccount', title: 'Gift Cards', value: -10 },
            ],
        }));
        expect(lines.slice(-2)).toEqual([
            { name: 'Store Credit', kind: 'credit', quantity: '1.00', unitAmount: '20.00' },
            { name: 'Gift Cards', kind: 'credit', quantity: '1.00', unitAmount: '10.00' },
        ]);
        expect(sum(lines)).toBe(114.8);
    });

    it('sends nothing without totals', () => {
        expect(buildPayPalLineItems(ITEMS, null)).toEqual([]);
    });
});

describe('buildGooglePayDisplayItems', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS);
    });

    it('shows base currency row amounts next to the base totals', () => {
        expect(buildGooglePayDisplayItems(ITEMS, totals(), false)).toEqual([
            { type: 'LINE_ITEM', label: 'Chaz Kangeroo Hoodie-S-Black', price: '104.00' },
            { type: 'LINE_ITEM', label: 'Joust Duffle Bag', price: '34.00' },
            { type: 'LINE_ITEM', label: enUS['Hyperion_Checkout::braintree_line_discount'], price: '-10.00' },
            { type: 'LINE_ITEM', label: enUS['Hyperion_Checkout::shipping_heading'], price: '5.00' },
            { type: 'LINE_ITEM', label: enUS['Hyperion_Checkout::braintree_line_tax'], price: '11.80' },
        ]);
    });

    it('uses the tax inclusive base prices when the catalog prices include tax', () => {
        const rows = buildGooglePayDisplayItems(ITEMS, totals(), true);
        expect(rows.map((row) => row.price)).toEqual(['112.58', '36.81', '-10.00', '5.41']);
        expect(rows.reduce((acc, row) => acc + Math.round(parseFloat(row.price) * 100), 0)).toBe(14480);
    });

    it('shows no rows when a quote item lacks its base price', () => {
        expect(buildGooglePayDisplayItems([item({ base_price: '' })], totals(), false)).toEqual([]);
    });
});
