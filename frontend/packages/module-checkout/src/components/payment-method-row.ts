// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-method-row> -- one selectable payment option.
 *
 * Usually one row per method. A vault method shows one row per stored token
 * instead: the list passes `token` and the row takes its title from the
 * provider's vault adapter (brand, last four, expiry).
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { PaymentMethodConfig } from '../types/payment.js';
import { t } from '../utils/i18n.js';
import { getPaymentRenderer, isSafeForGeneric } from './payment-renderers/registry.js';
import { getVaultAdapter, type VaultToken } from './payment-renderers/vault-tokens.js';
import './payment-renderers/payment-offline.js';
import './payment-renderers/payment-generic.js';
import './payment-renderers/payment-vault.js';

export class PaymentMethodRow extends LitElement {
    @property({ type: Object }) public method!: PaymentMethodConfig;
    @property({ attribute: false }) public token: VaultToken | null = null;
    /** Changes when a lazily loaded renderer registered itself, so the row renders again. */
    @property({ type: Number }) public renderersVersion = 0;
    @property({ type: Boolean }) public selected = false;

    /**
     * The renderer element of the selected row. It is kept across re-renders:
     * gateway renderers hold live state (hosted card fields, a PayPal
     * authorisation in progress) that a fresh element would wipe whenever the
     * method list is refreshed.
     */
    private _body: HTMLElement | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const m = this.method;
        const hasRenderer = getPaymentRenderer(m.code) !== null;
        const safe = isSafeForGeneric(m.code);
        const id = this.token ? `hc-pay-${this.token.key}` : `hc-pay-${m.code}`;
        const title = this.token
            ? getVaultAdapter(m.code)?.label(this.token) ?? m.title
            : m.title;
        // Disabled when: not selectable via generic fallback (no renderer AND not in the safe set)
        const disabled = !hasRenderer && !safe;
        return html`
            <div class="rounded-md border ${this.selected ? 'border-accent bg-accent/5' : 'border-subtle bg-surface'} ${disabled ? 'opacity-60' : ''}">
                <label for=${id}
                       class="flex items-start gap-3 p-3 cursor-pointer ${disabled ? 'cursor-not-allowed' : ''}">
                    <input
                        id=${id}
                        type="radio"
                        name="payment_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${this.selected}
                        ?disabled=${disabled}
                        @change=${this._onSelect}
                    />
                    <span class="text-sm">
                        <span class="font-medium text-brand">${title}</span>
                        ${disabled
                            ? html`<span class="block text-xs text-muted" data-payment-unsupported>
                                  ${t('Hyperion_Checkout::payment_method_unsupported_hint')}
                              </span>`
                            : nothing}
                    </span>
                </label>
                ${this.selected ? this._renderSelectedBody() : this._dropBody()}
            </div>
        `;
    }

    private _renderSelectedBody(): unknown {
        const renderer = getPaymentRenderer(this.method.code);
        const safe = isSafeForGeneric(this.method.code);
        if (renderer) {
            return html`<div class="px-3 pb-3">
                ${this._bodyElement(renderer.component, this.method.code)}
            </div>`;
        }
        this._body = null;
        if (safe) {
            // Offline method registered but no extra renderer needed -- nothing to show.
            return null;
        }
        return html`<div class="px-3 pb-3">
            <payment-generic code=${this.method.code}></payment-generic>
        </div>`;
    }

    /**
     * Render a custom element dynamically. `tag` is trusted because it comes
     * from `getPaymentRenderer()`, which only returns registered (internal)
     * tag names.
     */
    private _bodyElement(tag: string, code: string): HTMLElement {
        const current = this._body;
        if (current && current.localName === tag && current.getAttribute('code') === code) {
            return current;
        }
        const el = document.createElement(tag);
        el.setAttribute('code', code);
        this._body = el;
        return el;
    }

    private _dropBody(): null {
        this._body = null;
        return null;
    }

    private _onSelect(): void {
        this.dispatchEvent(new CustomEvent('payment-select', {
            detail: {
                code: this.method.code,
                ...(this.token ? { publicHash: this.token.publicHash } : {}),
            },
            bubbles: true,
            composed: true,
        }));
    }
}

if (!customElements.get('payment-method-row')) {
    customElements.define('payment-method-row', PaymentMethodRow);
}

declare global {
    interface HTMLElementTagNameMap { 'payment-method-row': PaymentMethodRow; }
}
