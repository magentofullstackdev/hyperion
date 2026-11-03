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
 * endpoint returns `true` even when no coupon was applied.
 */
import { apiFetch } from './client.js';

export function applyGuestCoupon(
    maskedCartId: string,
    code: string
): Promise<boolean> {
    return apiFetch<boolean>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/coupons/${encodeURIComponent(code)}`,
        {
            method: 'PUT',
            auth: 'guest',
        }
    );
}

export function applyCustomerCoupon(code: string): Promise<boolean> {
    return apiFetch<boolean>(
        `carts/mine/coupons/${encodeURIComponent(code)}`,
        {
            method: 'PUT',
            auth: 'customer',
        }
    );
}

export function removeGuestCoupon(maskedCartId: string): Promise<boolean> {
    return apiFetch<boolean>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/coupons`,
        {
            method: 'DELETE',
            auth: 'guest',
        }
    );
}

export function removeCustomerCoupon(): Promise<boolean> {
    return apiFetch<boolean>(
        'carts/mine/coupons',
        {
            method: 'DELETE',
            auth: 'customer',
        }
    );
}
