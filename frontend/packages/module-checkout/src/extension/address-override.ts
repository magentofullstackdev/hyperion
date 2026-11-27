// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The address a shipping extension puts in place of the typed one (a
 * pickup point, a parcel locker): `store.shippingAddressOverride`, written
 * by the shipping extension host on `hyperion-shipping:address-override`.
 *
 * `effectiveShippingAddress()` is the address the quote receives and the
 * snapshot shows: the typed address without an override, else the
 * override, with the name and telephone of the typed address when the
 * extension asked to keep them. `billingFollowsShipping()` is the "same as
 * shipping" choice, which an override with `separateBilling` turns off.
 * Without an override both answer exactly what the store holds, by
 * identity, so nothing changes for a checkout without such an extension.
 *
 * After the host sets or clears the override it calls
 * `flowActions().estimateShippingNow()`: the rates and the save follow the
 * effective address.
 */
import type { ShippingExtensionValue } from '../../extension-api.js';
import type { Address } from '../types/address.js';
import type { Store } from '../store/index.js';

export interface ShippingAddressOverride {
    /** The shipping extension that set it. */
    readonly extensionId: string;
    readonly address: Address;
    /** Keep the first name, the last name and the telephone of the typed address. */
    readonly keepContact: boolean;
    /** The billing address is entered on its own while the override is set. */
    readonly separateBilling: boolean;
}

/** The value of a shipping extension and what the host knows of it. */
export interface ShippingExtensionState {
    readonly value: ShippingExtensionValue | null;
    /** The element reported `hyperion-shipping:valid` since its last change. */
    readonly valid: boolean;
    /** The element's own message of `hyperion-shipping:invalid`, null when none. */
    readonly message: string | null;
}

let memo: { override: ShippingAddressOverride; typed: Address | null; result: Address } | null = null;

function filled(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim() !== '';
}

/** The shipping address the quote receives. Reads signals. */
export function effectiveShippingAddress(store: Store): Address | null {
    const typed = store.shippingAddress.get();
    const override = store.shippingAddressOverride.get();
    if (override === null) return typed;
    if (!override.keepContact) return override.address;
    if (memo !== null && memo.override === override && memo.typed === typed) return memo.result;
    const result: Address = {
        ...override.address,
        firstname: filled(typed?.firstname) ? typed.firstname : override.address.firstname,
        lastname: filled(typed?.lastname) ? typed.lastname : override.address.lastname,
        telephone: filled(typed?.telephone) ? typed.telephone : override.address.telephone,
    };
    memo = { override, typed, result };
    return result;
}

/**
 * The "same as shipping" choice as the requests apply it: the store's
 * checkbox, unless an override asks for a billing address of its own.
 * Reads signals.
 */
export function billingFollowsShipping(store: Store): boolean {
    return store.billingSameAsShipping.get() && store.shippingAddressOverride.get()?.separateBilling !== true;
}
