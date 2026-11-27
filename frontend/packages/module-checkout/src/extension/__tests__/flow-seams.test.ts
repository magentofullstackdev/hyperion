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
vi.mock('../../utils/minimum-order.js', () => ({ minimumOrderError: vi.fn(() => null) }));

import * as paymentApi from '../../api/payment.js';
import * as shippingApi from '../../api/shipping.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createFlowActions, type FlowActions, type PlaceOrderOutcome } from '../../store/flow-actions.js';
import { placeOrderBlockerMessage } from '../../store/place-order-hint.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { stopOrderRecovery } from '../../store/recovery.js';
import { expectedAgreements } from '../../store/selectors.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { PaymentDetails, ShippingMethod } from '../../types/shipping.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { shippingExtensionView, type ShippingExtensionView } from '../../components/shipping-extension-view.js';
import { resetCheckoutContextForTests } from '../context.js';
import { registerCheckoutGate, resetGatesForTests, setExtensionsPending, shippingExtensionsValid } from '../gates.js';
import { registerRequestFilter, resetFiltersForTests } from '../request-filters.js';

/**
 * Place Order without a payment step in between: the two halves of the
 * flow actions, as the order pipeline runs them.
 */
async function placeOrderThrough(actions: FlowActions): Promise<PlaceOrderOutcome> {
    const prepared = await actions.prepareOrder({ skipPaymentReady: true });
    return prepared.status === 'ready' ? actions.submitOrder() : null;
}

const paymentMocks = vi.mocked(paymentApi);
const shippingMocks = vi.mocked(shippingApi);

const address: Address = {
    country_id: 'US',
    city: 'Calder',
    firstname: 'Veronica',
    lastname: 'Costello',
    telephone: '555',
    postcode: '49628',
    street: ['6146 Honey Bluff Parkway'],
};

const locker: Address = {
    country_id: 'US',
    city: 'Detroit',
    firstname: 'Locker',
    lastname: 'L-42',
    telephone: '',
    postcode: '48201',
    street: ['Station Square 1'],
};

function rate(carrier: string, code: string): ShippingMethod {
    return {
        carrier_code: carrier, method_code: code, carrier_title: carrier, method_title: code,
        amount: 5, base_amount: 5, available: true, error_message: '', price_excl_tax: 5, price_incl_tax: 5,
    };
}

function totals(): Totals {
    return {
        grand_total: '57.00', base_grand_total: '57.00', subtotal: '52.00', base_subtotal: '52.00',
        discount_amount: '0', base_discount_amount: '0', subtotal_with_discount: '52.00', subtotal_incl_tax: '52.00',
        shipping_amount: '5', shipping_tax_amount: '0', shipping_incl_tax: '5', shipping_discount_amount: '0',
        tax_amount: '0', coupon_code: null, items_qty: '1', items: [], total_segments: [],
        quote_currency_code: 'USD', base_currency_code: 'USD',
    };
}

function details(): PaymentDetails {
    return { payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }], totals: totals() };
}

const FLATRATE = { carrier_code: 'flatrate', method_code: 'flatrate' };

