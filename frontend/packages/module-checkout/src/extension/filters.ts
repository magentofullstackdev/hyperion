// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The seam of the request filters in the flow actions: `applyFilters()` is
 * called where the checkout built the body of a shipping-information,
 * billing-address or payment-information request, when the write starts.
 * Until an extension registers a filter (`request-filters.ts`, loaded only
 * then) it returns the body itself: no clone, no snapshot, no cost.
 */
import type { RequestFilters } from '../../extension-api.js';

export type RequestFilterName = keyof RequestFilters;

type Applier = <T extends object>(name: RequestFilterName, payload: T) => T;

let applier: Applier | null = null;

/** Installed by the filter registry with its first filter; null removes it. */
export function installFilterApplier(next: Applier | null): void {
    applier = next;
}

/** The error that fails the write of a filter that broke; its message is written for the shopper. */
export class RequestFilterError extends Error {
    public constructor(message: string) {
        super(message);
        // The taxonomy shows the text of a plain `Error` (`classifyError()`).
        this.name = 'Error';
    }
}

/** The body to send for `name`. Throws `RequestFilterError` when a filter broke. */
export function applyFilters<T extends object>(name: RequestFilterName, payload: T): T {
    return applier === null ? payload : applier(name, payload);
}
