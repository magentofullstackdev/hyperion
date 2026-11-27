// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <address-selector>: the address step of a logged-in customer.
 *
 * Renders each saved address as a selectable card (one labeled radio
 * group) plus an "Add New Address" disclosure that opens an inline
 * <address-form>; a customer without saved addresses gets the form alone,
 * seeded with the account's name and flagged for the address book.
 * The active address flows through the store slice named on the
 * `mode` attribute (`shipping` -> shippingAddress / selectedShippingAddressId,
 * `billing` -> billingAddress / selectedBillingAddressId).
 *
 * The new-address form starts EMPTY (the customer's name and the default
 * country only), never from the selected saved address: a saved address
 * carries its `id`, and an address with an id travels as
 * `customer_address_id`, which makes core replace whatever was typed with
 * the saved address and never save the new one. An address the store
 * already holds WITHOUT an id (typed before a reload, restored with the
 * quote) is the exception: it is what the shopper was typing, so the form
 * continues from it. The seed object is created once per opening so the
 * form keeps what the shopper types across the selector's re-renders, and
 * every address the form emits is stored without `id` / `customer_id`.
 *
 * "Cancel" gives back the card that was selected when the form opened.
 * A saved address that lacks a field the store requires says which, with
 * an "Edit" (offered while the form is closed) that opens the form on a
 * copy of it without its id: the corrected address is saved as a new one. With saved addresses and no
 * selection (no default address) the first one of an allowed country is
 * selected at mount.
 *
 * Emits `saved-address-select` when a saved address becomes the active
 * one and relays the form's `address-change`.
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import type { Address } from '../types/address.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';
import { missingAddressFields, readAddressFieldConfig } from '../utils/address-validation.js';
import './address-card.js';
import './address-form.js';
import './ui/button.js';

/** The label key of a field `missingAddressFields()` names. */
const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
    firstname: 'Hyperion_Checkout::firstname_label',
    lastname: 'Hyperion_Checkout::lastname_label',
    prefix: 'Hyperion_Checkout::prefix_label',
    middlename: 'Hyperion_Checkout::middlename_label',
    suffix: 'Hyperion_Checkout::suffix_label',
    company: 'Hyperion_Checkout::company_label',
    country_id: 'Hyperion_Checkout::country_label',
    street: 'Hyperion_Checkout::street_label_primary',
    postcode: 'Hyperion_Checkout::postcode_label',
    city: 'Hyperion_Checkout::city_label',
    region: 'Hyperion_Checkout::region_label',
    telephone: 'Hyperion_Checkout::telephone_label',
    fax: 'Hyperion_Checkout::fax_label',
};

function hasId(address: Address | null): boolean {
    return address !== null && address.id != null && address.id !== '';
}

export class AddressSelector extends SignalWatcher(LitElement) {
    @property({ type: String }) public mode: 'shipping' | 'billing' = 'shipping';

    @state() private accessor _showNewForm = false;

    /** The address the open new-address form started from; one object per opening. */
    private _newAddressSeed: Address | null = null;

    /** The saved address that was selected when the form opened: "Cancel" gives it back. */
    private _previous: Address | null = null;

