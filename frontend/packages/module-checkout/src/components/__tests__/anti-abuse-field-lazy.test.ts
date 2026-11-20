// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/flow-actions.js', () => ({
    flowActions: vi.fn(),
}));

import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetCaptchaStateForTests, seedCaptchaState } from '../../store/captcha-state.js';
import { createStore, setStoreForTests } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { AntiAbuseField } from '../anti-abuse-field.js';
import '../anti-abuse-field.js';

const REQUIRED = { isRequired: true, isCaseSensitive: true, imageHeight: 50, imageWidth: 200 };

describe('the image CAPTCHA field as a chunk of its own', () => {
    beforeEach(() => {
        resetCaptchaStateForTests();
        setCheckoutConfig({
            hyperion: { captcha: { refreshUrl: 'https://store.test/captcha/refresh/', sectionUrl: '', forms: {} } },
        } as unknown as CheckoutConfig);
        setStoreForTests(createStore());
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ imgSrc: 'https://store.test/media/captcha/a.png' }) }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('is not defined until a form requires an answer, then loads and renders as a defined element', async () => {
        const el = document.createElement('hc-coupon-captcha') as AntiAbuseField;
        document.body.appendChild(el);
        await el.updateComplete;
        expect(el.children).toHaveLength(0);
        expect(customElements.get('hc-captcha')).toBeUndefined();

        seedCaptchaState({ sales_rule_coupon_request: REQUIRED });
        await el.updateComplete;
        // Never an element that is not defined yet: its methods are called once it is there.
        expect(el.querySelector('hc-captcha')).toBeNull();

        await vi.waitFor(() => { expect(el.querySelector('hc-captcha')).not.toBeNull(); });
        expect(customElements.get('hc-captcha')).toBeDefined();
        expect(el.querySelector('hc-captcha')!.getAttribute('form-id')).toBe('sales_rule_coupon_request');
    });
});
