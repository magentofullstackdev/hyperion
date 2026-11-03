// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Shipping endpoint wrappers.
 *
 *   POST /guest-carts/:cartId/estimate-shipping-methods  (guest)
 *   POST /carts/mine/estimate-shipping-methods           (customer)
 *   POST /guest-carts/:cartId/shipping-information       (guest)
 *   POST /carts/mine/shipping-information                (customer)
 */
import { apiFetch } from './client.js';
import type {
    EstimateShippingMethodsRequest,
    PaymentDetails,
    ShippingInformationRequest,
    ShippingMethod,
} from '../types/shipping.js';

export function estimateGuestShippingMethods(
    maskedCartId: string,
    req: EstimateShippingMethodsRequest,
    signal?: AbortSignal
): Promise<readonly ShippingMethod[]> {
    return apiFetch<readonly ShippingMethod[]>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/estimate-shipping-methods`,
        {
            method: 'POST',
            body: req,
            auth: 'guest',
            ...(signal ? { signal } : {}),
        }
    );
}

export function estimateCustomerShippingMethods(
    req: EstimateShippingMethodsRequest,
    signal?: AbortSignal
): Promise<readonly ShippingMethod[]> {
    return apiFetch<readonly ShippingMethod[]>(
        'carts/mine/estimate-shipping-methods',
        {
            method: 'POST',
            body: req,
            auth: 'customer',
            ...(signal ? { signal } : {}),
        }
    );
}

export function saveGuestShippingInformation(
    maskedCartId: string,
    req: ShippingInformationRequest
): Promise<PaymentDetails> {
    return apiFetch<PaymentDetails>(
        `guest-carts/${encodeURIComponent(maskedCartId)}/shipping-information`,
        {
            method: 'POST',
            body: req,
            auth: 'guest',
        }
    );
}

export function saveCustomerShippingInformation(
    req: ShippingInformationRequest
): Promise<PaymentDetails> {
    return apiFetch<PaymentDetails>(
        'carts/mine/shipping-information',
        {
            method: 'POST',
            body: req,
            auth: 'customer',
        }
    );
}
