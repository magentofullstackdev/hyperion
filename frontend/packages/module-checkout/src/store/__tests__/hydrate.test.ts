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
vi.mock('../../components/recaptcha-client.js', () => ({
    executeRecaptcha: vi.fn().mockResolvedValue(null),
}));
vi.mock('../drafts.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../drafts.js')>()),
    restoreDraft: vi.fn(),
}));

import * as shippingApi from '../../api/shipping.js';
import * as paymentApi from '../../api/payment.js';
import * as couponApi from '../../api/coupon.js';
import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import customerFixture from '../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import initialFixture from '../../fixtures/hyperion.initial.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import paymentRenderers from '../../fixtures/payment-renderers.json' with { type: 'json' };
import type { CheckoutConfig, GuestQuoteConfig, InitialStateConfig } from '../../types/config.js';
import type { CustomerDataAuthenticated } from '../../types/customer.js';
import type { ShippingMethod } from '../../types/shipping.js';
import type { Totals } from '../../types/totals.js';
import { restoreDraft } from '../drafts.js';
import { createFlowActions, type FlowActions } from '../flow-actions.js';
import { hydrateStore, startInitialRequests } from '../hydrate.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { createSelectors, expectedAgreements } from '../selectors.js';

/** The configuration with the bundle's payment renderer entries, as the server emits them. */
function withPaymentRenderers(config: CheckoutConfig | null): CheckoutConfig {
    const base = (config ?? {}) as unknown as { hyperion?: Record<string, unknown> };
    return { ...base, hyperion: { ...(base.hyperion ?? {}), paymentRenderers } } as unknown as CheckoutConfig;
}

