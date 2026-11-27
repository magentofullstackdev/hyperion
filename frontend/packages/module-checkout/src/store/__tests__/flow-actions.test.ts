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
vi.mock('../../api/gift-message.js', () => ({
    saveGuestGiftMessage: vi.fn(),
    saveCustomerGiftMessage: vi.fn(),
}));
vi.mock('../../components/recaptcha-client.js', () => ({
    executeRecaptcha: vi.fn().mockResolvedValue(null),
}));
// The taxonomy has its own tests: here a failure keeps the message it was
// thrown with. Its kind is `unexpected` unless the test names one
// (`checkoutKind` on the thrown value) or the thrown value carries what the
// real classification reads: core's refusal of a shipping method, a 401, a
// request to place the order that got no answer.
vi.mock('../../api/error-kinds.js', () => {
    const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));
    const TRANSPORT = ['network', 'timeout', 'offline'];
    return {
        classifyError: vi.fn((err: unknown, ctx?: { path: string; method: string }) => {
            const thrown = (err ?? {}) as { checkoutKind?: string; kind?: string; httpStatus?: number; retryAfterMs?: number };
            const message = messageOf(err);
            const retryAfterMs = thrown.retryAfterMs;
            const base = retryAfterMs === undefined ? { message } : { message, retryAfterMs };
            if (thrown.checkoutKind) return { ...base, kind: thrown.checkoutKind };
            if (thrown.httpStatus === 401) return { ...base, kind: 'session-expired' };
            if (
                TRANSPORT.includes(thrown.kind ?? '')
                && ctx?.method === 'POST'
                && ctx.path.endsWith('/payment-information')
            ) {
                return { ...base, kind: 'order-unknown', underlyingKind: thrown.kind };
            }
            if (message.startsWith('Carrier with such method not found')) return { ...base, kind: 'shipping-method-rejected' };
            return { ...base, kind: 'unexpected' };
        }),
        describeError: vi.fn(messageOf),
    };
});
vi.mock('../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));
vi.mock('../../components/payment-host/host.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../components/payment-host/host.js')>()),
    notifyOrderNotPlaced: vi.fn(),
}));
vi.mock('../../utils/minimum-order.js', () => ({ minimumOrderError: vi.fn(() => null) }));

import * as shippingApi from '../../api/shipping.js';
import * as paymentApi from '../../api/payment.js';
import * as couponApi from '../../api/coupon.js';
import * as cartApi from '../../api/cart.js';
import * as giftApi from '../../api/gift-message.js';
import { executeRecaptcha } from '../../components/recaptcha-client.js';
import { notifyOrderNotPlaced } from '../../components/payment-host/host.js';
import { patchRow, resetPaymentRowsForTests } from '../../components/payment-host/row-state.js';
import { MagentoApiError, NetworkError, RequestTimeoutError } from '../../api/client.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import paymentRenderers from '../../fixtures/payment-renderers.json' with { type: 'json' };
import { navigateTo } from '../../utils/navigate.js';
import { minimumOrderError } from '../../utils/minimum-order.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Address } from '../../types/address.js';
import type { PaymentDetails, ShippingInformationRequest, ShippingMethod } from '../../types/shipping.js';
import type { Totals } from '../../types/totals.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import {
    createFlowActions,
    isPickupRate,
    reconcilePaymentSelection,
    totalsWithShippingRate,
    type FlowActions,
    type PlaceOrderOutcome,
} from '../flow-actions.js';
import { startInitialRequests } from '../hydrate.js';
import { stopOrderRecovery } from '../recovery.js';
import { captchaAnswer, captchaError, resetCaptchaStateForTests, seedCaptchaState, setCaptchaAnswer } from '../captcha-state.js';
import { placeOrderBlocker } from '../place-order-hint.js';
import { createSelectors, expectedAgreements } from '../selectors.js';

/**
 * Place Order without a payment step in between: the two halves of the
 * flow actions, as the order pipeline runs them.
 */
async function placeOrderThrough(actions: FlowActions): Promise<PlaceOrderOutcome> {
    const prepared = await actions.prepareOrder({ skipPaymentReady: true });
    return prepared.status === 'ready' ? actions.submitOrder() : null;
}

/** The configuration with the bundle's payment renderer entries, as the server emits them. */
function withPaymentRenderers(config: CheckoutConfig | null): CheckoutConfig {
    const base = (config ?? {}) as unknown as { hyperion?: Record<string, unknown> };
    return { ...base, hyperion: { ...(base.hyperion ?? {}), paymentRenderers } } as unknown as CheckoutConfig;
}

const shippingMocks = vi.mocked(shippingApi);
const paymentMocks = vi.mocked(paymentApi);
const couponMocks = vi.mocked(couponApi);
const cartMocks = vi.mocked(cartApi);
const giftMocks = vi.mocked(giftApi);

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

function totals(grand: string, coupon: string | null = null): Totals {
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
        coupon_code: coupon,
        items_qty: '1',
        items: [],
        total_segments: [],
        quote_currency_code: 'USD',
        base_currency_code: 'USD',
    };
}

