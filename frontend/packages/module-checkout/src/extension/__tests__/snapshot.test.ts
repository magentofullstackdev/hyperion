// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { placeOrderHint } from '../../store/place-order-hint.js';
import { createSelectors } from '../../store/selectors.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Totals } from '../../types/totals.js';
import { registerCheckoutGate, resetGatesForTests } from '../gates.js';
import { buildSnapshot, createSnapshotSource } from '../snapshot.js';

const typed: Address = {
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['6146 Honey Bluff Parkway'],
    city: 'Calder',
    postcode: '49628-7978',
    country_id: 'US',
    region_id: '33',
    region: { region: 'Michigan', region_code: 'MI', region_id: 33 },
    telephone: '(555) 229-3326',
};

const billing: Address = { ...typed, firstname: 'Billing', street: ['1 Invoice Road'] };

const totals = {
    grand_total: '60.0000',
    base_grand_total: '50.0000',
    subtotal: '50.0000',
    base_subtotal: '41.6667',
    shipping_amount: '10.0000',
    base_shipping_amount: '8.3333',
    tax_amount: '0.0000',
    base_tax_amount: '0.0000',
    discount_amount: '0.0000',
    base_discount_amount: '0.0000',
    quote_currency_code: 'USD',
    base_currency_code: 'EUR',
    total_segments: [{ code: 'grand_total', title: 'Grand Total', value: '60.0000', area: 'footer' }],
} as unknown as Totals;

function configure(): void {
    setCheckoutConfig({
        storeCode: 'default',
        hyperion: { enabled: true },
        quoteData: { quote_currency_code: 'USD', base_currency_code: 'EUR', base_to_quote_rate: '1.2000' },
    } as unknown as CheckoutConfig);
}

