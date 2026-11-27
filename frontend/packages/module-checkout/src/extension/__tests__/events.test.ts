// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { reportFailure } from '../../store/section-status.js';
import type { Totals } from '../../types/totals.js';
import { emitCheckoutEvent, startCheckoutEvents } from '../events.js';

const totals = (grand: string): Totals => ({
    grand_total: grand,
    base_grand_total: grand,
    subtotal: '50.0000',
    base_subtotal: '50.0000',
    shipping_amount: '5.0000',
    base_shipping_amount: '5.0000',
    tax_amount: '0.0000',
    base_tax_amount: '0.0000',
    discount_amount: '0.0000',
    base_discount_amount: '0.0000',
    quote_currency_code: 'EUR',
    base_currency_code: 'EUR',
    total_segments: [],
} as unknown as Totals);

async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

/** Keys and value types of a detail, as a stable shape to compare. */
function shapeOf(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return typeof value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shapeOf((value as Record<string, unknown>)[key])]));
}

describe('checkout events', () => {
    let app: HTMLElement;
    let store: Store;
    let seen: Array<{ type: string; detail: unknown; event: CustomEvent }>;
    let stop: () => void = () => undefined;

    beforeEach(() => {
        app = document.createElement('checkout-app');
        document.body.appendChild(app);
        seen = [];
        for (const name of ['ready', 'shipping-method-applied', 'payment-method-selected', 'totals-updated',
            'before-place-order', 'order-placed', 'error']) {
            app.addEventListener(`hyperion:checkout:${name}`, (event) => {
                const custom = event as CustomEvent;
                seen.push({ type: custom.type, detail: custom.detail, event: custom });
            });
        }
        store = createStore();
        setStoreForTests(store);
    });

    afterEach(() => {
        stop();
        stop = () => undefined;
        app.remove();
        vi.restoreAllMocks();
    });

    it('dispatches on the mounted application, bubbling and composed, with a frozen detail', () => {
        expect(emitCheckoutEvent('ready', { apiVersion: '1.0-beta' })).toBe(true);
        const [ready] = seen;
        expect(ready?.event.target).toBe(app);
        expect(ready?.event.bubbles).toBe(true);
        expect(ready?.event.composed).toBe(true);
        expect(Object.isFrozen(ready?.detail)).toBe(true);
    });

    it('lets a listener cancel before-place-order, and only that one', () => {
        app.addEventListener('hyperion:checkout:before-place-order', (event) => event.preventDefault());
        expect(emitCheckoutEvent('before-place-order', { method: 'checkmo' }, { cancelable: true })).toBe(false);
        app.addEventListener('hyperion:checkout:ready', (event) => event.preventDefault());
        expect(emitCheckoutEvent('ready', { apiVersion: '1.0-beta' })).toBe(true);
    });

    it('does nothing before the application is mounted', () => {
        app.remove();
        expect(emitCheckoutEvent('before-place-order', { method: 'checkmo' }, { cancelable: true })).toBe(true);
        expect(seen).toHaveLength(0);
    });

    it('announces the confirmed method, the selected payment method, new totals and the placed order once each', async () => {
        stop = startCheckoutEvents(store);
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.selectedPaymentMethod.set('checkmo');
        store.totals.set(totals('55.0000'));
        await flush();
        store.totals.set(totals('55.0000'));
        store.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
        await flush();
        store.orderOutcome.set('placed');
        await flush();

        expect(seen.map((entry) => entry.type)).toEqual([
            'hyperion:checkout:shipping-method-applied',
            'hyperion:checkout:payment-method-selected',
            'hyperion:checkout:totals-updated',
            'hyperion:checkout:order-placed',
        ]);
        expect(seen[0]?.detail).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
        expect(seen[2]?.detail).toMatchObject({ display: { currency: 'EUR', grandTotal: 55 }, base: { grandTotal: 55 } });
        expect(seen[3]?.detail).toMatchObject({ method: 'checkmo', display: { grandTotal: 55 } });
    });

    it('announces a failure shown in a section with its public kind', () => {
        reportFailure('shipping-methods', { kind: 'offline', message: 'You are offline.' }, { source: 'background' });
        expect(seen.at(-1)?.detail).toEqual({ kind: 'network', section: 'shipping-methods' });
    });

    it('carries no personal data: no email, no address, no order id in any detail', async () => {
        store.email.set('veronica@example.com');
        store.shippingAddress.set({ firstname: 'Veronica', lastname: 'Costello', street: ['x'], city: 'c', country_id: 'US', telephone: '1' });
        store.orderNumber.set('000000123');
        stop = startCheckoutEvents(store);
        emitCheckoutEvent('ready', { apiVersion: '1.0-beta' });
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.selectedPaymentMethod.set('checkmo');
        store.totals.set(totals('55.0000'));
        await flush();
        emitCheckoutEvent('before-place-order', { method: 'checkmo' }, { cancelable: true });
        reportFailure('order', { kind: 'stock', message: 'Out of stock' }, { source: 'action' });
        store.orderOutcome.set('placed');
        await flush();

        const money = { currency: 'string', discount: 'number', grandTotal: 'number', shipping: 'number', subtotal: 'number', tax: 'number' };
        expect(Object.fromEntries(seen.map((entry) => [entry.type, shapeOf(entry.detail)]))).toEqual({
            'hyperion:checkout:ready': { apiVersion: 'string' },
            'hyperion:checkout:shipping-method-applied': { carrier_code: 'string', method_code: 'string' },
            'hyperion:checkout:payment-method-selected': { method: 'string' },
            'hyperion:checkout:totals-updated': { base: money, display: money },
            'hyperion:checkout:before-place-order': { method: 'string' },
            'hyperion:checkout:error': { kind: 'string', section: 'string' },
            'hyperion:checkout:order-placed': { display: money, method: 'string' },
        });
        const text = JSON.stringify(seen.map((entry) => entry.detail));
        expect(text).not.toContain('veronica');
        expect(text).not.toContain('Costello');
        expect(text).not.toContain('000000123');
    });
});
