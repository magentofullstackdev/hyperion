// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Quote values the Braintree renderers send to the gateway, read from the
 * quote of the first-party context (`context.firstParty.quote()`), the
 * same values the order request reads.
 */
import type { Address } from '../../../types/address.js';
import type { FirstPartyQuote } from '../first-party.js';

/** Core helper `format-amount.js`. */
export function formatAmount(value: unknown): string {
    const amount = parseFloat(String(value ?? 0));
    return (Number.isFinite(amount) ? amount : 0).toFixed(2);
}

/** The gateway charges the base currency amount, like the core renderers. */
export function getBaseGrandTotal(quote: FirstPartyQuote): string {
    return formatAmount(quote.totals?.base_grand_total);
}

export function getBaseCurrencyCode(quote: FirstPartyQuote): string {
    return quote.totals?.base_currency_code ?? '';
}

export function regionCodeOf(address: Address): string | undefined {
    const code = address.region && typeof address.region === 'object'
        ? address.region.region_code
        : undefined;
    return typeof code === 'string' && code.length > 0 ? code : undefined;
}

/** Core helper `remove-non-digit-characters.js`. */
export function digitsOnly(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}
