// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The map from the checkout's own error taxonomy (`api/error-kinds.ts`) to
 * the eight kinds of the public `CheckoutError` of `extension-api.d.ts`.
 * The public list is smaller on purpose: an extension needs to know what it
 * can do about a failure, not how the checkout recovers from it.
 */
import type { CheckoutError } from '../../extension-api.js';
import type { CheckoutErrorKind } from '../types/errors.js';

export type PublicErrorKind = CheckoutError['kind'];

const KIND_MAP: Readonly<Record<CheckoutErrorKind, PublicErrorKind>> = {
    offline: 'network',
    network: 'network',
    timeout: 'timeout',
    'session-expired': 'unauthorized',
    'quote-gone': 'not-found',
    'rate-limited': 'rate-limited',
    unavailable: 'server',
    blocked: 'server',
    'cart-locked': 'server',
    'order-unknown': 'server',
    unexpected: 'server',
    'shipping-method-rejected': 'validation',
    stock: 'validation',
    captcha: 'validation',
    validation: 'validation',
};

/** The public kind of one of the checkout's own error kinds. */
export function publicErrorKind(kind: CheckoutErrorKind): PublicErrorKind {
    return KIND_MAP[kind] ?? 'server';
}
