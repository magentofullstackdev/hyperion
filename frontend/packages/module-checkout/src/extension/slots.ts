// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The registry of slot elements: which custom elements the outlets
 * (`<hc-slot-outlet name="...">`) render, per slot name, in `sortOrder`
 * (registration order between equal ones). Declarative `slots` of a
 * generic pool entry and `api.registerSlot()` feed the same list.
 */
import { Signal } from 'signal-polyfill';

import type { CheckoutExtensionConfig, CheckoutSlotName, Unsubscribe } from '../../extension-api.js';

export const CHECKOUT_SLOT_NAMES: readonly CheckoutSlotName[] = [
    'after-email',
    'after-shipping-address',
    'after-shipping-methods',
    'before-payment-methods',
    'after-agreements',
    'before-place-order',
    'summary-after-totals',
];

export interface SlotRegistration {
    /** Unique per registration: the key of the element an outlet keeps. */
    readonly key: number;
    readonly slot: CheckoutSlotName;
    readonly tag: string;
    readonly sortOrder: number;
    /** The pool item name of the extension. */
    readonly owner: string;
    readonly options: Readonly<Record<string, unknown>>;
    readonly phrases: Readonly<Record<string, string>>;
    /** First-party entries may use the checkout's own tag prefixes. */
    readonly internal: boolean;
}

const registrations = new Signal.State<readonly SlotRegistration[]>([]);
let nextKey = 1;

export function isCheckoutSlotName(value: unknown): value is CheckoutSlotName {
    return typeof value === 'string' && (CHECKOUT_SLOT_NAMES as readonly string[]).includes(value);
}

/** Add an element to a slot; the function returned removes it. */
export function registerSlotElement(registration: Omit<SlotRegistration, 'key'>): Unsubscribe {
    if (!isCheckoutSlotName(registration.slot)) {
        console.error(`[hyperion-checkout] "${registration.owner}" registered an unknown slot "${String(registration.slot)}"`);
        return () => undefined;
    }
    const entry: SlotRegistration = Object.freeze({ ...registration, key: nextKey++ });
    registrations.set([...registrations.get(), entry]);
    return (): void => {
        registrations.set(registrations.get().filter((candidate) => candidate !== entry));
    };
}

/** The elements of a slot, in order. Reads a signal. */
export function registeredSlots(name: CheckoutSlotName): readonly SlotRegistration[] {
    return registrations.get()
        .filter((entry) => entry.slot === name)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.key - b.key);
}

/**
 * Register the declarative `slots` of the generic pool entries, before any
 * of their modules loads: the outlets wait for each tag to be defined.
 */
export function registerDeclaredSlots(entries: readonly CheckoutExtensionConfig[]): void {
    for (const entry of entries) {
        for (const slot of entry.slots ?? []) {
            registerSlotElement({
                slot: slot.slot,
                tag: slot.tag,
                sortOrder: Number.isFinite(slot.sortOrder) ? slot.sortOrder : 0,
                owner: entry.name,
                options: entry.options ?? {},
                phrases: entry.phrases ?? {},
                internal: entry.builtin !== null && entry.builtin !== undefined && entry.moduleUrl === null,
            });
        }
    }
}

export function resetSlotsForTests(): void {
    registrations.set([]);
    nextKey = 1;
}
