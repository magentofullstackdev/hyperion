// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flow = vi.hoisted(() => ({
    prepareOrder: vi.fn(),
    submitOrder: vi.fn(),
    cancelOrder: vi.fn(),
    confirmOrderPlaced: vi.fn(),
    savePaymentInformation: vi.fn(),
    refreshPaymentInformation: vi.fn(),
    resolveLostOrder: vi.fn(),
}));
vi.mock('../../../store/flow-actions.js', () => ({ flowActions: () => flow }));
vi.mock('../../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));

import type { PaymentElement } from '../../../../extension-api.js';
import paymentRenderers from '../../../fixtures/payment-renderers.json' with { type: 'json' };
import enUS from '../../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../../store/index.js';
import type { CheckoutConfig } from '../../../types/config.js';
import { setActiveCatalogForTests, t } from '../../../utils/i18n.js';
import { navigateTo } from '../../../utils/navigate.js';
import { CALL_TIMEOUTS } from '../../../extension/call.js';
import { renderSlotElements } from '../../../extension/slot-render.js';
import { validationRequests } from '../../../store/validation-request.js';
import { shippingExtensionView, type ShippingExtensionView } from '../../shipping-extension-view.js';
import { registerHosted, resetHostedForTests } from '../element-registry.js';
import type { PaymentEntry } from '../entries.js';
import {
    notifyOrderNotPlaced,
    paymentPipelineFor,
    placeOrderForRow,
    requestCheckoutValidation,
    resetPipelineForTests,
    runOrder,
} from '../pipeline.js';
import { patchEntry, resetPaymentRowsForTests } from '../row-state.js';

const ORIGIN = window.location.origin;
const SUCCESS = `${ORIGIN}/checkout/onepage/success/`;

const VENDOR: PaymentEntry = {
    ...(paymentRenderers[0] as unknown as PaymentEntry),
    id: 'vendor_psp',
    method: 'vendor_psp',
    pattern: null,
    tag: 'vendor-psp-card',
    builtin: null,
    moduleUrl: `${ORIGIN}/static/Vendor_Psp/js/card.js`,
    redirectHosts: ['pay.vendor-psp.example'],
};

let store: Store;
let calls: string[];

/** A payment element double, hosted for the row `vendor_psp`. */
function host(element: Partial<PaymentElement>): { element: PaymentElement; beats: Set<() => void> } {
    const beats = new Set<() => void>();
    const hosted = element as PaymentElement;
    registerHosted({ rowKey: 'vendor_psp', code: 'vendor_psp', entry: VENDOR, element: hosted, beats });
    return { element: hosted, beats };
}

describe('the order pipeline', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        setCheckoutConfig({
            defaultSuccessPageUrl: SUCCESS,
            hyperion: { paymentRenderers: [...paymentRenderers, VENDOR] },
        } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.availablePaymentMethods.set([{ code: 'vendor_psp', title: 'Vendor' }, { code: 'checkmo', title: 'Check' }]);
        store.selectedPaymentMethod.set('vendor_psp');
        patchEntry('vendor_psp', { load: 'ready' });
        calls = [];
        flow.prepareOrder.mockReset().mockImplementation(async () => { calls.push('prepare'); return { status: 'ready' }; });
        flow.submitOrder.mockReset().mockImplementation(async () => { calls.push('submit'); return 100001; });
        flow.cancelOrder.mockReset().mockImplementation(() => { calls.push('cancel'); });
        flow.confirmOrderPlaced.mockReset().mockImplementation(() => { calls.push('confirm'); });
        flow.savePaymentInformation.mockReset().mockResolvedValue(true);
        flow.resolveLostOrder.mockReset().mockResolvedValue(null);
        vi.mocked(navigateTo).mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        resetHostedForTests();
        resetPaymentRowsForTests();
        resetPipelineForTests();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('prepares, validates, collects the data on the settled quote, orders with it and continues on the success page', async () => {
        host({
            validate: vi.fn(async () => { calls.push('validate'); return true; }),
            getPaymentData: vi.fn(async () => { calls.push('data'); return { additional_data: { nonce: 'n-1' } }; }),
        });

        const result = await runOrder(null, null);

        expect(calls).toEqual(['prepare', 'validate', 'data', 'submit']);
        expect(flow.submitOrder).toHaveBeenCalledWith({ additional_data: { nonce: 'n-1' } });
        expect(result).toEqual({ status: 'done', outcome: { status: 'placed', orderId: 100001 } });
        expect(navigateTo).toHaveBeenCalledWith(SUCCESS);
    });

    it('dispatches no event of its own: the one before-place-order is the one prepareOrder sends', async () => {
        const listener = vi.fn();
        document.addEventListener('hyperion:checkout:before-place-order', listener);
        host({});
        await runOrder(null, null);
        document.removeEventListener('hyperion:checkout:before-place-order', listener);
        expect(listener).not.toHaveBeenCalled();
        expect(flow.prepareOrder).toHaveBeenCalledTimes(1);
    });

    it('stops at a closed gate without asking the element anything', async () => {
        const getPaymentData = vi.fn();
        host({ getPaymentData });
        flow.prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'agreements' });

        expect(await runOrder(null, null)).toEqual({ status: 'blocked', reason: 'agreements' });
        expect(getPaymentData).not.toHaveBeenCalled();
        expect(flow.submitOrder).not.toHaveBeenCalled();
    });

    it('asks the element to show what it misses when the gate found its own step incomplete', async () => {
        const validate = vi.fn().mockResolvedValue(false);
        host({ validate });
        flow.prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'payment-not-ready' });

        expect(await runOrder(null, null)).toEqual({ status: 'blocked', reason: 'payment-not-ready' });
        expect(validate).toHaveBeenCalledTimes(1);
    });

    it('gives the latch back when the element is not valid', async () => {
        host({ validate: () => false, getPaymentData: vi.fn() });
        expect(await runOrder(null, null)).toEqual({ status: 'blocked', reason: 'payment-not-ready' });
        expect(calls).toEqual(['prepare', 'cancel']);
    });

    it('a payment step that fails gives the latch back, shows its message and sends no order', async () => {
        const orderFailed = vi.fn();
        host({ getPaymentData: () => Promise.reject(new Error('The card was declined.')), orderFailed });

        const result = await runOrder(null, null);

        expect(calls).toEqual(['prepare', 'cancel']);
        expect(store.globalError.get()).toBe('The card was declined.');
        expect(result).toEqual({ status: 'done', outcome: { status: 'failed', message: 'The card was declined.' } });
        expect(orderFailed).not.toHaveBeenCalled();
    });

    it('does not ask for data the element handed in itself', async () => {
        const getPaymentData = vi.fn();
        host({ getPaymentData });
        await runOrder('vendor_psp', { additional_data: { wallet: 'w-1' } });
        expect(getPaymentData).not.toHaveBeenCalled();
        expect(flow.submitOrder).toHaveBeenCalledWith({ additional_data: { wallet: 'w-1' } });
    });

    it('a method that leaves the offer while its data is collected ends the attempt', async () => {
        let resolve: (value: unknown) => void = () => undefined;
        host({ getPaymentData: (signal: AbortSignal) => new Promise((done) => { resolve = done; void signal; }) as never });

        const running = runOrder(null, null);
        await vi.waitFor(() => expect(calls).toEqual(['prepare']));
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        const result = await running;
        resolve({});

        expect(calls).toEqual(['prepare', 'cancel']);
        expect(flow.submitOrder).not.toHaveBeenCalled();
        expect(store.globalError.get()).toBe(t('Hyperion_Checkout::payment_method_gone'));
        expect(result.status).toBe('done');
    });

    it('a busy report keeps a long payment step alive past the time limit', async () => {
        vi.useFakeTimers();
        const { beats } = host({ getPaymentData: () => new Promise((done) => setTimeout(() => done({}), 200000)) as never });
        const running = runOrder(null, null);
        await vi.advanceTimersByTimeAsync(100000);
        for (const beat of beats) beat();
        await vi.advanceTimersByTimeAsync(100001);
        const result = await running;
        expect(result).toEqual({ status: 'done', outcome: { status: 'placed', orderId: 100001 } });
    });

    describe('an element that places the order itself', () => {
        it('continues on a same-origin URL and keeps the latch while the browser leaves', async () => {
            host({ placeOrder: async () => ({ status: 'redirect', url: '/vendor/start' }) });
            const result = await runOrder(null, null);
            expect(navigateTo).toHaveBeenCalledWith(`${ORIGIN}/vendor/start`);
            expect(flow.cancelOrder).not.toHaveBeenCalled();
            expect(flow.submitOrder).not.toHaveBeenCalled();
            expect(result).toEqual({ status: 'done', outcome: { status: 'redirect', url: `${ORIGIN}/vendor/start` } });
        });

        it('follows a host its entry lists and refuses any other', async () => {
            host({ placeOrder: async () => ({ status: 'redirect', url: 'https://pay.vendor-psp.example/start' }) });
            await runOrder(null, null);
            expect(navigateTo).toHaveBeenCalledWith('https://pay.vendor-psp.example/start');

            vi.mocked(navigateTo).mockClear();
            const orderFailed = vi.fn();
            resetHostedForTests();
            host({ placeOrder: async () => ({ status: 'redirect', url: 'https://evil.example/' }), orderFailed });
            await runOrder(null, null);
            expect(navigateTo).not.toHaveBeenCalled();
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::unexpected_error'));
            expect(orderFailed).toHaveBeenCalledTimes(1);
        });

        it('an order placed elsewhere closes the latch for good and continues where afterPlaceOrder says', async () => {
            host({
                placeOrder: async () => ({ status: 'placed', orderId: 7 }),
                afterPlaceOrder: async (order) => ({ action: 'redirect', url: `https://pay.vendor-psp.example/3ds?o=${order.orderId}` }),
            });
            await runOrder(null, null);
            expect(flow.confirmOrderPlaced).toHaveBeenCalledTimes(1);
            expect(navigateTo).toHaveBeenCalledWith('https://pay.vendor-psp.example/3ds?o=7');
        });

        it('canceled gives the latch back without a message, failed shows its message and tells the element', async () => {
            const orderFailed = vi.fn();
            host({ placeOrder: async () => ({ status: 'canceled' }), orderFailed });
            await runOrder(null, null);
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
            expect(store.globalError.get()).toBeNull();
            expect(orderFailed).not.toHaveBeenCalled();

            resetHostedForTests();
            host({ placeOrder: async () => ({ status: 'failed', message: 'Declined by the bank.' }), orderFailed });
            await runOrder(null, null);
            expect(flow.cancelOrder).toHaveBeenCalledTimes(2);
            expect(store.globalError.get()).toBe('Declined by the bank.');
            expect(orderFailed).toHaveBeenCalledTimes(1);
        });
    });

    describe('after the order', () => {
        it('a failing afterPlaceOrder continues on the success page, never suggesting the order failed', async () => {
            host({ afterPlaceOrder: () => Promise.reject(new Error('3DS crashed')) });
            const result = await runOrder(null, null);
            expect(navigateTo).toHaveBeenCalledWith(SUCCESS);
            expect(store.globalError.get()).toBeNull();
            expect(result).toEqual({ status: 'done', outcome: { status: 'placed', orderId: 100001 } });
        });

        it('an afterPlaceOrder that does not answer in time continues on the success page', async () => {
            vi.useFakeTimers();
            host({ afterPlaceOrder: () => new Promise(() => undefined) });
            const running = runOrder(null, null);
            await vi.advanceTimersByTimeAsync(10001);
            await running;
            expect(navigateTo).toHaveBeenCalledWith(SUCCESS);
        });

        it('an order of unknown number (confirmed by the quote) skips afterPlaceOrder', async () => {
            const afterPlaceOrder = vi.fn();
            host({ afterPlaceOrder });
            flow.submitOrder.mockResolvedValue('placed-unconfirmed');
            await runOrder(null, null);
            expect(afterPlaceOrder).not.toHaveBeenCalled();
            expect(navigateTo).toHaveBeenCalledWith(SUCCESS);
        });
    });

    it('tells the element once that its order failed, also when the quote says so later', async () => {
        const orderFailed = vi.fn();
        host({ orderFailed });
        flow.submitOrder.mockResolvedValue(null);
        store.globalError.set('The order was refused.');

        const result = await runOrder(null, null);
        notifyOrderNotPlaced();

        expect(orderFailed).toHaveBeenCalledTimes(1);
        expect(orderFailed.mock.calls[0]?.[0]).toMatchObject({ kind: 'server', message: 'The order was refused.' });
        expect(result).toEqual({ status: 'done', outcome: { status: 'failed', message: 'The order was refused.' } });
    });

    it('keeps no single-use payment data in the checkout state, after a failed and after a placed order', async () => {
        host({ getPaymentData: async () => ({ additional_data: { payment_method_nonce: 'single-use-nonce' } }) });
        flow.submitOrder.mockResolvedValueOnce(null);
        await runOrder(null, null);
        flow.submitOrder.mockResolvedValueOnce(100002);
        await runOrder(null, null);

        expect(flow.submitOrder).toHaveBeenCalledWith({ additional_data: { payment_method_nonce: 'single-use-nonce' } });
        const state = Object.fromEntries(Object.entries(store).map(([key, signal]) => [key, (signal as { get(): unknown }).get()]));
        expect(JSON.stringify(state)).not.toContain('single-use-nonce');
    });

    it('waits with orderFailed while the outcome of a lost answer is unknown', async () => {
        const orderFailed = vi.fn();
        host({ orderFailed });
        flow.submitOrder.mockImplementation(async () => { store.orderOutcome.set('unknown'); return null; });

        await runOrder(null, null);
        expect(orderFailed).not.toHaveBeenCalled();

        notifyOrderNotPlaced();
        expect(orderFailed).toHaveBeenCalledTimes(1);
    });

    it('refuses an order asked by an element whose row is not the selected one', async () => {
        host({});
        store.selectedPaymentMethod.set('checkmo');
        expect(await placeOrderForRow('vendor_psp', {})).toEqual({
            status: 'failed',
            message: t('Hyperion_Checkout::checkout_incomplete_payment_method'),
        });
        expect(flow.prepareOrder).not.toHaveBeenCalled();
    });

    it('an element whose order is blocked learns why, and the checkout shows it', async () => {
        host({});
        flow.prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'shipping-method' });
        const outcome = await placeOrderForRow('vendor_psp', {});
        expect(outcome).toEqual({ status: 'failed', message: t('Hyperion_Checkout::checkout_incomplete_shipping_method') });
        expect(store.globalError.get()).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
    });

    describe('the shipping extension elements', () => {
        function view(validate: () => Promise<boolean>): void {
            shippingExtensionView.set({
                address: (editor) => editor, afterMethods: () => null, summary: () => null, holdsSave: () => false, validate,
            } as ShippingExtensionView);
        }

        afterEach(() => {
            shippingExtensionView.set(null);
        });

        it('are asked after the payment element and before the slots and the data; valid lets the order go on', async () => {
            view(async () => { calls.push('shipping'); return true; });
            host({
                validate: async () => { calls.push('validate'); return true; },
                getPaymentData: async () => { calls.push('data'); return {}; },
            });
            await runOrder(null, null);
            expect(calls).toEqual(['prepare', 'validate', 'shipping', 'data', 'submit']);
        });

        it.each<[string, () => Promise<boolean>]>([
            ['invalid', async () => false],
            ['a host that rejects', () => Promise.reject(new Error('boom'))],
        ])('%s stops the order before any request and gives the latch back', async (_label, validate) => {
            const getPaymentData = vi.fn();
            view(validate);
            host({ getPaymentData });
            expect(await runOrder(null, null)).toEqual({ status: 'blocked', reason: 'extension' });
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
            expect(getPaymentData).not.toHaveBeenCalled();
            expect(flow.submitOrder).not.toHaveBeenCalled();
        });

        it('requestCheckoutValidation() asks them too, answers what the order will find and reveals a block once', async () => {
            const validate = vi.fn(async () => false);
            view(validate);
            const before = validationRequests.get();
            expect(await requestCheckoutValidation()).toBe(false);
            expect(validate).toHaveBeenCalledTimes(1);
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
            expect(validationRequests.get()).toBe(before + 1);
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::extension_blocked'));

            validate.mockResolvedValue(true);
            expect(await requestCheckoutValidation()).toBe(true);
            expect(flow.cancelOrder).toHaveBeenCalledTimes(2);
        });

        it('a host that rejects during requestCheckoutValidation() still gives the latch back', async () => {
            view(() => Promise.reject(new Error('boom')));
            expect(await requestCheckoutValidation()).toBe(false);
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
        });

        it('with the host not loaded the step asks nothing', async () => {
            host({});
            expect(await runOrder(null, null)).toEqual({ status: 'done', outcome: { status: 'placed', orderId: 100001 } });
        });
    });

    describe('the slot elements', () => {
        let tagIndex = 0;

        /** A slot element in an outlet on the page, rendered as the slot binding renders it. */
        async function slotElement(validate?: () => boolean | Promise<boolean>): Promise<HTMLElement> {
            tagIndex += 1;
            const tag = `vendor-pipeline-slot-${tagIndex}`;
            class Slot extends HTMLElement {
                public static hyperionApi = '1';
            }
            if (validate) (Slot.prototype as unknown as { validate: typeof validate }).validate = validate;
            customElements.define(tag, Slot);
            const outlet = document.createElement('hc-slot-outlet');
            outlet.setAttribute('name', 'before-place-order');
            document.body.appendChild(outlet);
            await renderSlotElements(outlet, [{
                key: tagIndex, slot: 'before-place-order', tag, sortOrder: 0, owner: 'vendor_slot', options: {}, phrases: {}, internal: false,
            }]);
            const el = outlet.querySelector<HTMLElement>(tag);
            expect(el).not.toBeNull();
            return el as HTMLElement;
        }

        afterEach(() => {
            document.body.innerHTML = '';
        });

        it('a valid slot lets the order go on, a slot without validate() is ignored', async () => {
            const validate = vi.fn(() => { calls.push('slot'); return true; });
            await slotElement(validate);
            await slotElement();
            host({ getPaymentData: async () => { calls.push('data'); return {}; } });

            const result = await runOrder(null, null);

            expect(calls).toEqual(['prepare', 'slot', 'data', 'submit']);
            expect(result).toEqual({ status: 'done', outcome: { status: 'placed', orderId: 100001 } });
        });

        it.each<[string, () => boolean | Promise<boolean>]>([
            ['answers false', () => false],
            ['throws', () => { throw new Error('boom'); }],
            ['never answers', () => new Promise<boolean>(() => undefined)],
        ])('a slot that %s stops the order before any request and gives the latch back', async (_label, validate) => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            const getPaymentData = vi.fn();
            await slotElement(validate);
            await slotElement(() => true);
            host({ getPaymentData });

            const pending = runOrder(null, null);
            await vi.advanceTimersByTimeAsync(CALL_TIMEOUTS.validate + 1);
            const result = await pending;

            expect(result).toEqual({ status: 'blocked', reason: 'extension' });
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
            expect(getPaymentData).not.toHaveBeenCalled();
            expect(flow.submitOrder).not.toHaveBeenCalled();
        });

        it('requestCheckoutValidation() asks them, so a wallet is told before its sheet opens', async () => {
            const validate = vi.fn(() => false);
            await slotElement(validate);
            expect(await requestCheckoutValidation()).toBe(false);
            expect(validate).toHaveBeenCalledTimes(1);
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
            expect(flow.submitOrder).not.toHaveBeenCalled();
        });

        it('an element that asked for the order itself learns why it is blocked', async () => {
            await slotElement(() => false);
            host({});
            const outcome = await placeOrderForRow('vendor_psp', {});
            expect(outcome).toEqual({ status: 'failed', message: t('Hyperion_Checkout::extension_blocked') });
            expect(flow.submitOrder).not.toHaveBeenCalled();
        });
    });

    describe('data an element hands in', () => {
        it.each([['a string', 'tok_1'], ['an array', ['tok_1']], ['a number', 7]])(
            'refuses %s before the latch is taken',
            async (_label, data) => {
                host({ placeOrder: vi.fn() });
                const pipeline = paymentPipelineFor('vendor_psp', VENDOR);
                const outcome = await pipeline.placeOrder(data as never);
                expect(outcome).toEqual({ status: 'failed', message: t('Hyperion_Checkout::unexpected_error') });
                expect(flow.prepareOrder).not.toHaveBeenCalled();
                expect(flow.submitOrder).not.toHaveBeenCalled();
            }
        );

        it('null orders with empty data, without asking the element for more', async () => {
            const getPaymentData = vi.fn();
            host({ getPaymentData });
            const outcome = await paymentPipelineFor('vendor_psp', VENDOR).placeOrder(null as never);
            expect(outcome).toEqual({ status: 'placed', orderId: 100001 });
            expect(flow.submitOrder).toHaveBeenCalledWith({});
            expect(getPaymentData).not.toHaveBeenCalled();
        });
    });

    describe('a step that throws after the latch was taken', () => {
        const steps: Array<[string, () => void]> = [
            ['validate', () => host({ validate: () => { throw new Error('boom'); } })],
            ['getPaymentData', () => host({ getPaymentData: () => { throw new Error('boom'); } })],
            ['the payment data it returns', () => host({ getPaymentData: async () => 'tok_1' as never })],
            ['placeOrder of the element', () => host({ placeOrder: () => { throw new Error('boom'); } })],
            ['the order request', () => {
                host({});
                flow.submitOrder.mockImplementation(async () => { throw new Error('boom'); });
            }],
            ['the answer of the element', () => host({ placeOrder: async () => ({ get status(): never { throw new Error('boom'); } }) })],
        ];

        it.each(steps)('%s: the latch is given back and no order is sent unchecked', async (_label, arrange) => {
            arrange();
            const result = await runOrder(null, null);
            if (result.status === 'done') expect(result.outcome.status).toBe('failed');
            else expect(result).toEqual({ status: 'blocked', reason: 'payment-not-ready' });
            expect(flow.cancelOrder).toHaveBeenCalled();
            expect(navigateTo).not.toHaveBeenCalled();
        });
    });

    it('a method its entry serves is never ordered without its element', async () => {
        const result = await runOrder(null, null);
        expect(result).toEqual({ status: 'done', outcome: { status: 'failed', message: t('Hyperion_Checkout::unexpected_error') } });
        expect(flow.submitOrder).not.toHaveBeenCalled();
        expect(flow.cancelOrder).toHaveBeenCalledTimes(1);
        expect(store.globalError.get()).toBe(t('Hyperion_Checkout::unexpected_error'));
    });

    describe('an element whose own order does not answer in time', () => {
        function stalled(): { orderFailed: ReturnType<typeof vi.fn> } {
            const orderFailed = vi.fn();
            host({ placeOrder: () => new Promise(() => undefined), orderFailed });
            return { orderFailed };
        }

        it('asks the quote, and an order it finds continues on the success page', async () => {
            vi.useFakeTimers();
            stalled();
            flow.resolveLostOrder.mockResolvedValue('placed-unconfirmed');
            const pending = runOrder(null, null);
            await vi.advanceTimersByTimeAsync(CALL_TIMEOUTS.paymentData + 1);
            const result = await pending;
            expect(flow.resolveLostOrder).toHaveBeenCalledWith('unavailable');
            expect(flow.cancelOrder).not.toHaveBeenCalled();
            expect(flow.confirmOrderPlaced).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ status: 'done', outcome: { status: 'placed' } });
            expect(navigateTo).toHaveBeenCalledWith(SUCCESS);
        });

        it('no order on the quote: the latch is the recovery\'s to give back, and the element learns it failed', async () => {
            vi.useFakeTimers();
            const { orderFailed } = stalled();
            flow.resolveLostOrder.mockImplementation(async () => {
                store.globalError.set('Your order was not placed.');
                return null;
            });
            const pending = runOrder(null, null);
            await vi.advanceTimersByTimeAsync(CALL_TIMEOUTS.paymentData + 1);
            const result = await pending;
            expect(flow.resolveLostOrder).toHaveBeenCalledWith('unavailable');
            expect(flow.cancelOrder).not.toHaveBeenCalled();
            expect(result).toEqual({ status: 'done', outcome: { status: 'failed', message: 'Your order was not placed.' } });
            expect(orderFailed).toHaveBeenCalledTimes(1);
            expect(navigateTo).not.toHaveBeenCalled();
        });

        it('while the quote cannot tell, the element is not told yet', async () => {
            vi.useFakeTimers();
            const { orderFailed } = stalled();
            flow.resolveLostOrder.mockImplementation(async () => {
                store.orderOutcome.set('unknown');
                return null;
            });
            const pending = runOrder(null, null);
            await vi.advanceTimersByTimeAsync(CALL_TIMEOUTS.paymentData + 1);
            await pending;
            expect(orderFailed).not.toHaveBeenCalled();
            notifyOrderNotPlaced();
            expect(orderFailed).toHaveBeenCalledTimes(1);
        });
    });

    describe('the payment context', () => {
        it('checks the gate without announcing an order and gives the latch back', async () => {
            expect(await requestCheckoutValidation()).toBe(true);
            expect(flow.prepareOrder).toHaveBeenCalledWith({ skipPaymentReady: true, announce: false });
            expect(flow.cancelOrder).toHaveBeenCalledTimes(1);

            flow.prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'email' });
            expect(await requestCheckoutValidation()).toBe(false);
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::checkout_incomplete_email'));
        });

        it('saves the payment information with clean data, re-reads the totals and sets the payment message', async () => {
            const pipeline = paymentPipelineFor('vendor_psp', VENDOR);
            expect(await pipeline.savePaymentInformation({ additional_data: { a: 1 }, junk: 'x' } as never)).toBe(true);
            expect(flow.savePaymentInformation).toHaveBeenCalledWith({ additional_data: { a: 1 } });
            expect(await pipeline.savePaymentInformation('nope' as never)).toBe(false);

            flow.refreshPaymentInformation.mockResolvedValue(undefined);
            await pipeline.refreshTotals();
            expect(flow.refreshPaymentInformation).toHaveBeenCalledTimes(1);

            pipeline.setError('  The wallet is not available.  ');
            expect(store.globalError.get()).toBe('The wallet is not available.');
            pipeline.setError(null);
            expect(store.globalError.get()).toBeNull();
        });
    });
});
