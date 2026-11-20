// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The inline login body carries `captcha_form_id`: without it the core
// captcha plugin asks for a null form, which PHP 8.5 reports as a
// deprecation and Magento turns into an HTTP 500 (found on 2.4.9 / PHP 8.5).

import { describe, it, expect, vi } from 'vitest';

vi.mock('../client.js', () => ({
    apiFetch: vi.fn(),
    storefrontPostJson: vi.fn().mockResolvedValue({ errors: false, message: 'ok' }),
}));

import { apiFetch, storefrontPostJson } from '../client.js';
import { isEmailAvailable, loginOnStorefront, LOGIN_CAPTCHA_FORM_ID } from '../cart.js';

describe('loginOnStorefront', () => {
    it('posts the credentials with the login captcha form id', async () => {
        await loginOnStorefront({ username: 'a@example.com', password: 'secret' });

        expect(storefrontPostJson).toHaveBeenCalledWith(
            'customer/ajax/login',
            { captcha_form_id: LOGIN_CAPTCHA_FORM_ID, username: 'a@example.com', password: 'secret' },
            undefined
        );
        expect(LOGIN_CAPTCHA_FORM_ID).toBe('user_login');
    });

    it('adds the reCAPTCHA token to the body and the header', async () => {
        await loginOnStorefront({ username: 'a@example.com', password: 'secret' }, 'tok');

        expect(storefrontPostJson).toHaveBeenLastCalledWith(
            'customer/ajax/login',
            { captcha_form_id: 'user_login', username: 'a@example.com', password: 'secret', 'g-recaptcha-response': 'tok' },
            { 'g-recaptcha-response': 'tok' }
        );
    });

    it('adds the answer of the login CAPTCHA next to its form id', async () => {
        await loginOnStorefront({ username: 'a@example.com', password: 'secret' }, null, 'aaaa');

        expect(storefrontPostJson).toHaveBeenLastCalledWith(
            'customer/ajax/login',
            { captcha_form_id: 'user_login', captcha_string: 'aaaa', username: 'a@example.com', password: 'secret' },
            undefined
        );
    });
});

describe('isEmailAvailable', () => {
    it('is a lookup that may be repeated, without a signal by default', async () => {
        await isEmailAvailable({ customerEmail: 'a@example.com' });

        expect(apiFetch).toHaveBeenLastCalledWith('customers/isEmailAvailable', {
            method: 'POST',
            body: { customerEmail: 'a@example.com' },
            auth: 'none',
            idempotent: true,
        });
    });

    it('forwards the signal so a superseded check can be canceled', async () => {
        const controller = new AbortController();

        await isEmailAvailable({ customerEmail: 'a@example.com', websiteId: 1 }, { signal: controller.signal });

        expect(apiFetch).toHaveBeenLastCalledWith('customers/isEmailAvailable', {
            method: 'POST',
            body: { customerEmail: 'a@example.com', websiteId: 1 },
            auth: 'none',
            idempotent: true,
            signal: controller.signal,
        });
    });
});
