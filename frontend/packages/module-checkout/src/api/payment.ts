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
 * on the quote. Used by methods whose order is placed by the gateway's
 * own controllers afterwards (PayPal Express).
 */
import { apiFetch } from './client.js';
import type { AddressRequestPayload } from '../types/address.js';
import type { PaymentInformationRequest } from '../types/payment.js';
import type { PaymentDetails } from '../types/shipping.js';

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
        { method: 'POST', body: req, auth: 'guest' }
    );
}

export function assignCustomerBillingAddress(req: BillingAddressRequest): Promise<number> {
    return apiFetch<number>('carts/mine/billing-address', { method: 'POST', body: req, auth: 'customer' });
}

export function placeGuestOrder(
    maskedCartId: string,
    req: PaymentInformationRequest,
    recaptchaToken?: string | null
): Promise<number> {
    return apiFetch<number>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/payment-information`,
        {
            method: 'POST',
            body: req,
            auth: 'guest',
            ...(recaptchaToken ? { recaptchaToken } : {}),
        }
    );
}

export function placeCustomerOrder(
    req: PaymentInformationRequest,
    recaptchaToken?: string | null
): Promise<number> {
    return apiFetch<number>(
        'carts/mine/payment-information',
        {
            method: 'POST',
            body: req,
            auth: 'customer',
            ...(recaptchaToken ? { recaptchaToken } : {}),
        }
    );
}

export function setGuestPaymentInformation(
    maskedCartId: string,
    req: PaymentInformationRequest
): Promise<boolean> {
    return apiFetch<boolean>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/set-payment-information`,
        { method: 'POST', body: req, auth: 'guest' }
    );
}

export function setCustomerPaymentInformation(
    req: PaymentInformationRequest
): Promise<boolean> {
    return apiFetch<boolean>(
        'carts/mine/set-payment-information',
        { method: 'POST', body: req, auth: 'customer' }
    );
}
