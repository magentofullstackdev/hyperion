// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/flow-actions.js', () => ({
    flowActions: vi.fn(),
}));
vi.mock('../recaptcha-client.js', () => ({
    mountRecaptchaCheckbox: vi.fn().mockResolvedValue(undefined),
    unmountRecaptchaCheckbox: vi.fn(),
}));

import { setCheckoutConfig } from '../../bootstrap-config.js';
import {
    captchaError,
    focusCaptchaField,
    resetCaptchaStateForTests,
    seedCaptchaState,
    setCaptchaError,
    spendCaptchaAnswer,
} from '../../store/captcha-state.js';
import { flowActions } from '../../store/flow-actions.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { RecaptchaConfig } from '../../types/captcha.js';
import type { CheckoutConfig } from '../../types/config.js';
import { patchEntry } from '../payment-host/row-state.js';
import paymentRenderers from '../../fixtures/payment-renderers.json' with { type: 'json' };
import { resetInteractionForTests, type AntiAbuseField } from '../anti-abuse-field.js';
// The page defines the field before the mount when a form requires it from the start.
import '../captcha-field.js';
import type { CaptchaField } from '../captcha-field.js';
import type { CouponForm } from '../coupon-form.js';
import '../coupon-form.js';
import { mountRecaptchaCheckbox, unmountRecaptchaCheckbox } from '../recaptcha-client.js';

const REQUIRED = { isRequired: true, isCaseSensitive: true, imageHeight: 50, imageWidth: 200 };
const REFRESH_URL = 'https://store.test/captcha/refresh/';

function configure(recaptcha?: RecaptchaConfig): void {
    setCheckoutConfig({
        hyperion: {
            paymentRenderers,
            captcha: { refreshUrl: REFRESH_URL, sectionUrl: '', forms: {} },
            ...(recaptcha ? { recaptcha } : {}),
        },
    } as unknown as CheckoutConfig);
}

