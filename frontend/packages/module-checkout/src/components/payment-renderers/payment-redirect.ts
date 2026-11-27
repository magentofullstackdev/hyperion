// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-redirect> -- the generic `redirect` type of the payment
 * renderer entries: a hosted page gateway with no JavaScript of its own.
 * The order is placed first, like any other, then the shopper continues on
 * the gateway: the Luma pattern "place the order, then send the browser to
 * a controller of the module".
 *
 * The body shows the method's instructions when its configuration has some
 * (`config.instructions`, sanitized), nothing else. Once the order exists,
 * `afterPlaceOrder()` names the next page: the entry's `redirect.route` (an
 * absolute URL the server built from a route of the store), or the string
 * at `redirect.configPath` in the checkout configuration (a dot path, such
 * as `payment.vendor_psp.redirectUrl`). The checkout follows it under its
 * host rule (same origin, or a host of the entry's `redirectHosts`); without
 * a usable URL the shopper continues on the success page.
 */
import { LitElement, html, nothing } from 'lit';

import type {
    AfterOrderOutcome,
    PaymentContext,
    PaymentData,
    PaymentMethodInfo,
    VaultTokenInfo,
} from '../../../extension-api.js';
import { firstPartyOf } from './first-party.js';

export interface RedirectOptions {
    readonly route: string | null;
    readonly configPath: string | null;
}

export function redirectOf(options: Readonly<Record<string, unknown>>): RedirectOptions | null {
    const raw = options['redirect'];
    if (!raw || typeof raw !== 'object') return null;
    const route = (raw as Record<string, unknown>)['route'];
    const configPath = (raw as Record<string, unknown>)['configPath'];
    return {
        route: typeof route === 'string' && route !== '' ? route : null,
        configPath: typeof configPath === 'string' && configPath !== '' ? configPath : null,
    };
}

/** The string at a dot path of `source`, null when there is none. */
export function valueAt(source: unknown, path: string): string | null {
    let current: unknown = source;
    for (const key of path.split('.')) {
        if (current === null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) return null;
        current = (current as Record<string, unknown>)[key];
    }
    return typeof current === 'string' && current !== '' ? current : null;
}

export class PaymentRedirect extends LitElement {
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
        const raw = this.config['instructions'];
        const instructions = typeof raw === 'string' ? this.context.sanitizeHtml(raw) : '';
        return instructions !== ''
            ? html`<div class="text-sm text-muted" data-payment-instructions .innerHTML=${instructions}></div>`
            : nothing;
    }

    public getPaymentData(): PaymentData {
        return {};
    }

    /** The gateway page the shopper continues on once the order exists. */
    public afterPlaceOrder(): AfterOrderOutcome {
        const redirect = redirectOf(this.options);
        const url = redirect?.route
            ?? (redirect?.configPath ? valueAt(firstPartyOf(this.context)?.config() ?? null, redirect.configPath) : null);
        if (url === null) {
            console.error(`[hyperion-checkout] the payment method "${this.method.code}" names no redirect URL; continuing on the success page`);
            return { action: 'success' };
        }
        return { action: 'redirect', url };
    }
}

if (!customElements.get('hc-payment-redirect')) {
    customElements.define('hc-payment-redirect', PaymentRedirect);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-redirect': PaymentRedirect; }
}
