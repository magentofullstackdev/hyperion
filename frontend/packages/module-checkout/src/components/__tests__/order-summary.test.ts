// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ applyCoupon: vi.fn(), removeCoupon: vi.fn() }),
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { CartItem } from '../../types/quote.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../order-summary.js';
import type { OrderSummary } from '../order-summary.js';

const CONFIG = guestFixture as unknown as CheckoutConfig;
const FIRST = CONFIG.quoteItemData[0] as CartItem;

function item(id: number, qty: number, name = `Item ${id}`): CartItem {
    return { ...FIRST, item_id: id, qty, name, thumbnail: `https://hyperion.local/media/item-${id}.jpg` } as unknown as CartItem;
}

describe('<order-summary>', () => {
    let store: Store;

    async function mount(collapsible: boolean, config: CheckoutConfig = CONFIG): Promise<OrderSummary> {
        setCheckoutConfig(config);
        const el = document.createElement('order-summary') as OrderSummary;
        el.collapsible = collapsible;
        document.body.appendChild(el);
        await el.updateComplete;
        await Promise.all(Array.from(el.querySelectorAll('summary-item, summary-totals'))
            .map((child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete));
        return el;
    }

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        store.items.set([item(1, 1), item(2, 2), item(3, 1), item(4, 1)]);
        store.totals.set(CONFIG.totalsData as Totals);
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('is an open card in the rail: no bar, the items, the totals, the coupon form and its status', async () => {
        const el = await mount(false);

        expect(el.querySelector('details')).toBeNull();
        expect(el.querySelector('[data-hyperion-summary-bar]')).toBeNull();
        expect(text(el.querySelector('h2'))).toBe('Order Summary');
        expect(el.querySelectorAll('summary-item')).toHaveLength(4);
        expect(el.querySelector('summary-totals')).not.toBeNull();
        expect(el.querySelector('coupon-form')!.nextElementSibling!.matches('hc-section-status[section="coupon"]')).toBe(true);
        expect(el.querySelector('coupon-form hc-section-status')).toBeNull();
    });

    it('is a collapsed bar with the item count and the grand total when collapsible, opening to the same content', async () => {
        const el = await mount(true);
        const details = el.querySelector('details')!;
        const bar = details.querySelector('summary')!;

        expect(details.open).toBe(false);
        expect(text(bar)).toBe(`Order summary, 5 items ${text(el.querySelector('[data-total="grand_total"] dd'))}`);
        expect(text(bar.querySelector('[data-hyperion-summary-bar-total]'))).not.toBe('');
        expect(bar.querySelector('[aria-live]')).toBeNull();
        expect(details.querySelectorAll('summary-item')).toHaveLength(4);
        expect(details.querySelector('summary-totals')).not.toBeNull();
        expect(details.querySelector('coupon-form')).not.toBeNull();
    });

    it('counts one item in the singular', async () => {
        store.items.set([item(1, 1)]);
        const el = await mount(true);
        expect(text(el.querySelector('[data-hyperion-summary-bar] .truncate'))).toBe('Order summary, 1 item');
    });

    it('follows the expected grand total in the bar while a change is unanswered', async () => {
        const el = await mount(true);
        const confirmed = CONFIG.totalsData as Totals;
        store.optimisticTotals.set({
            ...confirmed,
            grand_total: '99.50',
            total_segments: confirmed.total_segments.map((s) => (s.code === 'grand_total' ? { ...s, value: '99.50' } : s)),
        });
        await el.updateComplete;
        expect(text(el.querySelector('[data-hyperion-summary-bar-total]'))).toBe('€99.50');
    });

    it('links to the cart from the header, with the URL of the Hyperion config first', async () => {
        const core = await mount(false);
        expect(core.querySelector<HTMLAnchorElement>('[data-hyperion-edit-cart]')!.getAttribute('href'))
            .toBe('https://shop.example/checkout/cart/');
        expect(text(core.querySelector('[data-hyperion-edit-cart]'))).toBe('Edit cart');
        document.body.innerHTML = '';

        const own = await mount(false, { ...CONFIG, hyperion: { ...CONFIG.hyperion, cartUrl: 'https://hyperion.local/it/checkout/cart/' } });
        expect(own.querySelector<HTMLAnchorElement>('[data-hyperion-edit-cart]')!.getAttribute('href'))
            .toBe('https://hyperion.local/it/checkout/cart/');
    });

    it('lists the items as a list and loads the first three thumbnails with the page', async () => {
        const el = await mount(false);
        const list = el.querySelector('[role="list"]')!;
        const rows = Array.from(list.children);

        expect(rows.every((row) => row.matches('summary-item[role="listitem"]'))).toBe(true);
        expect(rows.map((row) => row.querySelector('img')!.getAttribute('loading'))).toEqual(['eager', 'eager', 'eager', 'lazy']);
        expect(rows.every((row) => {
            const img = row.querySelector('img')!;
            return img.getAttribute('width') === '64' && img.getAttribute('height') === '64';
        })).toBe(true);
    });

    it('lets a long name take two lines and keeps the full name as its title', async () => {
        const name = 'A very long product name that does not fit on one line of the summary rail';
        store.items.set([item(1, 1, name)]);
        const el = await mount(false);
        const label = el.querySelector('summary-item p')!;

        expect(label.classList.contains('line-clamp-2')).toBe(true);
        expect(label.classList.contains('truncate')).toBe(false);
        expect(label.getAttribute('title')).toBe(name);
    });
});
