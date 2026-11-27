// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * What the payment host adds to the context of the bundle's own renderers
 * (`builtin` entries), next to the public `PaymentContext`: the quote in
 * the shapes the gateways were built against (Magento REST items and
 * totals, the addresses as the checkout holds them), the page's checkout
 * configuration for the gateway slices, and the few steps of the wallet
 * flows the public API does not describe (a storefront request that must
 * see the quote as it is, the check of an order whose answer was lost).
 *
 * It is not part of `extension-api.d.ts`: a third-party element never
 * receives it.
 */
import type { PaymentContext } from '../../../extension-api.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { CartItem } from '../../types/quote.js';
import type { Totals } from '../../types/totals.js';

export interface FirstPartyQuote {
    readonly items: readonly CartItem[];
    readonly totals: Totals | null;
    /** The address the order ships to (a shipping extension may have put it in place); null on a virtual quote. */
    readonly shippingAddress: Address | null;
    /** The shipping address while the billing address follows it on a physical quote. */
    readonly billingAddress: Address | null;
}

export interface FirstPartyServices {
    /** The checkout configuration of the page. */
    config(): CheckoutConfig;
    /** The quote as it stands. Reads signals: a signal watching element renders again on a change. */
    quote(): FirstPartyQuote;
    /**
     * Run a request that reads the quote as it is (a gateway token for its
     * amount): once no write runs or waits, with the queue closed and the
     * order latch shown while it runs.
     */
    holdQuote<T>(run: () => Promise<T>): Promise<T>;
    /** Inside the element's `placeOrder()`: send the request that orders the quote with the queue closed. */
    sendOrderRequest<T>(run: () => Promise<T>): Promise<T>;
    /**
     * An order request sent by the element got no usable answer: let the
     * quote say whether the order exists. True when it does.
     */
    resolveLostOrder(cause: 'network' | 'unavailable'): Promise<boolean>;
    /** The message a failed save shows in its own section, null when none does. */
    failureMessage(): string | null;
    /** The order exists or continues elsewhere: what the shopper typed is no longer kept for a reload. */
    forgetTypedInput(): void;
}

export type FirstPartyPaymentContext = PaymentContext & { readonly firstParty: FirstPartyServices };

/** The first-party services of a context; null on a context that has none. */
export function firstPartyOf(context: PaymentContext | null | undefined): FirstPartyServices | null {
    const services = (context as Partial<FirstPartyPaymentContext> | null | undefined)?.firstParty;
    return services ?? null;
}
