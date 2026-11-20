// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * API error shapes.
 *
 * Magento's REST error body follows this convention:
 *
 *   { "message": "The email address is invalid...", "parameters": {...} }
 *
 * Some endpoints also emit `trace` (dev-mode only) and `errors` (an
 * array of per-field messages). We normalise everything into
 * `MagentoApiError` (implemented in `api/errors.ts`). The interfaces
 * below describe the raw wire shapes.
 */

export interface MagentoWireError {
    message: string;
    parameters?: Record<string, string | number> | string[];
    trace?: string;
    errors?: readonly MagentoWireError[];
}

/**
 * The classes of failure the checkout tells apart. Each has its own
 * message and its own recovery; `api/error-kinds.ts` decides the class.
 */
export type CheckoutErrorKind =
    | 'offline'
    | 'network'
    | 'timeout'
    | 'session-expired'
    | 'quote-gone'
    | 'rate-limited'
    | 'unavailable'
    | 'blocked'
    | 'cart-locked'
    | 'shipping-method-rejected'
    | 'stock'
    | 'captcha'
    | 'validation'
    | 'order-unknown'
    | 'unexpected';
