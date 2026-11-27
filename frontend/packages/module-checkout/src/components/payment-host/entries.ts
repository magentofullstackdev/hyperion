// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The payment renderer entries of the page (`hyperion.paymentRenderers`,
 * `PaymentRendererConfig` of `extension-api.d.ts`) and the one question the
 * rest of the checkout asks them: which entry renders a method code.
 *
 * A method without an entry is not supported: the shopper never sees it.
 * Which element an entry renders with is the payment host's business
 * (`tags.ts`).
 */
import type { PaymentRendererConfig } from '../../../extension-api.js';
import { peekCheckoutConfig } from '../../bootstrap-config.js';
import { matchPaymentEntry } from '../../extension/match.js';

export type PaymentEntry = PaymentRendererConfig;

let matched: { entries: readonly PaymentEntry[]; byCode: Map<string, PaymentEntry | null> } | null = null;

/** The entries the server emitted for this page. */
export function paymentEntries(): readonly PaymentEntry[] {
    const listed = peekCheckoutConfig()?.hyperion?.paymentRenderers;
    return Array.isArray(listed) ? listed : [];
}

/** The entry that renders `code`, null when none does. */
export function matchEntry(code: string): PaymentEntry | null {
    const entries = paymentEntries();
    if (matched === null || matched.entries !== entries) matched = { entries, byCode: new Map() };
    const known = matched.byCode.get(code);
    if (known !== undefined) return known;
    const entry = matchPaymentEntry(entries, code);
    matched.byCode.set(code, entry);
    return entry;
}

/**
 * Whether the method is written to the quote when it is selected: false
 * only when its entry says so.
 */
export function savesOnSelection(code: string): boolean {
    return matchEntry(code)?.savesOnSelection !== false;
}

/**
 * Whether the checkout may select the method for the shopper when it is
 * the only one offered: an offline method of the bundle, which needs
 * nothing from the shopper. A gateway is never selected for them.
 */
export function isPreselectable(code: string): boolean {
    return matchEntry(code)?.builtin === 'offline';
}
