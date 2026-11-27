// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * What extensions add to the single Place Order gate.
 *
 * Two inputs, read last by `placeOrderBlocker()` (`store/place-order-hint.ts`),
 * after every built-in check:
 *
 *   1. `shippingExtensionsValid`: written by the shipping extension host, the
 *      message of the first active required extension that is not complete.
 *   2. The registered gates, in registration order: each holds its current
 *      message in a signal. A gate with an `evaluate` function is evaluated
 *      again by `refreshGates()` (on every change of the checkout snapshot,
 *      by the generic runtime, and synchronously by the order pipeline after
 *      the write queue was flushed). A throwing gate counts as blocking with
 *      a generic message.
 *
 * `extensionsSettled()` is the promise the order waits for while modules of
 * the generic pool are still loading; null when nothing is loading.
 */
import { Signal } from 'signal-polyfill';

import type { GateHandle } from '../../extension-api.js';
import { t } from '../utils/i18n.js';

/** The shipping extensions' own gate; null when every required one is complete. */
export const shippingExtensionsValid = new Signal.State<string | null>(null);

interface GateEntry {
    readonly id: string;
    readonly message: Signal.State<string | null>;
    readonly evaluate: (() => string | null) | null;
}

const gates = new Signal.State<readonly GateEntry[]>([]);

function evaluated(entry: GateEntry): string | null {
    if (entry.evaluate === null) return entry.message.get();
    try {
        const message = entry.evaluate();
        if (message === null || message === undefined || message === '') return null;
        return typeof message === 'string' ? message : t('Hyperion_Checkout::extension_gate_failed');
    } catch (err) {
        console.error(`[hyperion-checkout] the checkout gate "${entry.id}" failed`, err);
        return t('Hyperion_Checkout::extension_gate_failed');
    }
}

export interface RegisteredGate extends GateHandle {
    /** Set the message of a gate without an `evaluate` function. */
    set(message: string | null): void;
}

/**
 * Add a gate. `evaluate` answers the reason the order cannot be placed, or
 * null; without it the gate's message is what `set()` stores.
 */
export function registerCheckoutGate(id: string, evaluate: (() => string | null) | null = null): RegisteredGate {
    const entry: GateEntry = { id, message: new Signal.State<string | null>(null), evaluate };
    gates.set([...gates.get(), entry]);
    if (evaluate !== null) entry.message.set(evaluated(entry));
    return {
        refresh: (): void => {
            if (entry.evaluate !== null) entry.message.set(evaluated(entry));
        },
        remove: (): void => {
            gates.set(gates.get().filter((candidate) => candidate !== entry));
        },
        set: (message: string | null): void => {
            entry.message.set(message === '' ? null : message);
        },
    };
}

/** Evaluate every gate again, now. */
export function refreshGates(): void {
    for (const entry of gates.get()) {
        if (entry.evaluate !== null) entry.message.set(evaluated(entry));
    }
}

/** The first message of the extension gates; null when none blocks. Reads signals. */
export function extensionGateMessage(): string | null {
    const shipping = shippingExtensionsValid.get();
    if (shipping !== null && shipping !== '') return shipping;
    for (const entry of gates.get()) {
        const message = entry.message.get();
        if (message !== null) return message;
    }
    return null;
}

let pending: Promise<void> | null = null;

/** The modules of the generic pool are loading; the order waits for `settled`. */
export function setExtensionsPending(settled: Promise<void>): void {
    const tracked: Promise<void> = settled.then(
        () => undefined,
        () => undefined
    ).finally(() => {
        if (pending === tracked) pending = null;
    });
    pending = tracked;
}

/** What the order waits for before it is sent; null when no module is loading. */
export function extensionsSettled(): Promise<void> | null {
    return pending;
}

export function resetGatesForTests(): void {
    gates.set([]);
    shippingExtensionsValid.set(null);
    pending = null;
}
