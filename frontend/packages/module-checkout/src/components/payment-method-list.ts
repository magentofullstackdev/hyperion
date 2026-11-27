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
 * A method no renderer entry serves (or whose module failed) is not shown
 * (`payment-host/payment-rows.ts`). When that leaves nothing while the
 * server offered methods, the list says no method is available, as for a
 * quote the server offers nothing for, and the console names the hidden
 * codes. A store that asks for it shows those methods as diagnostic rows
 * at the end of the list, once the payment host is there.
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
 *
 * When the offered methods change and the selection is dropped with them,
 * a polite live region says that the payment methods were updated, once
 * per change.
 */
import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { t } from '../utils/i18n.js';
import { offeredPaymentMethods } from '../utils/payment-offer.js';
import { ensureEntriesFor, paymentHostNow } from './payment-host/host.js';
import {
    buildPaymentRows,
    getSelectedVaultToken,
    selectVaultToken,
    unsupportedReason,
} from './payment-host/payment-rows.js';
import './payment-host/importer.js';
import './payment-method-row.js';

export class PaymentMethodList extends SignalWatcher(LitElement) {
    /** The offered codes and the selection of the previous render. */
    private _last: { codes: string; selected: string | null } | null = null;
    private _announcement = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const methods = offeredPaymentMethods(store.availablePaymentMethods.get(), store.totals.get());
        const selectedNow = store.selectedPaymentMethod.get();
        const codes = methods.map((method) => method.code).join(',');
        if (this._last !== null && this._last.codes !== codes && this._last.selected !== null && selectedNow === null) {
            this._announcement = t('Hyperion_Checkout::payment_methods_updated');
        } else if (this._last !== null && this._last.codes !== codes) {
            this._announcement = '';
        }
        this._last = { codes, selected: selectedNow };
        return html`
            <p class="sr-only" role="status" aria-live="polite" data-payment-methods-status>${this._announcement}</p>
            ${this._renderList(methods)}
        `;
    }

    private _renderList(methods: ReturnType<typeof offeredPaymentMethods>): unknown {
        const store = getStore();
        ensureEntriesFor(methods);
        const rows = buildPaymentRows(methods);
        const host = paymentHostNow();
        if (host !== null) {
            for (const row of rows) host.checkUsable(row.entry, row.method.code);
        }
        const selected = store.selectedPaymentMethod.get();
        const diagnostics = host !== null && host.showsUnsupportedPayments() ? host.unsupportedRows(store.availablePaymentMethods.get()) : [];
        if (rows.length === 0 && diagnostics.length === 0) {
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
            if (methods.length === 0 && !store.isVirtual.get() && store.appliedShippingMethod.get() === null) {
                return html`<p class="text-sm text-muted" role="status" aria-live="polite" data-payment-methods-waiting>
                    ${t('Hyperion_Checkout::payment_waiting_for_shipping')}
                </p>`;
            }
            host?.reportHidden(methods.filter((method) => unsupportedReason(method.code) !== null).map((method) => method.code));
            return html`<p class="text-sm text-danger" role="alert" data-payment-methods-none>
                ${t('Hyperion_Checkout::payment_none_available')}
            </p>`;
        }
        return html`
            <div role="radiogroup"
                 aria-label=${t('Hyperion_Checkout::payment_method_aria')}
                 class="space-y-2">
                ${repeat(rows, (row) => row.token?.publicHash ?? row.method.code, (row) => html`
                    <payment-method-row
                        class="block"
                        .row=${row}
                        .selected=${selected === row.method.code
                            && (row.token === null
                                || getSelectedVaultToken(row.method.code)?.publicHash === row.token.publicHash)}
                        @payment-select=${this._onSelect}
                    ></payment-method-row>
                `)}
                ${diagnostics.length > 0
                    ? repeat(diagnostics, (row) => `unsupported:${row.method.code}`, (row) => html`
                        <payment-method-row class="block" .unsupported=${row}></payment-method-row>
                    `)
                    : nothing}
            </div>
        `;
    }

    private _onSelect(e: CustomEvent<{ code: string; publicHash?: string }>): void {
        const store = getStore();
        if (e.detail.publicHash) {
            selectVaultToken(e.detail.code, e.detail.publicHash);
            store.selectedPaymentMethod.set(e.detail.code);
            return;
        }
        store.selectedPaymentMethod.set(e.detail.code);
        flowActions().savePaymentMethod();
    }
}

if (!customElements.get('payment-method-list')) {
    customElements.define('payment-method-list', PaymentMethodList);
}

declare global {
    interface HTMLElementTagNameMap { 'payment-method-list': PaymentMethodList; }
}
