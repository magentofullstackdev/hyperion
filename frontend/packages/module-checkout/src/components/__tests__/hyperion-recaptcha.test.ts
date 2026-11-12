// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import { executeRecaptcha, resetRecaptchaLoaderForTests } from '../hyperion-recaptcha.js';

function scripts(): HTMLScriptElement[] {
    return Array.from(document.head.querySelectorAll<HTMLScriptElement>('script[src*="recaptcha/api.js"]'));
}

describe('checkout reCAPTCHA loader', () => {
    beforeEach(() => {
        resetRecaptchaLoaderForTests();
        setCheckoutConfig({
            recaptcha_for_place_order: { rendering: { sitekey: 'site-key-fixture' } },
        } as unknown as CheckoutConfig);
    });

    afterEach(() => {
        scripts().forEach((script) => script.remove());
        delete window.grecaptcha;
        resetRecaptchaLoaderForTests();
    });

    it('resolves to null without loading anything when the form is not protected', async () => {
        setCheckoutConfig({} as unknown as CheckoutConfig);

        await expect(executeRecaptcha('place_order')).resolves.toBeNull();
        expect(scripts()).toHaveLength(0);
    });

    it('a failed load rejects once and is not remembered: the next call loads the script again', async () => {
        const first = executeRecaptcha('place_order');
        expect(scripts()).toHaveLength(1);
        scripts()[0]!.dispatchEvent(new Event('error'));
        await expect(first).rejects.toThrow('Failed to load reCAPTCHA script');
        expect(scripts()).toHaveLength(0);

        const second = executeRecaptcha('place_order');
        expect(scripts()).toHaveLength(1);
        const execute = vi.fn().mockResolvedValue('token-fixture');
        window.grecaptcha = { ready: (cb) => cb(), execute };
        scripts()[0]!.dispatchEvent(new Event('load'));

        await expect(second).resolves.toBe('token-fixture');
        expect(execute).toHaveBeenCalledWith('site-key-fixture', { action: 'place_order' });
    });

    it('a loaded script is requested once for every later token', async () => {
        const execute = vi.fn().mockResolvedValue('token-fixture');
        const first = executeRecaptcha('place_order');
        window.grecaptcha = { ready: (cb) => cb(), execute };
        scripts()[0]!.dispatchEvent(new Event('load'));
        await first;

        await executeRecaptcha('place_order');

        expect(scripts()).toHaveLength(1);
        expect(execute).toHaveBeenCalledTimes(2);
    });
});
