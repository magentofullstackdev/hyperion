// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client.js', () => ({
    apiFetch: vi.fn().mockResolvedValue(true),
}));

import { apiFetch } from '../client.js';
import { applyCustomerCoupon, applyGuestCoupon, removeGuestCoupon } from '../coupon.js';

describe('coupon requests', () => {
    beforeEach(() => vi.clearAllMocks());

    it('applies a guest code without extra headers when there is no proof', async () => {
        await applyGuestCoupon('masked 1', 'SAVE/10');

        expect(apiFetch).toHaveBeenCalledWith('guest-carts/masked%201/coupons/SAVE%2F10', { method: 'PUT', auth: 'guest' });
    });

    it('sends the reCAPTCHA token as X-ReCaptcha and the CAPTCHA answer as X-Captcha', async () => {
        await applyGuestCoupon('masked-1', 'SAVE10', { recaptchaToken: 'rc-token', captcha: 'aaaa' });

        expect(apiFetch).toHaveBeenCalledWith('guest-carts/masked-1/coupons/SAVE10', {
            method: 'PUT',
            auth: 'guest',
            headers: { 'X-ReCaptcha': 'rc-token', 'X-Captcha': 'aaaa' },
        });
    });

    it('sends only the header there is a value for, for a customer too', async () => {
        await applyCustomerCoupon('SAVE10', { captcha: 'aaaa' });
        expect(apiFetch).toHaveBeenLastCalledWith('carts/mine/coupons/SAVE10', {
            method: 'PUT',
            auth: 'customer',
            headers: { 'X-Captcha': 'aaaa' },
        });

        await applyCustomerCoupon('SAVE10', { recaptchaToken: 'rc-token' });
        expect(apiFetch).toHaveBeenLastCalledWith('carts/mine/coupons/SAVE10', {
            method: 'PUT',
            auth: 'customer',
            headers: { 'X-ReCaptcha': 'rc-token' },
        });
    });

    it('removing a coupon carries no proof', async () => {
        await removeGuestCoupon('masked-1');

        expect(apiFetch).toHaveBeenCalledWith('guest-carts/masked-1/coupons', { method: 'DELETE', idempotent: true, auth: 'guest' });
    });
});
