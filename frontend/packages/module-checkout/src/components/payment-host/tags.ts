// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The custom element of a payment renderer entry. A first-party entry
 * (`builtin`) and the three generic types (`redirect`,
 * `redirect-before-order`, `form`) use the tag the bundle defines for them,
 * whatever the server named; any other entry uses its own `tag`. An entry
 * whose tag cannot be told is loaded as `load-failed` (`mount.ts`).
 */
import type { PaymentEntry } from './entries.js';

/** The first-party renderers of the bundle, by `builtin` id. */
export const BUILTIN_TAGS: Readonly<Record<string, string>> = Object.freeze({
    'offline': 'hc-payment-offline',
    'braintree-card': 'hc-payment-braintree-card',
    'braintree-paypal': 'hc-payment-braintree-paypal',
    'braintree-googlepay': 'hc-payment-braintree-googlepay',
    'braintree-vault': 'hc-payment-braintree-vault',
    'paypal-express': 'hc-payment-paypal-express',
});

/** The elements of the generic types. */
export const GENERIC_TAGS: Readonly<Record<string, string>> = Object.freeze({
    'redirect': 'hc-payment-redirect',
    'redirect-before-order': 'hc-payment-redirect-first',
    'form': 'hc-payment-form',
});

/** A builtin id in the spelling of `BUILTIN_TAGS` (the server may write `braintree_card`). */
export function builtinId(id: string): string {
    return id.replace(/_/g, '-');
}

/** The custom element an entry renders with; null when it names none it may use. */
export function elementTagOf(entry: PaymentEntry): string | null {
    if (entry.type !== 'element') return GENERIC_TAGS[entry.type] ?? null;
    if (entry.builtin) return BUILTIN_TAGS[builtinId(entry.builtin)] ?? null;
    return typeof entry.tag === 'string' && entry.tag !== '' ? entry.tag : null;
}
