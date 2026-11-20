// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-method-list>: the payment methods the quote offers, one row per
 * method or stored token. The rows are keyed (token hash, else method
 * code), so a row keeps its element, and the gateway fields mounted inside
 * it, when the list is refreshed around it.
 *
 * At a zero grand total only `free` is listed when the server offers it
 * (`offeredPaymentMethods()`): every other method would be refused.
 *
 * Without rows it says why: a physical quote whose shipping information
 * the server has not confirmed yet waits for the shipping step, a list on
 * its way shows two placeholder rows of the height of a real one, and a
 * quote the server offers nothing for says so as an alert. A virtual quote
 * has no shipping step and never shows the shipping text.
 *
 * Selecting a method saves it on the quote (the totals follow a cart rule
 * that depends on the method); selecting a stored token of a method is a
 * choice inside the client only.
 */
import { LitElement, html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { t } from '../utils/i18n.js';
import { offeredPaymentMethods } from '../utils/payment-offer.js';
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
        const methods = offeredPaymentMethods(store.availablePaymentMethods.get(), store.totals.get());
        ensureRenderersFor(methods.map((m) => m.code));
        const version = renderersVersion.get();
        const rows = buildPaymentRows(methods);
        const selected = store.selectedPaymentMethod.get();
        if (rows.length === 0) {
            const loading = store.quoteWritesPending.get() > 0
                || store.isSettlingTotals.get()
                || store.isLoadingShippingMethods.get();
            if (loading) {
                return html`
                    <div class="space-y-2"
                         aria-busy="true"
                         aria-label=${t('Hyperion_Checkout::payment_method_aria')}
                         data-payment-methods-loading>
                        <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse" aria-hidden="true"></div>
                        <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse" aria-hidden="true"></div>
                    </div>
                `;
            }
            if (!store.isVirtual.get() && store.appliedShippingMethod.get() === null) {
                return html`<p class="text-sm text-muted" role="status" aria-live="polite" data-payment-methods-waiting>
                    ${t('Hyperion_Checkout::payment_waiting_for_shipping')}
                </p>`;
            }
            return html`<p class="text-sm text-danger" role="alert" data-payment-methods-none>
                ${t('Hyperion_Checkout::payment_none_available')}
            </p>`;
        }
        return html`
            <div role="radiogroup"
                 aria-label=${t('Hyperion_Checkout::payment_method_aria')}
                 class="space-y-2">
                ${repeat(rows, ({ method, token }) => token?.publicHash ?? method.code, ({ method, token }) => html`
                    <payment-method-row
                        class="block"
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
        flowActions().savePaymentMethod();
    }
}

if (!customElements.get('payment-method-list')) {
    customElements.define('payment-method-list', PaymentMethodList);
}

declare global {
    interface HTMLElementTagNameMap { 'payment-method-list': PaymentMethodList; }
}
