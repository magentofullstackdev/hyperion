// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { t } from '../utils/i18n.js';
import './shipping-method-row.js';

export class ShippingMethodList extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const methods = store.availableShippingMethods.get();
        const loading = store.isLoadingShippingMethods.get();
        const selected = store.selectedShippingMethod.get();

        if (loading && methods.length === 0) {
            return html`<p class="text-sm text-muted" role="status" aria-live="polite">
                ${t('Hyperion_Checkout::shipping_calculating')}
            </p>`;
        }
        if (methods.length === 0) {
            return html`<p class="text-sm text-muted">
                ${t('Hyperion_Checkout::shipping_waiting_for_address')}
            </p>`;
        }

        return html`
            <div role="radiogroup"
                 aria-label=${t('Hyperion_Checkout::shipping_method_aria')}
                 class="space-y-2">
                ${methods.map((m) => html`
                    <shipping-method-row
                        .method=${m}
                        .selected=${selected?.carrier_code === m.carrier_code && selected.method_code === m.method_code}
                        @method-select=${this._onSelect}
                    ></shipping-method-row>
                `)}
                ${loading ? html`<p class="text-xs text-muted">${t('Hyperion_Checkout::shipping_updating')}</p>` : nothing}
            </div>
        `;
    }

    private _onSelect(e: CustomEvent<{ carrier_code: string; method_code: string }>): void {
        const store = getStore();
        store.selectedShippingMethod.set(e.detail);
        void flowActions().saveShippingAndEstimateTotals();
    }
}

if (!customElements.get('shipping-method-list')) {
    customElements.define('shipping-method-list', ShippingMethodList);
}

declare global {
    interface HTMLElementTagNameMap { 'shipping-method-list': ShippingMethodList; }
}
