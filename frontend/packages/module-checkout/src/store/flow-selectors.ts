// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Module-level computed selectors for the main flow.
 *
 * Separated from `selectors.ts` (which exports a factory) because the
 * Place Order button needs a stable reference independent of render
 * cycles. `initFlowSelectors()` memoises after bootstrap.
 */
import { getStore } from './index.js';
import { createSelectors } from './selectors.js';

let cached: ReturnType<typeof createSelectors> | null = null;

export function initFlowSelectors(): ReturnType<typeof createSelectors> {
    if (cached) return cached;
    cached = createSelectors(getStore());
    return cached;
}

export function resetFlowSelectorsForTests(): void {
    cached = null;
}
