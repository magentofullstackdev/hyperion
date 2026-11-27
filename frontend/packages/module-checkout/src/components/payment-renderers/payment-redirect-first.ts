// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-redirect-first> -- the generic `redirect-before-order` type of
 * the payment renderer entries: a gateway whose own page comes before the
 * order (the module's controller creates the order when the shopper comes
 * back). Place Order saves the payment method and the billing address on
 * the quote (`context.savePaymentInformation()`) and continues on the
 * entry's `redirect.route`; no order request is sent by the checkout.
 */
import { LitElement, nothing } from 'lit';

import type {
    PaymentContext,
    PaymentData,
    PaymentMethodInfo,
    PlaceOrderOutcome,
    VaultTokenInfo,
} from '../../../extension-api.js';
import { redirectOf } from './payment-redirect.js';

export class PaymentRedirectFirst extends LitElement {
    public static readonly hyperionApi = '1';

    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: PaymentMethodInfo;
    public config: Readonly<Record<string, unknown>> = {};
    public token: VaultTokenInfo | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this.dispatchEvent(new CustomEvent('hyperion-payment:ready', { bubbles: true, composed: true, detail: {} }));
    }

    public override render(): unknown {
        return nothing;
    }

    /** The order step: the payment information on the quote, then the gateway. */
    public async placeOrder(args: { signal: AbortSignal; data: PaymentData }): Promise<PlaceOrderOutcome> {
        const route = redirectOf(this.options)?.route ?? null;
        if (route === null) {
            console.error(`[hyperion-checkout] the payment method "${this.method.code}" names no redirect route`);
            return { status: 'failed', message: this.context.t('Something went wrong. Please try again.') };
        }
        if (!(await this.context.savePaymentInformation(args?.data ?? {}))) return { status: 'failed' };
        return { status: 'redirect', url: route };
    }
}

if (!customElements.get('hc-payment-redirect-first')) {
    customElements.define('hc-payment-redirect-first', PaymentRedirectFirst);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-redirect-first': PaymentRedirectFirst; }
}