const VIEW: ShippingExtensionView = { address: (editor) => editor, afterMethods: () => null, summary: () => null, holdsSave: () => false, validate: async () => true };

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe('extension seams of the flow actions', () => {
    let store: Store;
    let flow: FlowActions;
    let app: HTMLElement;

    function confirmQuote(): void {
        store.availableShippingMethods.set([rate('flatrate', 'flatrate')]);
        store.selectedShippingMethod.set(FLATRATE);
        store.appliedShippingMethod.set(FLATRATE);
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check / Money order' }]);
        store.selectedPaymentMethod.set('checkmo');
        store.totals.set(totals());
    }

    function configure(hyperion: Record<string, unknown> = {}): void {
        setCheckoutConfig({ storeCode: 'default', hyperion: { enabled: true, ...hyperion } } as unknown as CheckoutConfig);
    }

    beforeEach(() => {
        vi.clearAllMocks();
        setActiveCatalogForTests({
            'Hyperion_Checkout::extension_request_failed': 'The checkout could not prepare your request. Reload the page.',
            'Hyperion_Checkout::extension_blocked': 'Your order cannot be placed yet.',
        });
        configure();
        resetGatesForTests();
        resetFiltersForTests();
        resetCheckoutContextForTests();
        resetFlowSelectorsForTests();
        store = createStore();
        setStoreForTests(store);
        store.maskedQuoteId.set('masked-1');
        store.isGuest.set(true);
        store.email.set('ok@example.com');
        store.shippingAddress.set(address);
        store.billingSameAsShipping.set(true);
        expectedAgreements.set([]);
        flow = createFlowActions();
        app = document.createElement('checkout-app');
        document.body.appendChild(app);
        paymentMocks.getGuestPaymentInformation.mockResolvedValue(details());
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        shippingExtensionView.set(null);
        stopOrderRecovery();
        app.remove();
        resetGatesForTests();
        resetFiltersForTests();
        vi.restoreAllMocks();
    });

    it('sends the order body a payment filter returned, with the agreement ids kept', async () => {
        confirmQuote();
        store.acceptedAgreements.set([7]);
        registerRequestFilter('paymentInformation', (body) => {
            const method = body.paymentMethod as { extension_attributes?: Record<string, unknown> };
            method.extension_attributes = { hyperion_order_comment: 'Ring twice' };
            return body;
        }, { owner: 'order_comment' });
        paymentMocks.placeGuestOrder.mockResolvedValue(1001);

        await expect(placeOrderThrough(flow)).resolves.toBe(1001);
        const [, request] = paymentMocks.placeGuestOrder.mock.calls[0]!;
        expect(request.paymentMethod).toEqual({
            method: 'checkmo',
            extension_attributes: { hyperion_order_comment: 'Ring twice', agreement_ids: ['7'] },
        });
    });

    it('sends no order and releases the latch when a payment filter throws', async () => {
        confirmQuote();
        registerRequestFilter('paymentInformation', () => { throw new Error('boom'); }, { owner: 'broken' });

        await expect(placeOrderThrough(flow)).resolves.toBeNull();
        expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
        expect(store.globalError.get()).toBe('The checkout could not prepare your request. Reload the page.');
        expect(store.orderOutcome.get()).toBe('none');
        expect(store.isPlacingOrder.get()).toBe(false);
    });

    it('saves the address a shipping extension put in place, with the attributes its filter merges', async () => {
        store.availableShippingMethods.set([rate('lockers', 'locker_a')]);
        store.shippingAddressOverride.set({ extensionId: 'lockers', address: locker, keepContact: true, separateBilling: false });
        registerRequestFilter('shippingInformation', (body) => {
            const info = body.addressInformation as Record<string, Record<string, unknown>>;
            info.shipping_address!.extension_attributes = { locker_id: 'L-42' };
            return body;
        }, { owner: 'lockers', first: true });
        shippingMocks.saveGuestShippingInformation.mockResolvedValue(details());

        await flow.selectShippingMethod({ carrier_code: 'lockers', method_code: 'locker_a' });
        await settle();

        const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
        expect(request.addressInformation.shipping_address).toMatchObject({
            firstname: 'Veronica',
            lastname: 'Costello',
            telephone: '555',
            street: ['Station Square 1'],
            city: 'Detroit',
            extension_attributes: { locker_id: 'L-42' },
        });
        expect(request.addressInformation.billing_address).toMatchObject({ street: ['Station Square 1'] });
        expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'lockers', method_code: 'locker_a' });
    });

    it('leaves the billing address out of the shipping save while an override asks for one of its own', async () => {
        store.availableShippingMethods.set([rate('lockers', 'locker_a')]);
        store.shippingAddressOverride.set({
            extensionId: 'lockers',
            address: { ...locker, telephone: '555 0100' },
            keepContact: false,
            separateBilling: true,
        });
        shippingMocks.saveGuestShippingInformation.mockResolvedValue(details());

        await flow.selectShippingMethod({ carrier_code: 'lockers', method_code: 'locker_a' });
        await settle();

        const [, request] = shippingMocks.saveGuestShippingInformation.mock.calls[0]!;
        expect(request.addressInformation.shipping_address).toMatchObject({ firstname: 'Locker', street: ['Station Square 1'] });
        expect(request.addressInformation).not.toHaveProperty('billing_address');
    });

    it('stops an order canceled by a before-place-order listener, before any request', async () => {
        confirmQuote();
        const seen: unknown[] = [];
        app.addEventListener('hyperion:checkout:before-place-order', (event) => {
            seen.push((event as CustomEvent).detail);
            event.preventDefault();
        });

        await expect(flow.prepareOrder()).resolves.toEqual({ status: 'blocked', reason: 'extension' });
        expect(seen).toEqual([{ method: 'checkmo' }]);
        expect(store.orderOutcome.get()).toBe('none');
        await expect(placeOrderThrough(flow)).resolves.toBeNull();
        expect(placeOrderBlockerMessage(store, 'extension')).toBe('Your order cannot be placed yet.');
        expect(paymentMocks.placeGuestOrder).not.toHaveBeenCalled();
    });

    it('waits for the extension modules still loading and reads their gates before the order', async () => {
        confirmQuote();
        let loaded: () => void = () => undefined;
        setExtensionsPending(new Promise<void>((resolve) => {
            loaded = () => {
                registerCheckoutGate('vat', () => 'Check your VAT number.');
                resolve();
            };
        }));
        const prepared = flow.prepareOrder();
        await settle();
        loaded();

        await expect(prepared).resolves.toEqual({ status: 'blocked', reason: 'extension' });
        expect(store.isPlacingOrder.get()).toBe(false);
    });

    it('does not save a method on selection when its renderer entry says so', async () => {
        vi.useFakeTimers();
        try {
            confirmQuote();
            configure({
                paymentRenderers: [{ id: 'psp', method: null, pattern: 'vendor_psp_.*', savesOnSelection: false, sortOrder: 10 }],
            });
            store.availablePaymentMethods.set([{ code: 'vendor_psp_card', title: 'Card' }, { code: 'checkmo', title: 'Check' }]);
            store.selectedPaymentMethod.set('vendor_psp_card');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(1000);
            expect(paymentMocks.setGuestPaymentInformation).not.toHaveBeenCalled();

            paymentMocks.setGuestPaymentInformation.mockResolvedValue(true);
            store.selectedPaymentMethod.set('checkmo');
            flow.savePaymentMethod();
            await vi.advanceTimersByTimeAsync(1000);
            expect(paymentMocks.setGuestPaymentInformation).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('holds the save of the first estimate that preselects a gated rate until the extension chunk says nothing holds it', async () => {
        const lockerRate = { ...rate('locker', 'standard'), price_incl_tax: 3, amount: 3 };
        configure({ shippingExtensions: [{ id: 'vendor_locker', match: { carrier: 'locker', method: null }, required: true }] });
        shippingMocks.estimateGuestShippingMethods.mockResolvedValue([rate('flatrate', 'flatrate'), lockerRate]);
        shippingMocks.saveGuestShippingInformation.mockResolvedValue(details());
        await flow.estimateShipping();
        expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'locker', method_code: 'standard' });
        expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

        shippingExtensionsValid.set('Choose a pickup point.');
        const prepared = await flow.prepareOrder({ skipPaymentReady: true });
        expect(prepared).toEqual({ status: 'blocked', reason: 'extension' });
        expect(shippingMocks.saveGuestShippingInformation).not.toHaveBeenCalled();

        shippingExtensionsValid.set(null);
        shippingExtensionView.set({ ...VIEW, holdsSave: () => false });
        flow.flushShippingForm();
        await flow.queue.whenIdle();
        expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);
    });

    it('reads the hold for the rate a click selects, in the same turn', async () => {
        shippingMocks.estimateGuestShippingMethods.mockResolvedValue([rate('flatrate', 'flatrate'), rate('locker', 'standard')]);
        shippingMocks.saveGuestShippingInformation.mockResolvedValue(details());
        shippingExtensionView.set({ ...VIEW, holdsSave: (selected) => selected?.carrier_code === 'locker' });
        await flow.estimateShipping();
        expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);

        await flow.selectShippingMethod({ carrier_code: 'locker', method_code: 'standard' });
        expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(1);

        await flow.selectShippingMethod(FLATRATE);
        expect(shippingMocks.saveGuestShippingInformation).toHaveBeenCalledTimes(2);
    });
});
