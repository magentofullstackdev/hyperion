// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setCheckoutConfig } from '../../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../../store/index.js';
import type { Address } from '../../../types/address.js';
import type { CheckoutConfig } from '../../../types/config.js';
import { firstPartyServices } from '../mount.js';

const TYPED = {
    firstname: 'Ada', lastname: 'Typed', street: ['Home Street 1'], city: 'Rome', postcode: '00100',
    country_id: 'IT', telephone: '123',
} as Address;
const LOCKER = {
    firstname: 'Locker', lastname: 'Point', street: ['Station Square 1'], city: 'Milan', postcode: '20100',
    country_id: 'IT', telephone: '000',
} as Address;
const BILLING = { ...TYPED, street: ['Office Road 9'] } as Address;

describe('the quote first-party renderers read', () => {
    let store: Store;

    beforeEach(() => {
        setCheckoutConfig({ hyperion: { paymentRenderers: [] } } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.isVirtual.set(false);
        store.shippingAddress.set(TYPED);
        store.billingAddress.set(BILLING);
        store.billingSameAsShipping.set(true);
    });

    afterEach(() => {
        setStoreForTests(null);
    });

    it('carries the typed address when no shipping extension set one', () => {
        const quote = firstPartyServices().quote();
        expect(quote.shippingAddress).toBe(TYPED);
        expect(quote.billingAddress).toBe(TYPED);
    });

    it('carries the address a shipping extension put in place, billed to it while billing follows shipping', () => {
        store.shippingAddressOverride.set({ extensionId: 'lockers', address: LOCKER, keepContact: false, separateBilling: false });
        const quote = firstPartyServices().quote();
        expect(quote.shippingAddress).toBe(LOCKER);
        expect(quote.billingAddress).toBe(LOCKER);
    });

    it('bills the typed billing address when the override asks for a separate one', () => {
        store.shippingAddressOverride.set({ extensionId: 'lockers', address: LOCKER, keepContact: false, separateBilling: true });
        const quote = firstPartyServices().quote();
        expect(quote.shippingAddress).toBe(LOCKER);
        expect(quote.billingAddress).toBe(BILLING);
    });

    it('has no shipping address on a virtual quote', () => {
        store.isVirtual.set(true);
        store.shippingAddressOverride.set({ extensionId: 'lockers', address: LOCKER, keepContact: false, separateBilling: false });
        const quote = firstPartyServices().quote();
        expect(quote.shippingAddress).toBeNull();
        expect(quote.billingAddress).toBe(BILLING);
    });
});
