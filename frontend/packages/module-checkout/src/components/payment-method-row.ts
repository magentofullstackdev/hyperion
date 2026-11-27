// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-method-row> -- one selectable payment option, and the host of
 * the payment element of its renderer entry.
 *
 * Usually one row per method. A vault method shows one row per stored token
 * instead: the list passes the token and, once the payment host is there,
 * the row takes its title from the entry's element class
 * (`describeToken()`) or from the token details; the method title before.
 *
 * The selected row shows the element of its entry in its body: created once
 * per row (`payment-host/mount.ts`), with its properties set before it is
 * connected, and kept when the row is deselected, so a gateway that holds
 * live state (hosted card fields, an authorization in progress) keeps it
 * across a switch to another method and back. The body comes with the
 * payment host (`payment-host/row-view.ts`): an entry that awaits its
 * element's `ready` shows a placeholder of a fixed height until then, and
 * an inline error with Retry when it does not come; a busy element is
 * covered by a status line.
 *
 * A row whose entry module is still on its way (`pending`) holds its place
 * and cannot be selected yet.
 *
 * `unsupported` turns the row into the diagnostic line of a method the
 * checkout cannot render (shown only when the store asks for it): title,
 * code, the reason and the module URL, never selectable; a module that
 * failed to load offers Retry.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { loadEntry, loadPaymentHost, paymentHostNow } from './payment-host/host.js';
import type { PaymentRow, UnsupportedRow } from './payment-host/payment-rows.js';
import { rowKeyOf } from './payment-host/row-state.js';

export class PaymentMethodRow extends SignalWatcher(LitElement) {
    @property({ attribute: false }) public row: PaymentRow | null = null;
    @property({ attribute: false }) public unsupported: UnsupportedRow | null = null;
    @property({ type: Boolean }) public selected = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const host = paymentHostNow();
        if (this.unsupported !== null) {
            if (host === null) return nothing;
            return host.renderUnsupportedRow(this.unsupported, this._onRetryEntry);
        }
        const row = this.row;
        if (row === null) return nothing;
        const m = row.method;
        const id = row.token ? `hc-pay-${row.token.key}` : `hc-pay-${m.code}`;
        const title = row.token && host !== null ? host.tokenTitle(row) : m.title;
        return html`
            <div class="rounded-md border ${this.selected ? 'border-accent bg-accent/5' : 'border-subtle bg-surface'}">
                <label for=${id}
                       class="flex items-start gap-3 p-3 cursor-pointer ${row.pending ? 'cursor-not-allowed' : ''}">
                    <input
                        id=${id}
                        type="radio"
                        name="payment_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${this.selected}
                        ?disabled=${row.pending}
                        @change=${this._onSelect}
                    />
                    <span class="text-sm">
                        <span class="font-medium text-brand">${title}</span>
                    </span>
                </label>
                ${this.selected && host !== null ? host.renderRowBody(row, this._onRetryRow) : nothing}
            </div>
        `;
    }

    protected override updated(): void {
        const row = this.row;
        if (!this.selected || row === null || this.unsupported !== null) return;
        const host = paymentHostNow();
        if (host === null) {
            void loadPaymentHost().then(() => this.requestUpdate(), (err: unknown) => {
                console.error('[hyperion-checkout] the payment host could not be loaded', err);
            });
            return;
        }
        const body = this.querySelector<HTMLElement>('[data-payment-body]');
        if (body === null) return;
        const rowKey = rowKeyOf(row.method.code, row.token);
        const element = host.elementFor({
            rowKey,
            entry: row.entry,
            method: { code: row.method.code, title: row.method.title },
            token: row.token as never,
        });
        if (element === null) {
            void loadEntry(row.entry);
            return;
        }
        host.attach(body, rowKey, element);
    }

    private _onSelect(): void {
        const row = this.row;
        if (row === null) return;
        this.dispatchEvent(new CustomEvent('payment-select', {
            detail: {
                code: row.method.code,
                ...(row.token ? { publicHash: row.token.publicHash } : {}),
            },
            bubbles: true,
            composed: true,
        }));
    }

    private _onRetryRow = (): void => {
        const row = this.row;
        if (row === null) return;
        paymentHostNow()?.retryRow(rowKeyOf(row.method.code, row.token));
        this.requestUpdate();
    };

    private _onRetryEntry = (): void => {
        const entry = this.unsupported?.entry;
        if (entry) void loadPaymentHost().then((host) => host.retryEntry(entry));
    };
}

if (!customElements.get('payment-method-row')) {
    customElements.define('payment-method-row', PaymentMethodRow);
}

declare global {
    interface HTMLElementTagNameMap { 'payment-method-row': PaymentMethodRow; }
}
