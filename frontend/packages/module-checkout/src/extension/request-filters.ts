// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Request filters: extensions adjust the body of three quote requests
 * after the checkout built it, when the write starts (so a filter always
 * sees the latest state): `shippingInformation` (POST
 * `<cart>/shipping-information`), `paymentInformation` (POST
 * `<cart>/payment-information` and `<cart>/set-payment-information`) and
 * `billingAddress` (POST `<cart>/billing-address`).
 *
 * Filters run in registration order (a filter registered with `first`
 * ahead of the others). Each one receives a structured clone of the body
 * and the current checkout snapshot and returns the body to send. A filter
 * that throws, or returns something that is not a plain object, fails the
 * write with a generic message: a consent flag or a delivery note silently
 * dropped would be worse than a visible error. The checkout puts its own
 * keys back after the filters ran: the agreement ids, the email and the
 * address fields (an address keeps the `custom_attributes` and
 * `extension_attributes` the filters set).
 *
 * This module is the registry and the logic; the flow actions call the
 * small `applyFilters()` of `filters.ts`, which runs this logic once a
 * filter was registered and returns the body untouched (no clone, no
 * snapshot) otherwise.
 */
import type { CheckoutSnapshot, RequestFilters, Unsubscribe } from '../../extension-api.js';
import { t } from '../utils/i18n.js';
import { checkoutSnapshots } from './context.js';
import { installFilterApplier, RequestFilterError, type RequestFilterName } from './filters.js';

export type { RequestFilterName };

type AnyFilter = (payload: Record<string, unknown>, snapshot: CheckoutSnapshot) => unknown;

interface FilterEntry {
    readonly owner: string;
    readonly fn: AnyFilter;
}

const registry: Record<RequestFilterName, FilterEntry[]> = {
    shippingInformation: [],
    paymentInformation: [],
    billingAddress: [],
};

/** The entries registered with `first`. */
const firstOwners = new Set<FilterEntry>();

export interface RegisterFilterOptions {
    /** The extension the filter belongs to, for the log. */
    owner: string;
    /** Run ahead of the filters registered without it. */
    first?: boolean;
}

/** Add a filter; the function returned removes it. */
export function registerRequestFilter<K extends RequestFilterName>(
    name: K,
    fn: (payload: RequestFilters[K], snapshot: CheckoutSnapshot) => RequestFilters[K],
    options: RegisterFilterOptions
): Unsubscribe {
    installFilterApplier(runFilters);
    const entry: FilterEntry = { owner: options.owner, fn: fn as unknown as AnyFilter };
    const list = registry[name];
    if (options.first === true) {
        const firstOthers = list.findIndex((candidate) => !firstOwners.has(candidate));
        list.splice(firstOthers === -1 ? list.length : firstOthers, 0, entry);
        firstOwners.add(entry);
    } else {
        list.push(entry);
    }
    return (): void => {
        const at = list.indexOf(entry);
        if (at !== -1) list.splice(at, 1);
        firstOwners.delete(entry);
    };
}

/** True when at least one filter is registered for `name`. */
export function hasRequestFilters(name: RequestFilterName): boolean {
    return registry[name].length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value) as unknown;
    return proto === Object.prototype || proto === null;
}

/** Address keys a filter may set; every other key of the checkout's address is put back. */
const ADDRESS_EXTENSION_KEYS: ReadonlySet<string> = new Set(['custom_attributes', 'extension_attributes']);

function reassertAddress(original: unknown, filtered: Record<string, unknown>, key: string): void {
    if (!isPlainObject(original)) {
        if (original !== undefined) filtered[key] = original;
        return;
    }
    const target = isPlainObject(filtered[key]) ? filtered[key] as Record<string, unknown> : {};
    for (const [field, value] of Object.entries(original)) {
        if (!ADDRESS_EXTENSION_KEYS.has(field)) target[field] = value;
    }
    filtered[key] = target;
}

function reassert(name: RequestFilterName, original: Record<string, unknown>, filtered: Record<string, unknown>): void {
    if (name === 'shippingInformation') {
        const before = original.addressInformation as Record<string, unknown> | undefined;
        if (!isPlainObject(before)) return;
        const after = isPlainObject(filtered.addressInformation) ? filtered.addressInformation : {};
        for (const [field, value] of Object.entries(before)) {
            if (field === 'shipping_address' || field === 'billing_address') {
                reassertAddress(value, after, field);
            } else if (field !== 'extension_attributes' && field !== 'custom_attributes') {
                after[field] = value;
            }
        }
        filtered.addressInformation = after;
        return;
    }
    if (name === 'billingAddress') {
        reassertAddress(original.address, filtered, 'address');
        if ('useForShipping' in original) filtered.useForShipping = original.useForShipping;
        return;
    }
    if ('email' in original) filtered.email = original.email;
    if ('billingAddress' in original) reassertAddress(original.billingAddress, filtered, 'billingAddress');
    const method = original.paymentMethod as Record<string, unknown> | undefined;
    if (!isPlainObject(method)) return;
    const after = isPlainObject(filtered.paymentMethod) ? filtered.paymentMethod : {};
    after.method = method.method;
    const ids = (method.extension_attributes as Record<string, unknown> | undefined)?.agreement_ids;
    if (ids !== undefined) {
        const attributes = isPlainObject(after.extension_attributes) ? after.extension_attributes : {};
        attributes.agreement_ids = ids;
        after.extension_attributes = attributes;
    }
    filtered.paymentMethod = after;
}

/**
 * The body to send for `name`: `payload` itself without filters, else the
 * result of every filter. Throws `RequestFilterError` when a filter broke.
 */
function runFilters<T extends object>(name: RequestFilterName, payload: T): T {
    const list = registry[name];
    if (list.length === 0) return payload;
    const snapshot = checkoutSnapshots().snapshot();
    let current = payload as unknown as Record<string, unknown>;
    for (const entry of [...list]) {
        let result: unknown;
        try {
            result = entry.fn(structuredClone(current), snapshot);
        } catch (err) {
            console.error(`[hyperion-checkout] the ${name} filter of "${entry.owner}" failed`, err);
            throw new RequestFilterError(t('Hyperion_Checkout::extension_request_failed'));
        }
        if (!isPlainObject(result)) {
            console.error(`[hyperion-checkout] the ${name} filter of "${entry.owner}" did not return an object`);
            throw new RequestFilterError(t('Hyperion_Checkout::extension_request_failed'));
        }
        current = result;
    }
    reassert(name, payload as unknown as Record<string, unknown>, current);
    return current as unknown as T;
}

export function resetFiltersForTests(): void {
    registry.shippingInformation.length = 0;
    registry.paymentInformation.length = 0;
    registry.billingAddress.length = 0;
    firstOwners.clear();
    installFilterApplier(null);
}
