// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * What the checkout knows about each payment row and each renderer entry,
 * as signals, so the list, the Place Order button and the gate follow it.
 *
 * A row is one selectable line of the payment list: a method, or a stored
 * token of a vault method. Its key is the token's public hash, else the
 * method code (the key of the list's rows). The state of a row outlives
 * its element on screen: switching to another method and back keeps what
 * the element reported (an authorization done in it stays valid).
 *
 *   - `ready`: the element said it is ready to be shown (entries that
 *     await it show a placeholder until then);
 *   - `valid` / `message`: the element's own step is complete, or what is
 *     missing (feeds `paymentMethodReady` and the Place Order hint);
 *   - `busy`: the element works on something that takes a while;
 *   - `ownsPlaceOrder`: the element completes the order with a control of
 *     its own, so the checkout's button is not rendered;
 *   - `fatal`: the element gave up for the page lifetime; the row is gone.
 *
 * An entry's state is the state of its module: loading, ready, or one of
 * the failures that make its methods unsupported. Once ready, the static
 * answers of its element class are kept here: `canMakePayment()` per method
 * code (an eager entry only) and the row titles of stored tokens.
 */
import { Signal } from 'signal-polyfill';

import type { VaultTokenInfo } from '../../../extension-api.js';
import type { RecaptchaAction } from '../../types/captcha.js';

export interface PaymentRowState {
    readonly ready: boolean;
    readonly valid: boolean;
    readonly message: string | null;
    readonly busy: boolean;
    readonly busyLabel: string | null;
    readonly ownsPlaceOrder: boolean | null;
    readonly fatal: boolean;
    /** The element could not be created or did not show itself in time. */
    readonly failure: 'create-failed' | 'not-ready' | null;
}

export type EntryLoadState = 'idle' | 'loading' | 'ready' | 'load-failed' | 'timeout' | 'version-mismatch';

export interface EntryState {
    readonly load: EntryLoadState;
    /** `canMakePayment()` of the element class by method code; absent while not asked or still answering. */
    readonly usable: Readonly<Record<string, boolean>>;
    /** The row title of a stored token, from the element class. */
    readonly describeToken: ((token: VaultTokenInfo) => string | null) | null;
    /** The reCAPTCHA form that protects an order of the method (first-party classes only). */
    readonly recaptchaAction: (() => RecaptchaAction | null) | null;
}

export const EMPTY_ROW: PaymentRowState = Object.freeze({
    ready: false,
    valid: true,
    message: null,
    busy: false,
    busyLabel: null,
    ownsPlaceOrder: null,
    fatal: false,
    failure: null,
});

const IDLE_ENTRY: EntryState = Object.freeze({ load: 'idle', usable: {}, describeToken: null, recaptchaAction: null });

const rows = new Signal.State<ReadonlyMap<string, PaymentRowState>>(new Map());
const entries = new Signal.State<ReadonlyMap<string, EntryState>>(new Map());

/** The token of each vault method the shopper picked (public hash by vault code). */
export const selectedTokens = new Signal.State<Readonly<Record<string, string>>>({});

export function rowState(key: string): PaymentRowState {
    return rows.get().get(key) ?? EMPTY_ROW;
}

export function patchRow(key: string, patch: Partial<PaymentRowState>): void {
    const next = new Map(rows.get());
    next.set(key, Object.freeze({ ...(next.get(key) ?? EMPTY_ROW), ...patch }));
    rows.set(next);
}

export function entryState(id: string): EntryState {
    return entries.get().get(id) ?? IDLE_ENTRY;
}

export function patchEntry(id: string, patch: Partial<EntryState>): void {
    const next = new Map(entries.get());
    next.set(id, Object.freeze({ ...(next.get(id) ?? IDLE_ENTRY), ...patch }));
    entries.set(next);
}

/** The key of a row: the token's public hash, else the method code. */
export function rowKeyOf(code: string, token: { readonly publicHash: string } | null): string {
    return token === null ? code : token.publicHash;
}

export function resetPaymentRowsForTests(): void {
    rows.set(new Map());
    entries.set(new Map());
    selectedTokens.set({});
}
