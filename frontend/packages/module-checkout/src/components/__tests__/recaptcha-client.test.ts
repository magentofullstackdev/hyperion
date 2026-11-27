// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { RecaptchaConfig } from '../../types/captcha.js';
import type { CheckoutConfig } from '../../types/config.js';
import { t } from '../../utils/i18n.js';
import {
    executeRecaptcha,
    mountRecaptchaCheckbox,
    RecaptchaError,
    registerRecaptchaClient,
    resetRecaptchaClientForTests,
    unmountRecaptchaCheckbox,
    type RecaptchaClient,
} from '../recaptcha-client.js';

function configure(recaptcha?: RecaptchaConfig): void {
    setCheckoutConfig({ hyperion: recaptcha ? { recaptcha } : {} } as unknown as CheckoutConfig);
}

function fakeClient(): RecaptchaClient {
    return {
        executeRecaptcha: vi.fn().mockResolvedValue('client-token'),
        mountRecaptchaCheckbox: vi.fn().mockResolvedValue(undefined),
        unmountRecaptchaCheckbox: vi.fn(),
    };
}

describe('reCAPTCHA client access', () => {
    beforeEach(() => {
        resetRecaptchaClientForTests();
        configure();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('answers no token for an action without protection, with no client loaded', async () => {
        await expect(executeRecaptcha('place_order')).resolves.toBeNull();
    });

    it('answers no token for an unprotected action even when the client is loaded', async () => {
        const client = fakeClient();
        registerRecaptchaClient(client);
        configure({ coupon_code: { type: 'v3', siteKey: 'site-key' } });

        await expect(executeRecaptcha('place_order')).resolves.toBeNull();
        expect(client.executeRecaptcha).not.toHaveBeenCalled();
    });

    it('asks the loaded client for the token of a protected action', async () => {
        const client = fakeClient();
        registerRecaptchaClient(client);
        configure({ place_order: { type: 'v3', siteKey: 'site-key' } });

        await expect(executeRecaptcha('place_order')).resolves.toBe('client-token');
        expect(client.executeRecaptcha).toHaveBeenCalledWith('place_order');
    });

    it('refuses a protected action with the translated failure when the client never loaded', async () => {
        configure({ place_order: { type: 'v3', siteKey: 'site-key' } });

        const failure = await executeRecaptcha('place_order').catch((err: unknown) => err);

        expect(failure).toBeInstanceOf(RecaptchaError);
        expect((failure as RecaptchaError).reason).toBe('failed');
        expect((failure as RecaptchaError).message).toBe(t('Hyperion_Checkout::recaptcha_failed'));
    });

    it('mounts and unmounts the checkbox through the loaded client', async () => {
        const client = fakeClient();
        registerRecaptchaClient(client);
        const host = document.createElement('div');

        await mountRecaptchaCheckbox('coupon_code', host);
        unmountRecaptchaCheckbox('coupon_code', host);

        expect(client.mountRecaptchaCheckbox).toHaveBeenCalledWith('coupon_code', host);
        expect(client.unmountRecaptchaCheckbox).toHaveBeenCalledWith('coupon_code', host);
    });

    it('has nothing to unmount and rejects a mount while the client is not loaded', async () => {
        const host = document.createElement('div');

        expect(() => unmountRecaptchaCheckbox('coupon_code', host)).not.toThrow();
        await expect(mountRecaptchaCheckbox('coupon_code', host)).rejects.toThrow();
    });

    it('is served by the client chunk once that chunk is evaluated', async () => {
        await import('../hyperion-recaptcha.js');
        configure({ coupon_code: { type: 'v2-checkbox', siteKey: 'site-key' } });

        // A checkbox that was never placed is the client's own refusal, not the missing client's.
        const failure = await executeRecaptcha('coupon_code').catch((err: unknown) => err);

        expect(failure).toBeInstanceOf(RecaptchaError);
        expect((failure as RecaptchaError).reason).toBe('failed');
        expect(console.warn).not.toHaveBeenCalledWith('[hyperion-checkout] reCAPTCHA client not loaded');
        expect(console.warn).toHaveBeenCalledWith(
            '[hyperion-checkout] reCAPTCHA',
            expect.objectContaining({ message: 'reCAPTCHA checkbox has no place in the page' })
        );
    });
});
