// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <shipping-method-row> -- one row in the method list (a11y radio).
 *
 * The title reads `Carrier: Method`. Under a carrier subheading of the
 * list (`grouped`) only the method is printed and the carrier stays in the
 * accessible name. A zero price reads "Free"; when the store shows both
 * prices they are spelled out in one phrase.
 *
 * A rate the carrier answered as an error (`available` false, no method)
 * shows the carrier and the message the radio is described by: no price,
 * a disabled, unchecked radio and no pointer cursor.
 *
 * `disabled` is the list being refreshed: the row keeps its look and its
 * selection, the radio cannot be changed.
 *
 * On a store with shipping extensions the selected row carries the host of
 * the `below-method` slot under its label (`data-shipping-method-extension`,
 * empty unless an extension matches the rate), never inside it: the
 * controls of an extension are not part of the radio's label.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { ShippingMethod } from '../types/shipping.js';
import { getCheckoutConfig, getPriceFormat } from '../bootstrap-config.js';
import { formatMoney } from '../utils/currency.js';
import { t } from '../utils/i18n.js';

/** A rate that can be chosen, as opposed to a carrier's error answer. */
export function isUsableShippingRate(method: ShippingMethod): boolean {
    return method.available !== false && Boolean(method.method_code);
}

export class ShippingMethodRow extends LitElement {
    @property({ type: Object }) public method!: ShippingMethod;
    @property({ type: Boolean }) public selected = false;
    @property({ type: Boolean }) public disabled = false;
    @property({ type: Boolean }) public grouped = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const m = this.method;
        const usable = isUsableShippingRate(m);
        if (!usable) return this._renderError(m);
        const id = `hc-ship-${m.carrier_code}-${m.method_code}`;
        const selected = this.selected;
        const extended = selected && (getCheckoutConfig().hyperion?.shippingExtensions?.length ?? 0) > 0;
        return html`
            <label for=${id}
                   class="flex items-start justify-between gap-3 rounded-control border p-3 ${this.disabled ? 'cursor-default' : 'cursor-pointer'} ${selected ? 'border-accent bg-accent/5' : 'border-subtle hover:border-accent bg-surface'}">
                <span class="flex min-w-0 items-start gap-3">
                    <input
                        id=${id}
                        type="radio"
                        name="shipping_method"
                        class="mt-0.5 h-4 w-4 shrink-0 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${selected}
                        ?disabled=${this.disabled}
                        @change=${this._onSelect}
                    />
                    <span class="block min-w-0 text-sm font-medium text-brand" data-shipping-method-title>
                        ${this.grouped
                            ? html`<span class="sr-only">${m.carrier_title}: </span>${m.method_title}`
                            : html`${m.carrier_title}: ${m.method_title}`}
                    </span>
                </span>
                <span class="text-sm font-semibold text-brand text-right" data-shipping-method-price>
                    ${this._priceLabel(m)}
                </span>
            </label>
            ${extended
                ? html`<shipping-extension-host placement="below-method"
                                                data-shipping-method-extension
                                                .carrier=${m.carrier_code}
                                                .method=${m.method_code}></shipping-extension-host>`
                : nothing}
        `;
    }

    private _renderError(m: ShippingMethod): unknown {
        const id = `hc-ship-${m.carrier_code}-unavailable`;
        const message = m.error_message;
        return html`
            <label for=${id}
                   class="flex items-start gap-3 rounded-control border border-subtle bg-surface p-3"
                   data-shipping-method-error>
                <input
                    id=${id}
                    type="radio"
                    name="shipping_method"
                    class="mt-0.5 h-4 w-4 shrink-0 text-accent"
                    .checked=${false}
                    disabled
                    aria-describedby=${message ? `${id}-message` : nothing}
                />
                <span class="block min-w-0">
                    <span class="block text-sm font-medium text-brand" data-shipping-method-title>${m.carrier_title}</span>
                    ${message
                        ? html`<span id="${id}-message" class="block text-xs text-danger mt-0.5">${message}</span>`
                        : nothing}
                </span>
            </label>
        `;
    }

    private _priceLabel(m: ShippingMethod): string {
        const cfg = getCheckoutConfig();
        const fmt = getPriceFormat();
        const incl = Number(m.price_incl_tax ?? m.amount ?? 0);
        const excl = Number(m.price_excl_tax ?? m.amount ?? 0);
        if (cfg.isDisplayShippingBothPrices && incl !== excl) {
            return t('Hyperion_Checkout::shipping_price_both', {
                excl: formatMoney(excl, fmt),
                incl: formatMoney(incl, fmt),
            });
        }
        const price = cfg.isDisplayShippingPriceExclTax ? excl : incl;
        return price === 0 ? t('Hyperion_Checkout::shipping_free') : formatMoney(price, fmt);
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
