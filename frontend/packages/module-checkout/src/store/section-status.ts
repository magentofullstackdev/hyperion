// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Section status: the one entry point for showing a failed request next to
 * the controls it belongs to, and for taking it away once a later request
 * of the same section succeeds.
 *
 * Both functions act on the store singleton (`getStore()`), read at call
 * time, like the flow actions do.
 */
import type { CheckoutError } from '../api/error-kinds.js';
import type {
    SectionId,
    SectionStatus,
    SectionStatusMap,
    SectionStatusSource,
} from '../types/section.js';
import { getStore } from './index.js';

export type { SectionId, SectionStatus, SectionStatusMap, SectionStatusSource };

export interface ReportFailureOptions {
    /** Runs the failed request again. */
    retry?: () => void;
    source: SectionStatusSource;
}

/** Show `error` in `section`, replacing what the section showed before. */
export function reportFailure(section: SectionId, error: CheckoutError, opts: ReportFailureOptions): void {
    const store = getStore();
    const status: SectionStatus = { kind: error.kind, message: error.message, source: opts.source };
    if (opts.retry) status.retry = opts.retry;
    // Only a rate limit comes with a wait the shopper has to sit out.
    if (error.kind === 'rate-limited' && error.retryAfterMs !== undefined) {
        status.retryAt = Date.now() + error.retryAfterMs;
    }
    store.sectionStatus.set({ ...store.sectionStatus.get(), [section]: status });
}

/** A request of `section` succeeded: its failure, if any, no longer applies. */
export function clearFailure(section: SectionId): void {
    const store = getStore();
    const current = store.sectionStatus.get();
    if (current[section] === null) return;
    store.sectionStatus.set({ ...current, [section]: null });
}

/**
 * The message of the failure on screen in the first of `sections` that
 * shows one (in any section when none is named), null when there is none:
 * for a caller that awaited a save and needs the reason it failed.
 */
export function failureMessage(...sections: SectionId[]): string | null {
    const shown = getStore().sectionStatus.get();
    const order = sections.length > 0 ? sections : (Object.keys(shown) as SectionId[]);
    for (const section of order) {
        const status = shown[section];
        if (status !== null) return status.message;
    }
    return null;
}
