// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/shipping.js', () => ({
    estimateGuestShippingMethods: vi.fn(),
    estimateCustomerShippingMethods: vi.fn(),
    saveGuestShippingInformation: vi.fn(),
    saveCustomerShippingInformation: vi.fn(),
}));
vi.mock('../../api/payment.js', () => ({
    placeGuestOrder: vi.fn(),
    placeCustomerOrder: vi.fn(),
    setGuestPaymentInformation: vi.fn(),
    setCustomerPaymentInformation: vi.fn(),
    getGuestPaymentInformation: vi.fn(),
    getCustomerPaymentInformation: vi.fn(),
    assignGuestBillingAddress: vi.fn(),
    assignCustomerBillingAddress: vi.fn(),
}));
vi.mock('../../api/coupon.js', () => ({
    applyGuestCoupon: vi.fn(),
    applyCustomerCoupon: vi.fn(),
    removeGuestCoupon: vi.fn(),
    removeCustomerCoupon: vi.fn(),
}));
vi.mock('../../components/hyperion-recaptcha.js', () => ({
    executeRecaptcha: vi.fn().mockResolvedValue(null),
}));

import * as shippingApi from '../../api/shipping.js';
import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import customerFixture from '../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig, GuestQuoteConfig } from '../../types/config.js';
import type { CustomerDataAuthenticated } from '../../types/customer.js';
import type { ShippingMethod } from '../../types/shipping.js';
import type { Totals } from '../../types/totals.js';
import { createFlowActions, type FlowActions } from '../flow-actions.js';
import { hydrateStore, startInitialRequests } from '../hydrate.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { createSelectors, expectedAgreements } from '../selectors.js';

const shippingMocks = vi.mocked(shippingApi);

function rate(carrier: string, code: string): ShippingMethod {
    return {
        carrier_code: carrier,
        method_code: code,
        carrier_title: carrier,
        method_title: code,
        amount: 5,
        base_amount: 5,
        available: true,
        error_message: '',
        price_excl_tax: 5,
        price_incl_tax: 5,
    };
}

const SHIPPING = {
    firstname: 'Hunt',
    lastname: 'Four',
    company: null,
    city: 'Austin',
    region: 'Texas',
    region_code: 'TX',
    region_id: '57',
    postcode: '78701',
    country_id: 'US',
    telephone: '5125550100',
    fax: null,
    vat_id: null,
    prefix: null,
    middlename: null,
    suffix: null,
    street: ['100 Congress Avenue', 'Suite 200'],
};

function guestConfig(guestQuote: GuestQuoteConfig | null, extra: Record<string, unknown> = {}): CheckoutConfig {
    const base = guestFixture as unknown as CheckoutConfig;
    return {
        ...base,
        hyperion: { ...base.hyperion, guestQuote },
        selectedShippingMethod: null,
        ...extra,
    } as CheckoutConfig;
}

function fakeFlow(): FlowActions & { estimateShipping: ReturnType<typeof vi.fn>; syncBillingAddress: ReturnType<typeof vi.fn> } {
    return {
        estimateShipping: vi.fn().mockResolvedValue(undefined),
        syncBillingAddress: vi.fn().mockResolvedValue(undefined),
        saveShippingAndEstimateTotals: vi.fn(),
        applyCoupon: vi.fn(),
        removeCoupon: vi.fn(),
        placeOrder: vi.fn(),
        savePaymentInformation: vi.fn(),
        refreshPaymentInformation: vi.fn(),
        invalidateBillingSync: vi.fn(),
    } as unknown as FlowActions & { estimateShipping: ReturnType<typeof vi.fn>; syncBillingAddress: ReturnType<typeof vi.fn> };
}

