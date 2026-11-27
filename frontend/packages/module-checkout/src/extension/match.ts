// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The descriptor matcher of the payment renderer entries: which entry
 * serves a method code. A pure function over the emitted configuration
 * (the shipping matcher is `match-shipping.ts`, used by the lazy shipping
 * extension host only).
 *
 * Payment: an entry with the exact `method` wins over every `pattern`;
 * between patterns the lower `sortOrder` wins. A pattern must match the
 * whole code, as on the server (`utils/whole-pattern.ts`); one the browser
 * cannot compile matches nothing.
 */
import type { PaymentRendererConfig } from '../../extension-api.js';
import { matchesWhole } from '../utils/whole-pattern.js';

/** The entry that renders the payment method `code`, null when none does. */
export function matchPaymentEntry(
    entries: readonly PaymentRendererConfig[] | null | undefined,
    code: string
): PaymentRendererConfig | null {
    if (!entries || entries.length === 0) return null;
    const exact = entries.find((entry) => entry.method === code);
    if (exact) return exact;
    let best: PaymentRendererConfig | null = null;
    for (const entry of entries) {
        if (entry.method || !entry.pattern) continue;
        if (!matchesWhole(entry.pattern, code)) continue;
        if (best === null || entry.sortOrder < best.sortOrder) best = entry;
    }
    return best;
}
