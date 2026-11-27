// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-offline> -- the offline methods of the bundle: `checkmo`,
 * `banktransfer`, `cashondelivery`, `free`. A payment element of the
 * extension API with nothing to collect: the order carries the method code
 * alone.
 *
 * The merchant's instructions (bank transfer, cash on delivery) come from
 * `checkoutConfig.payment.instructions[code]`, where core's provider puts
 * them (never from the method's own slice), and pass through the sanitizer
 * before rendering. A check shows who it is payable to (`config.payableTo`, bound
 * as text: the server does not escape it) and where to send it
 * (`config.mailingAddress`, line breaks as markup, sanitized).
 */
import { LitElement, html, nothing } from 'lit';

import type { PaymentContext, PaymentMethodInfo, VaultTokenInfo } from '../../../extension-api.js';
import { firstPartyOf } from './first-party.js';

function stringOf(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export class PaymentOffline extends LitElement {
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

    private _instructions(): string {
        const shared = firstPartyOf(this.context)?.config().payment?.['instructions'];
        return shared && typeof shared === 'object' ? stringOf((shared as Record<string, unknown>)[this.method.code]) : '';
    }

    public override render(): unknown {
        const instructions = this.context.sanitizeHtml(this._instructions());
        return html`
            <div class="space-y-3">
                ${instructions
                    ? html`<div class="text-sm text-muted"
                                data-payment-instructions
                                .innerHTML=${instructions}></div>`
                    : nothing}
                ${this.method.code === 'checkmo' ? this._renderCheckDetails() : nothing}
            </div>
        `;
    }

    private _renderCheckDetails(): unknown {
        const payableTo = stringOf(this.config['payableTo']).trim();
        const mailingAddress = this.context.sanitizeHtml(stringOf(this.config['mailingAddress']));
        if (payableTo === '' && mailingAddress.trim() === '') return nothing;
        return html`
            <dl class="text-sm text-muted space-y-2" data-payment-check-details>
                ${payableTo !== ''
                    ? html`<div>
                              <dt class="font-medium text-brand">${this.context.t('Make Check payable to:')}</dt>
                              <dd data-payment-check-payable-to>${payableTo}</dd>
                          </div>`
                    : nothing}
                ${mailingAddress.trim() !== ''
                    ? html`<div>
                              <dt class="font-medium text-brand">${this.context.t('Send Check to:')}</dt>
                              <dd data-payment-check-send-to .innerHTML=${mailingAddress}></dd>
                          </div>`
                    : nothing}
            </dl>
        `;
    }
}

if (!customElements.get('hc-payment-offline')) {
    customElements.define('hc-payment-offline', PaymentOffline);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-offline': PaymentOffline; }
}
