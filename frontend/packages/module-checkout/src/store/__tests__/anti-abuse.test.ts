// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../api/captcha.js', () => ({
    loadCaptchaState: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../components/recaptcha-client.js', () => ({
    executeRecaptcha: vi.fn(),
}));

import { loadCaptchaState } from '../../api/captcha.js';
import { MagentoApiError } from '../../api/client.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { executeRecaptcha } from '../../components/recaptcha-client.js';
import { patchEntry, resetPaymentRowsForTests } from '../../components/payment-host/row-state.js';
import paymentRenderers from '../../fixtures/payment-renderers.json' with { type: 'json' };
import type { RecaptchaAction, RecaptchaConfig } from '../../types/captcha.js';
import type { CheckoutConfig } from '../../types/config.js';
import {
    antiAbuseBlocker,
    antiAbuseProof,
    orderRecaptchaAction,
    sendWithAntiAbuse,
} from '../anti-abuse.js';
import {
    attachCaptchaField,
    captchaError,
    resetCaptchaStateForTests,
    seedCaptchaState,
    setCaptchaAnswer,
    setCaptchaError,
    setRecaptchaCheckboxToken,
} from '../captcha-state.js';
import { createStore, setStoreForTests, type Store } from '../index.js';

const REQUIRED = { isRequired: true, isCaseSensitive: false, imageHeight: 50, imageWidth: 200 };

function configure(recaptcha?: RecaptchaConfig): void {
    setCheckoutConfig({ hyperion: { paymentRenderers, ...(recaptcha ? { recaptcha } : {}) } } as unknown as CheckoutConfig);
}

// What the element classes of the shipped entries answer once loaded: the
// card follows the configuration, the wallets and stored tokens of the same
// gateway send no token, every other method says nothing.
function registerRenderers(): void {
    resetPaymentRowsForTests();
    patchEntry('braintree_card', {
        load: 'ready',
        recaptchaAction: () => (configuredBraintree ? 'braintree' : 'place_order'),
    });
    for (const id of ['braintree_paypal', 'braintree_googlepay', 'braintree_vault']) {
        patchEntry(id, { load: 'ready', recaptchaAction: () => null });
    }
    patchEntry('offline', { load: 'ready' });
}

let configuredBraintree = false;

