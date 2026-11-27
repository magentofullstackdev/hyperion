// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-shipping>: wraps the shipping address editor and the
 * method list. Hidden when `isVirtual === true`.
 *
 * A logged-in customer always gets the <address-selector> (saved address
 * cards, or the form seeded with the account's name and flagged for the
 * address book when there is none); a guest the bare <address-form>.
 *
 * The slots `after-shipping-address` and `after-shipping-methods` of the
 * extension API sit under the address and under the rates (hidden while
 * empty). The shipping extensions (`hyperion.shippingExtensions`) are a
 * chunk of their own (`shipping-extension-host.ts`), imported only when the
 * list is not empty; once it arrived, it draws the address step around the
 * editor and its host under the rates (`shippingExtensionView`). Until then,
 * and without extensions, the step is the editor alone.
 */
import { LitElement, html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { SignalWatcher } from '@lit-labs/signals';

import type { Address } from '../types/address.js';
import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { t } from '../utils/i18n.js';
import { sanitiseHtml } from '../utils/sanitize-html.js';
import '../extension/slot-outlet.js';
import './address-form.js';
import './address-selector.js';
import './section-status.js';
import './shipping-method-list.js';
import './ui/button.js';
import { shippingExtensionsUnavailable, shippingExtensionView } from './shipping-extension-view.js';

export class CheckoutShipping extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this.classList.add('hc-host');
        // The chunk starts itself and installs its view (`shippingExtensionView`);
        // a failed load is tried once more after a second.
        if ((getCheckoutConfig().hyperion?.shippingExtensions?.length ?? 0) > 0 && !getStore().isVirtual.get()) {
            const load = (): Promise<unknown> => import('./shipping-extension-host.js');
            void load()
                .catch(() => new Promise((resolve) => setTimeout(resolve, 1000)).then(load))
                .catch((err: unknown) => {
                    console.error('[hyperion-checkout] the shipping extensions could not be loaded', err);
                    shippingExtensionsUnavailable();
                });
        }
    }

    public override render(): unknown {
        const store = getStore();
        if (store.isVirtual.get()) return null;
        const editor = this._renderEditor();
        const view = shippingExtensionView.get();
        return html`
            <div>
                <h3 class="mb-4 text-base font-semibold text-brand">
                    ${t('Hyperion_Checkout::shipping_address_heading')}
                </h3>
                ${view === null ? editor : view.address(editor)}
                <hc-section-status section="shipping-address"></hc-section-status>
                <hc-slot-outlet name="after-shipping-address"></hc-slot-outlet>
                <div class="mt-4 pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-brand mb-2">
                        ${t('Hyperion_Checkout::shipping_method_heading')}
                    </h3>
                    <shipping-method-list></shipping-method-list>
                    ${view?.afterMethods() ?? nothing}
                    <hc-slot-outlet name="after-shipping-methods"></hc-slot-outlet>
                    ${this._renderShippingPolicy()}
                </div>
            </div>
        `;
    }

    private _renderEditor(): unknown {
        const store = getStore();
        return store.customer.get() !== null
            ? html`<address-selector mode="shipping"
                                      @saved-address-select=${this._onSavedPick}
                                      @address-change=${this._onAddressChange}
                                      @focusout=${this._onFormFocusOut}
                    ></address-selector>`
            : html`<address-form
                        mode="shipping"
                        .value=${store.shippingAddress.get()}
                        @address-change=${this._onAddressChange}
                        @focusout=${this._onFormFocusOut}
                    ></address-form>`;
    }

    /**
     * `shipping/shipping_policy/*`: a button that opens the merchant's policy
     * text in a modal <dialog>. The content is admin HTML (core nl2br's it),
     * passed through the shared sanitizer like every other HTML we render.
     */
    private _renderShippingPolicy(): unknown {
        const policy = getCheckoutConfig().shippingPolicy;
        if (!policy || !policy.isEnabled) return nothing;
        const content = sanitiseHtml(policy.shippingPolicyContent ?? '');
        if (content.trim() === '') return nothing;
        return html`
            <div class="pt-3">
                <button type="button"
                        class="flex min-h-6 items-center text-sm font-medium text-accent hover:underline"
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

    /**
     * An edit of the form: the address goes into the store and the flow
     * decides what it asks for. Rates are asked again only when a field
     * they depend on changed (after a pause in the typing; at once for
     * another country, which is a pick, not typing); every other edit only
     * marks the form as ahead of the quote, saved when the form loses the
     * focus, after a pause, or by Place Order.
     */
    private _onAddressChange(e: CustomEvent<Address>): void {
        const store = getStore();
        const previousCountry = store.shippingAddress.get()?.country_id ?? '';
        store.shippingAddress.set(e.detail);
        if (previousCountry !== '' && e.detail.country_id !== previousCountry) {
            void flowActions().estimateShippingNow();
        } else {
            flowActions().scheduleShippingEstimate();
        }
    }

    /**
     * The focus left the address form or the saved address step (not for
     * another of its controls): save a form that is ahead of the quote now.
     */
    private _onFormFocusOut(e: FocusEvent): void {
        const form = e.currentTarget as HTMLElement | null;
        const next = e.relatedTarget;
        if (form !== null && next instanceof Node && form.contains(next)) return;
        flowActions().flushShippingForm();
    }

    private _onSavedPick(): void {
        // A saved address arrives complete: no typing to wait for.
        void flowActions().estimateShippingNow();
    }
}

if (!customElements.get('checkout-shipping')) {
    customElements.define('checkout-shipping', CheckoutShipping);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-shipping': CheckoutShipping; }
}