async function place<T extends AntiAbuseField>(tag: string): Promise<T> {
    const el = document.createElement(tag) as T;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

function type(field: CaptchaField, value: string): void {
    const input = field.querySelector<HTMLInputElement>('[data-hyperion-captcha-input]')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('security check elements', () => {
    let store: Store;

    beforeEach(() => {
        vi.clearAllMocks();
        resetCaptchaStateForTests();
        resetInteractionForTests();
        configure();
        store = createStore();
        setStoreForTests(store);
        // The image request of a rendered field.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ imgSrc: 'https://store.test/media/captcha/a.png' }) }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it.each(['hc-login-captcha', 'hc-coupon-captcha', 'hc-order-captcha'])(
        '<%s> renders nothing while its form requires no answer and no checkbox is configured',
        async (tag) => {
            const el = await place(tag);

            expect(el.children).toHaveLength(0);
            expect(mountRecaptchaCheckbox).not.toHaveBeenCalled();
        }
    );

    it.each([
        ['hc-login-captcha', 'user_login'],
        ['hc-coupon-captcha', 'sales_rule_coupon_request'],
        ['hc-order-captcha', 'payment_processing_request'],
    ] as const)('<%s> renders the field of %s when Magento requires an answer', async (tag, formId) => {
        seedCaptchaState({ [formId]: REQUIRED });

        const el = await place(tag);

        const field = el.querySelector<CaptchaField>('hc-captcha')!;
        expect(field.getAttribute('form-id')).toBe(formId);
        expect(field.getAttribute('refresh-url')).toBe(REFRESH_URL);
        expect(field.getAttribute('image-width')).toBe('200');
        expect(field.getAttribute('image-height')).toBe('50');
        expect(field.hasAttribute('case-sensitive')).toBe(true);
        expect(field.getAttribute('label')).toBe('Please type the letters and numbers below');
        expect(field.getAttribute('reload-label')).toBe('Reload captcha');
        expect(field.getAttribute('case-note')).toBe('The code is case sensitive.');
    });

    it('appears when the form starts to require an answer', async () => {
        const el = await place('hc-login-captcha');
        expect(el.querySelector('hc-captcha')).toBeNull();

        seedCaptchaState({ user_login: REQUIRED });
        await el.updateComplete;
        await el.updateComplete;

        expect(el.querySelector('hc-captcha')).not.toBeNull();
    });

    it('keeps the typed answer in the store and drops the message of the refused one', async () => {
        seedCaptchaState({ payment_processing_request: REQUIRED });
        const el = await place('hc-order-captcha');
        const field = el.querySelector<CaptchaField>('hc-captcha')!;
        await field.updateComplete;
        setCaptchaError('payment_processing_request', 'Incorrect CAPTCHA');
        await el.updateComplete;
        expect(field.getAttribute('error')).toBe('Incorrect CAPTCHA');

        type(field, 'aaaa');

        expect(store.captcha.get().payment_processing_request?.value).toBe('aaaa');
        expect(captchaError('payment_processing_request')).toBeNull();
    });

    it('hands its field to the flow: a spent answer asks for a new image, a missing one takes the focus', async () => {
        seedCaptchaState({ payment_processing_request: REQUIRED });
        const el = await place('hc-order-captcha');
        const field = el.querySelector<CaptchaField>('hc-captcha')!;
        await field.updateComplete;
        const refresh = vi.spyOn(field, 'refresh').mockResolvedValue(true);

        spendCaptchaAnswer('payment_processing_request');
        focusCaptchaField('payment_processing_request');

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(field.querySelector('[data-hyperion-captcha-input]'));

        el.remove();
        spendCaptchaAnswer('payment_processing_request');
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    describe('visible reCAPTCHA checkbox', () => {
        it('reserves the box at once and mounts the widget only after the first interaction with the page', async () => {
            configure({ customer_login: { type: 'v2-checkbox', siteKey: 'key-login' } });

            const el = await place('hc-login-captcha');

            const box = el.querySelector<HTMLElement>('[data-hc-recaptcha-checkbox]')!;
            expect(box.className).toContain('min-h-[78px]');
            expect(mountRecaptchaCheckbox).not.toHaveBeenCalled();

            document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            expect(mountRecaptchaCheckbox).toHaveBeenCalledTimes(1);
            expect(mountRecaptchaCheckbox).toHaveBeenCalledWith('customer_login', box);
        });

        it('mounts at once in a form that opens after the shopper already interacted', async () => {
            configure({ coupon_code: { type: 'v2-checkbox', siteKey: 'key-coupon' } });
            document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
            await place('hc-login-captcha');

            const el = await place('hc-coupon-captcha');

            expect(mountRecaptchaCheckbox).toHaveBeenCalledTimes(1);
            expect(mountRecaptchaCheckbox).toHaveBeenCalledWith('coupon_code', el.querySelector('[data-hc-recaptcha-checkbox]'));
        });

        it('renders no box for an invisible type', async () => {
            configure({ coupon_code: { type: 'v3', siteKey: 'key-coupon' } });

            const el = await place('hc-coupon-captcha');

            expect(el.children).toHaveLength(0);
        });

        it('gives the widget back when the form closes, also before it was mounted', async () => {
            configure({ customer_login: { type: 'v2-checkbox', siteKey: 'key-login' } });
            const el = await place('hc-login-captcha');
            const box = el.querySelector<HTMLElement>('[data-hc-recaptcha-checkbox]')!;

            el.remove();
            document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

            expect(unmountRecaptchaCheckbox).toHaveBeenCalledWith('customer_login', box);
            expect(mountRecaptchaCheckbox).not.toHaveBeenCalled();
        });

        it('the order box follows the action of the selected payment method with a fresh element', async () => {
            configure({
                place_order: { type: 'v2-checkbox', siteKey: 'key-order' },
                braintree: { type: 'v2-checkbox', siteKey: 'key-braintree' },
            });
            // What the element classes of the two entries answer once loaded.
            patchEntry('braintree_card', { load: 'ready', recaptchaAction: () => 'braintree' });
            patchEntry('braintree_paypal', { load: 'ready', recaptchaAction: () => null });
            document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
            store.selectedPaymentMethod.set('checkmo');
            const el = await place('hc-order-captcha');
            const first = el.querySelector<HTMLElement>('[data-hc-recaptcha-checkbox]')!;
            expect(mountRecaptchaCheckbox).toHaveBeenLastCalledWith('place_order', first);

            store.selectedPaymentMethod.set('braintree');
            await el.updateComplete;
            await el.updateComplete;

            const second = el.querySelector<HTMLElement>('[data-hc-recaptcha-checkbox]')!;
            expect(second).not.toBe(first);
            expect(unmountRecaptchaCheckbox).toHaveBeenCalledWith('place_order', first);
            expect(mountRecaptchaCheckbox).toHaveBeenLastCalledWith('braintree', second);

            store.selectedPaymentMethod.set('braintree_paypal');
            await el.updateComplete;
            await el.updateComplete;

            expect(el.querySelector('[data-hc-recaptcha-checkbox]')).toBeNull();
            expect(unmountRecaptchaCheckbox).toHaveBeenCalledWith('braintree', second);
        });
    });

    describe('coupon form', () => {
        async function openForm(): Promise<CouponForm> {
            const form = document.createElement('coupon-form');
            document.body.appendChild(form);
            await form.updateComplete;
            form.querySelector<HTMLButtonElement>('button')!.click();
            await form.updateComplete;
            return form;
        }

        async function apply(form: CouponForm, code: string): Promise<void> {
            form.querySelector('hc-text-input')!.dispatchEvent(new CustomEvent('value-change', { detail: { value: code } }));
            await form.updateComplete;
            form.querySelector('hc-button')!.dispatchEvent(new Event('click'));
            await form.updateComplete;
        }

        it('carries the security check of the coupon inside the open form', async () => {
            const form = await openForm();

            expect(form.querySelector('hc-coupon-captcha')).not.toBeNull();
            expect(form.querySelector('hc-captcha')).toBeNull();
        });

        it('asks for the answer of a required form before the code is sent', async () => {
            seedCaptchaState({ sales_rule_coupon_request: REQUIRED });
            const applyCoupon = vi.fn().mockResolvedValue(true);
            vi.mocked(flowActions).mockReturnValue({ applyCoupon } as never);
            const form = await openForm();

            await apply(form, 'SAVE10');

            expect(applyCoupon).not.toHaveBeenCalled();
            expect(captchaError('sales_rule_coupon_request')).toBe('This is a required field.');
        });

        it('sends the code once the answer is there', async () => {
            seedCaptchaState({ sales_rule_coupon_request: { ...REQUIRED, value: 'aaaa' } });
            const applyCoupon = vi.fn().mockResolvedValue(false);
            vi.mocked(flowActions).mockReturnValue({ applyCoupon } as never);
            const form = await openForm();

            await apply(form, ' SAVE10 ');

            expect(applyCoupon).toHaveBeenCalledWith('SAVE10');
        });

        it('shows a refused answer next to the CAPTCHA field, not under the code', async () => {
            seedCaptchaState({ sales_rule_coupon_request: REQUIRED });
            const form = await openForm();
            store.couponError.set('Incorrect CAPTCHA');
            setCaptchaError('sales_rule_coupon_request', 'Incorrect CAPTCHA');
            await form.updateComplete;
            await form.querySelector<AntiAbuseField>('hc-coupon-captcha')!.updateComplete;

            expect(form.querySelector('hc-captcha')!.getAttribute('error')).toBe('Incorrect CAPTCHA');
            expect((form.querySelector('hc-text-input') as unknown as { error: string }).error).toBe('');
        });
    });
});
