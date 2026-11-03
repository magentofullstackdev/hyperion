// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-shipping> -- wraps the shipping address editor + the
 * method list. Hidden when `isVirtual === true`.
 *
 * When the customer is logged in and has saved addresses, renders
 * an <address-selector> instead of a bare <address-form>.
 */
import { LitElement, html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { SignalWatcher } from '@lit-labs/signals';

import type { Address } from '../types/address.js';
import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { debounce } from '../utils/debounce.js';
import { t } from '../utils/i18n.js';
import { sanitiseHtml } from '../utils/sanitize-html.js';
import './address-form.js';
import './address-selector.js';
import './shipping-method-list.js';
import './ui/button.js';

export class CheckoutShipping extends SignalWatcher(LitElement) {
    private _triggerEstimate = debounce(() => {
        void flowActions().estimateShipping();
    }, 500);

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        if (store.isVirtual.get()) return null;
        const addr = store.shippingAddress.get();
        const savedAddresses = store.savedAddresses.get();
        const hasSaved = store.customer.get() !== null && savedAddresses.length > 0;
        return html`
            <section class="space-y-4">
                <h3 class="text-base font-semibold text-brand">
                    ${t('Hyperion_Checkout::shipping_address_heading')}
                </h3>
                ${hasSaved
                    ? html`<address-selector mode="shipping"
                                              @saved-address-select=${this._onSavedPick}
                                              @address-change=${this._onAddressChange}
                            ></address-selector>`
                    : html`<address-form
                                mode="shipping"
                                .value=${addr}
                                @address-change=${this._onAddressChange}
                            ></address-form>`}
                <div class="pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-brand mb-2">
                        ${t('Hyperion_Checkout::shipping_method_heading')}
                    </h3>
                    <shipping-method-list></shipping-method-list>
                    ${this._renderShippingPolicy()}
                </div>
            </section>
        `;
    }

    /**
     * `shipping/shipping_policy/*`: a button that opens the merchant's policy
     * text in a modal <dialog>. The content is admin HTML (core nl2br's it),
     * passed through the shared sanitiser like every other HTML we render.
     */
    private _renderShippingPolicy(): unknown {
        const policy = getCheckoutConfig().shippingPolicy;
        if (!policy || !policy.isEnabled) return nothing;
        const content = sanitiseHtml(policy.shippingPolicyContent ?? '');
        if (content.trim() === '') return nothing;
        return html`
            <div class="pt-3">
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        data-hyperion-shipping-policy-open
                        @click=${this._openPolicy}>
                    ${t('Hyperion_Checkout::shipping_policy_open')}
                </button>
                <dialog class="w-full max-w-lg rounded-md border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                        aria-labelledby="hc-shipping-policy-heading"
                        data-hyperion-shipping-policy>
                    <div class="p-4 space-y-3">
                        <h3 id="hc-shipping-policy-heading" class="text-base font-semibold text-brand">
                            ${t('Hyperion_Checkout::shipping_policy_heading')}
                        </h3>
                        <div class="text-sm text-brand space-y-2 max-h-[60vh] overflow-y-auto">${unsafeHTML(content)}</div>
                        <div class="flex justify-end">
                            <hc-button variant="secondary"
                                       .label=${t('Hyperion_Checkout::shipping_policy_close')}
                                       @click=${this._closePolicy}></hc-button>
                        </div>
                    </div>
                </dialog>
            </div>
        `;
    }

    private _openPolicy = (): void => {
        const dialog = this.querySelector<HTMLDialogElement>('dialog[data-hyperion-shipping-policy]');
        if (!dialog) return;
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    };

    private _closePolicy = (): void => {
        const dialog = this.querySelector<HTMLDialogElement>('dialog[data-hyperion-shipping-policy]');
        if (!dialog) return;
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    };

    private _onAddressChange(e: CustomEvent<Address>): void {
        const store = getStore();
        store.shippingAddress.set(e.detail);
        this._triggerEstimate();
    }

    private _onSavedPick(): void {
        // Saved-address pick is synchronous enough to fire the estimate immediately.
        void flowActions().estimateShipping();
    }
}

if (!customElements.get('checkout-shipping')) {
    customElements.define('checkout-shipping', CheckoutShipping);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-shipping': CheckoutShipping; }
}
