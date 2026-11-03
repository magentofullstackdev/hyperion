// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';
import {
    buildPaymentRows,
    getSelectedVaultToken,
    selectVaultToken,
} from './payment-renderers/vault-tokens.js';
import { ensureRenderersFor, renderersVersion } from './payment-renderers/lazy-renderers.js';
import './payment-method-row.js';

export class PaymentMethodList extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const methods = store.availablePaymentMethods.get();
        ensureRenderersFor(methods.map((m) => m.code));
        const version = renderersVersion.get();
        const rows = buildPaymentRows(methods);
        const selected = store.selectedPaymentMethod.get();
        if (rows.length === 0) {
            return html`<p class="text-sm text-muted" role="status" aria-live="polite">
                ${t('Hyperion_Checkout::payment_waiting_for_shipping')}
            </p>`;
        }
        return html`
            <div role="radiogroup"
                 aria-label=${t('Hyperion_Checkout::payment_method_aria')}
                 class="space-y-2">
                ${rows.map(({ method, token }) => html`
                    <payment-method-row
                        .method=${method}
                        .token=${token}
                        .renderersVersion=${version}
                        .selected=${selected === method.code
                            && (token === null
                                || getSelectedVaultToken(method.code)?.publicHash === token.publicHash)}
                        @payment-select=${this._onSelect}
                    ></payment-method-row>
                `)}
            </div>
        `;
    }

    private _onSelect(e: CustomEvent<{ code: string; publicHash?: string }>): void {
        if (e.detail.publicHash) {
            selectVaultToken(e.detail.code, e.detail.publicHash);
            return;
        }
        getStore().selectedPaymentMethod.set(e.detail.code);
    }
}

if (!customElements.get('payment-method-list')) {
    customElements.define('payment-method-list', PaymentMethodList);
}

declare global {
    interface HTMLElementTagNameMap { 'payment-method-list': PaymentMethodList; }
}
