// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-payment> -- payment methods + billing-address toggle.
 *
 * Physical cart: shows "billing same as shipping" checkbox (default
 * checked). Unchecking reveals an <address-form mode="billing"> below.
 *
 * Virtual cart: no toggle; always renders the billing form at the top,
 * expanded, since there is no shipping step.
 */
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import type { Address } from '../types/address.js';
import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { debounce } from '../utils/debounce.js';
import { t } from '../utils/i18n.js';
import './address-form.js';
import './address-selector.js';
import './payment-method-list.js';
import './ui/checkbox.js';

export class CheckoutPayment extends SignalWatcher(LitElement) {
    // A billing address entered on its own must reach the quote before the
    // order: typing is debounced like the shipping form, a saved-address
    // pick is synced at once.
    private _syncBilling = debounce(() => {
        void flowActions().syncBillingAddress();
    }, 500);

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const isVirtual = store.isVirtual.get();
        const same = store.billingSameAsShipping.get();
        const billing = store.billingAddress.get();
        const savedAddresses = store.savedAddresses.get();
        const hasSaved = store.customer.get() !== null && savedAddresses.length > 0;

        const billingEditor = hasSaved
            ? html`<address-selector mode="billing"
                                      @address-change=${this._onBillingChange}
                                      @saved-address-select=${this._onSavedBillingPick}
                    ></address-selector>`
            : html`<address-form
                        mode="billing"
                        .value=${billing}
                        .showSaveInAddressBook=${store.customer.get() !== null}
                        @address-change=${this._onBillingChange}
                    ></address-form>`;

        return html`
            <section class="space-y-4">
                ${isVirtual
                    ? html`
                          <div class="space-y-3">
                              <h3 class="text-base font-semibold text-brand">
                                  ${t('Hyperion_Checkout::billing_address_heading')}
                              </h3>
                              ${billingEditor}
                          </div>
                      `
                    : html`
                          <hc-checkbox
                              name="billing_same_as_shipping"
                              label=${t('Hyperion_Checkout::billing_same_as_shipping')}
                              .checked=${same}
                              @value-change=${this._onToggle}
                          ></hc-checkbox>
                          ${same
                              ? nothing
                              : html`
                                    <div class="space-y-3 pt-2 border-t border-subtle">
                                        <h3 class="text-base font-semibold text-brand">
                                            ${t('Hyperion_Checkout::billing_address_heading')}
                                        </h3>
                                        ${billingEditor}
                                    </div>
                                `}
                      `}
                <div class="pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-brand mb-2">
                        ${t('Hyperion_Checkout::payment_method_heading')}
                    </h3>
                    <payment-method-list></payment-method-list>
                </div>
            </section>
        `;
    }

    private _onToggle(e: CustomEvent<{ checked: boolean }>): void {
        getStore().billingSameAsShipping.set(e.detail.checked);
        flowActions().invalidateBillingSync();
        if (!e.detail.checked) void flowActions().syncBillingAddress();
    }

    private _onBillingChange(e: CustomEvent<Address>): void {
        getStore().billingAddress.set(e.detail);
        flowActions().invalidateBillingSync();
        this._syncBilling();
    }

    private _onSavedBillingPick(): void {
        flowActions().invalidateBillingSync();
        void flowActions().syncBillingAddress();
    }
}

if (!customElements.get('checkout-payment')) {
    customElements.define('checkout-payment', CheckoutPayment);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-payment': CheckoutPayment; }
}