function details(grand: string, coupon: string | null = null): PaymentDetails {
    return {
        payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
        totals: totals(grand, coupon),
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
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

const FLATRATE = { carrier_code: 'flatrate', method_code: 'flatrate' };
const BESTWAY = { carrier_code: 'tablerate', method_code: 'bestway' };

describe('flow actions', () => {
    let store: Store;
    let flow: FlowActions;
    let selectors: ReturnType<typeof createSelectors>;

    /** Everything the gate asks for, as a quote the server already confirmed: no request needed. */
    function confirmQuote(): void {
        store.availableShippingMethods.set([method('flatrate', 'flatrate'), method('tablerate', 'bestway', 9)]);
        store.selectedShippingMethod.set(FLATRATE);
        store.appliedShippingMethod.set(FLATRATE);
        store.availablePaymentMethods.set([
            { code: 'checkmo', title: 'Check / Money order' },
            { code: 'banktransfer', title: 'Bank Transfer' },
            { code: 'purchaseorder', title: 'Purchase Order' },
            { code: 'braintree', title: 'Card' },
        ]);
        store.selectedPaymentMethod.set('checkmo');
        store.totals.set(totals('57.00'));
    }

    // A recovery left waiting for the quote would keep reading it in the tests that follow.
    afterEach(() => { stopOrderRecovery(); });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(executeRecaptcha).mockResolvedValue(null);
        setCheckoutConfig(withPaymentRenderers(null as unknown as CheckoutConfig));
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
        beforeEach(() => { confirmQuote(); });

        it('guest order: agreement ids travel inside paymentMethod.extension_attributes as strings', async () => {
            store.acceptedAgreements.set([7, 12]);
            paymentMocks.placeGuestOrder.mockResolvedValue(1001);

            const orderId = await placeOrderThrough(flow);

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
                    region: '',
                    region_id: 0,
                    region_code: '',
                },
            });
            expect(request).not.toHaveProperty('extension_attributes');
        });

        describe('the region of the quote address', () => {
            async function savedShippingAddress(addr: Address): Promise<Record<string, unknown>> {
                store.shippingAddress.set(addr);
                shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
                shippingMocks.saveCustomerShippingInformation.mockResolvedValue(details('57.00'));
                await flow.selectShippingMethod(FLATRATE);
                const calls = store.isGuest.get()
                    ? shippingMocks.saveGuestShippingInformation.mock.calls
                    : shippingMocks.saveCustomerShippingInformation.mock.calls;
                const request = store.isGuest.get() ? calls[0]![1] : calls[0]![0];
                return { ...(request as ShippingInformationRequest).addressInformation.shipping_address };
            }

            it('a region picked from the list travels with its id, name and code', async () => {
                const sent = await savedShippingAddress({
                    ...address,
                    region_id: '33',
                    region: { region: 'Michigan', region_code: 'MI', region_id: 33 },
                });
                expect(sent).toMatchObject({ region_id: 33, region: 'Michigan', region_code: 'MI' });
            });

            it('a country change that cleared the region says so, so the quote does not keep the old one', async () => {
                const sent = await savedShippingAddress({ ...address, country_id: 'DE', region_id: null, region: null });
                expect(sent).toMatchObject({ region_id: 0, region: '', region_code: '' });
            });

            it('a typed region travels as text and clears the id and the code of a region picked before', async () => {
                const sent = await savedShippingAddress({
                    ...address,
                    country_id: 'GB',
                    region_id: null,
                    region: 'Kent' as never,
                });
                expect(sent).toMatchObject({ region_id: 0, region: 'Kent', region_code: '' });
            });

            it('a saved address is named by its id and gets no region keys of its own', async () => {
                store.isGuest.set(false);
                const sent = await savedShippingAddress({ ...address, id: '12', region_id: null, region: null });
                expect(sent['customer_address_id']).toBe(12);
                expect(sent).not.toHaveProperty('region_id');
                expect(sent).not.toHaveProperty('region');
                expect(sent).not.toHaveProperty('region_code');
            });
        });

        it('customer order: same nesting, no email, gateway data kept beside the agreements', async () => {
            store.isGuest.set(false);
            store.selectedPaymentMethod.set('braintree');
            store.acceptedAgreements.set([3]);
            paymentMocks.placeCustomerOrder.mockResolvedValue(42);

            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });
            await flow.submitOrder({ additional_data: { payment_method_nonce: 'nonce-1' } });

            const [request] = paymentMocks.placeCustomerOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({
                method: 'braintree',
                additional_data: { payment_method_nonce: 'nonce-1' },
                extension_attributes: { agreement_ids: ['3'] },
            });
            expect(request).not.toHaveProperty('email');
            expect(request).not.toHaveProperty('extension_attributes');
        });

        it('savePaymentInformation uses the same payload shape and goes through the queue', async () => {
            store.acceptedAgreements.set([7]);
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));

            expect(await flow.savePaymentInformation()).toBe(true);
            const [, request] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(request.paymentMethod.extension_attributes).toEqual({ agreement_ids: ['7'] });
            // The answer carries no totals: the queue reads them once.
            await flow.queue.whenIdle();
            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
        });

        it('savePaymentInformation answers false and shows the message when the save is refused', async () => {
            paymentMocks.setGuestPaymentInformation.mockRejectedValue(new Error('Payment method not available'));

            expect(await flow.savePaymentInformation()).toBe(false);
            // The renderer that asked for the save shows the reason: it
            // appears in one place.
            expect(store.globalError.get()).toBe('Payment method not available');
            expect(store.sectionStatus.get().payment).toBeNull();
        });

        it('omits extension_attributes entirely when no agreement was accepted', async () => {
            paymentMocks.placeGuestOrder.mockResolvedValue(5);

            await placeOrderThrough(flow);

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({ method: 'checkmo' });
        });

        it('the reCAPTCHA token of the place order form travels as a header of the order request', async () => {
            vi.mocked(executeRecaptcha).mockResolvedValue('rc-token');
            paymentMocks.placeGuestOrder.mockResolvedValue(6);

            await placeOrderThrough(flow);

            expect(executeRecaptcha).toHaveBeenCalledWith('place_order');
            const [, , headers] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(headers).toEqual({ 'X-ReCaptcha': 'rc-token' });
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
            expect(store.estimateState.get()).toBe('loading');
            const b = flow.estimateShipping();
            await a;

            // A was canceled by B: no error, and B is still the active estimate.
            expect(store.globalError.get()).toBeNull();
            expect(store.isLoadingShippingMethods.get()).toBe(true);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

            pending[1]!.resolve([method('flatrate', 'flatrate')]);
            await b;

            expect(store.isLoadingShippingMethods.get()).toBe(false);
            expect(store.estimateState.get()).toBe('ready');
            expect(store.availableShippingMethods.get()).toHaveLength(1);
            expect(store.selectedShippingMethod.get()).toEqual(FLATRATE);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
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
            expect(store.selectedShippingMethod.get()).toEqual(BESTWAY);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.isLoadingShippingMethods.get()).toBe(false);
        });

        it('an answer for an address whose rate fields changed meanwhile is not applied', async () => {
            const estimate = deferred<readonly ShippingMethod[]>();
            shippingMocks.estimateGuestShippingMethods.mockReturnValueOnce(estimate.promise);

            const running = flow.estimateShipping();
            store.shippingAddress.set({ ...address, postcode: '78701' });
            estimate.resolve([method('flatrate', 'flatrate')]);
            await running;

            expect(store.availableShippingMethods.get()).toEqual([]);
            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
        });

        it('a served address followed by one without rates clears the selection and never saves it', async () => {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            store.selectedPaymentMethod.set('checkmo');

            await flow.estimateShipping();
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
            expect(selectors.canPlaceOrder.get()).toBe(true);

            // Antarctica needs no postcode (`general/country/optional_zip_countries`).
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, optionalZipCountries: ['AQ'] } as unknown as CheckoutConfig));
            store.shippingAddress.set({ ...address, country_id: 'AQ', postcode: '' });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([]);
            await flow.estimateShipping();

            expect(store.availableShippingMethods.get()).toEqual([]);
            expect(store.estimateState.get()).toBe('empty');
            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(store.availablePaymentMethods.get()).toEqual([]);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.isLoadingShippingMethods.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a failure of the current estimate is reported in its section with a retry, an abort is not', async () => {
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(new Error('offline'));
            await flow.estimateShipping();
            expect(store.globalError.get()).toBeNull();
            expect(store.estimateState.get()).toBe('error');
            expect(store.isLoadingShippingMethods.get()).toBe(false);
            const status = store.sectionStatus.get()['shipping-methods'];
            expect(status?.message).toBe('offline');
            expect(status?.source).toBe('background');

            // The retry of the section asks the rates again and clears the failure.
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            status!.retry!();
            await settle();
            await flow.queue.whenIdle();
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);

            store.globalError.set(null);
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(
                new DOMException('The operation was aborted.', 'AbortError')
            );
            await flow.estimateShipping();
            expect(store.globalError.get()).toBeNull();
        });
    });

    describe('shipping save through the queue', () => {
        beforeEach(() => {
            store.availableShippingMethods.set([method('flatrate', 'flatrate'), method('tablerate', 'bestway', 9)]);
            store.selectedPaymentMethod.set('checkmo');
        });

        it('rapid method switching: the first answer is not applied and the second request carries the newest selection', async () => {
            const pending: Deferred<PaymentDetails>[] = [];
            shippingMocks.saveGuestShippingInformation.mockImplementation(() => {
                const d = deferred<PaymentDetails>();
                pending.push(d);
                return d.promise;
            });

            const s1 = flow.selectShippingMethod(FLATRATE);
            const s2 = flow.selectShippingMethod(BESTWAY);
            // One write in flight: the second waits for the first.
            expect(pending).toHaveLength(1);
            expect(store.isSavingShipping.get()).toBe(true);
            expect(store.quoteWritesPending.get()).toBe(2);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            pending[0]!.resolve(details('57.00'));
            await settle();
            expect(store.totals.get()).toBeNull();
            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(pending).toHaveLength(2);
            const [, second] = shippingMocks.saveGuestShippingInformation.mock.calls[1]!;
            expect(second.addressInformation.shipping_method_code).toBe('bestway');

            pending[1]!.resolve(details('61.00'));
            await s1;
            await s2;
            expect(store.totals.get()?.grand_total).toBe('61.00');
            expect(store.appliedShippingMethod.get()).toEqual(BESTWAY);
            expect(store.isSavingShipping.get()).toBe(false);
            expect(store.quoteWritesPending.get()).toBe(0);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('three quick selections send two requests: the one waiting is replaced', async () => {
            const pending: Deferred<PaymentDetails>[] = [];
            shippingMocks.saveGuestShippingInformation.mockImplementation(() => {
                const d = deferred<PaymentDetails>();
                pending.push(d);
                return d.promise;
            });

            void flow.selectShippingMethod(FLATRATE);
            void flow.selectShippingMethod(BESTWAY);
            const last = flow.selectShippingMethod(FLATRATE);
            pending[0]!.resolve(details('57.00'));
            await settle();
            pending[1]!.resolve(details('57.00'));
            await last;

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
        });

        it('a failed save clears the applied method and reports the error with a retry', async () => {
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            await flow.selectShippingMethod(FLATRATE);
            expect(selectors.canPlaceOrder.get()).toBe(true);

            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(new Error('Carrier unavailable'));
            await flow.selectShippingMethod(BESTWAY);

            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(store.optimisticTotals.get()).toBeNull();
            expect(store.sectionStatus.get()['shipping-methods']?.message).toBe('Carrier unavailable');
            expect(store.globalError.get()).toBeNull();
            expect(store.isSavingShipping.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            const status = store.sectionStatus.get()['shipping-methods'];
            expect(status?.message).toBe('Carrier unavailable');

            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('61.00'));
            status!.retry!();
            await flow.queue.whenIdle();
            expect(store.appliedShippingMethod.get()).toEqual(BESTWAY);
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a shipping save whose answer offers only free at a zero total switches the selection to free', async () => {
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce({
                payment_methods: [{ code: 'free', title: 'No Payment Information Required' }],
                totals: totals('0.0000'),
            });

            await flow.selectShippingMethod(FLATRATE);

            expect(store.availablePaymentMethods.get().map((m) => m.code)).toEqual(['free']);
            expect(store.selectedPaymentMethod.get()).toBe('free');
            expect(selectors.paymentMethodSelected.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a shipping save that drops the selected method falls back to the only offered offline method', async () => {
            store.selectedPaymentMethod.set('cashondelivery');
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));

            await flow.selectShippingMethod(FLATRATE);

            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a selection the quote does not offer closes Place Order even when everything else is ready', async () => {
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            await flow.selectShippingMethod(FLATRATE);
            expect(selectors.canPlaceOrder.get()).toBe(true);

            store.selectedPaymentMethod.set('paypal_express');
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a selection the server has not confirmed keeps Place Order closed', async () => {
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            await flow.selectShippingMethod(FLATRATE);
            expect(selectors.canPlaceOrder.get()).toBe(true);

            store.selectedShippingMethod.set(BESTWAY);
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a rate click shows the expected totals at once and the answer replaces them', async () => {
            confirmQuote();
            store.totals.set({
                ...totals('57.00'),
                total_segments: [
                    { code: 'shipping', title: 'Shipping', value: '5', area: null },
                    { code: 'grand_total', title: 'Grand Total', value: '57.00', area: 'footer' },
                ],
            });
            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(save.promise);

            const selecting = flow.selectShippingMethod(BESTWAY);

            const expected = store.optimisticTotals.get()!;
            expect(Number(expected.grand_total)).toBe(61);
            expect(Number(expected.shipping_amount)).toBe(9);
            expect(Number(expected.shipping_incl_tax)).toBe(9);
            expect(expected.total_segments.map((seg) => Number(seg.value))).toEqual([9, 61]);
            expect(store.totals.get()?.grand_total).toBe('57.00');
            expect(store.isSettlingTotals.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            save.resolve(details('60.50'));
            await selecting;
            expect(store.optimisticTotals.get()).toBeNull();
            expect(store.totals.get()?.grand_total).toBe('60.50');
            expect(store.isSettlingTotals.get()).toBe(false);
        });

        it('the expected totals move the tax by the difference between the price with and without tax', () => {
            const taxed = { ...method('tablerate', 'bestway', 10), price_incl_tax: 12.2 };
            const projected = totalsWithShippingRate(
                { ...totals('57.00'), total_segments: [{ code: 'tax', title: 'Tax', value: '0', area: null }] },
                method('flatrate', 'flatrate'),
                taxed
            )!;
            expect(Number(projected.shipping_amount)).toBe(10);
            expect(Number(projected.shipping_incl_tax)).toBeCloseTo(12.2);
            expect(Number(projected.shipping_tax_amount)).toBeCloseTo(2.2);
            expect(Number(projected.tax_amount)).toBeCloseTo(2.2);
            expect(Number(projected.grand_total)).toBeCloseTo(64.2);
            expect(Number(projected.total_segments[0]!.value)).toBeCloseTo(2.2);
            expect(totalsWithShippingRate(null, null, taxed)).toBeNull();
        });
    });

    describe('address payload mapper', () => {
        it('keeps VAT, fax, custom and extension attributes and the identity of a saved address', async () => {
            confirmQuote();
            store.isGuest.set(false);
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

            await placeOrderThrough(flow);

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
            confirmQuote();
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'opt' } as unknown as CheckoutConfig));
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, telephone: '', save_in_address_book: false });
            store.billingSynced.set(true);
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));
            await flow.savePaymentInformation();
            const [, first] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(first.billingAddress.save_in_address_book).toBe(0);
            await flow.queue.whenIdle();

            store.selectedPaymentMethod.set('checkmo');
            store.billingAddress.set({ ...address, telephone: '', save_in_address_book: true });
            store.billingSynced.set(true);
            paymentMocks.placeGuestOrder.mockResolvedValue(8);

            await placeOrderThrough(flow);

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.billingAddress.save_in_address_book).toBe(1);
            expect(request.billingAddress).not.toHaveProperty('telephone');
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
            expect(saved.addressInformation.billing_address!.city).toBe('Austin');

            await placeOrderThrough(flow);
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
            shippingMocks.estimateCustomerShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveCustomerShippingInformation.mockResolvedValue(details('57.00'));
            paymentMocks.placeCustomerOrder.mockResolvedValue(10);

            await flow.estimateShipping();
            const [saved] = shippingMocks.saveCustomerShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_address.save_in_address_book).toBe(0);
            expect(saved.addressInformation.billing_address!.save_in_address_book).toBe(1);
            expect(store.billingSynced.get()).toBe(true);

            await placeOrderThrough(flow);
            const [order] = paymentMocks.placeCustomerOrder.mock.calls[0]!;
            expect(order.billingAddress.save_in_address_book).toBe(1);
        });

        it('ticking the box again sends one shipping save with the billing copy, refreshes methods and totals, and keeps the gate closed meanwhile', async () => {
            confirmQuote();
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, country_id: 'CA', city: 'Toronto', postcode: 'M5V 2T6' });
            store.billingSynced.set(true);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(save.promise);

            // What the checkbox does.
            store.billingSameAsShipping.set(true);
            flow.invalidateBillingSync();
            const syncing = flow.syncBillingAddress();

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(request.addressInformation.billing_address!.country_id).toBe('US');
            expect(request.addressInformation.billing_address!.city).toBe('Calder');
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();

            save.resolve({
                payment_methods: [{ code: 'checkmo', title: 'Check' }, { code: 'banktransfer', title: 'Bank Transfer' }],
                totals: totals('55.00'),
            });
            await syncing;
            expect(store.billingDirty.get()).toBe(false);
            expect(store.totals.get()?.grand_total).toBe('55.00');
            expect(store.availablePaymentMethods.get().map((m) => m.code)).toEqual(['checkmo', 'banktransfer']);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(selectors.canPlaceOrder.get()).toBe(true);
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
        it('the estimate, the shipping save and a separate billing address carry the guest email', async () => {
            store.email.set('guest@example.com');
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();

            const [, estimate] = shippingMocks.estimateGuestShippingMethods.mock.calls[0]!;
            expect(estimate.address.email).toBe('guest@example.com');
            const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(request.addressInformation.shipping_address.email).toBe('guest@example.com');
            expect(request.addressInformation.billing_address!.email).toBe('guest@example.com');

            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, city: 'Austin', postcode: '78701' });
            flow.invalidateBillingSync();
            await flow.syncBillingAddress();
            const [, second] = shippingMocks.saveGuestShippingInformation.mock.calls[1]!;
            expect(second.addressInformation.billing_address!.email).toBe('guest@example.com');
            expect(second.addressInformation.billing_address!.city).toBe('Austin');
        });

        it('the billing address of a virtual quote carries the guest email', async () => {
            store.email.set('guest@example.com');
            store.isVirtual.set(true);
            store.billingAddress.set({ ...address, city: 'Austin', postcode: '78701' });
            paymentMocks.assignGuestBillingAddress.mockResolvedValue(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('30.00'));

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

    describe('rates before the address is complete', () => {
        it('estimates and saves with an empty telephone when the merchant made it optional', async () => {
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'opt' } as unknown as CheckoutConfig));
            store.shippingAddress.set({ ...address, telephone: '' });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
        });

        it('country and postcode are enough for the rates and the preselection; nothing is saved until the address is complete', async () => {
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'req' } as unknown as CheckoutConfig));
            store.shippingAddress.set({
                country_id: 'US', postcode: '49628', city: '', firstname: '', lastname: '', telephone: '', street: [''],
            });
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(store.availableShippingMethods.get()).toHaveLength(1);
            expect(store.selectedShippingMethod.get()).toEqual(FLATRATE);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(store.appliedShippingMethod.get()).toBeNull();

            // The rest of the address arrives: same rate key, no second
            // estimate, one save.
            store.shippingAddress.set({ ...address });
            await flow.estimateShippingNow();
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
        });

        it('the preselection follows the configuration: cheapest by default, first, or none', async () => {
            const rates = [method('tablerate', 'bestway', 9), method('flatrate', 'flatrate', 5)];
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue(rates);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();
            expect(store.selectedShippingMethod.get()).toEqual(FLATRATE);

            store.selectedShippingMethod.set(null);
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true, shippingPreselect: 'first' } } as unknown as CheckoutConfig));
            await flow.estimateShipping();
            expect(store.selectedShippingMethod.get()).toEqual(BESTWAY);

            store.selectedShippingMethod.set(null);
            vi.mocked(shippingMocks.saveGuestShippingInformation).mockClear();
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true, shippingPreselect: 'none' } } as unknown as CheckoutConfig));
            await flow.estimateShipping();
            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(store.estimateState.get()).toBe('ready');
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
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
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, telephoneConfig: 'req', postCodes } as unknown as CheckoutConfig));
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
            expect(saved.addressInformation.billing_address!.postcode).toBe('ABCDE');
            expect(selectors.shippingAddressValid.get()).toBe(true);

            store.selectedPaymentMethod.set('checkmo');
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await placeOrderThrough(flow)).toBe(21);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.billingAddress.postcode).toBe('ABCDE');
        });

        it('an empty postcode of a country that requires one sends no request at all', async () => {
            installPatterns();
            store.shippingAddress.set({ ...address, postcode: '' });
            store.selectedShippingMethod.set(FLATRATE);

            await flow.estimateShipping();
            await flow.saveShippingAndEstimateTotals();
            store.selectedPaymentMethod.set('checkmo');
            expect(selectors.shippingAddressValid.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await placeOrderThrough(flow)).toBeNull();

            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        });

        it('a separate billing address with a postcode outside the patterns is saved and ordered, an empty one is not', async () => {
            installPatterns();
            confirmQuote();
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: '' });
            flow.invalidateBillingSync();

            await flow.syncBillingAddress();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(selectors.billingAddressValid.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: 'ABCDE' });
            flow.invalidateBillingSync();
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(22);

            await flow.syncBillingAddress();
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.billing_address!.postcode).toBe('ABCDE');
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(selectors.billingAddressValid.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await placeOrderThrough(flow)).toBe(22);
        });

        it('a virtual quote follows the same rule for its billing address', async () => {
            installPatterns();
            store.isVirtual.set(true);
            store.selectedPaymentMethod.set('checkmo');
            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: '' });

            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(await placeOrderThrough(flow)).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();

            store.billingAddress.set({ ...address, firstname: 'Bill', postcode: 'ABCDE' });
            paymentMocks.assignGuestBillingAddress.mockResolvedValueOnce(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('30.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(23);

            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledTimes(1);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await placeOrderThrough(flow)).toBe(23);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.billingAddress.postcode).toBe('ABCDE');
        });
    });

    describe('coupons', () => {
        it('a coupon on a physical quote asks the rates again and ends in a shipping save, with no extra read', async () => {
            confirmQuote();
            couponMocks.applyGuestCoupon.mockResolvedValue(true);
            // Free shipping appeared with the coupon.
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([
                method('flatrate', 'flatrate'),
                method('freeshipping', 'freeshipping', 0),
            ]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('47.00', 'FREESHIP'));

            expect(await flow.applyCoupon('FREESHIP')).toBe(true);

            expect(couponMocks.applyGuestCoupon).toHaveBeenCalledWith('masked-1', 'FREESHIP', {});
            expect(couponMocks.applyGuestCoupon.mock.invocationCallOrder[0]!)
                .toBeLessThan(shippingMocks.estimateGuestShippingMethods.mock.invocationCallOrder[0]!);
            expect(shippingMocks.estimateGuestShippingMethods.mock.invocationCallOrder[0]!)
                .toBeLessThan(shippingMocks.saveGuestShippingInformation.mock.invocationCallOrder[0]!);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(paymentMocks.getGuestPaymentInformation).not.toHaveBeenCalled();
            expect(store.availableShippingMethods.get().map((m) => m.carrier_code)).toEqual(['flatrate', 'freeshipping']);
            expect(store.selectedShippingMethod.get()).toEqual(FLATRATE);
            expect(store.totals.get()?.grand_total).toBe('47.00');
            expect(store.appliedCoupon.get()).toBe('FREESHIP');
            expect(store.couponError.get()).toBeNull();
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a rate that vanished with the coupon is replaced and the replacement is saved', async () => {
            confirmQuote();
            couponMocks.applyGuestCoupon.mockResolvedValue(true);
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('tablerate', 'bestway', 9)]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('51.00', 'SWAP'));

            expect(await flow.applyCoupon('SWAP')).toBe(true);

            expect(store.selectedShippingMethod.get()).toEqual(BESTWAY);
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_method_code).toBe('bestway');
            expect(store.appliedShippingMethod.get()).toEqual(BESTWAY);
        });

        it('a coupon on a virtual quote reads the payment information once; one that zeroes the total switches the selection to free', async () => {
            store.isVirtual.set(true);
            store.selectedPaymentMethod.set('checkmo');
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            couponMocks.applyGuestCoupon.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue({
                payment_methods: [{ code: 'free', title: 'No Payment Information Required' }],
                totals: totals('0.0000', 'FREEBIE'),
            });

            expect(await flow.applyCoupon('FREEBIE')).toBe(true);

            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledWith('masked-1');
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(store.availablePaymentMethods.get().map((m) => m.code)).toEqual(['free']);
            expect(store.selectedPaymentMethod.get()).toBe('free');
            expect(store.totals.get()?.grand_total).toBe('0.0000');
            expect(store.appliedCoupon.get()).toBe('FREEBIE');
        });

        it('removing the coupon drops free and falls back to the only offered offline method', async () => {
            store.isVirtual.set(true);
            store.selectedPaymentMethod.set('free');
            store.appliedCoupon.set('FREEBIE');
            couponMocks.removeGuestCoupon.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));

            expect(await flow.removeCoupon()).toBe(true);

            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(store.appliedCoupon.get()).toBeNull();
        });

        it('a coupon the server dropped loses its applied state with the next totals', async () => {
            confirmQuote();
            store.appliedCoupon.set('EXPIRED');
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.selectShippingMethod(BESTWAY);

            expect(store.appliedCoupon.get()).toBeNull();
        });

        it('a refused code shows its message at the coupon field only, and changes nothing else', async () => {
            confirmQuote();
            couponMocks.applyGuestCoupon.mockRejectedValue(Object.assign(
                new MagentoApiError(404, '404', "The coupon code isn't valid. Verify the code and try again."),
                { checkoutKind: 'validation' }
            ));

            expect(await flow.applyCoupon('NOPE')).toBe(false);

            expect(store.couponError.get()).toBe("The coupon code isn't valid. Verify the code and try again.");
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get().coupon).toBeNull();
            expect(store.appliedCoupon.get()).toBeNull();
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            await flow.queue.whenIdle();
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a refused CAPTCHA answer stands at the CAPTCHA field and leaves the code field valid', async () => {
            confirmQuote();
            seedCaptchaState({
                sales_rule_coupon_request: { isRequired: true, isCaseSensitive: false, imageHeight: 50, imageWidth: 200 },
            });
            setCaptchaAnswer('sales_rule_coupon_request', 'wrong');
            couponMocks.applyGuestCoupon.mockRejectedValue(Object.assign(
                new MagentoApiError(400, '400', 'Incorrect CAPTCHA'),
                { checkoutKind: 'captcha' }
            ));

            expect(await flow.applyCoupon('SAVE10')).toBe(false);

            expect(captchaError('sales_rule_coupon_request')).toBe('Incorrect CAPTCHA');
            expect(store.couponError.get()).toBeNull();
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get().coupon).toBeNull();
            expect(store.appliedCoupon.get()).toBeNull();
            resetCaptchaStateForTests();
        });

        it('a code core answers false for is reported as not valid', async () => {
            store.isVirtual.set(true);
            couponMocks.applyGuestCoupon.mockResolvedValue(false);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));

            expect(await flow.applyCoupon('NOPE')).toBe(false);
            expect(store.couponError.get()).toBe('This promo code is not valid.');
            expect(store.appliedCoupon.get()).toBeNull();
        });

        it('reconcilePaymentSelection keeps an offered selection, takes free at zero and the only safe method, and otherwise selects nothing', () => {
            const methods = [{ code: 'braintree', title: 'Card' }, { code: 'checkmo', title: 'Check' }];
            expect(reconcilePaymentSelection('braintree', methods, totals('57.00'))).toBe('braintree');
            // Two methods offered and the selection gone: the shopper chooses.
            expect(reconcilePaymentSelection('paypal_express', methods, totals('57.00'))).toBeNull();
            expect(reconcilePaymentSelection(null, methods, totals('57.00'))).toBeNull();
            // A gateway is never selected for the shopper, even alone.
            expect(reconcilePaymentSelection(null, [{ code: 'braintree', title: 'Card' }], totals('57.00'))).toBeNull();
            expect(reconcilePaymentSelection(null, [{ code: 'checkmo', title: 'Check' }], totals('57.00'))).toBe('checkmo');
            expect(reconcilePaymentSelection('checkmo', [{ code: 'free', title: 'Free' }, ...methods], totals('0'))).toBe('free');
        });

        it('reconcilePaymentSelection keeps the selection when a gateway marks another method as not presentable', async () => {
            const { setPaymentVisibility } = await import('../../utils/payment-offer.js');
            setPaymentVisibility({ hidden_gateway: { isVisible: false } });
            try {
                const methods = [{ code: 'checkmo', title: 'Check' }, { code: 'braintree', title: 'Card' }, { code: 'hidden_gateway', title: 'Hidden' }];
                expect(reconcilePaymentSelection('checkmo', methods, totals('57.00'))).toBe('checkmo');
                expect(reconcilePaymentSelection(null, methods, totals('57.00'))).toBeNull();
                expect(reconcilePaymentSelection('hidden_gateway', methods, totals('57.00'))).toBeNull();
            } finally {
                setPaymentVisibility(null);
            }
        });
    });

    describe('billing address of a virtual quote', () => {
        beforeEach(() => {
            store.isVirtual.set(true);
            store.selectedPaymentMethod.set('checkmo');
        });

        it('is put on the quote, then methods and totals are read once, before the order', async () => {
            store.billingAddress.set({ ...address, firstname: 'Bill' });
            paymentMocks.assignGuestBillingAddress.mockResolvedValue(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('30.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(9);

            expect(selectors.canPlaceOrder.get()).toBe(false);
            await flow.syncBillingAddress();

            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledWith('masked-1', {
                address: expect.objectContaining({ firstname: 'Bill', city: 'Calder' }),
                useForShipping: false,
            });
            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
            expect(store.billingSynced.get()).toBe(true);
            expect(store.isSavingBilling.get()).toBe(false);
            expect(store.totals.get()?.grand_total).toBe('30.00');
            expect(selectors.canPlaceOrder.get()).toBe(true);

            await placeOrderThrough(flow);
            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledTimes(1);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('Place Order saves an unsaved billing address first and gives up when the save fails', async () => {
            store.billingAddress.set({ ...address, firstname: 'Bill' });
            store.totals.set(totals('30.00'));
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            paymentMocks.assignGuestBillingAddress.mockRejectedValueOnce(new Error('Invalid VAT'));

            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await placeOrderThrough(flow)).toBeNull();
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get().billing?.message).toBe('Invalid VAT');
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderOutcome.get()).toBe('none');

            paymentMocks.assignGuestBillingAddress.mockResolvedValueOnce(5);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('30.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(11);
            expect(await placeOrderThrough(flow)).toBe(11);
            expect(store.billingSynced.get()).toBe(true);
            expect(paymentMocks.assignGuestBillingAddress.mock.invocationCallOrder[1]!)
                .toBeLessThan(paymentMocks.placeGuestOrder.mock.invocationCallOrder[0]!);
        });

        it('an answer for address A arriving after the edit to B does not mark B as saved', async () => {
            store.billingAddress.set({ ...address, city: 'Calder' });
            const assignA = deferred<number>();
            paymentMocks.assignGuestBillingAddress.mockReturnValueOnce(assignA.promise);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('30.00'));

            const syncA = flow.syncBillingAddress();
            // The shopper edits the address to B: the component invalidates
            // at once, the save of B has not started yet.
            store.billingAddress.set({ ...address, city: 'Detroit' });
            flow.invalidateBillingSync();
            assignA.resolve(1);
            await syncA;

            expect(store.billingSynced.get()).toBe(false);
            expect(store.billingDirty.get()).toBe(true);
            expect(store.isSavingBilling.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            // The pause ends: B is saved and its answer is the one applied.
            paymentMocks.assignGuestBillingAddress.mockResolvedValueOnce(2);
            paymentMocks.getGuestPaymentInformation.mockResolvedValueOnce(details('31.00'));
            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).toHaveBeenLastCalledWith('masked-1', {
                address: expect.objectContaining({ city: 'Detroit' }),
                useForShipping: false,
            });
            expect(store.billingSynced.get()).toBe(true);
            expect(store.billingDirty.get()).toBe(false);
            expect(store.totals.get()?.grand_total).toBe('31.00');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a save enqueued while another runs waits for it, and only the newer one marks the address as saved', async () => {
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
            flow.invalidateBillingSync();
            const second = flow.syncBillingAddress();
            expect(pending).toHaveLength(1);
            pending[0]!.resolve(1);
            await settle();
            expect(store.billingSynced.get()).toBe(false);
            expect(pending).toHaveLength(2);
            expect(store.isSavingBilling.get()).toBe(true);
            pending[1]!.resolve(2);
            await first;
            await second;
            expect(store.billingSynced.get()).toBe(true);
            expect(store.isSavingBilling.get()).toBe(false);
            // One read for the whole drain.
            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
        });

        it('the typing pause saves the billing address once', async () => {
            vi.useFakeTimers();
            try {
                paymentMocks.assignGuestBillingAddress.mockResolvedValue(5);
                paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('30.00'));

                store.billingAddress.set({ ...address, city: 'Det' });
                flow.invalidateBillingSync();
                flow.scheduleBillingSync();
                await vi.advanceTimersByTimeAsync(300);
                store.billingAddress.set({ ...address, city: 'Detroit' });
                flow.invalidateBillingSync();
                flow.scheduleBillingSync();
                await vi.advanceTimersByTimeAsync(499);
                expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
                await vi.advanceTimersByTimeAsync(1);
                await vi.advanceTimersByTimeAsync(0);

                expect(paymentMocks.assignGuestBillingAddress).toHaveBeenCalledTimes(1);
                expect(store.billingSynced.get()).toBe(true);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('billing address of a physical quote', () => {
        it('is a no-op while the billing address is the shipping one and the quote carries it', async () => {
            confirmQuote();
            await flow.syncBillingAddress();
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(selectors.billingReady.get()).toBe(true);
        });

        it('a returning guest with a separate billing address boots with exactly one shipping save and no billing request', async () => {
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, firstname: 'Bill', city: 'Austin', postcode: '78701' });
            store.selectedShippingMethod.set(FLATRATE);
            store.selectedPaymentMethod.set('checkmo');
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            startInitialRequests(store, flow);
            await settle();
            await flow.queue.whenIdle();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.billing_address!.firstname).toBe('Bill');
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(paymentMocks.getGuestPaymentInformation).not.toHaveBeenCalled();
            expect(store.billingSynced.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('the shipping save goes out without a billing address while the separate one is incomplete, and once more when it is completed', async () => {
            store.billingSameAsShipping.set(false);
            store.billingAddress.set(null);
            store.selectedPaymentMethod.set('checkmo');
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, first] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(first.addressInformation).not.toHaveProperty('billing_address');
            expect(first.addressInformation.shipping_method_code).toBe('flatrate');
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
            expect(store.billingSynced.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            // What the billing form does when its last field is filled.
            store.billingAddress.set({ ...address, firstname: 'Bill' });
            flow.invalidateBillingSync();
            await flow.syncBillingAddress();

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            const [, second] = shippingMocks.saveGuestShippingInformation.mock.calls[1]!;
            expect(second.addressInformation.billing_address!.firstname).toBe('Bill');
            expect(paymentMocks.assignGuestBillingAddress).not.toHaveBeenCalled();
            expect(store.appliedShippingMethod.get()).toEqual(store.selectedShippingMethod.get());
            expect(store.billingSynced.get()).toBe(true);
            expect(store.billingDirty.get()).toBe(false);
            expect(store.totals.get()?.grand_total).toBe('57.00');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('Place Order saves an unsaved separate billing address with the shipping information and gives up when that fails', async () => {
            confirmQuote();
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...address, firstname: 'Bill' });
            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(new Error('Invalid VAT'));

            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await placeOrderThrough(flow)).toBeNull();
            expect(store.sectionStatus.get()['shipping-methods']?.message).toBe('Invalid VAT');
            expect(store.globalError.get()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();

            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('57.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(11);
            expect(await placeOrderThrough(flow)).toBe(11);
            expect(store.billingSynced.get()).toBe(true);
        });
    });

    describe('shipping form ahead of the quote', () => {
        /** A quote confirmed for the first address through the requests: the gate is open. */
        async function openGate(): Promise<void> {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            store.selectedPaymentMethod.set('checkmo');
            await flow.estimateShipping();
            expect(selectors.canPlaceOrder.get()).toBe(true);
            vi.clearAllMocks();
            vi.mocked(executeRecaptcha).mockResolvedValue(null);
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
        }

        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        it('an edit that keeps the rate key asks no rates, keeps the confirmed method and is saved once after the idle delay', async () => {
            await openGate();

            store.shippingAddress.set({ ...address, telephone: '5551' });
            flow.scheduleShippingEstimate();
            store.shippingAddress.set({ ...address, telephone: '55512' });
            flow.scheduleShippingEstimate();

            expect(store.shippingDirty.get()).toBe(true);
            expect(selectors.shippingReady.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(placeOrderBlocker(store, selectors)).toBe('updating');
            // The quote still carries the old address and its confirmed method.
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);

            await vi.advanceTimersByTimeAsync(1499);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            await vi.advanceTimersByTimeAsync(0);

            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_address.telephone).toBe('55512');
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
            expect(store.shippingDirty.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            // Nothing else fires later.
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        });

        it('the form losing the focus saves it at once, and only once', async () => {
            await openGate();

            store.shippingAddress.set({ ...address, telephone: '5551' });
            flow.scheduleShippingEstimate();
            flow.flushShippingForm();
            await vi.advanceTimersByTimeAsync(0);

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.shippingDirty.get()).toBe(false);
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        });

        it('an edit followed at once by Place Order sends the shipping save, then the order, with the edited address in both', async () => {
            await openGate();
            paymentMocks.placeGuestOrder.mockResolvedValue(77);

            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();
            const prepared = await flow.prepareOrder();

            expect(prepared).toEqual({ status: 'ready' });
            expect(store.orderOutcome.get()).toBe('placing');
            expect(store.isPlacingOrder.get()).toBe(true);
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();

            expect(await flow.submitOrder()).toBe(77);

            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(saved.addressInformation.shipping_address.street).toEqual(['1 New Street']);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.billingAddress).toEqual(saved.addressInformation.billing_address);
            expect(order.billingAddress.street).toEqual(['1 New Street']);
            expect(shippingMocks.saveGuestShippingInformation.mock.invocationCallOrder[0]!)
                .toBeLessThan(paymentMocks.placeGuestOrder.mock.invocationCallOrder[0]!);
            // The idle save was consumed by the flush.
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        });

        it('a rate key change asks the rates once the typing pauses, and only the save that carried the address reopens the gate', async () => {
            await openGate();
            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValue(save.promise);

            store.shippingAddress.set({ ...address, postcode: '7870' });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(200);
            store.shippingAddress.set({ ...address, postcode: '78701' });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(299);
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            const [, estimate] = shippingMocks.estimateGuestShippingMethods.mock.calls[0]!;
            expect(estimate.address.postcode).toBe('78701');
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.shippingDirty.get()).toBe(true);

            save.resolve(details('57.00'));
            await vi.advanceTimersByTimeAsync(0);
            expect(store.shippingDirty.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        });

        it('a rate key change with a selected rate starts the rates and the save together; a rate the new list dropped is replaced by a second save and no error shows', async () => {
            await openGate();
            const estimate = deferred<readonly ShippingMethod[]>();
            shippingMocks.estimateGuestShippingMethods.mockReturnValueOnce(estimate.promise);
            const firstSave = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(firstSave.promise);
            shippingMocks.saveGuestShippingInformation.mockResolvedValueOnce(details('61.00'));

            store.shippingAddress.set({ ...address, postcode: '78701' });
            const running = flow.estimateShippingNow();

            // Both left at the same moment.
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            const [, optimistic] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
            expect(optimistic.addressInformation.shipping_method_code).toBe('flatrate');
            expect(optimistic.addressInformation.shipping_address.postcode).toBe('78701');

            estimate.resolve([method('tablerate', 'bestway', 9)]);
            await vi.advanceTimersByTimeAsync(0);
            expect(store.selectedShippingMethod.get()).toEqual(BESTWAY);
            // Core refuses the save that carried the dropped rate.
            firstSave.reject(new MagentoApiError(400, '400', 'Carrier with such method not found: flatrate, flatrate'));
            await running;

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            const [, corrected] = shippingMocks.saveGuestShippingInformation.mock.calls[1]!;
            expect(corrected.addressInformation.shipping_method_code).toBe('bestway');
            expect(store.appliedShippingMethod.get()).toEqual(BESTWAY);
            expect(store.totals.get()?.grand_total).toBe('61.00');
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('a refusal of the early save that arrives before the rates is not shown and the save is sent again with the settled selection', async () => {
            await openGate();
            const estimate = deferred<readonly ShippingMethod[]>();
            shippingMocks.estimateGuestShippingMethods.mockReturnValueOnce(estimate.promise);
            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(
                new MagentoApiError(400, '400', 'Carrier with such method not found: flatrate, flatrate')
            );

            store.shippingAddress.set({ ...address, postcode: '78701' });
            const running = flow.estimateShippingNow();
            await vi.advanceTimersByTimeAsync(0);
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();

            estimate.resolve([method('flatrate', 'flatrate')]);
            await running;

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
            expect(store.shippingDirty.get()).toBe(false);
            expect(store.globalError.get()).toBeNull();
        });

        it('a rate key change with the selected rate still offered needs one save only', async () => {
            await openGate();

            store.shippingAddress.set({ ...address, postcode: '78701' });
            await flow.estimateShippingNow();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
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

        it('a failed save leaves the form marked as ahead of the quote, and an address without rates leaves nothing to order', async () => {
            await openGate();
            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(new Error('Carrier unavailable'));
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            await flow.estimateShippingNow();
            expect(store.shippingDirty.get()).toBe(true);
            expect(store.sectionStatus.get()['shipping-methods']?.message).toBe('Carrier unavailable');

            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([]);
            store.shippingAddress.set({ ...address, postcode: '78701' });
            await flow.estimateShippingNow();
            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(store.appliedShippingMethod.get()).toBeNull();
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('Place Order pressed while the typing pause runs waits for the rates and the save, then orders with the new address', async () => {
            await openGate();
            paymentMocks.placeGuestOrder.mockResolvedValue(77);

            store.shippingAddress.set({ ...address, postcode: '78701' });
            flow.scheduleShippingEstimate();
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();

            expect(await placeOrderThrough(flow)).toBe(77);

            expect(store.shippingDirty.get()).toBe(false);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            const lastSave = shippingMocks.saveGuestShippingInformation.mock.calls.length - 1;
            const [, saved] = shippingMocks.saveGuestShippingInformation.mock.calls[lastSave]!;
            expect(saved.addressInformation.shipping_address.postcode).toBe('78701');
            expect(shippingMocks.estimateGuestShippingMethods.mock.invocationCallOrder[0]!)
                .toBeLessThan(paymentMocks.placeGuestOrder.mock.invocationCallOrder[0]!);
            expect(shippingMocks.saveGuestShippingInformation.mock.invocationCallOrder[lastSave]!)
                .toBeLessThan(paymentMocks.placeGuestOrder.mock.invocationCallOrder[0]!);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.billingAddress.postcode).toBe('78701');
            // The scheduled run was consumed: nothing fires later.
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
        });

        it('preparing waits for a save that is already in flight and answers at once when nothing is pending', async () => {
            await openGate();
            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });
            flow.cancelOrder();
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(save.promise);
            void flow.saveShippingAndEstimateTotals();
            let result: unknown = null;
            const preparing = flow.prepareOrder().then((value) => { result = value; });
            await vi.advanceTimersByTimeAsync(0);
            expect(result).toBeNull();
            expect(store.orderOutcome.get()).toBe('placing');
            save.resolve(details('57.00'));
            await preparing;
            expect(result).toEqual({ status: 'ready' });
            expect(store.isSavingShipping.get()).toBe(false);
        });

        it('a press after a failed shipping save sends the save again and, when it succeeds, places the order with the current address', async () => {
            await openGate();
            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(new MagentoApiError(503, 'unknown', 'The store is temporarily unavailable.'));
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            await flow.estimateShippingNow();
            expect(store.shippingDirty.get()).toBe(true);
            expect(store.sectionStatus.get()['shipping-methods']?.message).toBe('The store is temporarily unavailable.');
            expect(selectors.canPlaceOrder.get()).toBe(false);
            paymentMocks.placeGuestOrder.mockResolvedValue(91);

            expect(await placeOrderThrough(flow)).toBe(91);

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            const [, resent] = shippingMocks.saveGuestShippingInformation.mock.calls[1]!;
            expect(resent.addressInformation.shipping_address.street).toEqual(['1 New Street']);
            expect(store.shippingDirty.get()).toBe(false);
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
        });

        it('a press after a failed estimate asks for the rates again', async () => {
            await openGate();
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));
            store.shippingAddress.set({ ...address, postcode: '78701' });
            await flow.estimateShippingNow();
            expect(store.estimateState.get()).toBe('error');
            // The list on screen belongs to the previous address.
            expect(selectors.canPlaceOrder.get()).toBe(false);

            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(2);
            expect(store.estimateState.get()).toBe('ready');
            expect(store.shippingDirty.get()).toBe(false);
        });

        it('a press after a failed save that fails again places nothing and shows the error, with one attempt per press', async () => {
            await openGate();
            shippingMocks.saveGuestShippingInformation.mockRejectedValue(new MagentoApiError(503, 'unknown', 'The store is temporarily unavailable.'));
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            await flow.estimateShippingNow();
            store.globalError.set(null);

            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'write-failed' });

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            expect(store.shippingDirty.get()).toBe(true);
            expect(store.sectionStatus.get()['shipping-methods']?.message).toBe('The store is temporarily unavailable.');
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
            // Nothing retries in the background.
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
        });

        it('preparing gives the gate back when the new address has no rate', async () => {
            await openGate();
            shippingMocks.estimateGuestShippingMethods.mockResolvedValueOnce([]);

            store.shippingAddress.set({ ...address, postcode: '78701' });
            flow.scheduleShippingEstimate();
            const prepared = await flow.prepareOrder();

            expect(prepared).toEqual({ status: 'blocked', reason: 'shipping-method' });
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(await placeOrderThrough(flow)).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        });

        it('an edit made between the two halves of Place Order sends no order', async () => {
            await openGate();
            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });

            // The payment step runs; the shopper edits the address meanwhile.
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();

            expect(await flow.submitOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.isPlacingOrder.get()).toBe(false);
        });

        it('no estimate and no save start while the order is being sent or once it exists', async () => {
            await openGate();
            const order = deferred<number>();
            paymentMocks.placeGuestOrder.mockReturnValue(order.promise);
            const placing = placeOrderThrough(flow);
            await vi.advanceTimersByTimeAsync(0);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);

            store.shippingAddress.set({ ...address, postcode: '78701' });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(2000);
            await flow.estimateShipping();
            await flow.saveShippingAndEstimateTotals();
            await flow.selectShippingMethod(FLATRATE);
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(500);
            expect(await flow.savePaymentInformation()).toBe(false);
            expect((await flow.saveGiftMessage(null, { sender: 'a', recipient: 'b', message: 'c' })).status).toBe('skipped');
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(paymentMocks.setGuestPaymentInformation).not.toHaveBeenCalled();
            expect(giftMocks.saveGuestGiftMessage).not.toHaveBeenCalled();

            order.resolve(5);
            expect(await placing).toBe(5);
            await flow.estimateShippingNow();
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
        });

        it('an edit made while the payment step runs starts no request and keeps the order from being sent', async () => {
            await openGate();
            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });

            store.shippingAddress.set({ ...address, postcode: '78701' });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(5000);
            flow.flushShippingForm();

            expect(store.shippingDirty.get()).toBe(true);
            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(await flow.submitOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();

            // The latch is back: the next press saves the edit and orders.
            paymentMocks.placeGuestOrder.mockResolvedValue(93);
            expect(await placeOrderThrough(flow)).toBe(93);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.billingAddress.postcode).toBe('78701');
        });

        it('a latch another control holds blocks estimates and saves too', async () => {
            await openGate();
            // What a wallet does while it authorizes a payment.
            store.isPlacingOrder.set(true);
            store.shippingAddress.set({ ...address, postcode: '78701' });
            flow.scheduleShippingEstimate();
            await vi.advanceTimersByTimeAsync(2000);
            await flow.estimateShipping();
            await flow.saveShippingAndEstimateTotals();

            expect(shippingMocks.estimateGuestShippingMethods).not.toHaveBeenCalled();
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'busy' });
        });
    });

    describe('payment method saved on selection', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            confirmQuote();
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue({
                payment_methods: store.availablePaymentMethods.get(),
                totals: totals('54.15'),
            });
        });
        afterEach(() => { vi.useRealTimers(); });

        it('one save without the data of the order, then one read of the totals', async () => {
            store.acceptedAgreements.set([7]);
            store.selectedPaymentMethod.set('banktransfer');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(249);
            expect(paymentMocks.setGuestPaymentInformation).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            await vi.advanceTimersByTimeAsync(0);

            expect(paymentMocks.setGuestPaymentInformation).toHaveBeenCalledTimes(1);
            const [cartId, request] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(cartId).toBe('masked-1');
            expect(request.paymentMethod).toEqual({ method: 'banktransfer' });
            expect(request.billingAddress.city).toBe('Calder');
            expect(request.email).toBe('ok@example.com');
            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
            expect(paymentMocks.setGuestPaymentInformation.mock.invocationCallOrder[0]!)
                .toBeLessThan(paymentMocks.getGuestPaymentInformation.mock.invocationCallOrder[0]!);
            // The total follows a cart rule that depends on the method.
            expect(store.totals.get()?.grand_total).toBe('54.15');
            expect(store.selectedPaymentMethod.get()).toBe('banktransfer');
        });

        it('carries the answer of the image CAPTCHA and asks for no reCAPTCHA token', async () => {
            seedCaptchaState({
                payment_processing_request: { isRequired: true, isCaseSensitive: false, imageHeight: 50, imageWidth: 200 },
            });
            setCaptchaAnswer('payment_processing_request', 'order-word');
            vi.mocked(executeRecaptcha).mockClear();
            store.selectedPaymentMethod.set('banktransfer');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(250);
            await vi.advanceTimersByTimeAsync(0);

            expect(paymentMocks.setGuestPaymentInformation).toHaveBeenCalledTimes(1);
            expect(paymentMocks.setGuestPaymentInformation.mock.calls[0]![2]).toEqual({ 'X-Captcha': 'order-word' });
            expect(executeRecaptcha).not.toHaveBeenCalled();
            // The order form keeps its answer: this request does not spend it.
            expect(captchaAnswer(store, 'payment_processing_request')).toBe('order-word');
            resetCaptchaStateForTests();
        });

        it('two quick selections send one request, for the last one', async () => {
            store.selectedPaymentMethod.set('banktransfer');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(100);
            store.selectedPaymentMethod.set('checkmo');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(250);
            await vi.advanceTimersByTimeAsync(0);

            expect(paymentMocks.setGuestPaymentInformation).toHaveBeenCalledTimes(1);
            const [, request] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(request.paymentMethod.method).toBe('checkmo');
        });

        it('keeps the gate closed while the totals settle', async () => {
            const read = deferred<PaymentDetails>();
            paymentMocks.getGuestPaymentInformation.mockReturnValue(read.promise);
            expect(selectors.canPlaceOrder.get()).toBe(true);

            store.selectedPaymentMethod.set('banktransfer');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(250);
            await vi.advanceTimersByTimeAsync(0);

            expect(store.quoteWritesPending.get()).toBe(0);
            expect(store.isSettlingTotals.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(placeOrderBlocker(store, selectors)).toBe('updating');

            read.resolve({ payment_methods: store.availablePaymentMethods.get(), totals: totals('54.15') });
            await vi.advanceTimersByTimeAsync(0);
            expect(store.isSettlingTotals.get()).toBe(false);
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('is not sent while the quote does not carry the shipping information; Place Order sends it after the shipping save', async () => {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue(store.availableShippingMethods.get());
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));
            paymentMocks.placeGuestOrder.mockResolvedValue(31);
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(250);
            expect(paymentMocks.setGuestPaymentInformation).not.toHaveBeenCalled();

            expect(await placeOrderThrough(flow)).toBe(31);

            const shippingAt = shippingMocks.saveGuestShippingInformation.mock.invocationCallOrder[0]!;
            const paymentAt = paymentMocks.setGuestPaymentInformation.mock.invocationCallOrder[0]!;
            const orderAt = paymentMocks.placeGuestOrder.mock.invocationCallOrder[0]!;
            expect(shippingAt).toBeLessThan(paymentAt);
            expect(paymentAt).toBeLessThan(orderAt);
            expect(paymentMocks.setGuestPaymentInformation).toHaveBeenCalledTimes(1);
        });

        it('is skipped for a method whose renderer declines the save on selection', async () => {
            setCheckoutConfig({
                hyperion: {
                    paymentRenderers: paymentRenderers.map((entry) => (entry.id === 'purchaseorder'
                        ? { ...entry, savesOnSelection: false }
                        : entry)),
                },
            } as unknown as CheckoutConfig);
            store.selectedPaymentMethod.set('purchaseorder');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(500);

            expect(paymentMocks.setGuestPaymentInformation).not.toHaveBeenCalled();
        });

        it('a save that fails in the flush of Place Order does not hold the order back: its request carries the method', async () => {
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue(store.availableShippingMethods.get());
            shippingMocks.saveGuestShippingInformation.mockResolvedValue({
                payment_methods: store.availablePaymentMethods.get(),
                totals: totals('57.00'),
            });
            paymentMocks.setGuestPaymentInformation.mockRejectedValue(new Error('Not available'));
            paymentMocks.placeGuestOrder.mockResolvedValue(32);
            store.shippingAddress.set({ ...address, street: ['1 New Street'] });
            flow.scheduleShippingEstimate();
            store.selectedPaymentMethod.set('banktransfer');
            flow.savePaymentMethod();

            expect(await placeOrderThrough(flow)).toBe(32);

            expect(paymentMocks.setGuestPaymentInformation).toHaveBeenCalledTimes(1);
            const [, order] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(order.paymentMethod.method).toBe('banktransfer');
            expect(store.sectionStatus.get().payment?.message).toBe('Not available');
        });

        it('waits for a valid email of a guest: core requires it with the request', async () => {
            store.email.set('');
            store.selectedPaymentMethod.set('banktransfer');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(500);
            expect(paymentMocks.setGuestPaymentInformation).not.toHaveBeenCalled();

            // The press finds the email missing and still sends nothing.
            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'email' });
            expect(paymentMocks.setGuestPaymentInformation).not.toHaveBeenCalled();

            store.email.set('ok@example.com');
            paymentMocks.placeGuestOrder.mockResolvedValue(33);
            expect(await placeOrderThrough(flow)).toBe(33);
            expect(paymentMocks.setGuestPaymentInformation).toHaveBeenCalledTimes(1);
            expect(paymentMocks.setGuestPaymentInformation.mock.invocationCallOrder[0]!)
                .toBeLessThan(paymentMocks.placeGuestOrder.mock.invocationCallOrder[0]!);
        });

        it('a failed save reports to the payment section and keeps the selection', async () => {
            paymentMocks.setGuestPaymentInformation.mockRejectedValue(new Error('Not available'));
            store.selectedPaymentMethod.set('banktransfer');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(250);
            await vi.advanceTimersByTimeAsync(0);

            expect(store.sectionStatus.get().payment?.message).toBe('Not available');
            expect(store.selectedPaymentMethod.get()).toBe('banktransfer');
            expect(store.globalError.get()).toBeNull();
            expect(paymentMocks.getGuestPaymentInformation).not.toHaveBeenCalled();
        });
    });

    describe('gift message', () => {
        it('is one write per target, serialized with the other writes and followed by one read', async () => {
            confirmQuote();
            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(save.promise);
            giftMocks.saveGuestGiftMessage.mockResolvedValue(true);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('57.00'));
            const payload = { sender: 'Veronica', recipient: 'Roni', message: 'Enjoy' };

            void flow.selectShippingMethod(BESTWAY);
            const order = flow.saveGiftMessage(null, payload);
            const replaced = flow.saveGiftMessage(7, { ...payload, message: 'first' });
            const item = flow.saveGiftMessage(7, payload);

            expect(giftMocks.saveGuestGiftMessage).not.toHaveBeenCalled();
            expect((await replaced).status).toBe('superseded');
            save.resolve(details('61.00'));
            expect((await order).status).toBe('applied');
            expect((await item).status).toBe('applied');
            await flow.queue.whenIdle();

            expect(giftMocks.saveGuestGiftMessage.mock.calls).toEqual([
                ['masked-1', null, payload],
                ['masked-1', 7, payload],
            ]);
            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
        });

        it('a failed save reports to the gift section without a global error', async () => {
            giftMocks.saveGuestGiftMessage.mockRejectedValue(new Error('Gift messages are disabled'));

            const outcome = await flow.saveGiftMessage(null, { sender: '', recipient: '', message: 'x' });

            expect(outcome.status).toBe('failed');
            expect(store.sectionStatus.get().gift?.message).toBe('Gift messages are disabled');
            expect(store.globalError.get()).toBeNull();
        });
    });

    describe('order latch', () => {
        beforeEach(() => { confirmQuote(); });

        it('after a successful order the placing state stays, the order is marked placed and a second call sends nothing', async () => {
            paymentMocks.placeGuestOrder.mockResolvedValue(1001);

            expect(await placeOrderThrough(flow)).toBe(1001);
            expect(store.isPlacingOrder.get()).toBe(true);
            expect(store.orderPlaced.get()).toBe(true);
            expect(store.orderOutcome.get()).toBe('placed');
            expect(selectors.canPlaceOrder.get()).toBe(false);

            expect(await placeOrderThrough(flow)).toBeNull();
            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'busy' });
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('two calls in the same tick send one order request', async () => {
            const order = deferred<number>();
            paymentMocks.placeGuestOrder.mockReturnValue(order.promise);

            const first = placeOrderThrough(flow);
            const second = placeOrderThrough(flow);
            // The latch is taken before anything is awaited.
            expect(store.orderOutcome.get()).toBe('placing');
            expect(store.isPlacingOrder.get()).toBe(true);
            await settle();
            order.resolve(5);

            expect(await second).toBeNull();
            expect(await first).toBe(5);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('an order the server refused releases the latch, reopens the queue and shows the message of the server', async () => {
            paymentMocks.placeGuestOrder.mockRejectedValue(new MagentoApiError(400, '400', 'The payment was declined.'));

            expect(await placeOrderThrough(flow)).toBeNull();
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderPlaced.get()).toBe(false);
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.globalError.get()).toBe('The payment was declined.');
            expect(cartMocks.getGuestCartState).not.toHaveBeenCalled();

            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('61.00'));
            await flow.selectShippingMethod(BESTWAY);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        });

        it('a press with a piece missing and nothing pending answers the piece without taking the latch', async () => {
            store.selectedPaymentMethod.set(null);
            const seen: boolean[] = [];
            const preparing = flow.prepareOrder();
            seen.push(store.isPlacingOrder.get());

            expect(await preparing).toEqual({ status: 'blocked', reason: 'payment-method' });
            expect(seen).toEqual([false]);
            expect(store.orderOutcome.get()).toBe('none');
        });

        it('submitting without a prepared order sends nothing, and a canceled preparation gives the latch back', async () => {
            expect(await flow.submitOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();

            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(true);
            flow.cancelOrder();
            expect(store.orderOutcome.get()).toBe('none');
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(await flow.submitOrder()).toBeNull();
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        });

        it('a renderer that owns the order is not asked for its own readiness', async () => {
            // What the element of the row reported.
            patchRow('banktransfer', { valid: false });
            store.selectedPaymentMethod.set('banktransfer');

            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'payment-not-ready' });
            expect(await flow.prepareOrder({ skipPaymentReady: true })).toEqual({ status: 'ready' });
            flow.cancelOrder();
            resetPaymentRowsForTests();
        });

        it('the gate without the latch equals the absence of a blocker', () => {
            expect(placeOrderBlocker(store, selectors)).toBeNull();
            expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(true);
            store.isSettlingTotals.set(true);
            expect(placeOrderBlocker(store, selectors)).toBe('updating');
            expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(false);
            store.isSettlingTotals.set(false);
            store.quoteWritesPending.set(1);
            expect(placeOrderBlocker(store, selectors)).toBe('updating');
            expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(false);
            store.quoteWritesPending.set(0);
            store.totals.set(null);
            expect(placeOrderBlocker(store, selectors)).toBe('totals');
            expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(false);
        });
    });

    describe('order request that lost its answer', () => {
        const NOT_PLACED = 'We could not reach the store. Your order was not placed. Please try again.';
        const UNKNOWN = 'We could not confirm whether your order was placed. Please do not pay again yet.';
        const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

        beforeEach(() => {
            confirmQuote();
            setCheckoutConfig(withPaymentRenderers({
                hyperion: { checkoutVersion: '2.0.0', enabled: true },
                defaultSuccessPageUrl: '/checkout/onepage/success/',
            } as unknown as CheckoutConfig));
            paymentMocks.placeGuestOrder.mockRejectedValue(new NetworkError(new TypeError('Failed to fetch')));
            paymentMocks.placeCustomerOrder.mockRejectedValue(new NetworkError(new TypeError('Failed to fetch')));
        });

        it('guest: a cart answered as inactive means the order exists and the call resolves as placed', async () => {
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: false, reserved_order_id: '000000205' });

            expect(await placeOrderThrough(flow)).toBe('placed-unconfirmed');
            expect(cartMocks.getGuestCartState).toHaveBeenCalledWith('masked-1');
            expect(store.orderPlaced.get()).toBe(true);
            expect(store.orderOutcome.get()).toBe('placed');
            expect(store.orderNumber.get()).toBe('000000205');
            expect(store.isPlacingOrder.get()).toBe(true);
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get().order).toBeNull();
            // The caller leaves for the success page with the answer it got.
            expect(navigateTo).not.toHaveBeenCalled();
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('guest: a cart that is gone (404) continues to the success page, where the server decides', async () => {
            cartMocks.getGuestCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));

            expect(await placeOrderThrough(flow)).toBe('placed-unconfirmed');
            expect(store.orderPlaced.get()).toBe(true);
        });

        it('guest: a cart that is still active releases the latch, says so next to Place Order and keeps every input', async () => {
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: true });

            expect(await placeOrderThrough(flow)).toBeNull();
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderPlaced.get()).toBe(false);
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.orderStep.get()).toBe('idle');
            expect(store.sectionStatus.get().order?.message).toBe(NOT_PLACED);
            expect(store.globalError.get()).toBeNull();
            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(store.shippingAddress.get()).toBe(address);

            // The queue is open again and the next press sends the order.
            paymentMocks.placeGuestOrder.mockResolvedValueOnce(88);
            expect(await placeOrderThrough(flow)).toBe(88);
            expect(store.sectionStatus.get().order).toBeNull();
        });

        it('a cart read that fails too keeps the order latched: nothing is saved, a press neither reads nor sends, "Check again" resolves it', async () => {
            cartMocks.getGuestCartState.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));

            expect(await placeOrderThrough(flow)).toBeNull();
            expect(store.orderOutcome.get()).toBe('unknown');
            expect(store.orderPlaced.get()).toBe(false);
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderStep.get()).toBe('idle');
            const status = store.sectionStatus.get().order;
            expect(status?.message).toBe(UNKNOWN);
            expect(store.globalError.get()).toBeNull();

            // Nothing may change a quote that may already be an order.
            await flow.selectShippingMethod(BESTWAY);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

            // A press on Place Order is not the way out.
            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'outcome-unknown' });
            expect(await placeOrderThrough(flow)).toBeNull();
            expect(cartMocks.getGuestCartState).toHaveBeenCalledTimes(1);
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);

            // The cart shows the order: success without a second request.
            cartMocks.getGuestCartState.mockResolvedValueOnce({ id: 464, is_active: false });
            status?.retry?.();
            expect(store.orderStep.get()).toBe('confirming');
            await settled();
            expect(store.orderPlaced.get()).toBe(true);
            expect(store.orderOutcome.get()).toBe('placed');
            expect(navigateTo).toHaveBeenCalledTimes(1);
            expect(navigateTo).toHaveBeenCalledWith(expect.stringContaining('/checkout/onepage/success'));
            expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
        });

        it('after an unknown outcome, a cart found still active tells the payment method and lets the next press send the order', async () => {
            const afterPlaceOrderFailed = vi.mocked(notifyOrderNotPlaced);
            afterPlaceOrderFailed.mockClear();
            cartMocks.getGuestCartState.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')));
            await placeOrderThrough(flow);
            expect(store.orderOutcome.get()).toBe('unknown');
            expect(afterPlaceOrderFailed).not.toHaveBeenCalled();

            cartMocks.getGuestCartState.mockResolvedValueOnce({ id: 464, is_active: true });
            store.sectionStatus.get().order?.retry?.();
            await settled();
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.sectionStatus.get().order?.message).toBe(NOT_PLACED);
            expect(afterPlaceOrderFailed).toHaveBeenCalledTimes(1);
            expect(navigateTo).not.toHaveBeenCalled();

            paymentMocks.placeGuestOrder.mockResolvedValueOnce(88);
            expect(await placeOrderThrough(flow)).toBe(88);
            expect(store.orderOutcome.get()).toBe('placed');
        });

        it('a timeout with a cart that is still active asks five times before the order counts as not placed', async () => {
            vi.useFakeTimers();
            try {
                paymentMocks.placeGuestOrder.mockRejectedValue(new RequestTimeoutError());
                cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: true });

                const placing = placeOrderThrough(flow);
                await vi.advanceTimersByTimeAsync(4 * 3000 - 1);
                expect(store.orderOutcome.get()).toBe('unknown');
                expect(store.orderStep.get()).toBe('confirming');
                await vi.advanceTimersByTimeAsync(1);
                expect(await placing).toBeNull();
                expect(cartMocks.getGuestCartState).toHaveBeenCalledTimes(5);
                expect(store.orderOutcome.get()).toBe('none');
                expect(store.sectionStatus.get().order?.message).toBe(NOT_PLACED);
            } finally {
                vi.useRealTimers();
            }
        });

        it('a cart locked by an earlier request is never shown as an error: the quote is asked after a pause', async () => {
            vi.useFakeTimers();
            try {
                paymentMocks.placeGuestOrder.mockRejectedValue(Object.assign(
                    new MagentoApiError(400, '400', 'The cart is locked for processing. Please try again later.'),
                    { checkoutKind: 'cart-locked' }
                ));
                cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: false });

                const placing = placeOrderThrough(flow);
                await vi.advanceTimersByTimeAsync(2999);
                expect(cartMocks.getGuestCartState).not.toHaveBeenCalled();
                await vi.advanceTimersByTimeAsync(1);
                expect(await placing).toBe('placed-unconfirmed');
                expect(store.globalError.get()).toBeNull();
                expect(store.sectionStatus.get().order).toBeNull();
                expect(paymentMocks.placeGuestOrder).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });

        describe('customer', () => {
            beforeEach(() => {
                store.isGuest.set(false);
                store.quoteId.set('465' as never);
            });

            it('no active cart (404) means the order exists', async () => {
                cartMocks.getCustomerCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));

                expect(await placeOrderThrough(flow)).toBe('placed-unconfirmed');
                expect(store.orderPlaced.get()).toBe(true);
                expect(cartMocks.getGuestCartState).not.toHaveBeenCalled();
            });

            it('the quote of this checkout, still active, means no order: its id is compared as a number', async () => {
                cartMocks.getCustomerCartState.mockResolvedValue({ id: 465, is_active: true });

                expect(await placeOrderThrough(flow)).toBeNull();
                expect(store.sectionStatus.get().order?.message).toBe(NOT_PLACED);
                expect(store.isPlacingOrder.get()).toBe(false);
            });

            it('another active cart means the quote of this checkout was ordered', async () => {
                cartMocks.getCustomerCartState.mockResolvedValue({ id: 470, is_active: true });

                expect(await placeOrderThrough(flow)).toBe('placed-unconfirmed');
            });

            it('a session that ended (401) leaves the outcome unknown and asks the shopper to sign in again', async () => {
                cartMocks.getCustomerCartState.mockRejectedValue(new MagentoApiError(401, '401', 'Not authorized'));

                expect(await placeOrderThrough(flow)).toBeNull();
                expect(store.orderOutcome.get()).toBe('unknown');
                expect(store.sessionExpired.get()).toBe(true);
                expect(store.isPlacingOrder.get()).toBe(false);
                expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'busy' });
                expect(paymentMocks.placeCustomerOrder).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('an order request sent outside the flow', () => {
        beforeEach(() => { confirmQuote(); });

        it('a lost answer is resolved by the quote: ordered means success, with no request of the checkout', async () => {
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: false });

            expect(await flow.resolveLostOrder()).toBe('placed-unconfirmed');
            expect(store.orderPlaced.get()).toBe(true);
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        });

        it('a quote that is still active releases the latch and says the order was not placed', async () => {
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: true });

            expect(await flow.resolveLostOrder()).toBeNull();
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.sectionStatus.get().order?.kind).toBe('order-unknown');
        });
    });

    describe('a shipping save the closed queue never ran', () => {
        it('does not leave the form waiting for it: the next save is sent once the queue is open again', async () => {
            confirmQuote();
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('61.00'));
            flow.queue.close();
            await flow.selectShippingMethod(BESTWAY);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

            flow.queue.reopen();
            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.appliedShippingMethod.get()).toEqual(BESTWAY);
            expect(placeOrderBlocker(store, selectors)).toBeNull();
        });
    });

    describe('the steps of an order attempt', () => {
        beforeEach(() => { confirmQuote(); });

        it('names the saves, the payment method step and the order request, and is idle again after a refusal', async () => {
            expect(store.orderStep.get()).toBe('idle');
            // Something is owed to the quote, so the first half has saves to wait for.
            store.appliedShippingMethod.set(null);
            const save = deferred<PaymentDetails>();
            shippingMocks.saveGuestShippingInformation.mockReturnValueOnce(save.promise);
            const preparing = flow.prepareOrder();
            await Promise.resolve();
            expect(store.orderStep.get()).toBe('preparing');
            save.resolve(details('57.00'));
            expect(await preparing).toEqual({ status: 'ready' });
            expect(store.orderStep.get()).toBe('payment');

            const order = deferred<number>();
            paymentMocks.placeGuestOrder.mockReturnValueOnce(order.promise);
            const submitting = flow.submitOrder();
            expect(store.orderStep.get()).toBe('submitting');
            order.reject(new MagentoApiError(400, '400', 'Declined'));
            expect(await submitting).toBeNull();
            expect(store.orderStep.get()).toBe('idle');
            expect(store.globalError.get()).toBe('Declined');
        });

        it('an order refused for an item out of stock says so next to Place Order, once', async () => {
            paymentMocks.placeGuestOrder.mockRejectedValue(Object.assign(
                new MagentoApiError(400, '400', 'Some of the products are out of stock.'),
                { checkoutKind: 'stock' }
            ));

            expect(await placeOrderThrough(flow)).toBeNull();

            const status = store.sectionStatus.get().order;
            expect(status?.kind).toBe('stock');
            expect(status?.message).toBe('Some of the products are out of stock.');
            expect(store.globalError.get()).toBeNull();
            expect(store.orderOutcome.get()).toBe('none');
        });

        it('a prepared order that is given back is idle', async () => {
            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });
            flow.cancelOrder();
            expect(store.orderStep.get()).toBe('idle');
        });
    });

    describe('failures of the whole checkout', () => {
        const settled = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

        beforeEach(() => {
            confirmQuote();
            setCheckoutConfig(withPaymentRenderers({
                hyperion: { checkoutVersion: '2.0.0', enabled: true },
                defaultSuccessPageUrl: '/checkout/onepage/success/',
            } as unknown as CheckoutConfig));
        });

        it('a session that ended closes the queue and shows no section failure: the sign in prompt is the message', async () => {
            store.isGuest.set(false);
            store.quoteId.set('465' as never);
            shippingMocks.saveCustomerShippingInformation.mockRejectedValue(new MagentoApiError(401, '401', 'Not authorized'));

            await flow.selectShippingMethod(BESTWAY);

            expect(store.sessionExpired.get()).toBe(true);
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
            expect(store.globalError.get()).toBeNull();
            shippingMocks.saveCustomerShippingInformation.mockClear();
            await flow.selectShippingMethod(FLATRATE);
            expect(shippingMocks.saveCustomerShippingInformation).not.toHaveBeenCalled();
            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'busy' });
        });

        it('a quote that is gone is read once: still there for nobody, the order section offers the way back to the cart', async () => {
            shippingMocks.saveGuestShippingInformation.mockRejectedValue(Object.assign(
                new MagentoApiError(404, '404', 'No such entity with cartId = 5'),
                { checkoutKind: 'quote-gone' }
            ));
            cartMocks.getGuestCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));

            await flow.selectShippingMethod(BESTWAY);
            await settled();

            expect(cartMocks.getGuestCartState).toHaveBeenCalledTimes(1);
            const status = store.sectionStatus.get().order;
            expect(status?.kind).toBe('quote-gone');
            expect(status?.message).toBe('Your cart has changed or expired.');
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
            expect(navigateTo).not.toHaveBeenCalled();
            expect(await flow.prepareOrder()).toEqual({ status: 'blocked', reason: 'busy' });
            expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        });

        it('a quote that is gone because it was ordered elsewhere in this session leaves for the success page', async () => {
            shippingMocks.saveGuestShippingInformation.mockRejectedValue(Object.assign(
                new MagentoApiError(404, '404', 'No such entity with cartId = 5'),
                { checkoutKind: 'quote-gone' }
            ));
            cartMocks.getGuestCartState.mockResolvedValue({ id: 464, is_active: false });

            await flow.selectShippingMethod(BESTWAY);
            await settled();

            expect(store.orderPlaced.get()).toBe(true);
            expect(navigateTo).toHaveBeenCalledTimes(1);
            expect(store.sectionStatus.get().order).toBeNull();
        });
    });

    describe('requests sent again without a press', () => {
        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        const limited = (retryAfterMs?: number): Error => Object.assign(
            new Error('Too many requests. Please wait a moment.'),
            retryAfterMs === undefined ? { checkoutKind: 'rate-limited' } : { checkoutKind: 'rate-limited', retryAfterMs }
        );

        it('a background request the server asked to wait for is sent again once the wait is over', async () => {
            shippingMocks.estimateGuestShippingMethods
                .mockRejectedValueOnce(limited(3000))
                .mockResolvedValueOnce([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));

            await flow.estimateShipping();
            expect(store.sectionStatus.get()['shipping-methods']?.kind).toBe('rate-limited');
            expect(typeof store.sectionStatus.get()['shipping-methods']?.retryAt).toBe('number');

            await vi.advanceTimersByTimeAsync(2999);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(2);
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
            expect(store.estimateState.get()).toBe('ready');
        });

        it('a second refusal in a row is not sent again by itself, and a later refusal gets its own retry', async () => {
            shippingMocks.estimateGuestShippingMethods.mockRejectedValue(limited());

            await flow.estimateShipping();
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(2);
            await vi.advanceTimersByTimeAsync(60000);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(2);
            expect(store.sectionStatus.get()['shipping-methods']?.kind).toBe('rate-limited');

            // The shopper's retry fails the same way: one more automatic attempt.
            store.sectionStatus.get()['shipping-methods']?.retry?.();
            await vi.advanceTimersByTimeAsync(0);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(3);
            await vi.advanceTimersByTimeAsync(5000);
            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(4);
        });

        it('a request the shopper started is not sent again by itself: the section shows the wait', async () => {
            confirmQuote();
            shippingMocks.saveGuestShippingInformation.mockRejectedValue(limited(3000));

            await flow.selectShippingMethod(BESTWAY);
            expect(store.sectionStatus.get()['shipping-methods']?.source).toBe('action');
            await vi.advanceTimersByTimeAsync(10000);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
        });

        it('a connection that comes back asks again for the rates that failed without it and saves what the shopper chose meanwhile', async () => {
            shippingMocks.estimateGuestShippingMethods.mockRejectedValueOnce(
                Object.assign(new Error('You appear to be offline.'), { checkoutKind: 'offline' })
            );
            await flow.estimateShipping();
            expect(store.sectionStatus.get()['shipping-methods']?.kind).toBe('offline');

            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([method('flatrate', 'flatrate')]);
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('57.00'));
            flow.resumeAfterReconnect();
            await vi.advanceTimersByTimeAsync(0);
            await flow.queue.whenIdle();

            expect(shippingMocks.estimateGuestShippingMethods).toHaveBeenCalledTimes(2);
            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
            expect(store.appliedShippingMethod.get()).toEqual(FLATRATE);
        });

        it('a save the shopper asked for that failed offline is sent again when the connection is back', async () => {
            confirmQuote();
            shippingMocks.saveGuestShippingInformation.mockRejectedValueOnce(
                Object.assign(new Error('You appear to be offline.'), { checkoutKind: 'offline' })
            );
            await flow.selectShippingMethod(BESTWAY);
            expect(store.sectionStatus.get()['shipping-methods']?.kind).toBe('offline');
            expect(store.appliedShippingMethod.get()).toBeNull();

            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('61.00'));
            flow.resumeAfterReconnect();
            await vi.advanceTimersByTimeAsync(0);
            await flow.queue.whenIdle();

            expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
            expect(store.appliedShippingMethod.get()).toEqual(BESTWAY);
            expect(store.sectionStatus.get()['shipping-methods']).toBeNull();
        });
    });

    describe('minimum order amount', () => {
        it('is evaluated again from every totals answer that is applied', async () => {
            setCheckoutConfig(withPaymentRenderers({ hyperion: { checkoutVersion: '2.0.0', enabled: true } } as unknown as CheckoutConfig));
            confirmQuote();
            vi.mocked(minimumOrderError).mockReturnValueOnce('Minimum order amount is 50.');
            shippingMocks.saveGuestShippingInformation.mockResolvedValue(details('12.00'));

            await flow.selectShippingMethod(BESTWAY);

            expect(minimumOrderError).toHaveBeenCalledWith(details('12.00').totals, expect.anything());
            expect(store.minimumOrderError.get()).toBe('Minimum order amount is 50.');
            expect(selectors.canPlaceOrder.get()).toBe(false);

            await flow.selectShippingMethod(FLATRATE);
            expect(store.minimumOrderError.get()).toBeNull();
        });
    });

    describe('a failed coupon request', () => {
        it('shows in the coupon section with a retry, not at the field', async () => {
            confirmQuote();
            couponMocks.applyGuestCoupon.mockRejectedValue(new Error('We could not reach the store. Please try again.'));

            expect(await flow.applyCoupon('SAVE')).toBe(false);

            const status = store.sectionStatus.get().coupon;
            expect(status?.source).toBe('action');
            expect(typeof status?.retry).toBe('function');
            expect(store.couponError.get()).toBeNull();
            expect(store.globalError.get()).toBeNull();
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
            expect(store.selectedShippingMethod.get()).toEqual(FLATRATE);
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
            expect(store.estimateState.get()).toBe('empty');
            expect(store.availablePaymentMethods.get()).toEqual([]);
            expect(store.availableShippingMethods.get().map((m) => m.error_message)).toEqual([
                'This shipping method is not available.',
                'This shipping method is currently unavailable.',
            ]);
            expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();
            expect(selectors.canPlaceOrder.get()).toBe(false);
        });

        it('a hydrated selection that came back as an error row is replaced by a usable rate', async () => {
            store.selectedShippingMethod.set(BESTWAY);
            shippingMocks.estimateGuestShippingMethods.mockResolvedValue([
                { ...method('tablerate', 'bestway'), available: false, error_message: 'Not available for this address.' },
                method('flatrate', 'flatrate'),
            ]);

            await flow.estimateShipping();

            expect(store.selectedShippingMethod.get()).toEqual(FLATRATE);
        });

        it('a selection on a rate marked unavailable keeps Place Order closed', () => {
            store.availableShippingMethods.set([{ ...method('flatrate', 'flatrate'), available: false }]);
            store.selectedShippingMethod.set(FLATRATE);
            store.appliedShippingMethod.set(FLATRATE);
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
            expect(store.selectedShippingMethod.get()).toEqual(FLATRATE);
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

    describe('the payment data of the order request', () => {
        beforeEach(() => { confirmQuote(); });

        it('sends the selected code alone without data, and an empty additional_data not at all', async () => {
            store.selectedPaymentMethod.set('checkmo');
            paymentMocks.placeGuestOrder.mockResolvedValue(12);

            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });
            await flow.submitOrder({ additional_data: {} });

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({ method: 'checkmo' });
        });

        it('takes the method of the data when it names one', async () => {
            store.selectedPaymentMethod.set('vendor_wallet');
            paymentMocks.placeGuestOrder.mockResolvedValue(12);
            store.availablePaymentMethods.set([...store.availablePaymentMethods.get(), { code: 'vendor_wallet', title: 'Wallet' }]);

            await flow.prepareOrder({ skipPaymentReady: true });
            await flow.submitOrder({ method: 'vendor_wallet_alias', additional_data: { token: 't-1' } });

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({ method: 'vendor_wallet_alias', additional_data: { token: 't-1' } });
        });

        it('merges extension_attributes next to the accepted agreements and drops agreement ids of its own', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            store.selectedPaymentMethod.set('checkmo');
            store.acceptedAgreements.set([4]);
            paymentMocks.placeGuestOrder.mockResolvedValue(12);

            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });
            await flow.submitOrder({ extension_attributes: { agreement_ids: ['99'], vendor_reference: 'r-1' } });

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({
                method: 'checkmo',
                extension_attributes: { vendor_reference: 'r-1', agreement_ids: ['4'] },
            });
            expect(warn).toHaveBeenCalledTimes(1);
        });

        it('the save of the payment without an order carries the data it is handed', async () => {
            store.selectedPaymentMethod.set('checkmo');
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);

            await flow.savePaymentInformation({ method: 'other', additional_data: { a: 1 } });

            const [, request] = paymentMocks.setGuestPaymentInformation.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({ method: 'other', additional_data: { a: 1 } });
        });
    });

    describe('purchase order number', () => {
        beforeEach(() => { confirmQuote(); });

        it('travels as a top-level field of the payment, trimmed, with no additional_data left', async () => {
            store.selectedPaymentMethod.set('purchaseorder');
            paymentMocks.placeGuestOrder.mockResolvedValue(12);

            expect(await flow.prepareOrder()).toEqual({ status: 'ready' });
            await flow.submitOrder({ po_number: '  HYP-PO-1  ' });

            const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
            expect(request.paymentMethod).toEqual({ method: 'purchaseorder', po_number: 'HYP-PO-1' });
            expect(request.paymentMethod).not.toHaveProperty('additional_data');
        });

        it('leaves the other keys of the method data in additional_data', async () => {
            store.selectedPaymentMethod.set('purchaseorder');
            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);

            await flow.savePaymentInformation({ po_number: 'HYP-PO-2', additional_data: { reference: 'dept-7' } });

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
            confirmQuote();
            expect(selectors.canPlaceOrder.get()).toBe(true);
            const read = deferred<PaymentDetails>();
            paymentMocks.getGuestPaymentInformation.mockReturnValue(read.promise);

            const refresh = flow.refreshPaymentInformation();
            expect(store.isSettlingTotals.get()).toBe(true);
            expect(selectors.canPlaceOrder.get()).toBe(false);

            read.resolve(details('47.00'));
            await refresh;
            expect(store.isSettlingTotals.get()).toBe(false);
            expect(store.totals.get()?.grand_total).toBe('47.00');
            expect(selectors.canPlaceOrder.get()).toBe(true);
        });

        it('waits for the writes on their way and reads once after them', async () => {
            confirmQuote();
            const save = deferred<boolean>();
            giftMocks.saveGuestGiftMessage.mockReturnValue(save.promise);
            paymentMocks.getGuestPaymentInformation.mockResolvedValue(details('47.00'));

            void flow.saveGiftMessage(null, { sender: '', recipient: '', message: 'x' });
            const refresh = flow.refreshPaymentInformation();
            await settle();
            expect(paymentMocks.getGuestPaymentInformation).not.toHaveBeenCalled();
            save.resolve(true);
            await refresh;

            expect(paymentMocks.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
        });

        it('a failed read releases the flag and reports to the payment section with a retry', async () => {
            paymentMocks.getGuestPaymentInformation.mockRejectedValue(new MagentoApiError(500, '500', 'boom'));

            await flow.refreshPaymentInformation();

            expect(store.isSettlingTotals.get()).toBe(false);
            expect(store.globalError.get()).toBeNull();
            expect(store.sectionStatus.get().payment?.message).toBe('boom');
            expect(typeof store.sectionStatus.get().payment?.retry).toBe('function');
        });
    });
});
