// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';

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
vi.mock('../../api/cart.js', () => ({
    getGuestTotals: vi.fn(),
    getCustomerTotals: vi.fn(),
    getGuestCartState: vi.fn(),
    getCustomerCartState: vi.fn(),
}));
vi.mock('../../components/hyperion-recaptcha.js', () => ({
    executeRecaptcha: vi.fn().mockResolvedValue(null),
}));

import * as shippingApi from '../../api/shipping.js';
import * as paymentApi from '../../api/payment.js';
import * as couponApi from '../../api/coupon.js';
import * as cartApi from '../../api/cart.js';
import { MagentoApiError, NetworkError, RequestTimeoutError } from '../../api/client.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Address } from '../../types/address.js';
import type { PaymentDetails, ShippingMethod } from '../../types/shipping.js';
import type { Totals } from '../../types/totals.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { createFlowActions, isPickupRate, reconcilePaymentSelection, type FlowActions } from '../flow-actions.js';
import { createSelectors, expectedAgreements } from '../selectors.js';

const shippingMocks = vi.mocked(shippingApi);
const paymentMocks = vi.mocked(paymentApi);
const couponMocks = vi.mocked(couponApi);
const cartMocks = vi.mocked(cartApi);

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

/** A pending estimate that rejects with an AbortError when its signal fires, like fetch(). */
function abortableEstimate(signal: AbortSignal | undefined): Deferred<readonly ShippingMethod[]> {
    const d = deferred<readonly ShippingMethod[]>();
    signal?.addEventListener('abort', () => {
        d.reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
    return d;
}

function method(carrier: string, code: string, amount = 5): ShippingMethod {
    return {
        carrier_code: carrier,
        method_code: code,
        carrier_title: carrier,
        method_title: code,
        amount,
        base_amount: amount,
        available: true,
        error_message: '',
        price_excl_tax: amount,
        price_incl_tax: amount,
    };
}

/** A rate as a carrier answers it when it does not serve the address. */
function errorRate(carrier: string, message: string): ShippingMethod {
    return {
        carrier_code: carrier,
        method_code: null as unknown as string,
        carrier_title: carrier,
        method_title: null as unknown as string,
        amount: 0,
        base_amount: 0,
        available: false,
        error_message: message,
        price_excl_tax: 0,
        price_incl_tax: 0,
    };
}

function totals(grand: string): Totals {
    return {
        grand_total: grand,
        base_grand_total: grand,
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
    };
}

function details(grand: string): PaymentDetails {
    return {
        payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
        totals: totals(grand),
    };
}

const address: Address = {
    country_id: 'US',
    city: 'Calder',
    firstname: 'Veronica',
    lastname: 'Costello',
    telephone: '555',
    postcode: '49628',
    street: ['6146 Honey Bluff Parkway'],
};

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('flow actions', () => {
    let store: Store;
    let flow: FlowActions;
    let selectors: ReturnType<typeof createSelectors>;

    beforeEach(() => {
        vi.clearAllMocks();
        setCheckoutConfig(null as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.maskedQuoteId.set('masked-1');
        store.isGuest.set(true);
        store.email.set('ok@example.com');
        store.shippingAddress.set(address);
        store.billingSameAsShipping.set(true);
        flow = createFlowActions();
        selectors = createSelectors(store);
        expectedAgreements.set([]);
    });

    describe('payment-information payload (agreements contract)', () => {
        it('guest order: agreement ids travel inside paymentMethod.extension_attributes as strings', async () => {
            store.selectedPaymentMethod.set('checkmo');
            store.acceptedAgreements.set([7, 12]);
            paymentMocks.placeGuestOrder.mockResolvedValue(1001);

            const orderId = await flow.placeOrder();

            expect(orderId).toBe(1001);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
            const [cartId, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(cartId).toBe('masked-1');
            expect(JSON.parse(JSON.stringify(request))).toEqual({
                email: 'ok@example.com',
                paymentMethod: {
                    method: 'checkmo',
                    extension_attributes: { agreement_ids: ['7', '12'] },
                },
                billingAddress: {
                    country_id: 'US',
                    street: ['6146 Honey Bluff Parkway'],
                    telephone: '555',
                    postcode: '49628',
                    city: 'Calder',
                    firstname: 'Veronica',
                    lastname: 'Costello',
                    email: 'ok@example.com',
                },
            });
            expect(request).not.toHaveProperty('extension_attributes');
        });

        it('customer order: same nesting, no email, gateway data kept beside the agreements', async () => {
            store.isGuest.set(false);
            store.selectedPaymentMethod.set('braintree');
            store.paymentMethodData.set({ braintree: { payment_method_nonce: 'nonce-1' } });
            store.acceptedAgreements.set([3]);
            paymentMocks.placeCustomerOrder.mockResolvedValue(42);

            await flow.placeOrder();

            const [request] = paymentMocks.placeCustomerOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({
                method: 'braintree',
                additional_data: { payment_method_nonce: 'nonce-1' },
                extension_attributes: { agreement_ids: ['3'] },
            });
            expect(request).not.toHaveProperty('email');
            expect(request).not.toHaveProperty('extension_attributes');
        });

        it('savePaymentInformation uses the same payload shape', async () => {
            store.selectedPaymentMethod.set('checkmo');
            store.acceptedAgreements.set([7]);
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);

            expect(await flow.savePaymentInformation()).toBe(true);
            const [, request] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(request.paymentMethod.extension_attributes).toEqual({ agreement_ids: ['7'] });
        });

        it('omits extension_attributes entirely when no agreement was accepted', async () => {
            store.selectedPaymentMethod.set('checkmo');
            paymentMocks.placeGuestOrder.mockResolvedValue(5);

            await flow.placeOrder();

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({ method: 'checkmo' });
        });
    });

    describe('estimateShipping concurrency', () => {
        it('estimate B supersedes estimate A: A is aborted, B keeps loading and wins', async () => {
            const pending: Deferred<readonly ShippingMethod[]>[] = [];
            shippingMocks.estimateGuestShippingMethods.mockImplementation((_id, _req, signal) => {
                const d = abortableEstimate(signal);
                pending.push(d);
                return d.promise;
            });
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            const a = flow.estimateShipping();
            expect(store.isLoadingShippingMethods.get()).toBe(true);
            const b = flow.estimateShipping();
            await a;

            // A was cancelled by B: no error, and B is still the active estimate.
            expect(store.globalError.get()).toBeNull();
            expect(store.isLoadingShippingMethods.get()).toBe(true);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

            pending[1]!.resolve([method('flatrate', 'flatrate')]);
            await b;

            expect(store.isLoadingShippingMethods.get()).toBe(false);
            expect(store.availableShippingMethods.get()).toHaveLength(1);
            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
            expect(store.totals.get()?.grand_total).toBe('57.00');
        });

        it('a late response of a superseded estimate is ignored even when it resolves', async () => {
            const pending: Deferred<readonly ShippingMethod[]>[] = [];
            shippingMocks.estimateGuestShippingMethods.mockImplementation(() => {
                const d = deferred<readonly ShippingMethod[]>();
                pending.push(d);
                return d.promise;
            });
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            const a = flow.estimateShipping();
            const b = flow.estimateShipping();
            pending[1]!.resolve([method('tablerate', 'bestway')]);
            await b;
            pending[0]!.resolve([method('flatrate', 'flatrate')]);
            await a;

            expect(store.availableShippingMethods.get().map((m) => m.method_code)).toEqual(['bestway']);
            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'tablerate', method_code: 'bestway' });
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.isLoadingShippingMethods.get()).toBe(false);
        });

        it('a served address followed by one without rates clears the selection and never saves it', async () => {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            store.selectedPaymentMethod.set('checkmo');

            await flow.estimateShipping();
            expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
            expect(selectors.canPlaceOrder.get()).toBe(true);

            // Antarctica needs no postcode (`general/country/optional_zip_countries`).
            setCheckoutConfig({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, optionalZipCountries: ['AQ'] } as unknown as CheckoutConfig);
            store.shippingAddress.set({ ...address, country_id: 'AQ', postcode: '' });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([]);
            await flow.estimateShipping();

            expect(store.availableShippingMethods.get()).toEqual([]);
            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(store.availablePaymentMethods.get()).toEqual([]);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.isLoadingShippingMethods.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a transport failure of the current estimate is reported, an abort is not', async () => {
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(new Error('offline'));
            await flow.estimateShipping();
            expect(store.globalError.get()).toBe('offline');
            expect(store.isLoadingShippingMethods.get()).toBe(false);

            store.globalError.set(null);
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(
                new DOMException('The operation was aborted.', 'AbortError')
            );
            await flow.estimateShipping();
            expect(store.globalError.get()).toBeNull();
        });
    });

    describe('saveShippingAndEstimateTotals concurrency', () => {
        beforeEach(() => {
            store.availableShippingMethods.set([method('flatrate', 'flatrate'), method('tablerate', 'bestway', 9)]);
            store.selectedPaymentMethod.set('checkmo');
        });

        it('rapid method switching: the newest save wins whatever order the responses arrive in', async () => {
            const pending: Deferred<PaymentDetails>[] = [];
            shippingMocks.saveGuestShippingInformation.mockImplementation(() => {
                const d = deferred<PaymentDetails>();
                pending.push(d);
                return d.promise;
            });

            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            const s1 = flow.saveShippingAndEstimateTotals();
            store.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
            const s2 = flow.saveShippingAndEstimateTotals();
            expect(store.isSavingShipping.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            pending[1]!.resolve(details('61.00'));
            await s2;
            expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'tablerate', method_code: 'bestway' });
            expect(store.totals.get()?.grand_total).toBe('61.00');
            expect(store.isSavingShipping.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);

            pending[0]!.resolve(details('57.00'));
            await s1;
            await settle();
            expect(store.totals.get()?.grand_total).toBe('61.00');
            expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'tablerate', method_code: 'bestway' });
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('an older save resolving first is ignored and the gate stays closed until the newest one lands', async () => {
            const pending: Deferred<PaymentDetails>[] = [];
            shippingMocks.saveGuestShippingInformation.mockImplementation(() => {
                const d = deferred<PaymentDetails>();
                pending.push(d);
                return d.promise;
            });

            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            const s1 = flow.saveShippingAndEstimateTotals();
            store.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
            const s2 = flow.saveShippingAndEstimateTotals();

            pending[0]!.resolve(details('57.00'));
            await s1;
            expect(store.totals.get()).toBeNull();
            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(store.isSavingShipping.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            pending[1]!.resolve(details('61.00'));
            await s2;
            expect(store.totals.get()?.grand_total).toBe('61.00');
            expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'tablerate', method_code: 'bestway' });
            expect(store.isSavingShipping.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a failed save clears the applied method and reports the error', async () => {
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            await flow.saveShippingAndEstimateTotals();
            expect(selectors.canPlaceOrder.get()).toBe(true);

            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(new Error('Carrier unavailable'));
            store.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
            await flow.saveShippingAndEstimateTotals();

            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(store.globalError.get()).toBe('Carrier unavailable');
            expect(store.isSavingShipping.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a shipping save whose answer offers only free at a zero total switches the selection to free', async () => {
            store.selectedPaymentMethod.set('checkmo');
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce({
                payment_methods: [{ code: 'free', title: 'No Payment Information Required' }],
                totals: totals('0.0000'),
            });

            await flow.saveShippingAndEstimateTotals();

            expect(store.availablePaymentMethods.get().map((m) => m.code)).toEqual(['free']);
            expect(store.selectedPaymentMethod.get()).toBe('free');
            expect(selectors.paymentMethodSelected.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a shipping save that drops the selected method falls back to an offered offline method', async () => {
            store.selectedPaymentMethod.set('cashondelivery');
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));

            await flow.saveShippingAndEstimateTotals();

            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a selection the quote does not offer closes Place Order even when everything else is ready', async () => {
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            await flow.saveShippingAndEstimateTotals();
            expect(selectors.canPlaceOrder.get()).toBe(true);

            store.selectedPaymentMethod.set('paypal_express');
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a selection the server has not confirmed keeps Place Order closed', async () => {
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            await flow.saveShippingAndEstimateTotals();
            expect(selectors.canPlaceOrder.get()).toBe(true);

            store.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });
    });

    describe('address payload mapper', () => {
        it('keeps VAT, fax, custom and extension attributes and the identity of a saved address', async () => {
            store.isGuest.set(false);
            store.selectedPaymentMethod.set('checkmo');
            store.billingAddress.set({
                ...address,
                id: '12',
                customer_id: '3',
                company: 'Luma',
                fax: '555-0199',
                vat_id: 'IT01234567890',
                custom_attributes: [{ attribute_code: 'house_number', value: '6146' }],
                extension_attributes: { gift_registry_id: '1' },
                save_in_address_book: true,
            });
            store.billingSameAsShipping.set(false);
            store.billingSynced.set(true);
            paymentMocks.placeCustomerOrder.mockResolvedValue(7);

            await flow.placeOrder();

            const [request] = paymentMocks.placeCustomerOrder.mock.calls[0]!;
            expect(request.billingAddress).toEqual({
                country_id: 'US',
                street: ['6146 Honey Bluff Parkway'],
                telephone: '555',
                postcode: '49628',
                city: 'Calder',
                firstname: 'Veronica',
                lastname: 'Costello',
                company: 'Luma',
                fax: '555-0199',
                vat_id: 'IT01234567890',
                custom_attributes: [{ attribute_code: 'house_number', value: '6146' }],
                extension_attributes: { gift_registry_id: '1' },
                customer_address_id: 12,
            });
            expect(request.billingAddress).not.toHaveProperty('save_in_address_book');
        });

        it('sends save_in_address_book as 1 or 0 for a billing address typed on its own and omits an empty telephone', async () => {
            store.selectedPaymentMethod.set('checkmo');
            setCheckoutConfig({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'opt' } as unknown as CheckoutConfig);
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, telephone: '', save_in_address_book: true });
            store.billingSynced.set(true);
            paymentMocks.placeGuestOrder.mockResolvedValue(8);

            await flow.placeOrder();

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.billingAddress.save_in_address_book).toBe(1);
            expect(request.billingAddress).not.toHaveProperty('telephone');

            store.billingAddress.set({ ...address, telephone: '', save_in_address_book: false });
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);
            await flow.savePaymentInformation();
            const [, second] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(second.billingAddress.save_in_address_book).toBe(0);
        });
    });

    describe('"same as shipping" billing copy', () => {
        it('the billing copy of a new address travels without save_in_address_book in the shipping save and the order', async () => {
            store.isGuest.set(false);
            store.selectedPaymentMethod.set('checkmo');
            store.shippingAddress.set({ ...address, city: 'Austin', postcode: '78701', save_in_address_book: true });
            shippingMocks.estimateCustomerShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveCustomerShippingInformation.mockResolvedValue(details('57.00'));
            paymentMocks.placeCustomerOrder.mockResolvedValue(9);

            await flow.estimateShipping();
            const [saved] = shippingMocks.saveCustomerShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_address.save_in_address_book).toBe(1);
            expect(saved.addressInformation.billing_address).not.toHaveProperty('save_in_address_book');
            expect(saved.addressInformation.billing_address.city).toBe('Austin');

            await flow.placeOrder();
            const [order] = paymentMocks.placeCustomerOrder.mock.calls[0]!;
            expect(order.billingAddress).not.toHaveProperty('save_in_address_book');
            expect(order.billingAddress.city).toBe('Austin');
        });

        it('a billing address typed on its own keeps the flag of its checkbox', async () => {
            store.isGuest.set(false);
            store.selectedPaymentMethod.set('checkmo');
            store.shippingAddress.set({ ...address, save_in_address_book: false });
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, city: 'Austin', postcode: '78701', save_in_address_book: true });
            store.billingSynced.set(true);
            shippingMocks.estimateCustomerShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveCustomerShippingInformation.mockResolvedValue(details('57.00'));
            paymentMocks.placeCustomerOrder.mockResolvedValue(10);

            await flow.estimateShipping();
            const [saved] = shippingMocks.saveCustomerShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_address.save_in_address_book).toBe(0);
            expect(saved.addressInformation.billing_address.save_in_address_book).toBe(1);

            await flow.placeOrder();
            const [order] = paymentMocks.placeCustomerOrder.mock.calls[0]!;
            expect(order.billingAddress.save_in_address_book).toBe(1);
        });
    });

    describe('new address of a customer', () => {
        it('an address typed into the "Add new address" form is saved to the address book, never as a saved pick', async () => {
            store.isGuest.set(false);
            store.selectedPaymentMethod.set('checkmo');
            store.savedAddresses.set([{ ...address, id: '1', customer_id: '3' }]);
            store.selectedShippingAddressId.set(null);
            // What the selector seeds the form with: name and telephone, no identity.
            store.shippingAddress.set({ ...address, city: 'Austin', postcode: '78701', save_in_address_book: true });
            shippingMocks.estimateCustomerShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveCustomerShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();

            const [request] = shippingMocks.saveCustomerShippingInformation.mock.calls[0]!;
            const shipping = request.addressInformation.shipping_address;
            expect(shipping.city).toBe('Austin');
            expect(shipping.save_in_address_book).toBe(1);
            expect(shipping).not.toHaveProperty('customer_address_id');
            expect(shipping).not.toHaveProperty('email');
            expect(request.addressInformation.billing_address).not.toHaveProperty('customer_address_id');
        });
    });

    describe('guest email on the quote', () => {
        it('the shipping save and the billing sync carry the guest email on the addresses', async () => {
            store.email.set('guest@example.com');
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();

            const [, estimate] = shippingMocks.estimateGuestShippingMethods.mock.calls[0]!;
            expect(estimate.address.email).toBe('guest@example.com');
            const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(request.addressInformation.shipping_address.email).toBe('guest@example.com');
            expect(request.addressInformation.billing_address.email).toBe('guest@example.com');

            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, city: 'Austin', postcode: '78701' });
            paymentMocks.assignGuestBillingAddress.mockResolvedValue(undefined as never);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));
            await flow.syncBillingAddress();
            const [, billing] = paymentMocks.assignGuestBillingAddress.mock.calls[0]!;
            expect(billing.address.email).toBe('guest@example.com');
        });

        it('an email that is not valid yet never travels', async () => {
            store.email.set('not-an-email');
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();

            const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(request.addressInformation.shipping_address).not.toHaveProperty('email');
        });
    });

    describe('optional telephone (R6)', () => {
        it('estimates and places with an empty telephone when the merchant made it optional', async () => {
            setCheckoutConfig({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'opt' } as unknown as CheckoutConfig);
            store.shippingAddress.set({ ...address, telephone: '' });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
        });

        it('still blocks the estimate when the telephone is required and missing', async () => {
            setCheckoutConfig({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'req' } as unknown as CheckoutConfig);
            store.shippingAddress.set({ ...address, telephone: '' });

            await flow.estimateShipping();

            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
        });
    });

    describe('postcode format is a warning, not a gate', () => {
        const postCodes = {
            US: {
                pattern_1: { example: '12345-6789', pattern: '^[0-9]{5}\\-[0-9]{4}$' },
                pattern_2: { example: '12345', pattern: '^[0-9]{5}$' },
            },
        };

        function installPatterns(): void {
            setCheckoutConfig({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'req', postCodes } as unknown as CheckoutConfig);
        }

        it('a shipping postcode outside the patterns is estimated, saved and ordered with the value as typed', async () => {
            installPatterns();
            store.shippingAddress.set({ ...address, postcode: 'ABCDE' });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(21);

            await flow.estimateShipping();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            const [, estimate] = shippingMocks.estimateGuestShippingMethods.mock.calls[0]!;
            expect(estimate.address.postcode).toBe('ABCDE');
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_address.postcode).toBe('ABCDE');
            expect(saved.addressInformation.billing_address.postcode).toBe('ABCDE');
            expect(selectors.shippingAddressValid.get()).toBe(true);

            store.selectedPaymentMethod.set('checkmo');
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await flow.placeOrder()).toBe(21);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.billingAddress.postcode).toBe('ABCDE');
        });

        it('an empty postcode of a country that requires one sends no request at all', async () => {
            installPatterns();
            store.shippingAddress.set({ ...address, postcode: '' });
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });

            await flow.estimateShipping();
            await flow.saveShippingAndEstimateTotals();
            store.selectedPaymentMethod.set('checkmo');
            expect(selectors.shippingAddressValid.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await flow.placeOrder()).toBeNull();

            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        });

        it('a separate billing address with a postcode outside the patterns is synced and ordered, an empty one is not', async () => {
            installPatterns();
            store.availableShippingMethods.set([method('flatrate', 'flatrate')]);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.totals.set(totals('57.00'));
            store.selectedPaymentMethod.set('checkmo');
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: '' });

            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(selectors.billingAddressValid.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: 'ABCDE' });
            paymentMocks.assignGuestBillingAddress.mockResolvedValueOnce(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('57.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(22);

            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledTimes(1);
            const [, billing] = paymentMocks.assignGuestBillingAddress.mock.calls[0]!;
            expect(billing.address.postcode).toBe('ABCDE');
            expect(selectors.billingAddressValid.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await flow.placeOrder()).toBe(22);
        });

        it('a virtual quote follows the same rule for its billing address', async () => {
            installPatterns();
            store.isVirtual.set(true);
            store.selectedPaymentMethod.set('checkmo');
            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: '' });

            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(await flow.placeOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();

            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: 'ABCDE' });
            paymentMocks.assignGuestBillingAddress.mockResolvedValueOnce(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('30.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(23);

            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledTimes(1);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await flow.placeOrder()).toBe(23);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.billingAddress.postcode).toBe('ABCDE');
        });
    });

    describe('payment information refresh (R3)', () => {
        it('a coupon that zeroes the total switches the selection to free and refreshes the method list', async () => {
            store.selectedPaymentMethod.set('checkmo');
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            couponMocks.applyGuestCoupon.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue({
                payment_methods: [{ code: 'free', title: 'No Payment Information Required' }],
                totals: totals('0.0000'),
            });

            expect(await flow.applyCoupon('FREEBIE')).toBe(true);

            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledWith('masked-1');
            expect(store.availablePaymentMethods.get().map((m) => m.code)).toEqual(['free']);
            expect(store.selectedPaymentMethod.get()).toBe('free');
            expect(store.totals.get()?.grand_total).toBe('0.0000');
            expect(store.appliedCoupon.get()).toBe('FREEBIE');
        });

        it('removing the coupon drops free, falls back to the first offline method', async () => {
            store.selectedPaymentMethod.set('free');
            couponMocks.removeGuestCoupon.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));

            expect(await flow.removeCoupon()).toBe(true);

            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(store.appliedCoupon.get()).toBeNull();
        });

        it('reconcilePaymentSelection keeps an offered selection and never picks a gateway on its own', () => {
            const methods = [{ code: 'braintree', title: 'Card' }, { code: 'checkmo', title: 'Check' }];
            expect(reconcilePaymentSelection('braintree', methods, totals('57.00'))).toBe('braintree');
            expect(reconcilePaymentSelection('paypal_express', methods, totals('57.00'))).toBe('checkmo');
            expect(reconcilePaymentSelection(null, [{ code: 'braintree', title: 'Card' }], totals('57.00'))).toBeNull();
            expect(reconcilePaymentSelection('checkmo', [{ code: 'free', title: 'Free' }, ...methods], totals('0'))).toBe('free');
        });
    });

    describe('billing address sync (R2)', () => {
        it('a virtual quote puts the billing address on the quote and refreshes methods and totals before the order', async () => {
            store.isVirtual.set(true);
            store.billingAddress.set({ ...address, firstname: 'Bill' });
            store.selectedPaymentMethod.set('checkmo');
            paymentMocks.assignGuestBillingAddress.mockResolvedValue(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('30.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(9);

            expect(selectors.canPlaceOrder.get()).toBe(false);
            await flow.syncBillingAddress();

            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledWith('masked-1', {
                address: expect.objectContaining({ firstname: 'Bill', city: 'Calder' }),
                useForShipping: false,
            });
            expect(store.billingSynced.get()).toBe(true);
            expect(store.isSavingBilling.get()).toBe(false);
            expect(store.totals.get()?.grand_total).toBe('30.00');
            expect(selectors.canPlaceOrder.get()).toBe(true);

            await flow.placeOrder();
            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledTimes(1);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('placeOrder syncs an unsynced separate billing address first and gives up when the sync fails', async () => {
            store.availableShippingMethods.set([method('flatrate', 'flatrate')]);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, firstname: 'Bill' });
            store.selectedPaymentMethod.set('checkmo');
            store.totals.set(totals('57.00'));
            paymentMocks.assignGuestBillingAddress.mockRejectedValueOnce(new Error('Invalid VAT'));

            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await flow.placeOrder()).toBeNull();
            expect(store.globalError.get()).toBe('Invalid VAT');
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();

            paymentMocks.assignGuestBillingAddress.mockResolvedValueOnce(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('57.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(11);
            expect(await flow.placeOrder()).toBe(11);
            expect(store.billingSynced.get()).toBe(true);
        });

        it('is a no-op while the billing address is the shipping one', async () => {
            store.billingSameAsShipping.set(true);
            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(selectors.billingReady.get()).toBe(true);
        });

        it('an answer for address A arriving after the edit to B, before the next sync starts, is ignored', async () => {
            store.isVirtual.set(true);
            store.selectedPaymentMethod.set('checkmo');
            store.billingAddress.set({ ...address, city: 'Calder' });
            const assignA = deferred<number>();
            paymentMocks.assignGuestBillingAddress.mockReturnValueOnce(assignA.promise);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('30.00'));

            const syncA = flow.syncBillingAddress();
            // The shopper edits the address to B: the component invalidates
            // at once, the debounced sync for B has not started yet.
            store.billingAddress.set({ ...address, city: 'Detroit' });
            flow.invalidateBillingSync();
            assignA.resolve(1);
            await syncA;
            await settle();

            expect(store.billingSynced.get()).toBe(false);
            expect(store.isSavingBilling.get()).toBe(false);
            expect(store.totals.get()).toBeNull();
            expect(selectors.canPlaceOrder.get()).toBe(false);

            // The debounce fires: B is synced and its answer is the one applied.
            paymentMocks.assignGuestBillingAddress.mockResolvedValueOnce(2);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('31.00'));
            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenLastCalledWith('masked-1', {
                address: expect.objectContaining({ city: 'Detroit' }),
                useForShipping: false,
            });
            expect(store.billingSynced.get()).toBe(true);
            expect(store.totals.get()?.grand_total).toBe('31.00');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('toggling "same as shipping" back on drops a pending sync and reopens the gate through the shipping address', async () => {
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, city: 'Calder' });
            const assign = deferred<number>();
            paymentMocks.assignGuestBillingAddress.mockReturnValueOnce(assign.promise);
            const pending = flow.syncBillingAddress();
            store.billingSameAsShipping.set(true);
            flow.invalidateBillingSync();
            assign.resolve(1);
            await pending;

            expect(store.billingSynced.get()).toBe(false);
            expect(selectors.billingReady.get()).toBe(true);
        });

        it('an older sync resolving after a newer one is ignored', async () => {
            store.isVirtual.set(true);
            store.billingAddress.set({ ...address, city: 'Calder' });
            const pending: Deferred<number>[] = [];
            paymentMocks.assignGuestBillingAddress.mockImplementation(() => {
                const d = deferred<number>();
                pending.push(d);
                return d.promise;
            });
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('30.00'));

            const first = flow.syncBillingAddress();
            store.billingAddress.set({ ...address, city: 'Detroit' });
            const second = flow.syncBillingAddress();
            pending[0]!.resolve(1);
            await first;
            expect(store.billingSynced.get()).toBe(false);
            expect(store.isSavingBilling.get()).toBe(true);
            pending[1]!.resolve(2);
            await second;
            expect(store.billingSynced.get()).toBe(true);
            expect(store.isSavingBilling.get()).toBe(false);
        });
    });

    describe('shipping form ahead of the quote', () => {
        const FLATRATE = { carrier_code: 'flatrate', method_code: 'flatrate' };

        /** A quote confirmed for the first address: the gate is open. */
        async function openGate(): Promise<void> {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            store.selectedPaymentMethod.set('checkmo');
            await flow.estimateShipping();
            expect(selectors.canPlaceOrder.get()).toBe(true);
            vi.clearAllMocks();
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
        }

        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        it('an address edit closes the gate at once and Place Order before the pause ends sends no order request', async () => {
            await openGate();

            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();

            expect(store.shippingDirty.get()).toBe(true);
            expect(selectors.shippingReady.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            // The quote still carries the old address and its confirmed method.
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();

            expect(await flow.placeOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
            expect(store.isPlacingOrder.get()).toBe(false);
        });

        it('the estimate starts once the typing pauses, and only the save that carried the address reopens the gate', async () => {
            await openGate();
            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValue(save.promise);

            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(300);
            store.shippingAddress.set({ ...address, street: ['12 New Street'] });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(499);
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.shippingDirty.get()).toBe(true);

            save.resolve(details('57.00'));
            await vi.advanceTimersByTimeAsync(0);
            expect(store.shippingDirty.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a save answered after another edit leaves the form marked as ahead of the quote', async () => {
            await openGate();
            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(save.promise);

            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            const first = flow.estimateShippingNow();
            await vi.advanceTimersByTimeAsync(0);
            store.shippingAddress.set({ ...address, street: ['2 Newer Street'] });
            flow.scheduleShippingEstimate();
            save.resolve(details('57.00'));
            await first;

            expect(store.shippingDirty.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a failed save and an address without rates both leave the form marked as ahead of the quote', async () => {
            await openGate();
            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(new Error('Carrier unavailable'));
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            await flow.estimateShippingNow();
            expect(store.shippingDirty.get()).toBe(true);

            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([]);
            store.shippingAddress.set({ ...address, street: ['2 New Street'] });
            await flow.estimateShippingNow();
            expect(store.shippingDirty.get()).toBe(true);
            expect(store.selectedShippingMethod.get()).toBeNull();
        });

        it('Place Order pressed while the typing pause runs waits for the estimate and the save, then orders with the new address', async () => {
            await openGate();
            paymentMocks.placeGuestOrder.mockResolvedValue(77);

            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();
            // What the button does on a press: settle, then decide.
            await flow.settleShipping();

            expect(store.shippingDirty.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await flow.placeOrder()).toBe(77);

            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_address.street).toEqual(['1 New Street']);
            expect(shippingMocks.estimateGuestShippingMethods.mock.invocationCallOrder[0]!)
                .toBeLessThan(shippingMocks.saveGuestShippingInformation.mock.invocationCallOrder[0]!);
            expect(shippingMocks.saveGuestShippingInformation.mock.invocationCallOrder[0]!)
                .toBeLessThan(paymentMocks.placeGuestOrder.mock.invocationCallOrder[0]!);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            // The scheduled run was consumed: nothing fires later.
            await vi.advanceTimersByTimeAsync(1000);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
        });

        it('settling waits for a save that is already in flight and resolves at once when nothing is pending', async () => {
            await openGate();
            await flow.settleShipping();
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();

            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(save.promise);
            void flow.saveShippingAndEstimateTotals();
            let settled = false;
            const settling = flow.settleShipping().then(() => { settled = true; });
            await vi.advanceTimersByTimeAsync(0);
            expect(settled).toBe(false);
            save.resolve(details('57.00'));
            await settling;
            expect(store.isSavingShipping.get()).toBe(false);
        });

        it('a press after a failed shipping save sends the save again and, when it succeeds, places the order with the current address', async () => {
            await openGate();
            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(new MagentoApiError(503, 'unknown', 'The store is temporarily unavailable.'));
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            await flow.estimateShippingNow();
            expect(store.shippingDirty.get()).toBe(true);
            expect(store.globalError.get()).toBe('The store is temporarily unavailable.');
            expect(selectors.canPlaceOrder.get()).toBe(false);
            paymentMocks.placeGuestOrder.mockResolvedValue(91);

            // The press: settle, then decide.
            await flow.settleShipping();

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            const [, resent] = shippingMocks.saveGuestShippingInformation.mock.calls[1]!;
            expect(resent.addressInformation.shipping_address.street).toEqual(['1 New Street']);
            expect(store.shippingDirty.get()).toBe(false);
            expect(store.globalError.get()).toBeNull();
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await flow.placeOrder()).toBe(91);
        });

        it('a press after a failed estimate asks for the rates again', async () => {
            await openGate();
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            await flow.estimateShippingNow();
            expect(store.shippingDirty.get()).toBe(true);

            await flow.settleShipping();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(2);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a press after a failed save that fails again places nothing and shows the error, with one attempt per press', async () => {
            await openGate();
            shippingMocks.saveGuestShippingInformation.mockRejectedValue(new MagentoApiError(503, 'unknown', 'The store is temporarily unavailable.'));
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            await flow.estimateShippingNow();
            store.globalError.set(null);

            await flow.settleShipping();

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            expect(store.shippingDirty.get()).toBe(true);
            expect(store.globalError.get()).toBe('The store is temporarily unavailable.');
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await flow.placeOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
            // Nothing retries in the background.
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
        });

        it('settling gives the gate back when the new address has no rate', async () => {
            await openGate();
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([]);

            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();
            await flow.settleShipping();

            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await flow.placeOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        });

        it('no estimate and no save start while the order is being placed or once it exists', async () => {
            await openGate();
            store.isPlacingOrder.set(true);
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(500);
            await flow.estimateShipping();
            await flow.saveShippingAndEstimateTotals();
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

            store.isPlacingOrder.set(false);
            store.orderPlaced.set(true);
            await flow.estimateShippingNow();
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
        });
    });

    describe('shipping save skipped for an incomplete billing address', () => {
        it('is sent once the billing address syncs, and the server confirmed method ends equal to the selection', async () => {
            store.billingSameAsShipping.set(false);
            store.billingAddress.set(null);
            store.selectedPaymentMethod.set('checkmo');
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            paymentMocks.assignGuestBillingAddress.mockResolvedValue(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('52.00'));

            await flow.estimateShippingNow();
            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(store.shippingDirty.get()).toBe(true);

            store.billingAddress.set({ ...address, firstname: 'Bill' });
            await flow.syncBillingAddress();

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.billing_address.firstname).toBe('Bill');
            expect(paymentMocks.assignGuestBillingAddress.mock.invocationCallOrder[0]!)
                .toBeLessThan(shippingMocks.saveGuestShippingInformation.mock.invocationCallOrder[0]!);
            expect(store.appliedShippingMethod.get()).toEqual(store.selectedShippingMethod.get());
            expect(store.shippingDirty.get()).toBe(false);
            expect(store.totals.get()?.grand_total).toBe('57.00');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a billing sync sends no shipping save when the quote already carries the selection, or for a virtual quote', async () => {
            store.availableShippingMethods.set([method('flatrate', 'flatrate')]);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, firstname: 'Bill' });
            paymentMocks.assignGuestBillingAddress.mockResolvedValue(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));

            await flow.syncBillingAddress();
            expect(store.billingSynced.get()).toBe(true);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

            store.isVirtual.set(true);
            store.appliedShippingMethod.set(null);
            await flow.syncBillingAddress();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
        });
    });

    describe('order latch', () => {
        beforeEach(() => {
            store.selectedPaymentMethod.set('checkmo');
        });

        it('after a successful order the placing state stays, the order is marked placed and a second call sends nothing', async () => {
            paymentMocks.placeGuestOrder.mockResolvedValue(1001);

            expect(await flow.placeOrder()).toBe(1001);
            expect(store.isPlacingOrder.get()).toBe(true);
            expect(store.orderPlaced.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            expect(await flow.placeOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('two calls in the same tick send one order request', async () => {
            const order = deferred<number>();
            paymentMocks.placeGuestOrder.mockReturnValue(order.promise);

            const first = flow.placeOrder();
            const second = flow.placeOrder();
            order.resolve(5);

            expect(await second).toBeNull();
            expect(await first).toBe(5);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('an order the server refused releases the placing state and shows the message of the server', async () => {
            paymentMocks.placeGuestOrder.mockRejectedValue(new MagentoApiError(400, '400', 'The payment was declined.'));

            expect(await flow.placeOrder()).toBeNull();
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderPlaced.get()).toBe(false);
            expect(store.globalError.get()).toBe('The payment was declined.');
            expect(cartMocks.getGuestCartState).not.toHaveBeenCalled();
        });
    });

    describe('order request that lost its answer', () => {
        const NOT_PLACED = 'We could not reach the store. Your order was not placed. Please try again.';
        const UNKNOWN = 'We could not confirm whether your order was placed. Please wait a moment and press Place Order again; we will check before sending anything.';

        beforeEach(() => {
            store.selectedPaymentMethod.set('checkmo');
            paymentMocks.placeGuestOrder.mockRejectedValue(new NetworkError(new TypeError('Failed to fetch')));
            paymentMocks.placeCustomerOrder.mockRejectedValue(new NetworkError(new TypeError('Failed to fetch')));
        });

        it('guest: a cart answered as inactive means the order exists and the call resolves as placed', async () => {
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: false });

            expect(await flow.placeOrder()).toBe('placed-unconfirmed');
            expect(cartMocks.getGuestCartState).toHaveBeenCalledWith('masked-1');
            expect(store.orderPlaced.get()).toBe(true);
            expect(store.isPlacingOrder.get()).toBe(true);
            expect(store.globalError.get()).toBeNull();
        });

        it('guest: a cart that is gone (404) means the order exists', async () => {
            cartMocks.getGuestCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));

            expect(await flow.placeOrder()).toBe('placed-unconfirmed');
            expect(store.orderPlaced.get()).toBe(true);
        });

        it('guest: a cart that is still active releases the placing state with the "not placed" message and keeps every input', async () => {
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: true });

            expect(await flow.placeOrder()).toBeNull();
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderPlaced.get()).toBe(false);
            expect(store.orderOutcomeUnknown.get()).toBe(false);
            expect(store.globalError.get()).toBe(NOT_PLACED);
            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(store.shippingAddress.get()).toBe(address);
        });

        it('a cart read that fails too marks the outcome unknown, and the next press reads the cart before it sends anything', async () => {
            cartMocks.getGuestCartState.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));

            expect(await flow.placeOrder()).toBeNull();
            expect(store.orderOutcomeUnknown.get()).toBe(true);
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.globalError.get()).toBe(UNKNOWN);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);

            // Still unknown: nothing is sent.
            cartMocks.getGuestCartState.mockRejectedValueOnce(new MagentoApiError(503, '503', 'unavailable'));
            expect(await flow.placeOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
            expect(store.orderOutcomeUnknown.get()).toBe(true);
            expect(store.globalError.get()).toBe(UNKNOWN);

            // The cart shows the order: success without a second request.
            cartMocks.getGuestCartState.mockResolvedValueOnce({ id: 464, is_active: false });
            expect(await flow.placeOrder()).toBe('placed-unconfirmed');
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
            expect(store.orderPlaced.get()).toBe(true);
            expect(store.orderOutcomeUnknown.get()).toBe(false);
        });

        it('after an unknown outcome, a cart that is still active lets the next press send the order again', async () => {
            cartMocks.getGuestCartState.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));
            await flow.placeOrder();
            expect(store.orderOutcomeUnknown.get()).toBe(true);

            cartMocks.getGuestCartState.mockResolvedValueOnce({ id: 464, is_active: true });
            paymentMocks.placeGuestOrder.mockResolvedValueOnce(88);
            expect(await flow.placeOrder()).toBe(88);
            expect(cartMocks.getGuestCartState.mock.invocationCallOrder[1]!)
                .toBeLessThan(paymentMocks.placeGuestOrder.mock.invocationCallOrder[1]!);
            expect(store.orderOutcomeUnknown.get()).toBe(false);
            expect(store.orderPlaced.get()).toBe(true);
        });

        it('a timeout with a cart that is still active stays unknown: the server may still be working on the order', async () => {
            paymentMocks.placeGuestOrder.mockRejectedValue(new RequestTimeoutError());
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: true });

            expect(await flow.placeOrder()).toBeNull();
            expect(store.orderOutcomeUnknown.get()).toBe(true);
            expect(store.globalError.get()).toBe(UNKNOWN);
        });

        describe('customer', () => {
            beforeEach(() => {
                store.isGuest.set(false);
                store.quoteId.set('465' as never);
            });

            it('no active cart (404) means the order exists', async () => {
                cartMocks.getCustomerCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));

                expect(await flow.placeOrder()).toBe('placed-unconfirmed');
                expect(store.orderPlaced.get()).toBe(true);
                expect(cartMocks.getGuestCartState).not.toHaveBeenCalled();
            });

            it('the quote of this checkout, still active, means no order: its id is compared as a number', async () => {
                cartMocks.getCustomerCartState.mockResolvedValue({ id: 465, is_active: true });

                expect(await flow.placeOrder()).toBeNull();
                expect(store.globalError.get()).toBe(NOT_PLACED);
                expect(store.isPlacingOrder.get()).toBe(false);
            });

            it('another active cart means the quote of this checkout was ordered', async () => {
                cartMocks.getCustomerCartState.mockResolvedValue({ id: 470, is_active: true });

                expect(await flow.placeOrder()).toBe('placed-unconfirmed');
            });

            it('a session that ended (401) decides nothing', async () => {
                cartMocks.getCustomerCartState.mockRejectedValue(new MagentoApiError(401, '401', 'Not authorized'));

                expect(await flow.placeOrder()).toBeNull();
                expect(store.orderOutcomeUnknown.get()).toBe(true);
                expect(store.globalError.get()).toBe(UNKNOWN);
            });
        });
    });

    describe('transport failures outside the order request', () => {
        it('show a message about the connection, never the wording of the browser', async () => {
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));

            await flow.estimateShipping();

            expect(store.globalError.get()).toBe('We could not reach the store. Check your connection and try again.');
        });
    });

    describe('shipping rates that cannot be used', () => {
        beforeEach(() => {
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            store.selectedPaymentMethod.set('checkmo');
        });

        it('an error rate first in the list is never selected or saved: the first usable rate is', async () => {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([
                errorRate('freeshipping', 'This shipping method is not available.'),
                method('flatrate', 'flatrate'),
            ]);

            await flow.estimateShipping();

            expect(store.availableShippingMethods.get()).toHaveLength(2);
            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_carrier_code).toBe('flatrate');
            expect(saved.addressInformation.shipping_method_code).toBe('flatrate');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a list of only error rates selects nothing, saves nothing and keeps the rows as the explanation', async () => {
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([
                errorRate('freeshipping', 'This shipping method is not available.'),
                errorRate('ups', 'This shipping method is currently unavailable.'),
            ]);

            await flow.estimateShipping();

            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(store.availablePaymentMethods.get()).toEqual([]);
            expect(store.availableShippingMethods.get().map((m) => m.error_message)).toEqual([
                'This shipping method is not available.',
                'This shipping method is currently unavailable.',
            ]);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a hydrated selection that came back as an error row is replaced by a usable rate', async () => {
            store.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([
                { ...method('tablerate', 'bestway'), available: false, error_message: 'Not available for this address.' },
                method('flatrate', 'flatrate'),
            ]);

            await flow.estimateShipping();

            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
        });

        it('a selection on a rate marked unavailable keeps Place Order closed', () => {
            store.availableShippingMethods.set([{ ...method('flatrate', 'flatrate'), available: false }]);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.totals.set(totals('57.00'));
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);

            expect(selectors.shippingReady.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('the in-store pickup rate is absent from the store and never preselected', async () => {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([
                method('instore', 'pickup', 0),
                method('flatrate', 'flatrate'),
            ]);

            await flow.estimateShipping();

            expect(store.availableShippingMethods.get().map((m) => m.carrier_code)).toEqual(['flatrate']);
            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
            expect(isPickupRate({ carrier_code: 'instore', method_code: 'pickup' })).toBe(true);
            expect(isPickupRate({ carrier_code: 'flatrate', method_code: 'pickup' })).toBe(false);
        });

        it('an address served by pickup alone has no selectable rate', async () => {
            store.selectedShippingMethod.set({ carrier_code: 'instore', method_code: 'pickup' });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('instore', 'pickup', 0)]);

            await flow.estimateShipping();

            expect(store.availableShippingMethods.get()).toEqual([]);
            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
        });
    });

    describe('purchase order number', () => {
        it('travels as a top-level field of the payment, trimmed, with no additional_data left', async () => {
            store.selectedPaymentMethod.set('purchaseorder');
            store.paymentMethodData.set({ purchaseorder: { po_number: '  HYP-PO-1  ' } });
            paymentMocks.placeGuestOrder.mockResolvedValue(12);

            await flow.placeOrder();

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({ method: 'purchaseorder', po_number: 'HYP-PO-1' });
            expect(request.paymentMethod).not.toHaveProperty('additional_data');
        });

        it('leaves the other keys of the method data in additional_data', async () => {
            store.selectedPaymentMethod.set('purchaseorder');
            store.paymentMethodData.set({ purchaseorder: { po_number: 'HYP-PO-2', reference: 'dept-7' } });
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);

            await flow.savePaymentInformation();

            const [, request] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({
                method: 'purchaseorder',
                po_number: 'HYP-PO-2',
                additional_data: { reference: 'dept-7' },
            });
        });
    });

    describe('totals refresh', () => {
        it('keeps Place Order closed while the payment information is being read again', async () => {
            store.availableShippingMethods.set([method('flatrate', 'flatrate')]);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            store.selectedPaymentMethod.set('checkmo');
            store.totals.set(totals('57.00'));
            expect(selectors.canPlaceOrder.get()).toBe(true);
            const read = deferred<PaymentDetails>();
            paymentMocks.getGuestPaymentInformation.mockReturnValue(read.promise);

            const refresh = flow.refreshPaymentInformation();
            expect(store.isRefreshingTotals.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            read.resolve(details('47.00'));
            await refresh;
            expect(store.isRefreshingTotals.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a failed read releases the flag', async () => {
            paymentMocks.getGuestPaymentInformation.mockRejectedValue(new MagentoApiError(500, '500', 'boom'));

            await flow.refreshPaymentInformation();

            expect(store.isRefreshingTotals.get()).toBe(false);
            expect(store.globalError.get()).toBe('boom');
        });
    });
});