describe('checkout snapshot', () => {
    let store: Store;
    let selectors: ReturnType<typeof createSelectors>;

    beforeEach(() => {
        configure();
        resetGatesForTests();
        store = createStore();
        setStoreForTests(store);
        selectors = createSelectors(store);
        store.isGuest.set(true);
        store.maskedQuoteId.set('masked-1');
        store.email.set('veronica@example.com');
        store.shippingAddress.set(typed);
        store.items.set([{
            item_id: '7', sku: 'MS09', name: 'Tee', qty: 2, product_type: 'simple',
            price: '25.0000', row_total: '50.0000', base_price: '20.8333', base_row_total: '41.6667',
        } as never]);
        store.totals.set(totals);
    });

    afterEach(() => {
        resetGatesForTests();
        vi.restoreAllMocks();
    });

    it('is frozen all the way down', () => {
        const snapshot = buildSnapshot(store, selectors);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.shippingAddress)).toBe(true);
        expect(Object.isFrozen(snapshot.shippingAddress?.street)).toBe(true);
        expect(Object.isFrozen(snapshot.items[0])).toBe(true);
        expect(Object.isFrozen(snapshot.totals?.base)).toBe(true);
    });

    it('describes identity, currencies, items and the confirmed totals in both currencies', () => {
        const snapshot = buildSnapshot(store, selectors);
        expect(snapshot.cartId).toBe('masked-1');
        expect(snapshot.storeCode).toBe('default');
        expect(snapshot.currency).toEqual({ display: 'USD', base: 'EUR', rate: 1.2 });
        expect(snapshot.items[0]).toEqual({
            item_id: 7, sku: 'MS09', name: 'Tee', qty: 2, product_type: 'simple',
            price: 25, row_total: 50, base_price: 20.8333, base_row_total: 41.6667,
        });
        expect(snapshot.totals?.display).toEqual({ currency: 'USD', grandTotal: 60, subtotal: 50, shipping: 10, tax: 0, discount: 0 });
        expect(snapshot.totals?.base).toEqual({ currency: 'EUR', grandTotal: 50, subtotal: 41.6667, shipping: 8.3333, tax: 0, discount: 0 });
        expect(snapshot.totals?.segments).toEqual([{ code: 'grand_total', title: 'Grand Total', value: 60 }]);
    });

    it('has no totals when a base amount is missing, and never shows the expected totals of a change', () => {
        store.optimisticTotals.set({ ...totals, grand_total: '99.0000' });
        expect(buildSnapshot(store, selectors).totals?.display.grandTotal).toBe(60);
        store.totals.set({ ...totals, base_grand_total: undefined } as unknown as Totals);
        expect(buildSnapshot(store, selectors).totals).toBeNull();
    });

    it('resolves the effective billing address', () => {
        store.billingSameAsShipping.set(true);
        let snapshot = buildSnapshot(store, selectors);
        expect(snapshot.billingAddress).toEqual(snapshot.shippingAddress);
        expect(snapshot.shippingAddress).toMatchObject({ firstname: 'Veronica', region: 'Michigan', region_code: 'MI', region_id: 33 });

        store.billingSameAsShipping.set(false);
        store.billingAddress.set(billing);
        snapshot = buildSnapshot(store, selectors);
        expect(snapshot.billingAddress).toMatchObject({ firstname: 'Billing', street: ['1 Invoice Road'] });
    });

    it('applies the address override of a shipping extension, keeping the contact when asked', () => {
        const locker: Address = { ...typed, firstname: 'Locker', lastname: '42', street: ['Station Square'], telephone: '' };
        store.shippingAddressOverride.set({ extensionId: 'lockers', address: locker, keepContact: true, separateBilling: true });
        store.billingAddress.set(billing);
        const snapshot = buildSnapshot(store, selectors);
        expect(snapshot.shippingAddress).toMatchObject({ firstname: 'Veronica', lastname: 'Costello', street: ['Station Square'], telephone: '(555) 229-3326' });
        expect(snapshot.billingAddress).toMatchObject({ firstname: 'Billing' });
    });

    it('has no shipping address or method on a virtual quote', () => {
        store.isVirtual.set(true);
        store.billingAddress.set(billing);
        const snapshot = buildSnapshot(store, selectors);
        expect(snapshot.shippingAddress).toBeNull();
        expect(snapshot.shippingMethod).toBeNull();
        expect(snapshot.billingAddress).toMatchObject({ firstname: 'Billing' });
    });

    it('is settling while a write or a form is ahead of the quote, and placing once the latch is taken', () => {
        expect(buildSnapshot(store, selectors).isSettling).toBe(false);
        store.shippingDirty.set(true);
        expect(buildSnapshot(store, selectors).isSettling).toBe(true);
        store.shippingDirty.set(false);
        store.quoteWritesPending.set(1);
        expect(buildSnapshot(store, selectors).isSettling).toBe(true);
        store.quoteWritesPending.set(0);
        store.orderOutcome.set('placing');
        expect(buildSnapshot(store, selectors).isPlacingOrder).toBe(true);
    });

    it('names the same blocker as the gate, extension gates included', () => {
        expect(buildSnapshot(store, selectors).blocker).toBe(placeOrderHint(store, selectors, { skipPaymentReady: true }));
        store.selectedPaymentMethod.set('checkmo');
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.availableShippingMethods.set([{ carrier_code: 'flatrate', method_code: 'flatrate', available: true } as never]);
        expect(buildSnapshot(store, selectors).blocker).toBeNull();
        const gate = registerCheckoutGate('vat');
        gate.set('Check your VAT number.');
        expect(buildSnapshot(store, selectors).blocker).toBe('Check your VAT number.');
    });

    describe('source', () => {
        it('keeps its identity until a value in it changes', () => {
            const source = createSnapshotSource(store, selectors);
            const first = source.snapshot();
            store.loginError.set('not in the snapshot');
            store.shippingAddress.set({ ...typed });
            expect(source.snapshot()).toBe(first);
            store.email.set('other@example.com');
            expect(source.snapshot()).not.toBe(first);
            expect(source.snapshot().email).toBe('other@example.com');
        });

        it('tells every subscriber once per batch, even when one of them throws', async () => {
            const source = createSnapshotSource(store, selectors);
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const broken = vi.fn(() => { throw new Error('boom'); });
            const good = vi.fn();
            source.subscribe(broken);
            const stop = source.subscribe(good);
            store.email.set('a@example.com');
            store.email.set('b@example.com');
            await Promise.resolve();
            await Promise.resolve();
            expect(broken).toHaveBeenCalledTimes(1);
            expect(good).toHaveBeenCalledTimes(1);
            expect(good.mock.calls[0]?.[0].email).toBe('b@example.com');
            stop();
            store.email.set('c@example.com');
            await Promise.resolve();
            await Promise.resolve();
            expect(good).toHaveBeenCalledTimes(1);
        });
    });
});