    /**
     * The form was opened when the element connected (an address without an
     * id in the store), not by the shopper, who has not picked, opened or
     * cancelled anything since.
     */
    private _openedAtConnect = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this.classList.add('hc-host');
        this._adoptInitialState();
    }

    /**
     * What the store holds when the step appears: an address without an id
     * next to saved addresses is a new address in progress (its form opens);
     * no address at all selects the first saved one that can be used.
     */
    private _adoptInitialState(): void {
        const store = getStore();
        const addresses = store.savedAddresses.get();
        if (addresses.length === 0) return;
        const current = this._currentAddress();
        if (current !== null) {
            if (!hasId(current)) {
                this._showNewForm = true;
                this._openedAtConnect = true;
            }
            return;
        }
        const first = this._firstUsable();
        if (first) this._selectSaved(first);
    }

    /** The first saved address whose country the store sells to (any, when the directory is unknown). */
    private _firstUsable(): Address | null {
        const directory = readAddressFieldConfig().directoryData ?? {};
        const known = Object.keys(directory).length > 0;
        const addresses = getStore().savedAddresses.get();
        return addresses.find((a) => !known || directory[a.country_id] !== undefined) ?? null;
    }

    /**
     * A form opened at the connection only ever emits addresses without an
     * id, so a saved address in the store means that something else chose
     * it (the typed address a shipping extension gives back, before or
     * after the first render): the card is shown selected, never the form
     * with what it held, nor an empty new address. A form the shopper
     * opened is not concerned.
     */
    public override willUpdate(): void {
        if (this._openedAtConnect && hasId(this._currentAddress())) {
            this._showNewForm = false;
            this._newAddressSeed = null;
            this._openedAtConnect = false;
        }
    }

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

        const cfg = readAddressFieldConfig();
        return html`
            <div>
                <div class="hc-field-row hc-field-row-2"
                     role="radiogroup"
                     aria-label=${this.mode === 'shipping'
                         ? t('Hyperion_Checkout::shipping_address_heading')
                         : t('Hyperion_Checkout::billing_address_heading')}>
                    ${addresses.map((a) => this._renderCard(a, selectedId, missingAddressFields(a, cfg)))}
                </div>
                ${this._showNewForm
                    ? html`
                          <div class="mt-4 pt-4 border-t border-subtle">
                              <p class="text-sm font-medium text-brand mb-3">
                                  ${t('Hyperion_Checkout::add_new_address')}
                              </p>
                              <address-form
                                  mode=${this.mode}
                                  .showSaveInAddressBook=${true}
                                  .value=${this._seedForNewAddress()}
                                  @address-change=${this._onNewAddressChange}
                              ></address-form>
                              <div class="mt-3">
                                  <hc-button variant="ghost"
                                             .label=${t('Hyperion_Checkout::cancel')}
                                             data-hyperion-address-cancel
                                             @click=${this._closeNewForm}></hc-button>
                              </div>
                          </div>
                      `
                    : html`
                          <div class="mt-4">
                              <hc-button variant="secondary"
                                         .label=${t('Hyperion_Checkout::add_new_address')}
                                         data-hyperion-address-new
                                         @click=${this._openNewForm}></hc-button>
                          </div>
                      `}
            </div>
        `;
    }

    private _renderCard(a: Address, selectedId: string | null, missing: readonly string[]): unknown {
        const id = a.id ?? '';
        const selected = id === selectedId && !this._showNewForm;
        return html`
            <div data-hyperion-address-card=${id}>
                <label class="flex h-full items-start gap-3 rounded-lg border p-3 cursor-pointer ${selected
                    ? 'border-accent bg-accent/5'
                    : 'border-subtle bg-surface hover:border-accent'}">
                    <input
                        type="radio"
                        name="saved-${this.mode}-address"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${selected}
                        @change=${() => this._selectSaved(a)}
                    />
                    <span class="flex-1">
                        <address-card .address=${a}></address-card>
                        ${missing.length > 0
                            ? html`<span class="mt-2 block text-sm text-danger" data-hyperion-address-incomplete>
                                  ${t('Hyperion_Checkout::address_incomplete_notice', { fields: this._fieldNames(missing) })}
                              </span>`
                            : nothing}
                    </span>
                </label>
                ${missing.length > 0 && !this._showNewForm
                    ? html`
                          <div class="mt-1">
                              <hc-button variant="ghost"
                                         .label=${t('Hyperion_Checkout::address_edit')}
                                         data-hyperion-address-edit
                                         @click=${() => this._editSaved(a)}></hc-button>
                          </div>
                      `
                    : nothing}
            </div>
        `;
    }

    private _fieldNames(fields: readonly string[]): string {
        return fields.map((field) => {
            const key = FIELD_LABEL_KEYS[field];
            return key ? t(key) : field;
        }).join(', ');
    }

    private _currentAddress(): Address | null {
        const store = getStore();
        return this.mode === 'shipping'
            ? store.shippingAddress.get()
            : store.billingAddress.get();
    }

    /**
     * The start of a new address: the address in progress when the store
     * holds one without an id; otherwise the store's default country, the
     * customer's name and, when the selected saved address has one, its
     * telephone. Nothing that identifies a saved address.
     */
    private _seedForNewAddress(): Address {
        if (this._newAddressSeed === null) {
            const store = getStore();
            const customer = store.customer.get();
            const current = this._currentAddress();
            this._newAddressSeed = current !== null && !hasId(current)
                ? current
                : {
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

    /**
     * The form is about to replace the selected address: the rates on
     * screen belong to that one, so the shipping step waits for the new
     * address again.
     */
    private _beginNewAddress(seed: Address | null): void {
        this._openedAtConnect = false;
        const current = this._currentAddress();
        this._previous = hasId(current) ? current : this._previous;
        this._newAddressSeed = seed;
        this._showNewForm = true;
        if (this.mode === 'shipping') getStore().estimateState.set('idle');
    }

    private _openNewForm = (): void => {
        this._beginNewAddress(null);
    };

    /** The form on a copy of a saved address, without what identifies it. */
    private _editSaved(a: Address): void {
        const copy: Address = { ...a };
        delete copy.id;
        delete copy.customer_id;
        delete copy.default_shipping;
        delete copy.default_billing;
        delete copy.inline;
        this._beginNewAddress(copy);
    }

    private _closeNewForm = (): void => {
        this._openedAtConnect = false;
        const previous = this._previous ?? this._firstUsable();
        this._showNewForm = false;
        this._newAddressSeed = null;
        if (previous !== null) {
            this._selectSaved(previous);
        } else {
            this._clearSelection();
        }
    };

    private _selectSaved(a: Address): void {
        this._openedAtConnect = false;
        const store = getStore();
        this._showNewForm = false;
        this._newAddressSeed = null;
        this._previous = null;
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
