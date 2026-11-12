// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <shipping-method-row> -- one row in the method list (a11y radio). A
 * rate the carrier answered as an error (`available` false, no method) is
 * listed with its message and a disabled, unchecked radio.
 */
import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

import type { ShippingMethod } from '../types/shipping.js';
import { getCheckoutConfig, getPriceFormat } from '../bootstrap-config.js';
import { formatMoney } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

export class ShippingMethodRow extends LitElement {
    @property({ type: Object }) public method!: ShippingMethod;
    @property({ type: Boolean }) public selected = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const m = this.method;
        const cfg = getCheckoutConfig();
        const fmt = getPriceFormat();
        const incl = m.price_incl_tax ?? m.amount ?? 0;
        const excl = m.price_excl_tax ?? m.amount ?? 0;
        const priceLabel = cfg.isDisplayShippingBothPrices && incl !== excl
            ? `${formatMoney(excl, fmt)} (${t('Hyperion_Checkout::total_incl_tax', { title: formatMoney(incl, fmt) })})`
            : formatMoney(cfg.isDisplayShippingPriceExclTax ? excl : incl, fmt);
        const id = `hc-ship-${m.carrier_code}-${m.method_code}`;
        // An error row explains why a carrier does not serve the address:
        // it can be neither chosen nor shown as the choice.
        const usable = m.available !== false && Boolean(m.method_code);
        const selected = this.selected && usable;
        return html`
            <label for=${id}
                   class="flex items-start justify-between gap-3 rounded-md border p-3 ${usable ? 'cursor-pointer' : 'cursor-not-allowed'} ${selected ? 'border-accent bg-accent/5' : 'border-subtle hover:border-accent bg-surface'}">
                <span class="flex items-start gap-3">
                    <input
                        id=${id}
                        type="radio"
                        name="shipping_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${selected}
                        ?disabled=${!usable}
                        @change=${this._onSelect}
                    />
                    <span>
                        <span class="block text-sm font-medium text-brand">
                            ${usable ? html`${m.carrier_title}${' '}-- ${m.method_title}` : m.carrier_title}
                        </span>
                        ${m.error_message
                            ? html`<span class="block text-xs text-danger mt-0.5">${m.error_message}</span>`
                            : null}
                    </span>
                </span>
                ${usable
                    ? html`<span class="text-sm font-semibold text-brand whitespace-nowrap">${priceLabel}</span>`
                    : null}
            </label>
        `;
    }

    private _onSelect(): void {
        this.dispatchEvent(new CustomEvent('method-select', {
            detail: {
                carrier_code: this.method.carrier_code,
                method_code: this.method.method_code,
            },
            bubbles: true,
            composed: true,
        }));
    }
}

if (!customElements.get('shipping-method-row')) {
    customElements.define('shipping-method-row', ShippingMethodRow);
}

declare global {
    interface HTMLElementTagNameMap { 'shipping-method-row': ShippingMethodRow; }
}
