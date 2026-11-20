// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { CartItem } from '../../types/quote.js';
import '../summary-item.js';
import type { SummaryItem } from '../summary-item.js';

const PARENT = 'https://hyperion.local/media/wj06-purple_main.jpg';
const VARIANT = 'https://hyperion.local/media/wj06-blue_main.jpg';

function item(extra: Record<string, unknown> = {}): CartItem {
    return {
        item_id: '11',
        sku: 'WJ06-XS-Blue',
        name: 'Juno Jacket',
        qty: 1,
        price: '77',
        price_incl_tax: '77',
        row_total: '77',
        row_total_incl_tax: '77',
        tax_amount: '0',
        discount_amount: '0',
        product_id: '1',
        product_type: 'configurable',
        is_virtual: '0',
        ...extra,
    } as unknown as CartItem;
}

async function mount(config: Record<string, unknown>, it: CartItem): Promise<SummaryItem> {
    setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), ...config } as CheckoutConfig);
    const el = document.createElement('summary-item') as SummaryItem;
    el.item = it;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

describe('line image of the order summary', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('prefers the image data of the line, which follows the cart image settings, over the item thumbnail', async () => {
        const el = await mount({ imageData: { 11: { src: VARIANT } } }, item({ thumbnail: PARENT }));
        expect(el.querySelector('img')?.getAttribute('src')).toBe(VARIANT);
    });

    it('falls back to the item thumbnail when the image data has no entry for the line', async () => {
        const el = await mount({ imageData: { 99: { src: VARIANT } } }, item({ thumbnail: PARENT }));
        expect(el.querySelector('img')?.getAttribute('src')).toBe(PARENT);
    });

    it('renders the placeholder box when neither is known', async () => {
        const el = await mount({ imageData: {} }, item());
        expect(el.querySelector('img')).toBeNull();
    });
});
