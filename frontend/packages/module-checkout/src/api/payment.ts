// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Payment / place-order endpoint wrappers.
 *
 *   POST /guest-carts/:cartId/payment-information  (guest)
 *   POST /carts/mine/payment-information           (customer)
 *
 * The response is a bare numeric order ID (Magento convention).
 *
 *   POST /guest-carts/:cartId/set-payment-information  (guest)
 *   POST /carts/mine/set-payment-information           (customer)
 *
 * Same body, but the payment method and billing address are only saved
 * on the quote: when the shopper selects a method (so the totals follow a
 * cart rule that depends on it), and for methods whose order is placed by
 * the gateway's own controllers afterwards (PayPal Express).
 *
 * The saves that put the same state on the quote whenever they are sent
 * (billing-address, set-payment-information) are marked `idempotent`.
 */
import { apiFetch } from './client.js';
import type { AddressRequestPayload } from '../types/address.js';
import type { PaymentInformationRequest } from '../types/payment.js';
import type { PaymentDetails } from '../types/shipping.js';

/**
 * How long the order request may wait for its answer. Past it the request
 * is given up and the quote is read to learn whether the order exists.
 */
export const PLACE_ORDER_TIMEOUT_MS = 60000;

/**
 * GET payment-information: the payment methods available for the quote as
 * it is now, together with its totals (`PaymentDetailsInterface`). Read
 * again whenever something changed the quote outside the shipping step
 * (coupon, billing address) so the method list and the selection follow
 * the totals (the `free` method exists only at a zero grand total).
 */
export function getGuestPaymentInformation(maskedCartId: string): Promise<PaymentDetails> {
    return apiFetch<PaymentDetails>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/payment-information`,
        { auth: 'guest' }
    );
}

export function getCustomerPaymentInformation(): Promise<PaymentDetails> {
    return apiFetch<PaymentDetails>('carts/mine/payment-information', { auth: 'customer' });
}

export interface BillingAddressRequest {
    address: AddressRequestPayload;
    useForShipping?: boolean;
}

/**
 * POST billing-address (`BillingAddressManagementInterface::assign`): puts
 * the billing address on the quote and recollects its totals, so taxes and
 * payment availability computed from the billing address are current before
 * the order is placed. Returns the quote address id.
 */
export function assignGuestBillingAddress(maskedCartId: string, req: BillingAddressRequest): Promise<number> {
    return apiFetch<number>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/billing-address`,
        { method: 'POST', body: req, auth: 'guest', idempotent: true }
    );
}

export function assignCustomerBillingAddress(req: BillingAddressRequest): Promise<number> {
    return apiFetch<number>('carts/mine/billing-address', { method: 'POST', body: req, auth: 'customer', idempotent: true });
}

/**
 * The order id of a payment-information answer as a number. Some platform
 * versions answer the id as a JSON string ("167"): read as it comes, such
 * an order would reach the renderers without an id and skip their step
 * after the order. An answer that is not an id is handed on unchanged.
 */
export function orderIdOf(answer: unknown): number {
    if (typeof answer === 'string' && /^[1-9]\d*$/.test(answer.trim())) return Number(answer.trim());
    return answer as number;
}

/**
 * POST payment-information: places the order. `headers` carries the
 * anti-abuse proof of the request (reCAPTCHA token, CAPTCHA answer). Never
 * retried: the quote is read instead to learn what a lost answer meant.
 */
export function placeGuestOrder(
    maskedCartId: string,
    req: PaymentInformationRequest,
    headers: Readonly<Record<string, string>> = {}
): Promise<number> {
    return apiFetch<unknown>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/payment-information`,
        {
            method: 'POST',
            body: req,
            auth: 'guest',
            retry: false,
            timeoutMs: PLACE_ORDER_TIMEOUT_MS,
            headers,
        }
    ).then(orderIdOf);
}

export function placeCustomerOrder(
    req: PaymentInformationRequest,
    headers: Readonly<Record<string, string>> = {}
): Promise<number> {
    return apiFetch<unknown>(
        'carts/mine/payment-information',
        {
            method: 'POST',
            body: req,
            auth: 'customer',
            retry: false,
            timeoutMs: PLACE_ORDER_TIMEOUT_MS,
            headers,
        }
    ).then(orderIdOf);
}

/**
 * POST set-payment-information: puts the payment method (and the billing
 * address) on the quote without ordering. `headers` carries the image
 * CAPTCHA answer for a store whose saving limiter asks for one.
 */
export function setGuestPaymentInformation(
    maskedCartId: string,
    req: PaymentInformationRequest,
    headers: Readonly<Record<string, string>> = {}
): Promise<boolean> {
    return apiFetch<boolean>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/set-payment-information`,
        { method: 'POST', body: req, auth: 'guest', idempotent: true, headers }
    );
}

export function setCustomerPaymentInformation(
    req: PaymentInformationRequest,
    headers: Readonly<Record<string, string>> = {}
): Promise<boolean> {
    return apiFetch<boolean>(
        'carts/mine/set-payment-information',
        { method: 'POST', body: req, auth: 'customer', idempotent: true, headers }
    );
}
