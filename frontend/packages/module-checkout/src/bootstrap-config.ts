// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Module-scoped handle on the raw `CheckoutConfig` parsed at boot.
 *
 * Components that need static reference data (country list, region
 * list, priceFormat, street line count) import from here rather than
 * re-parsing the JSON island. Bootstrap sets it once; components read
 * freely.
 */
import type { CheckoutConfig, PriceFormat } from './types/config.js';

let cfg: CheckoutConfig | null = null;

export function setCheckoutConfig(next: CheckoutConfig): void {
    cfg = next;
}

export function getCheckoutConfig(): CheckoutConfig {
    if (!cfg) {
        throw new Error('[hyperion-checkout] checkoutConfig accessed before bootstrap.');
    }
    return cfg;
}

/** The config when bootstrapped, null before: for readers with a safe default. */
export function peekCheckoutConfig(): CheckoutConfig | null {
    return cfg;
}

export function getPriceFormat(): PriceFormat {
    return getCheckoutConfig().priceFormat;
}