describe('store hydration from checkoutConfig', () => {
    let store: Store;

    beforeEach(() => {
        vi.clearAllMocks();
        store = createStore();
        expectedAgreements.set([]);
    });

    afterEach(() => {
        setStoreForTests(null);
    });

    it('a guest without a saved address starts empty and requests nothing', () => {
        hydrateStore(store, guestConfig({ email: null, shippingAddress: null, billingAddress: null }));

        expect(store.isGuest.get()).toBe(true);
        expect(store.maskedQuoteId.get()).toBe(String(guestFixture.quoteData.entity_id));
        expect(store.email.get()).toBe('');
        expect(store.shippingAddress.get()).toBeNull();
        expect(store.billingAddress.get()).toBeNull();
        expect(store.billingSameAsShipping.get()).toBe(true);
        expect(store.selectedShippingMethod.get()).toBeNull();
        expect(store.items.get().length).toBe(guestFixture.quoteItemData.length);

        const flow = fakeFlow();
        startInitialRequests(store, flow);
        expect(flow.estimateShipping).not.toHaveBeenCalled();
        expect(flow.syncBillingAddress).not.toHaveBeenCalled();
    });

    it('a guest reload restores the email, the quote address and the selected method, then re-estimates', () => {
        hydrateStore(store, guestConfig(
            { email: 'guest@example.com', shippingAddress: SHIPPING, billingAddress: null },
            { selectedShippingMethod: { carrier_code: 'flatrate', method_code: 'flatrate', amount: 5 } }
        ));

        expect(store.email.get()).toBe('guest@example.com');
        expect(store.shippingAddress.get()).toMatchObject({
            firstname: 'Hunt',
            lastname: 'Four',
            city: 'Austin',
            postcode: '78701',
            country_id: 'US',
            telephone: '5125550100',
            street: ['100 Congress Avenue', 'Suite 200'],
            region_id: '57',
            region: { region: 'Texas', region_code: 'TX', region_id: 57 },
        });
        expect(store.shippingAddress.get()).not.toHaveProperty('company');
        expect(store.billingSameAsShipping.get()).toBe(true);
        expect(store.billingAddress.get()).toBeNull();
        expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });

        const flow = fakeFlow();
        startInitialRequests(store, flow);
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
        expect(flow.syncBillingAddress).not.toHaveBeenCalled();
    });

    it('a guest reload with a saved method re-confirms it: one estimate, one shipping save, appliedShippingMethod set', async () => {
        const config = guestConfig(
            { email: 'guest@example.com', shippingAddress: SHIPPING, billingAddress: null },
            { selectedShippingMethod: { carrier_code: 'flatrate', method_code: 'flatrate', amount: 5 } }
        );
        setCheckoutConfig(config);
        hydrateStore(store, config);
        setStoreForTests(store);
        const flow = createFlowActions();
        const selectors = createSelectors(store);
        shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([rate('flatrate', 'flatrate'), rate('tablerate', 'bestway')]);
        shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce({
            payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
            totals: { grand_total: '39.00' } as Totals,
        });

        // The hydrated address is complete for the flow as it is (an incomplete
        // one would make the save silently skip).
        expect(store.shippingAddress.get()).toMatchObject({ save_in_address_book: false });
        startInitialRequests(store, flow);
        await vi.waitFor(() => {
            expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
        });

        expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
        expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
        expect(request.addressInformation.shipping_carrier_code).toBe('flatrate');
        expect(request.addressInformation.shipping_address).toMatchObject({ city: 'Austin', postcode: '78701', email: 'guest@example.com' });
        expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
        expect(store.availablePaymentMethods.get().map((m) => m.code)).toEqual(['checkmo']);
        expect(selectors.shippingReady.get()).toBe(true);
    });

    it('a billing address of its own turns "same as shipping" off and is synced at boot', () => {
        hydrateStore(store, guestConfig({
            email: 'guest@example.com',
            shippingAddress: SHIPPING,
            billingAddress: { ...SHIPPING, city: 'Calder', postcode: '49628', region: 'Michigan', region_code: 'MI', region_id: '33' },
        }));

        expect(store.billingSameAsShipping.get()).toBe(false);
        expect(store.billingAddress.get()).toMatchObject({ city: 'Calder', region_id: '33' });

        const flow = fakeFlow();
        startInitialRequests(store, flow);
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
        expect(flow.syncBillingAddress).toHaveBeenCalledTimes(1);
    });

    it('a virtual guest quote hydrates the billing address only and never a shipping method', () => {
        const config = guestConfig(
            { email: 'gift@example.com', shippingAddress: null, billingAddress: SHIPPING },
            { selectedShippingMethod: { carrier_code: 'flatrate', method_code: 'flatrate' } }
        );
        (config.quoteData as { is_virtual: unknown }).is_virtual = '1';
        hydrateStore(store, config);

        expect(store.isVirtual.get()).toBe(true);
        expect(store.shippingAddress.get()).toBeNull();
        expect(store.billingAddress.get()).toMatchObject({ city: 'Austin' });
        expect(store.selectedShippingMethod.get()).toBeNull();

        const flow = fakeFlow();
        startInitialRequests(store, flow);
        expect(flow.estimateShipping).not.toHaveBeenCalled();
        expect(flow.syncBillingAddress).toHaveBeenCalledTimes(1);
    });

    it('a customer hydrates from customerData and ignores guestQuote', () => {
        const base = customerFixture as unknown as CheckoutConfig;
        const config = { ...base, hyperion: { ...base.hyperion, guestQuote: null } } as CheckoutConfig;
        hydrateStore(store, config);

        expect(store.isGuest.get()).toBe(false);
        expect(store.customer.get()).not.toBeNull();
        const customer = base.customerData as CustomerDataAuthenticated;
        expect(store.email.get()).toBe(customer.email);
        expect(store.savedAddresses.get().length).toBeGreaterThan(0);
        expect(store.selectedShippingAddressId.get()).toBe(customer.default_shipping);
        expect(store.shippingAddress.get()?.id).toBe(customer.default_shipping);

        const flow = fakeFlow();
        startInitialRequests(store, flow);
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
    });

    it('seeds the manual agreements gate', () => {
        hydrateStore(store, guestConfig(null, {
            checkoutAgreements: {
                isEnabled: true,
                agreements: [
                    { agreementId: 2, mode: 1, checkboxText: 'I agree', content: 'c', contentHeight: '' },
                    { agreementId: 5, mode: 0, checkboxText: '', content: 'auto', contentHeight: '' },
                ],
            },
        }));
        expect(expectedAgreements.get()).toEqual([2]);
    });
});