describe('anti-abuse proof', () => {
    let store: Store;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(executeRecaptcha).mockImplementation(async (action: RecaptchaAction) => `token-${action}`);
        resetCaptchaStateForTests();
        configure();
        configuredBraintree = false;
        store = createStore();
        setStoreForTests(store);
        registerRenderers();
    });

    describe('reCAPTCHA action of the order', () => {
        it.each([
            ['checkmo', 'place_order'],
            ['unknown_gateway', 'place_order'],
            ['braintree', 'place_order'],
            ['braintree_paypal', null],
            ['braintree_googlepay', null],
            ['braintree_cc_vault', null],
        ] as const)('%s is protected by %s', (method, action) => {
            store.selectedPaymentMethod.set(method);

            expect(orderRecaptchaAction(store)).toBe(action);
        });

        it('a Braintree card order is protected by the Braintree form when one is configured', () => {
            configuredBraintree = true;
            store.selectedPaymentMethod.set('braintree');

            expect(orderRecaptchaAction(store)).toBe('braintree');
        });

        it('the token of the action travels as X-ReCaptcha on the order request', async () => {
            store.selectedPaymentMethod.set('checkmo');
            expect((await antiAbuseProof(store, { purpose: 'order' })).headers).toEqual({ 'X-ReCaptcha': 'token-place_order' });

            configuredBraintree = true;
            store.selectedPaymentMethod.set('braintree');
            expect((await antiAbuseProof(store, { purpose: 'order' })).headers).toEqual({ 'X-ReCaptcha': 'token-braintree' });
        });

        it('a method without protection asks for no token and sends no header', async () => {
            store.selectedPaymentMethod.set('braintree_paypal');

            expect((await antiAbuseProof(store, { purpose: 'order' })).headers).toEqual({});
            expect(executeRecaptcha).not.toHaveBeenCalled();
        });

        it('an action that is not configured resolves to no header', async () => {
            vi.mocked(executeRecaptcha).mockResolvedValue(null);
            store.selectedPaymentMethod.set('checkmo');

            expect((await antiAbuseProof(store, { purpose: 'order' })).headers).toEqual({});
        });
    });

    describe('carriers per request', () => {
        beforeEach(() => {
            seedCaptchaState({ payment_processing_request: REQUIRED, sales_rule_coupon_request: REQUIRED });
            setCaptchaAnswer('payment_processing_request', 'order-word');
            setCaptchaAnswer('sales_rule_coupon_request', 'coupon-word');
            store.selectedPaymentMethod.set('checkmo');
        });

        it('the order request carries the token and the answer of the order form', async () => {
            expect((await antiAbuseProof(store, { purpose: 'order' })).headers).toEqual({
                'X-ReCaptcha': 'token-place_order',
                'X-Captcha': 'order-word',
            });
        });

        it('set-payment-information carries the answer and never a reCAPTCHA token', async () => {
            expect((await antiAbuseProof(store, { purpose: 'payment-method' })).headers).toEqual({ 'X-Captcha': 'order-word' });
            expect(executeRecaptcha).not.toHaveBeenCalled();
        });

        it('the coupon request carries the coupon token and the answer of the coupon form', async () => {
            expect(await antiAbuseProof(store, { purpose: 'coupon' })).toEqual({
                recaptchaToken: 'token-coupon_code',
                captcha: 'coupon-word',
                headers: { 'X-ReCaptcha': 'token-coupon_code', 'X-Captcha': 'coupon-word' },
            });
        });

        it('an answer typed for a form that no longer requires one is not sent', async () => {
            seedCaptchaState({ payment_processing_request: { ...REQUIRED, isRequired: false, value: 'stale' } });

            expect((await antiAbuseProof(store, { purpose: 'payment-method' })).headers).toEqual({});
        });
    });

    describe('sending', () => {
        let refresh: Mock<() => Promise<boolean>>;

        beforeEach(() => {
            store.selectedPaymentMethod.set('checkmo');
            refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
        });

        it('hands the proof to the request and returns its answer', async () => {
            const send = vi.fn().mockResolvedValue(42);

            expect(await sendWithAntiAbuse(store, 'order', send)).toBe(42);
            expect(send).toHaveBeenCalledWith({
                recaptchaToken: 'token-place_order',
                headers: { 'X-ReCaptcha': 'token-place_order' },
            });
        });

        it('sends nothing when the security check cannot be completed', async () => {
            vi.mocked(executeRecaptcha).mockRejectedValue(new Error('The security check could not be completed.'));
            const send = vi.fn();

            await expect(sendWithAntiAbuse(store, 'order', send)).rejects.toThrow('The security check could not be completed.');
            expect(send).not.toHaveBeenCalled();
        });

        it('a refused answer of the order goes next to its field, is forgotten, and the image and the state are renewed', async () => {
            seedCaptchaState({ payment_processing_request: REQUIRED });
            setCaptchaAnswer('payment_processing_request', 'wrong');
            attachCaptchaField('payment_processing_request', { refresh, focus: vi.fn() });
            const refusal = new MagentoApiError(400, '400', 'Incorrect CAPTCHA');

            await expect(sendWithAntiAbuse(store, 'order', () => Promise.reject(refusal))).rejects.toBe(refusal);

            expect(captchaError('payment_processing_request')).toBe('Incorrect CAPTCHA');
            expect(store.captcha.get().payment_processing_request?.value).toBe('');
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(loadCaptchaState).toHaveBeenCalledTimes(1);
        });

        it('any other failure of a request that carried an answer still spends it', async () => {
            seedCaptchaState({ payment_processing_request: REQUIRED });
            setCaptchaAnswer('payment_processing_request', 'right');
            attachCaptchaField('payment_processing_request', { refresh, focus: vi.fn() });
            setCaptchaError('payment_processing_request', 'Incorrect CAPTCHA');

            await expect(sendWithAntiAbuse(store, 'order', () => Promise.reject(new MagentoApiError(400, '400', 'The card was declined.'))))
                .rejects.toThrow('The card was declined.');

            expect(captchaError('payment_processing_request')).toBeNull();
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(loadCaptchaState).toHaveBeenCalledTimes(1);
        });

        it('a wrong answer on a coupon request, refused behind the coupon prefix, is the error of the CAPTCHA field', async () => {
            seedCaptchaState({ sales_rule_coupon_request: REQUIRED });
            setCaptchaAnswer('sales_rule_coupon_request', 'wrong');
            attachCaptchaField('sales_rule_coupon_request', { refresh, focus: vi.fn() });
            const refusal = new MagentoApiError(400, '400', "The coupon code couldn't be applied: Incorrect CAPTCHA");

            await expect(sendWithAntiAbuse(store, 'coupon', () => Promise.reject(refusal))).rejects.toBe(refusal);

            expect(captchaError('sales_rule_coupon_request')).toBe('Incorrect CAPTCHA');
            expect(store.captcha.get().sales_rule_coupon_request?.value).toBe('');
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(loadCaptchaState).toHaveBeenCalledTimes(1);
        });

        it('a coupon refused for too many attempts reads the state again so the field can appear', async () => {
            const refusal = new MagentoApiError(400, '400', 'Too many coupon code requests, please try again later.');

            await expect(sendWithAntiAbuse(store, 'coupon', () => Promise.reject(refusal))).rejects.toBe(refusal);

            expect(captchaError('sales_rule_coupon_request')).toBe('Too many coupon code requests, please try again later.');
            expect(loadCaptchaState).toHaveBeenCalledTimes(1);
            expect(refresh).not.toHaveBeenCalled();
        });

        it('an applied coupon that carried an answer gets a new image for the next code', async () => {
            seedCaptchaState({ sales_rule_coupon_request: REQUIRED });
            setCaptchaAnswer('sales_rule_coupon_request', 'right');
            attachCaptchaField('sales_rule_coupon_request', { refresh, focus: vi.fn() });

            expect(await sendWithAntiAbuse(store, 'coupon', () => Promise.resolve(true))).toBe(true);

            expect(refresh).toHaveBeenCalledTimes(1);
            expect(store.captcha.get().sales_rule_coupon_request?.value).toBe('');
        });

        it('a canceled request changes nothing', async () => {
            seedCaptchaState({ sales_rule_coupon_request: REQUIRED });
            setCaptchaAnswer('sales_rule_coupon_request', 'right');
            attachCaptchaField('sales_rule_coupon_request', { refresh, focus: vi.fn() });
            const aborted = new DOMException('Aborted', 'AbortError');

            await expect(sendWithAntiAbuse(store, 'coupon', () => Promise.reject(aborted))).rejects.toBe(aborted);

            expect(refresh).not.toHaveBeenCalled();
            expect(loadCaptchaState).not.toHaveBeenCalled();
        });

        it('set-payment-information leaves the answer of the order form alone', async () => {
            seedCaptchaState({ payment_processing_request: REQUIRED });
            setCaptchaAnswer('payment_processing_request', 'right');
            attachCaptchaField('payment_processing_request', { refresh, focus: vi.fn() });

            await expect(sendWithAntiAbuse(store, 'payment-method', () => Promise.reject(new Error('refused')))).rejects.toThrow('refused');
            await sendWithAntiAbuse(store, 'payment-method', () => Promise.resolve(true));

            expect(store.captcha.get().payment_processing_request?.value).toBe('right');
            expect(refresh).not.toHaveBeenCalled();
            expect(loadCaptchaState).not.toHaveBeenCalled();
        });
    });

    describe('what the shopper still has to supply', () => {
        beforeEach(() => store.selectedPaymentMethod.set('checkmo'));

        it('nothing when no form requires an answer and no checkbox is configured', () => {
            expect(antiAbuseBlocker(store)).toBeNull();
        });

        it('the answer of the order form while it is required and empty', () => {
            seedCaptchaState({ payment_processing_request: REQUIRED });
            expect(antiAbuseBlocker(store)).toBe('captcha');

            setCaptchaAnswer('payment_processing_request', '   ');
            expect(antiAbuseBlocker(store)).toBe('captcha');

            setCaptchaAnswer('payment_processing_request', 'aaaa');
            expect(antiAbuseBlocker(store)).toBeNull();
        });

        it('the tick of the checkbox of the action that protects the selected method', () => {
            configure({
                place_order: { type: 'v2-checkbox', siteKey: 'key-order' },
                braintree: { type: 'v3', siteKey: 'key-braintree' },
            });
            expect(antiAbuseBlocker(store)).toBe('recaptcha');

            setRecaptchaCheckboxToken('place_order', 'ticked');
            expect(antiAbuseBlocker(store)).toBeNull();

            setRecaptchaCheckboxToken('place_order', '');
            store.selectedPaymentMethod.set('braintree_paypal');
            expect(antiAbuseBlocker(store)).toBeNull();

            configuredBraintree = true;
            store.selectedPaymentMethod.set('braintree');
            expect(antiAbuseBlocker(store)).toBeNull();
        });

        it('an invisible type never holds the order back', () => {
            configure({ place_order: { type: 'v2-invisible', siteKey: 'key-order' } });

            expect(antiAbuseBlocker(store)).toBeNull();
        });
    });
});
