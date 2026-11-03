// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { CartItem } from '../../types/quote.js';
import { parseWeeeLines } from '../../utils/weee.js';
import '../summary-item.js';
import type { SummaryItem } from '../summary-item.js';

const APPLIED = JSON.stringify([
    { title: 'Recycling fee', base_amount: '5.0000', amount: 5, row_amount: 10, base_row_amount: 10, base_amount_incl_tax: 6, amount_incl_tax: 6, row_amount_incl_tax: 12, base_row_amount_incl_tax: 12 },
    { title: 'Zero', amount: 0, row_amount: 0 },
]);

function item(extra: Record<string, unknown> = {}): CartItem {
    return {
        item_id: '11',
        sku: 'SKU',
        name: 'Fusion Backpack',
        qty: 2,
        price: '52',
        price_incl_tax: '52',
        row_total: '104',
        row_total_incl_tax: '104',
        tax_amount: '0',
        discount_amount: '0',
        product_id: '1',
        product_type: 'simple',
        is_virtual: '0',
        ...extra,
    } as unknown as CartItem;
}

async function mount(it: CartItem): Promise<SummaryItem> {
    const el = document.createElement('summary-item') as SummaryItem;
    el.item = it;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

describe('FPT (Weee) in the order summary', () => {
    beforeEach(() => {
        setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), isWeeeEnabled: true });
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('parses the serialized applied taxes, skipping zero rows', () => {
        const lines = parseWeeeLines(item({ weee_tax_applied: APPLIED }));
        expect(lines).toEqual([{ title: 'Recycling fee', amount: 5, rowAmount: 10 }]);
        expect(parseWeeeLines(item({ weee_tax_applied: APPLIED }), true)[0]?.rowAmount).toBe(12);
        expect(parseWeeeLines(item({ weee_tax_applied: null }))).toEqual([]);
        expect(parseWeeeLines(item({ weee_tax_applied: 'not json' }))).toEqual([]);
    });

    it('renders one FPT line per applied tax under the item', async () => {
        const el = await mount(item({ weee_tax_applied: APPLIED }));
        const lines = Array.from(el.querySelectorAll('[data-hyperion-fpt] li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(/^Recycling fee: .*10/);
    });

    it('renders nothing when FPT is disabled or the item carries none', async () => {
        setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), isWeeeEnabled: false });
        expect((await mount(item({ weee_tax_applied: APPLIED }))).querySelector('[data-hyperion-fpt]')).toBeNull();
        document.body.innerHTML = '';
        setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), isWeeeEnabled: true });
        expect((await mount(item({ weee_tax_applied: null }))).querySelector('[data-hyperion-fpt]')).toBeNull();
    });
});
