// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, setStoreForTests, getStore } from '../index.js';
import { createActions } from '../actions.js';
import { createSelectors, expectedAgreements } from '../selectors.js';

const FLATRATE = {
    carrier_code: 'flatrate',
    method_code: 'flatrate',
    carrier_title: 'Flat Rate',
    method_title: 'Fixed',
    amount: 5,
    base_amount: 5,
    available: true,
    error_message: '',
    price_excl_tax: 5,
    price_incl_tax: 5,
};

describe('store / actions / selectors', () => {
    let store: ReturnType<typeof createStore>;
    let actions: ReturnType<typeof createActions>;
    let selectors: ReturnType<typeof createSelectors>;

    beforeEach(() => {
        store = createStore();
        setStoreForTests(store);
        actions = createActions(getStore());
        selectors = createSelectors(store);
        expectedAgreements.set([]);
    });

    it('emailValid becomes true for a well-formed email', () => {
        expect(selectors.emailValid.get()).toBe(false);
        actions.setEmail('ok@example.com');
        expect(selectors.emailValid.get()).toBe(true);
    });

    it('shippingAddressValid is true on virtual carts regardless of address', () => {
        store.isVirtual.set(true);
        expect(selectors.shippingAddressValid.get()).toBe(true);
    });

    it('shippingAddressValid requires full address on non-virtual carts', () => {
        expect(selectors.shippingAddressValid.get()).toBe(false);
        actions.setShippingAddress({
            country_id: 'US',
            city: 'Calder',
            firstname: 'Vero',
            lastname: 'Costello',
            telephone: '555',
            street: ['6146 Honey Bluff'],
            postcode: '49628',
        });
        expect(selectors.shippingAddressValid.get()).toBe(true);
    });

    it('canPlaceOrder requires every gate + totals + not-placing', () => {
        expect(selectors.canPlaceOrder.get()).toBe(false);

        actions.setEmail('ok@example.com');
        actions.setShippingAddress({
            country_id: 'US',
            city: 'Calder',
            firstname: 'Vero',
            lastname: 'Costello',
            telephone: '555',
            street: ['6146 Honey Bluff'],
            postcode: '49628',
        });
        actions.setBillingSameAsShipping(true);
        store.availableShippingMethods.set([FLATRATE]);
        actions.selectShippingMethod('flatrate', 'flatrate');
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        actions.selectPaymentMethod('checkmo');
        store.totals.set({
            grand_total: '52.00',
            base_grand_total: '52.00',
            subtotal: '52.00',
            base_subtotal: '52.00',
            discount_amount: '0',
            base_discount_amount: '0',
            subtotal_with_discount: '52.00',
            subtotal_incl_tax: '52.00',
            shipping_amount: '5',
            shipping_tax_amount: '0',
            shipping_incl_tax: '5',
            shipping_discount_amount: '0',
            tax_amount: '0',
            coupon_code: null,
            items_qty: '1',
            items: [],
            total_segments: [],
            quote_currency_code: 'USD',
            base_currency_code: 'USD',
        });

        expect(selectors.canPlaceOrder.get()).toBe(true);

        actions.setIsPlacingOrder(true);
        expect(selectors.canPlaceOrder.get()).toBe(false);
    });

    it('paymentMethodSelected requires the selection to be among the offered methods', () => {
        actions.selectPaymentMethod('checkmo');
        expect(selectors.paymentMethodSelected.get()).toBe(false);
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        expect(selectors.paymentMethodSelected.get()).toBe(true);
        store.availablePaymentMethods.set([{ code: 'free', title: 'Free' }]);
        expect(selectors.paymentMethodSelected.get()).toBe(false);
    });

    it('shippingReady needs an offered, server-confirmed method and no request in flight', () => {
        expect(selectors.shippingReady.get()).toBe(false);

        store.availableShippingMethods.set([FLATRATE]);
        actions.selectShippingMethod('flatrate', 'flatrate');
        expect(selectors.shippingReady.get()).toBe(false);

        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        expect(selectors.shippingReady.get()).toBe(true);

        store.isLoadingShippingMethods.set(true);
        expect(selectors.shippingReady.get()).toBe(false);
        store.isLoadingShippingMethods.set(false);

        store.isSavingShipping.set(true);
        expect(selectors.shippingReady.get()).toBe(false);
        store.isSavingShipping.set(false);

        actions.selectShippingMethod('tablerate', 'bestway');
        expect(selectors.shippingReady.get()).toBe(false);

        store.availableShippingMethods.set([]);
        actions.selectShippingMethod('flatrate', 'flatrate');
        expect(selectors.shippingReady.get()).toBe(false);

        store.isVirtual.set(true);
        expect(selectors.shippingReady.get()).toBe(true);
    });

    it('agreements gate blocks place order when any expected agreement unaccepted', () => {
        expectedAgreements.set([101, 102]);
        actions.acceptAgreement(101);
        expect(selectors.agreementsAccepted.get()).toBe(false);
        actions.acceptAgreement(102);
        expect(selectors.agreementsAccepted.get()).toBe(true);
        actions.revokeAgreement(101);
        expect(selectors.agreementsAccepted.get()).toBe(false);
    });

    it('setFieldError / clearFieldError manage the error map', () => {
        actions.setFieldError('email', 'required');
        expect(store.fieldErrors.get()).toEqual({ email: 'required' });
        actions.clearFieldError('email');
        expect(store.fieldErrors.get()).toEqual({});
    });

    it('minimumOrderError blocks place order even when every other gate passes', () => {
        actions.setEmail('ok@example.com');
        actions.setShippingAddress({
            country_id: 'US',
            city: 'Calder',
            firstname: 'Vero',
            lastname: 'Costello',
            telephone: '555',
            street: ['6146 Honey Bluff'],
            postcode: '49628',
        });
        actions.setBillingSameAsShipping(true);
        store.availableShippingMethods.set([FLATRATE]);
        actions.selectShippingMethod('flatrate', 'flatrate');
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        actions.selectPaymentMethod('checkmo');
        store.totals.set({
            grand_total: '52.00',
            base_grand_total: '52.00',
            subtotal: '52.00',
            base_subtotal: '52.00',
            discount_amount: '0',
            base_discount_amount: '0',
            subtotal_with_discount: '52.00',
            subtotal_incl_tax: '52.00',
            shipping_amount: '5',
            shipping_tax_amount: '0',
            shipping_incl_tax: '5',
            shipping_discount_amount: '0',
            tax_amount: '0',
            coupon_code: null,
            items_qty: '1',
            items: [],
            total_segments: [],
            quote_currency_code: 'USD',
            base_currency_code: 'USD',
        });
        expect(selectors.canPlaceOrder.get()).toBe(true);

        store.minimumOrderError.set('Minimum order amount is $100.00.');
        expect(selectors.canPlaceOrder.get()).toBe(false);

        store.minimumOrderError.set(null);
        expect(selectors.canPlaceOrder.get()).toBe(true);
    });

    it('agreementsAccepted is true when expectedAgreements is empty', () => {
        expectedAgreements.set([]);
        store.acceptedAgreements.set([]);
        expect(selectors.agreementsAccepted.get()).toBe(true);
    });

    it('agreementsAccepted requires every expected ID to be in acceptedAgreements', () => {
        expectedAgreements.set([1, 2]);

        store.acceptedAgreements.set([]);
        expect(selectors.agreementsAccepted.get()).toBe(false);

        store.acceptedAgreements.set([1]);
        expect(selectors.agreementsAccepted.get()).toBe(false);

        store.acceptedAgreements.set([1, 2]);
        expect(selectors.agreementsAccepted.get()).toBe(true);
    });

    it('extra accepted IDs (e.g. revoked agreements) do not prevent acceptance', () => {
        expectedAgreements.set([1]);
        store.acceptedAgreements.set([1, 99]);
        expect(selectors.agreementsAccepted.get()).toBe(true);
    });
});
