// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import { resetCaptchaStateForTests } from '../captcha-state.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { createSelectors, expectedAgreements } from '../selectors.js';

const FLATRATE = { carrier_code: 'flatrate', method_code: 'flatrate' };

/** A guest checkout with nothing missing: Place Order is open. */
function completeStore(): Store {
    const config = guestFixture as unknown as CheckoutConfig;
    const store = createStore();
    setStoreForTests(store);
    store.maskedQuoteId.set('masked-1');
    store.email.set('ok@example.com');
    store.shippingAddress.set({
        firstname: 'Veronica',
        lastname: 'Costello',
        street: ['Via Roma 1'],
        city: 'Milano',
        postcode: '20121',
        country_id: 'IT',
        telephone: '+39 02 1234567',
    });
    store.availableShippingMethods.set([{
        ...FLATRATE,
        carrier_title: 'Flat Rate',
        method_title: 'Fixed',
        amount: 5,
        base_amount: 5,
        available: true,
        error_message: '',
        price_excl_tax: 5,
        price_incl_tax: 5,
    }]);
    store.selectedShippingMethod.set(FLATRATE);
    store.appliedShippingMethod.set(FLATRATE);
    store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check / Money order' }]);
    store.selectedPaymentMethod.set('checkmo');
    store.totals.set(config.totalsData);
    return store;
}

describe('canPlaceOrder latch', () => {
    let store: Store;
    let selectors: ReturnType<typeof createSelectors>;

    beforeEach(() => {
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        resetCaptchaStateForTests();
        expectedAgreements.set([]);
        store = completeStore();
        selectors = createSelectors(store);
    });

    it('is open for a complete checkout with no order under way', () => {
        expect(selectors.canPlaceOrder.get()).toBe(true);
    });

    it('is closed while an order is prepared, sent or placed', () => {
        store.orderOutcome.set('placing');
        expect(selectors.canPlaceOrder.get()).toBe(false);
        store.orderOutcome.set('placed');
        expect(selectors.canPlaceOrder.get()).toBe(false);
    });

    it('is closed while the outcome of an order is unknown, and the gate itself stays open', () => {
        store.orderOutcome.set('unknown');
        expect(selectors.canPlaceOrder.get()).toBe(false);
        expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(true);
    });

    it('is closed once the customer session ended', () => {
        store.sessionExpired.set(true);
        expect(selectors.canPlaceOrder.get()).toBe(false);
        expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(true);
    });

    it('is closed once the quote is gone', () => {
        store.quoteGone.set(true);
        expect(selectors.canPlaceOrder.get()).toBe(false);
        expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(true);
    });
});