const shippingMocks = vi.mocked(shippingApi);
const restoreDraftMock = vi.mocked(restoreDraft);

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
        setCheckoutConfig(withPaymentRenderers(config));
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

    it('a billing address of its own turns "same as shipping" off and travels with the shipping save: no billing request at boot', () => {
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
        expect(flow.syncBillingAddress).not.toHaveBeenCalled();
    });

    it('a virtual guest quote hydrates the billing address only and never a shipping method', () => {
        const config = guestConfig(
            { email: 'gift@example.com', shippingAddress: null, billingAddress: SHIPPING },
            { selectedShippingMethod: { carrier_code: 'flatrate', method_code: 'flatrate' } }
        );
        config.quoteData = { ...config.quoteData, is_virtual: '1' } as CheckoutConfig['quoteData'];
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

describe('hydration from the state the quote already holds', () => {
    let store: Store;
    let scheduled: Array<() => void>;
    const schedule = (task: () => void): void => { scheduled.push(task); };

    const FLAT = { carrier_code: 'flatrate', method_code: 'flatrate' };
    const BILLING = { ...SHIPPING, city: 'Calder', postcode: '49628', region: 'Michigan', region_code: 'MI', region_id: '33' };

    /** A second saved address, so "the address of the quote" is not the default one. */
    const SECOND = {
        id: '2',
        customer_id: '1',
        firstname: 'Veronica',
        lastname: 'Costello',
        company: null,
        city: 'Austin',
        country_id: 'US',
        postcode: '78701',
        region: { region: 'Texas', region_code: 'TX', region_id: 57 },
        region_id: '57',
        street: ['100 Congress Avenue'],
        telephone: '5125550100',
        fax: null,
        vat_id: null,
        prefix: null,
        middlename: null,
        suffix: null,
    };
    const SECOND_ON_QUOTE = {
        ...SHIPPING,
        firstname: 'Veronica',
        lastname: 'Costello',
        street: ['100 Congress Avenue'],
        customer_address_id: 2,
        same_as_billing: '1',
    };

    function initialState(extra: Partial<InitialStateConfig> = {}): InitialStateConfig {
        return {
            shippingMethods: [rate('flatrate', 'flatrate')],
            paymentMethods: [{ code: 'checkmo', title: 'Check / Money order' }],
            appliedShippingMethod: FLAT,
            quoteAddresses: null,
            fingerprint: 'f00d',
            ...extra,
        } as InitialStateConfig;
    }

    function guestWithInitial(initial: InitialStateConfig | null, guestQuote?: GuestQuoteConfig): CheckoutConfig {
        const config = guestConfig(
            guestQuote ?? { email: 'guest@example.com', shippingAddress: SHIPPING, billingAddress: null },
            { selectedShippingMethod: { ...FLAT, amount: 5 } }
        );
        return { ...config, hyperion: { ...config.hyperion, initial } } as CheckoutConfig;
    }

    function customerWithInitial(initial: InitialStateConfig | null): CheckoutConfig {
        const base = customerFixture as unknown as CheckoutConfig;
        const customer = base.customerData as CustomerDataAuthenticated;
        return {
            ...base,
            customerData: { ...customer, addresses: { ...customer.addresses, '2': SECOND } },
            hyperion: { ...base.hyperion, guestQuote: null, initial },
            selectedShippingMethod: { ...FLAT, amount: 5 },
        } as unknown as CheckoutConfig;
    }

    /** Hydrate like the boot does: config, store, then the flow built on the hydrated store. */
    function boot(config: CheckoutConfig): { flow: FlowActions; selectors: ReturnType<typeof createSelectors> } {
        setCheckoutConfig(withPaymentRenderers(config));
        hydrateStore(store, config);
        setStoreForTests(store);
        const flow = createFlowActions();
        startInitialRequests(store, flow, schedule);
        return { flow, selectors: createSelectors(store) };
    }

    function expectNoRequest(): void {
        for (const api of [shippingApi, paymentApi, couponApi]) {
            for (const fn of Object.values(vi.mocked(api))) {
                expect(fn).not.toHaveBeenCalled();
            }
        }
    }

    function acceptAgreements(): void {
        store.acceptedAgreements.set([...expectedAgreements.get()]);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        restoreDraftMock.mockReset();
        for (const fn of Object.values(shippingMocks)) fn.mockReset();
        store = createStore();
        scheduled = [];
        expectedAgreements.set([]);
    });

    afterEach(() => {
        setStoreForTests(null);
    });

    it('a guest whose quote holds the address and a confirmed method can place the order with no request', async () => {
        const { selectors } = boot(guestWithInitial(initialState()));
        acceptAgreements();
        await Promise.resolve();

        expect(store.availableShippingMethods.get().map((m) => m.carrier_code)).toEqual(['flatrate']);
        expect(store.selectedShippingMethod.get()).toEqual(FLAT);
        expect(store.appliedShippingMethod.get()).toEqual(FLAT);
        expect(store.availablePaymentMethods.get().map((m) => m.code)).toEqual(['checkmo']);
        expect(store.selectedPaymentMethod.get()).toBe('checkmo');
        expect(store.estimateState.get()).toBe('ready');
        expect(store.shippingDirty.get()).toBe(false);
        expect(store.billingSynced.get()).toBe(true);
        expect(selectors.shippingReady.get()).toBe(true);
        expect(selectors.canPlaceOrder.get()).toBe(true);
        expectNoRequest();
        expect(scheduled).toHaveLength(1);
    });

    it('a guest billing address of its own is already on the quote: confirmed without a request', () => {
        const { selectors } = boot(guestWithInitial(
            initialState(),
            { email: 'guest@example.com', shippingAddress: SHIPPING, billingAddress: BILLING }
        ));
        acceptAgreements();

        expect(store.billingSameAsShipping.get()).toBe(false);
        expect(store.billingSynced.get()).toBe(true);
        expect(selectors.billingReady.get()).toBe(true);
        expect(selectors.canPlaceOrder.get()).toBe(true);
        expectNoRequest();
    });

    describe('from the JSON the server provider emits (shared fixture, asserted by its PHP unit test too)', () => {
        const emitted = initialFixture as unknown as { guest: InitialStateConfig; customer: InitialStateConfig };
        const FIXTURE_RATE = { carrier_code: 'flatrate', method_code: 'flatrate' };

        it('carries real JSON types: booleans, a numeric or null address id, numeric amounts', () => {
            const addresses = emitted.customer.quoteAddresses!;
            expect(typeof addresses.billingSameAsShipping).toBe('boolean');
            expect(typeof addresses.shipping!['customer_address_id']).toBe('number');
            expect(addresses.billing!['customer_address_id']).toBeNull();
            expect(typeof addresses.shipping!['same_as_billing']).toBe('boolean');
            expect(typeof addresses.shipping!['region_id']).toBe('string');
            expect(Array.isArray(addresses.shipping!['street'])).toBe(true);
            expect(typeof emitted.guest.shippingMethods[0]!.amount).toBe('number');
            expect(typeof emitted.guest.shippingMethods[0]!.available).toBe('boolean');
            expect(emitted.guest.quoteAddresses).toBeNull();
            expect(emitted.guest.fingerprint).toMatch(/^[0-9a-f]{40}$/);
        });

        it('a guest whose quote holds the emitted address starts with its rate applied and no request', () => {
            const quoteAddress = { ...emitted.customer.quoteAddresses!.shipping! };
            delete quoteAddress['customer_address_id'];
            delete quoteAddress['same_as_billing'];
            const { selectors } = boot(guestWithInitial(
                emitted.guest,
                { email: 'guest@example.com', shippingAddress: quoteAddress, billingAddress: null }
            ));
            acceptAgreements();

            expect(store.availableShippingMethods.get()).toEqual(emitted.guest.shippingMethods);
            expect(store.appliedShippingMethod.get()).toEqual(FIXTURE_RATE);
            expect(store.availablePaymentMethods.get()).toEqual([{ code: 'checkmo', title: 'Check / Money order' }]);
            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(store.estimateState.get()).toBe('ready');
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expectNoRequest();
        });

        it('a customer gets the saved address named by the numeric id and the typed billing address, with no request', () => {
            const onQuote = emitted.customer.quoteAddresses!.shipping!;
            const saved = {
                id: '12',
                customer_id: '1',
                firstname: onQuote['firstname'],
                lastname: onQuote['lastname'],
                company: null,
                city: onQuote['city'],
                country_id: onQuote['country_id'],
                postcode: onQuote['postcode'],
                region: { region: onQuote['region'], region_code: onQuote['region_code'], region_id: Number(onQuote['region_id']) },
                region_id: onQuote['region_id'],
                street: onQuote['street'],
                telephone: onQuote['telephone'],
                fax: null,
                vat_id: null,
                prefix: null,
                middlename: null,
                suffix: null,
            };
            const config = customerWithInitial(emitted.customer);
            const customer = config.customerData as CustomerDataAuthenticated;
            const { selectors } = boot({
                ...config,
                customerData: { ...customer, addresses: { ...customer.addresses, '12': saved } },
            } as unknown as CheckoutConfig);
            acceptAgreements();

            expect(store.selectedShippingAddressId.get()).toBe('12');
            expect(store.shippingAddress.get()?.id).toBe('12');
            expect(store.billingSameAsShipping.get()).toBe(false);
            expect(store.selectedBillingAddressId.get()).toBeNull();
            expect(store.billingAddress.get()).toMatchObject({ city: 'Austin', region_id: '57', save_in_address_book: true });
            expect(store.billingAddress.get()).not.toHaveProperty('id');
            expect(store.appliedShippingMethod.get()).toEqual(FIXTURE_RATE);
            expect(store.billingSynced.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expectNoRequest();
        });
    });

    it('several payment methods wait for the shopper: the gate opens with the choice, still with no request', () => {
        const { selectors } = boot(guestWithInitial(initialState({
            paymentMethods: [{ code: 'checkmo', title: 'Check' }, { code: 'banktransfer', title: 'Bank transfer' }],
        })));
        acceptAgreements();

        expect(store.selectedPaymentMethod.get()).toBeNull();
        expect(selectors.canPlaceOrder.get()).toBe(false);
        store.selectedPaymentMethod.set('banktransfer');
        expect(selectors.canPlaceOrder.get()).toBe(true);
        expectNoRequest();
    });

    it('a customer gets the saved address of the quote selected, not the default one, with no request', () => {
        const { selectors } = boot(customerWithInitial(initialState({
            quoteAddresses: { shipping: SECOND_ON_QUOTE, billing: null, billingSameAsShipping: true },
        })));
        acceptAgreements();

        expect(store.selectedShippingAddressId.get()).toBe('2');
        expect(store.shippingAddress.get()?.id).toBe('2');
        expect(store.billingSameAsShipping.get()).toBe(true);
        expect(store.appliedShippingMethod.get()).toEqual(FLAT);
        expect(selectors.canPlaceOrder.get()).toBe(true);
        expectNoRequest();
    });

    it('a customer address typed in the checkout comes back as a new address to save, with no request', () => {
        const typed = { ...SHIPPING, customer_address_id: null, same_as_billing: '0' };
        const typedBilling = { ...BILLING, customer_address_id: null, save_in_address_book: '0' };
        const { selectors } = boot(customerWithInitial(initialState({
            quoteAddresses: { shipping: typed, billing: typedBilling, billingSameAsShipping: false },
        })));
        acceptAgreements();

        expect(store.selectedShippingAddressId.get()).toBeNull();
        expect(store.shippingAddress.get()).toMatchObject({ firstname: 'Hunt', city: 'Austin', save_in_address_book: true });
        expect(store.shippingAddress.get()).not.toHaveProperty('id');
        expect(store.selectedBillingAddressId.get()).toBeNull();
        expect(store.billingAddress.get()).toMatchObject({ city: 'Calder', save_in_address_book: false });
        expect(store.billingSameAsShipping.get()).toBe(false);
        expect(store.billingSynced.get()).toBe(true);
        expect(selectors.canPlaceOrder.get()).toBe(true);
        expectNoRequest();
    });

    it('a customer billing address of the address book is selected by its id', () => {
        boot(customerWithInitial(initialState({
            quoteAddresses: {
                shipping: { ...SECOND_ON_QUOTE, same_as_billing: '0' },
                billing: {
                    firstname: 'Veronica', lastname: 'Costello', street: ['6146 Honey Bluff Parkway'], city: 'Calder',
                    region: 'Michigan', region_code: 'MI', region_id: '33', postcode: '49628-7978', country_id: 'US',
                    telephone: '(555) 229-3326', customer_address_id: '1',
                },
                billingSameAsShipping: false,
            },
        })));

        expect(store.selectedBillingAddressId.get()).toBe('1');
        expect(store.billingAddress.get()?.id).toBe('1');
        expect(store.billingSameAsShipping.get()).toBe(false);
        expect(store.billingSynced.get()).toBe(true);
        expectNoRequest();
    });

    it('without the stored state the rates are asked and the method is saved as before', async () => {
        shippingMocks.estimateGuestShippingMethods.mockResolvedValue([rate('flatrate', 'flatrate')]);
        shippingMocks.saveGuestShippingInformation.mockResolvedValue({
            payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
            totals: { grand_total: '39.00' } as Totals,
        });
        boot(guestWithInitial(null));

        expect(store.estimateState.get()).not.toBe('ready');
        expect(store.appliedShippingMethod.get()).toBeNull();
        await vi.waitFor(() => { expect(store.appliedShippingMethod.get()).toEqual(FLAT); });
        expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
        expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        expect(scheduled).toHaveLength(0);
    });

    it('a saved address edited since the quote took it is selected, but the stored state is not trusted', async () => {
        shippingMocks.estimateCustomerShippingMethods.mockResolvedValue([rate('flatrate', 'flatrate')]);
        shippingMocks.saveCustomerShippingInformation.mockResolvedValue({
            payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
            totals: { grand_total: '39.00' } as Totals,
        });
        boot(customerWithInitial(initialState({
            quoteAddresses: {
                shipping: { ...SECOND_ON_QUOTE, street: ['1 Old Street'] },
                billing: null,
                billingSameAsShipping: true,
            },
        })));

        expect(store.selectedShippingAddressId.get()).toBe('2');
        expect(store.estimateState.get()).not.toBe('ready');
        expect(store.availableShippingMethods.get()).toEqual([]);
        expect(scheduled).toHaveLength(0);
        await vi.waitFor(() => { expect(shippingMocks.saveCustomerShippingInformation).toHaveBeenCalledTimes(1); });
        expect(shippingMocks.estimateCustomerShippingMethods).toHaveBeenCalledTimes(1);
    });

    it('a quote address whose saved address is gone keeps the default address and asks the rates', () => {
        const config = customerWithInitial(initialState({
            quoteAddresses: {
                shipping: { ...SECOND_ON_QUOTE, customer_address_id: 99 },
                billing: null,
                billingSameAsShipping: true,
            },
        }));
        setCheckoutConfig(withPaymentRenderers(config));
        hydrateStore(store, config);

        expect(store.selectedShippingAddressId.get()).toBe('1');
        expect(store.estimateState.get()).toBe('idle');
        const flow = fakeFlow();
        startInitialRequests(store, flow, schedule);
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['is not among the stored rates', { appliedShippingMethod: { carrier_code: 'ups', method_code: 'GND' } }],
        ['is an error row', { shippingMethods: [{ ...rate('flatrate', 'flatrate'), available: false }] }],
    ])('a confirmed method that %s is ignored', (_title, extra) => {
        const config = guestWithInitial(initialState(extra as Partial<InitialStateConfig>));
        setCheckoutConfig(withPaymentRenderers(config));
        hydrateStore(store, config);

        expect(store.estimateState.get()).toBe('idle');
        expect(store.appliedShippingMethod.get()).toBeNull();
        const flow = fakeFlow();
        startInitialRequests(store, flow, schedule);
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
    });

    it('an incomplete quote address is not enough for the stored state', () => {
        const config = guestWithInitial(
            initialState(),
            { email: 'guest@example.com', shippingAddress: { ...SHIPPING, city: null }, billingAddress: null }
        );
        setCheckoutConfig(withPaymentRenderers(config));
        hydrateStore(store, config);

        expect(store.estimateState.get()).toBe('idle');
        expect(store.appliedShippingMethod.get()).toBeNull();
    });

    it('a draft that puts another destination in the form gets its own estimate', () => {
        restoreDraftMock.mockImplementation((target) => {
            const current = target.shippingAddress.get();
            if (current) target.shippingAddress.set({ ...current, postcode: '10001' });
            target.shippingDirty.set(true);
        });
        const config = guestWithInitial(initialState());
        setCheckoutConfig(withPaymentRenderers(config));
        hydrateStore(store, config);

        expect(restoreDraftMock).toHaveBeenCalledWith(store, config);
        expect(store.estimateState.get()).toBe('idle');
        const flow = fakeFlow();
        startInitialRequests(store, flow, schedule);
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
        expect(scheduled).toHaveLength(0);
    });

    it('a draft that only changed a name keeps the stored rates and is saved at once', () => {
        restoreDraftMock.mockImplementation((target) => {
            const current = target.shippingAddress.get();
            if (current) target.shippingAddress.set({ ...current, firstname: 'Typed' });
            target.shippingDirty.set(true);
        });
        const config = guestWithInitial(initialState());
        setCheckoutConfig(withPaymentRenderers(config));
        hydrateStore(store, config);

        expect(store.estimateState.get()).toBe('ready');
        const flow = fakeFlow();
        startInitialRequests(store, flow, schedule);
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
    });

    it('the late refresh completes the stored list below its rows without closing the gate and keeps the confirmed selection', async () => {
        const { selectors } = boot(guestWithInitial(initialState()));
        acceptAgreements();
        let answer: (rates: ShippingMethod[]) => void = () => undefined;
        shippingMocks.estimateGuestShippingMethods.mockReturnValue(
            new Promise<ShippingMethod[]>((resolve) => { answer = resolve; })
        );

        scheduled[0]!();
        await Promise.resolve();
        expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
        expect(store.isLoadingShippingMethods.get()).toBe(false);
        expect(store.estimateState.get()).toBe('ready');
        expect(store.shippingDirty.get()).toBe(false);
        expect(selectors.canPlaceOrder.get()).toBe(true);

        answer([rate('tablerate', 'bestway'), rate('flatrate', 'flatrate')]);
        await vi.waitFor(() => { expect(store.availableShippingMethods.get()).toHaveLength(2); });
        // The row on screen stays first: the rate the stored list missed goes below it.
        expect(store.availableShippingMethods.get().map((m) => m.carrier_code)).toEqual(['flatrate', 'tablerate']);
        expect(store.selectedShippingMethod.get()).toEqual(FLAT);
        expect(store.appliedShippingMethod.get()).toEqual(FLAT);
        expect(selectors.canPlaceOrder.get()).toBe(true);
        expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
    });

    it('a refreshed list without the confirmed method selects another rate and saves it', async () => {
        boot(guestWithInitial(initialState()));
        shippingMocks.estimateGuestShippingMethods.mockResolvedValue([rate('tablerate', 'bestway')]);
        shippingMocks.saveGuestShippingInformation.mockResolvedValue({
            payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
            totals: { grand_total: '41.00' } as Totals,
        });

        scheduled[0]!();
        const best = { carrier_code: 'tablerate', method_code: 'bestway' };
        await vi.waitFor(() => { expect(store.appliedShippingMethod.get()).toEqual(best); });
        expect(store.selectedShippingMethod.get()).toEqual(best);
        expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
        expect(request.addressInformation.shipping_carrier_code).toBe('tablerate');
    });

    it('a failed refresh shows nothing and leaves the gate open', async () => {
        const { flow, selectors } = boot(guestWithInitial(initialState()));
        acceptAgreements();
        shippingMocks.estimateGuestShippingMethods.mockRejectedValue(new Error('offline'));

        await flow.refreshShippingRatesSilently();

        expect(store.globalError.get()).toBeNull();
        expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
        expect(store.estimateState.get()).toBe('ready');
        expect(store.availableShippingMethods.get()).toHaveLength(1);
        expect(selectors.canPlaceOrder.get()).toBe(true);
    });

    it('a refresh answered after the destination changed is dropped', async () => {
        const { flow } = boot(guestWithInitial(initialState()));
        let answer: (rates: ShippingMethod[]) => void = () => undefined;
        shippingMocks.estimateGuestShippingMethods.mockReturnValueOnce(
            new Promise<ShippingMethod[]>((resolve) => { answer = resolve; })
        );

        const refresh = flow.refreshShippingRatesSilently();
        // Not enough for rates any more, so the edit itself asks nothing.
        store.shippingAddress.set({ ...store.shippingAddress.get()!, postcode: '' });
        flow.scheduleShippingEstimate();
        answer([rate('tablerate', 'bestway'), rate('ups', 'GND')]);
        await refresh;

        expect(store.availableShippingMethods.get().map((m) => m.carrier_code)).toEqual(['flatrate']);
        expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
    });

    it('nothing is refreshed while the rates are not the confirmed ones', async () => {
        const { flow } = boot(guestWithInitial(null, { email: null, shippingAddress: null, billingAddress: null }));

        await flow.refreshShippingRatesSilently();

        expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
    });

    it('the coupon of the quote totals is shown as applied', () => {
        const base = guestConfig(null);
        hydrateStore(store, { ...base, totalsData: { ...base.totalsData, coupon_code: 'H20' } } as CheckoutConfig);
        expect(store.appliedCoupon.get()).toBe('H20');

        const empty = createStore();
        hydrateStore(empty, guestConfig(null));
        expect(empty.appliedCoupon.get()).toBeNull();
    });
});
