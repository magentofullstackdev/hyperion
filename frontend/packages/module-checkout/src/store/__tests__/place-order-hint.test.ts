// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/flow-actions.js', () => ({
    flowActions: vi.fn(),
}));
vi.mock('../../store/flow-selectors.js', () => ({
    initFlowSelectors: vi.fn(),
}));

import { setCheckoutConfig } from '../../bootstrap-config.js';
import { requestCheckoutValidation } from '../../components/payment-host/pipeline.js';
import type { RecaptchaConfig } from '../../types/captcha.js';
import type { CheckoutConfig } from '../../types/config.js';
import { t } from '../../utils/i18n.js';
import {
    resetCaptchaStateForTests,
    seedCaptchaState,
    setCaptchaAnswer,
    setRecaptchaCheckboxToken,
} from '../captcha-state.js';
import { flowActions } from '../flow-actions.js';
import { initFlowSelectors } from '../flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { placeOrderBlocker, placeOrderHint } from '../place-order-hint.js';
import type { createSelectors } from '../selectors.js';

type Selectors = ReturnType<typeof createSelectors>;

/** What an element that owns Place Order reads before its wallet opens (`snapshot().blocker`). */
function getCheckoutBlocker(): string | null {
    return placeOrderHint(store, initFlowSelectors(), { skipPaymentReady: true });
}

let store: Store;

const REQUIRED = { isRequired: true, isCaseSensitive: false, imageHeight: 50, imageWidth: 200 };

/** Selectors of a checkout where everything the shopper supplies is there, except what a test turns off. */
function selectorsWith(off: Partial<Record<keyof Selectors, boolean>> = {}): Selectors {
    const names: Array<keyof Selectors> = [
        'emailValid', 'shippingAddressValid', 'billingAddressValid', 'billingReady', 'shippingMethodSelected',
        'shippingReady', 'paymentMethodSelected', 'paymentMethodReady', 'agreementsAccepted',
        'canPlaceOrderIgnoringLatch', 'canPlaceOrder',
    ];
    return Object.fromEntries(names.map((name) => [name, { get: () => off[name] ?? true }])) as unknown as Selectors;
}

function configure(recaptcha?: RecaptchaConfig): void {
    setCheckoutConfig({ hyperion: recaptcha ? { recaptcha } : {} } as unknown as CheckoutConfig);
}

describe('security checks in the place order hint', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        resetCaptchaStateForTests();
        configure();
        store = createStore();
        setStoreForTests(store);
        store.selectedPaymentMethod.set('checkmo');
        store.totals.set({ grand_total: 10 } as never);
        vi.mocked(initFlowSelectors).mockReturnValue(selectorsWith());
    });

    it('nothing is missing without a required form or a checkbox', () => {
        expect(placeOrderBlocker(store, selectorsWith())).toBeNull();
        expect(getCheckoutBlocker()).toBeNull();
    });

    it('asks for the security code while the order form requires one', () => {
        seedCaptchaState({ payment_processing_request: REQUIRED });

        expect(placeOrderBlocker(store, selectorsWith())).toBe('captcha');
        expect(placeOrderHint(store, selectorsWith())).toBe('Enter the security code before paying.');

        setCaptchaAnswer('payment_processing_request', 'aaaa');
        expect(placeOrderHint(store, selectorsWith())).toBeNull();
    });

    it('asks for the tick of a visible reCAPTCHA checkbox', () => {
        configure({ place_order: { type: 'v2-checkbox', siteKey: 'key-order' } });

        expect(placeOrderBlocker(store, selectorsWith())).toBe('recaptcha');
        expect(placeOrderHint(store, selectorsWith())).toBe('Please confirm you are not a robot.');

        setRecaptchaCheckboxToken('place_order', 'ticked');
        expect(placeOrderHint(store, selectorsWith())).toBeNull();
    });

    it('the security code comes before the checkbox, and both after the agreements', () => {
        configure({ place_order: { type: 'v2-checkbox', siteKey: 'key-order' } });
        seedCaptchaState({ payment_processing_request: REQUIRED });

        expect(placeOrderBlocker(store, selectorsWith({ agreementsAccepted: false }))).toBe('agreements');
        expect(placeOrderBlocker(store, selectorsWith())).toBe('captcha');

        setCaptchaAnswer('payment_processing_request', 'aaaa');
        expect(placeOrderBlocker(store, selectorsWith())).toBe('recaptcha');
    });

    it('comes before the totals and the minimum order amount', () => {
        seedCaptchaState({ payment_processing_request: REQUIRED });
        store.minimumOrderError.set('Minimum order amount is 50.');

        expect(placeOrderBlocker(store, selectorsWith())).toBe('captcha');
    });

    describe('for a renderer that owns Place Order', () => {
        it('the gate asks for the security code before the wallet opens', () => {
            seedCaptchaState({ payment_processing_request: REQUIRED });

            expect(getCheckoutBlocker()).toBe(t('Hyperion_Checkout::checkout_incomplete_captcha'));

            setCaptchaAnswer('payment_processing_request', 'aaaa');
            expect(getCheckoutBlocker()).toBeNull();
        });

        it('the gate asks for the checkbox too', () => {
            configure({ place_order: { type: 'v2-checkbox', siteKey: 'key-order' } });

            expect(getCheckoutBlocker()).toBe(t('Hyperion_Checkout::recaptcha_required'));
        });

        it('the awaited gate names the security code a prepared order is blocked by', async () => {
            vi.mocked(flowActions).mockReturnValue({
                prepareOrder: vi.fn().mockResolvedValue({ status: 'blocked', reason: 'captcha' }),
                cancelOrder: vi.fn(),
            } as never);

            expect(await requestCheckoutValidation()).toBe(false);
            expect(store.globalError.get()).toBe('Enter the security code before paying.');
        });
    });
});
