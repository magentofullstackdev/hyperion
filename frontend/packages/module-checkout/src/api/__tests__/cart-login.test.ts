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

import { storefrontPostJson } from '../client.js';
import { loginOnStorefront, LOGIN_CAPTCHA_FORM_ID } from '../cart.js';

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
});
