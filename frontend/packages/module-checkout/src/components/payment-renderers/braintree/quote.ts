// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Quote values the Braintree renderers send to the gateway, read from the
 * store the same way `flow-actions.ts::placeOrder` reads them.
 */
import type { Address } from '../../../types/address.js';
import { getStore } from '../../../store/index.js';

export function getBillingAddress(): Address | null {
    const store = getStore();
    return store.billingSameAsShipping.get() && !store.isVirtual.get()
        ? store.shippingAddress.get()
        : store.billingAddress.get();
}

export function getShippingAddress(): Address | null {
    const store = getStore();
    return store.isVirtual.get() ? null : store.shippingAddress.get();
}

/** Core helper `format-amount.js`. */
export function formatAmount(value: unknown): string {
    const amount = parseFloat(String(value ?? 0));
    return (Number.isFinite(amount) ? amount : 0).toFixed(2);
}

/** The gateway charges the base currency amount, like the core renderers. */
export function getBaseGrandTotal(): string {
    return formatAmount(getStore().totals.get()?.base_grand_total);
}

export function getBaseCurrencyCode(): string {
    return getStore().totals.get()?.base_currency_code ?? '';
}

export function regionCodeOf(address: Address): string | undefined {
    const code = address.region && typeof address.region === 'object'
        ? address.region.region_code
        : undefined;
    return typeof code === 'string' && code.length > 0 ? code : undefined;
}

/** Core helper `remove-non-digit-characters.js`. */
export function digitsOnly(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}
