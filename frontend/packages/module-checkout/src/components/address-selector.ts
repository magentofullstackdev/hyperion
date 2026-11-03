// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <address-selector> -- saved-address picker for logged-in customers.
 *
 * Renders each saved address as a selectable card plus a
 * "+ Add new address" disclosure that opens an inline <address-form>.
 * The active address flows through the store slice named on the
 * `mode` attribute (`shipping` -> shippingAddress / selectedShippingAddressId,
 * `billing` -> billingAddress / selectedBillingAddressId).
 *
 * The new-address form starts EMPTY (the customer's name and the default
 * country only), never from the selected saved address: a saved address
 * carries its `id`, and an address with an id travels as
 * `customer_address_id`, which makes core replace whatever was typed with
 * the saved address and never save the new one. The seed object is created
 * once per opening so the form keeps what the shopper types across the
 * selector's re-renders, and every address the form emits is stored
 * without `id` / `customer_id`.
 */
import { LitElement, html } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import type { Address } from '../types/address.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';
import './address-card.js';
import './address-form.js';
import './ui/button.js';

export class AddressSelector extends SignalWatcher(LitElement) {
    @property({ type: String }) public mode: 'shipping' | 'billing' = 'shipping';

    @state() private accessor _showNewForm = false;

    /** The address the open new-address form started from; one object per opening. */
    private _newAddressSeed: Address | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const addresses = store.savedAddresses.get();
        const selectedId = this.mode === 'shipping'
            ? store.selectedShippingAddressId.get()
            : store.selectedBillingAddressId.get();

        if (addresses.length === 0) {
            return html`
                <address-form
                    mode=${this.mode}
                    .showSaveInAddressBook=${true}
                    .value=${this._seedForNewAddress()}
                    @address-change=${this._onNewAddressChange}
                ></address-form>
            `;
        }

        return html`
            <div class="space-y-3">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${addresses.map((a) => this._renderCard(a, selectedId))}
                </div>
                ${this._showNewForm
                    ? html`
                          <div class="mt-3 pt-3 border-t border-subtle">
                              <p class="text-sm font-medium text-brand mb-2">
                                  ${t('Hyperion_Checkout::add_new_address')}
                              </p>
                              <address-form
                                  mode=${this.mode}
                                  .showSaveInAddressBook=${true}
                                  .value=${this._seedForNewAddress()}
                                  @address-change=${this._onNewAddressChange}
                              ></address-form>
                              <div class="mt-2">
                                  <hc-button variant="ghost"
                                             .label=${t('Hyperion_Checkout::cancel')}
                                             @click=${this._closeNewForm}></hc-button>
                              </div>
                          </div>
                      `
                    : html`
                          <div>
                              <hc-button variant="secondary"
                                         .label=${t('Hyperion_Checkout::add_new_address')}
                                         @click=${this._openNewForm}></hc-button>
                          </div>
                      `}
            </div>
        `;
    }

    private _renderCard(a: Address, selectedId: string | null): unknown {
        const id = a.id ?? '';
        const selected = id === selectedId && !this._showNewForm;
        return html`
            <label class="flex items-start gap-3 rounded-md border p-3 cursor-pointer ${selected
                ? 'border-accent bg-accent/5'
                : 'border-subtle bg-surface hover:border-accent'}">
                <input
                    type="radio"
                    name="saved-${this.mode}-address"
                    class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                    .checked=${selected}
                    @change=${() => this._selectSaved(a)}
                />
                <address-card .address=${a} class="flex-1"></address-card>
            </label>
        `;
    }

    private _currentAddress(): Address | null {
        const store = getStore();
        return this.mode === 'shipping'
            ? store.shippingAddress.get()
            : store.billingAddress.get();
    }

    /**
     * The start of a new address: the store's default country, the
     * customer's name and, when the selected saved address has one, its
     * telephone. Nothing that identifies a saved address.
     */
    private _seedForNewAddress(): Address {
        if (this._newAddressSeed === null) {
            const store = getStore();
            const customer = store.customer.get();
            const current = this._currentAddress();
            this._newAddressSeed = {
                country_id: getCheckoutConfig().defaultCountryId,
                street: [],
                city: '',
                firstname: customer?.firstname ?? '',
                lastname: customer?.lastname ?? '',
                telephone: current?.telephone ?? '',
            };
        }
        return this._newAddressSeed;
    }

    private _openNewForm = (): void => {
        this._newAddressSeed = null;
        this._showNewForm = true;
    };

    private _closeNewForm = (): void => {
        this._showNewForm = false;
        this._newAddressSeed = null;
        this._clearSelection();
    };

    private _selectSaved(a: Address): void {
        const store = getStore();
        this._showNewForm = false;
        this._newAddressSeed = null;
        if (this.mode === 'shipping') {
            store.selectedShippingAddressId.set(a.id ?? null);
            store.shippingAddress.set(a);
        } else {
            store.selectedBillingAddressId.set(a.id ?? null);
            store.billingAddress.set(a);
        }
        this.dispatchEvent(new CustomEvent('saved-address-select', {
            detail: { address: a, mode: this.mode },
            bubbles: true,
            composed: true,
        }));
    }

    private _clearSelection(): void {
        const store = getStore();
        if (this.mode === 'shipping') {
            store.selectedShippingAddressId.set(null);
            store.shippingAddress.set(null);
        } else {
            store.selectedBillingAddressId.set(null);
            store.billingAddress.set(null);
        }
    }

    private _onNewAddressChange(e: CustomEvent<Address>): void {
        const store = getStore();
        // A typed address is a new one whatever it was seeded from: without
        // `id` it travels with `save_in_address_book`, never as a saved pick.
        const address: Address = { ...e.detail };
        delete address.id;
        delete address.customer_id;
        if (this.mode === 'shipping') {
            store.selectedShippingAddressId.set(null);
            store.shippingAddress.set(address);
        } else {
            store.selectedBillingAddressId.set(null);
            store.billingAddress.set(address);
        }
    }
}

if (!customElements.get('address-selector')) {
    customElements.define('address-selector', AddressSelector);
}

declare global {
    interface HTMLElementTagNameMap { 'address-selector': AddressSelector; }
}
