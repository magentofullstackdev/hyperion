// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Coupon endpoint wrappers.
 *
 *   PUT    /guest-carts/:cartId/coupons/:code  (guest apply)
 *   DELETE /guest-carts/:cartId/coupons        (guest remove)
 *   PUT    /carts/mine/coupons/:code           (customer apply)
 *   DELETE /carts/mine/coupons                 (customer remove)
 *
 * Both apply endpoints return `true` on success and throw a
 * `MagentoApiError` on invalid code / expired rule / etc. The remove
 * endpoint returns `true` even when no coupon was applied, so it is marked
 * `idempotent`; applying a code is not (core counts the attempts).
 *
 * Applying a code is what Magento protects: the reCAPTCHA token of the
 * coupon form travels as `X-ReCaptcha` and the answer of the image CAPTCHA
 * `sales_rule_coupon_request` as `X-Captcha`.
 */
import { apiFetch } from './client.js';

/** The anti-abuse proof of a coupon request; an absent member sends no header. */
export interface CouponProof {
    recaptchaToken?: string;
    captcha?: string;
}

function proofHeaders(proof: CouponProof): { headers?: Record<string, string> } {
    const headers: Record<string, string> = {};
    if (proof.recaptchaToken) headers['X-ReCaptcha'] = proof.recaptchaToken;
    if (proof.captcha) headers['X-Captcha'] = proof.captcha;
    return Object.keys(headers).length > 0 ? { headers } : {};
}

export function applyGuestCoupon(
    maskedCartId: string,
    code: string,
    proof: CouponProof = {}
): Promise<boolean> {
    return apiFetch<boolean>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/coupons/${encodeURIComponent(code)}`,
        {
            method: 'PUT',
            auth: 'guest',
            ...proofHeaders(proof),
        }
    );
}

export function applyCustomerCoupon(code: string, proof: CouponProof = {}): Promise<boolean> {
    return apiFetch<boolean>(
        `carts/mine/coupons/${encodeURIComponent(code)}`,
        {
            method: 'PUT',
            auth: 'customer',
            ...proofHeaders(proof),
        }
    );
}

export function removeGuestCoupon(maskedCartId: string): Promise<boolean> {
    return apiFetch<boolean>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/coupons`,
        {
            method: 'DELETE',
            idempotent: true,
            auth: 'guest',
        }
    );
}

export function removeCustomerCoupon(): Promise<boolean> {
    return apiFetch<boolean>(
        'carts/mine/coupons',
        {
            method: 'DELETE',
            idempotent: true,
            auth: 'customer',
        }
    );
}
