// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * "Show me what is missing": a counter the Place Order button bumps when
 * it is pressed while the order cannot be placed. Every form on the page
 * compares it with the value it saw at mount and, once it moved, treats
 * all of its fields as touched so the pending validation errors show. A
 * module-level signal rather than a store slice: the address form has no
 * store dependency (it is a pure editor) and the unit tests mount it alone.
 */
import { Signal } from 'signal-polyfill';

export const validationRequests = new Signal.State<number>(0);

export function requestValidation(): void {
    validationRequests.set(validationRequests.get() + 1);
}

export function resetValidationRequestsForTests(): void {
    validationRequests.set(0);
}
