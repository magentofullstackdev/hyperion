// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <place-order-button> -- primary CTA.
 *
 * Not rendered while the selected method's renderer `ownsPlaceOrder`
 * (it completes the order with its own control). Otherwise gated by the
 * `canPlaceOrder` selector: while it is false the button is soft-disabled
 * (`aria-disabled`, still focusable and clickable, Enter / Space as any
 * button) and a press reveals what is missing instead of doing nothing:
 * every form shows its pending errors (`requestValidation()`), the email
 * error is set, one hint line names the first missing piece and the
 * keyboard focus moves to the first invalid field (or to the hint). The
 * order is never placed while the gate is closed. A press while the
 * shipping form is ahead of the quote (an edit whose rates were not
 * estimated yet, a save in flight) first waits for that work, so the order
 * goes out against the address in the form or not at all. Once the gate is
 * open, a click:
 *   1. Runs the selected method's `beforePlaceOrder` hook (collects
 *      token/nonce/PO number into `paymentMethodData`). Gateway hooks
 *      can take a while (tokenization, a 3D Secure challenge), so the
 *      button shows its loading state and ignores further clicks.
 *   2. Calls `flowActions().placeOrder()`, or the renderer's `placeOrder`
 *      when it has one (redirect gateways).
 *   3. On success, navigates to `/checkout/onepage/success` (stock
 *      Magento success page) or to the URL the renderer resolved with; the
 *      loading state stays until the browser leaves. On failure the
 *      renderer's `afterPlaceOrderFailed` hook runs.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { flowActions } from '../store/flow-actions.js';
import { renderersVersion } from './payment-renderers/lazy-renderers.js';
import { getPaymentRenderer, type PaymentRenderer } from './payment-renderers/registry.js';
import { initFlowSelectors } from '../store/flow-selectors.js';
import { checkoutUpdatingMessage, placeOrderHint } from '../store/place-order-hint.js';
import { requestValidation } from '../store/validation-request.js';
import { t } from '../utils/i18n.js';
import { email as emailValidator } from '../validation/rules.js';
import { navigateTo } from '../utils/navigate.js';
import { decideRedirectTarget, resolveSameOriginUrl } from '../utils/safe-redirect.js';
import './ui/button.js';

export { placeOrderHint };

export class PlaceOrderButton extends SignalWatcher(LitElement) {
    private readonly _selectors = initFlowSelectors();

    @state() private _preparing = false;
    /** What the last early press found missing; cleared once the gate opens. */
    @state() private _hint: string | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override willUpdate(): void {
        if (this._hint === null) return;
        if (this._selectors.canPlaceOrder.get()) {
            this._hint = null;
        } else if (this._hint === checkoutUpdatingMessage()) {
            // The update ended without opening the gate: name what is
            // missing now instead of an update that is no longer running.
            this._hint = placeOrderHint(getStore(), this._selectors);
        }
    }

    public override render(): unknown {
        renderersVersion.get();
        const method = getStore().selectedPaymentMethod.get();
        if (method && getPaymentRenderer(method)?.ownsPlaceOrder?.()) return nothing;
        const can = this._selectors.canPlaceOrder.get();
        const placing = this._preparing || getStore().isPlacingOrder.get();
        return html`
            <hc-button variant="primary"
                       .label=${t(placing ? 'Hyperion_Checkout::placing_order' : 'Hyperion_Checkout::place_order')}
                       .softDisabled=${!can}
                       .loading=${placing}
                       @click=${this._onClick}></hc-button>
            ${this._hint !== null
                ? html`<p class="mt-2 text-sm text-danger"
                          role="status"
                          tabindex="-1"
                          data-place-order-hint>${this._hint}</p>`
                : nothing}
        `;
    }

    private _onClick = async (): Promise<void> => {
        const store = getStore();
        // A second press while the first is still at work does nothing.
        if (this._preparing || store.isPlacingOrder.get() || store.orderPlaced.get()) return;
        // The form may be ahead of the quote: let the pending estimate and
        // saves finish, then decide on what the server confirmed.
        if (
            store.shippingDirty.get()
            || store.isLoadingShippingMethods.get()
            || store.isSavingShipping.get()
            || store.isSavingBilling.get()
        ) {
            this._preparing = true;
            try {
                await flowActions().settleShipping();
            } finally {
                this._preparing = false;
            }
        }
        if (!this._selectors.canPlaceOrder.get()) {
            await this._revealMissing();
            return;
        }
        const method = store.selectedPaymentMethod.get();
        if (!method) return;

        // Run the renderer's beforePlaceOrder hook if any.
        const renderer = getPaymentRenderer(method);
        if (renderer?.beforePlaceOrder) {
            this._preparing = true;
            store.globalError.set(null);
            try {
                const data = await renderer.beforePlaceOrder();
                const current = store.paymentMethodData.get();
                store.paymentMethodData.set({ ...current, [method]: data });
            } catch (err) {
                store.globalError.set((err as Error).message || t('Hyperion_Checkout::unexpected_error'));
                return;
            } finally {
                this._preparing = false;
            }
        }

        if (renderer?.placeOrder) {
            await this._placeThroughRenderer(renderer.placeOrder, renderer);
            return;
        }

        // A number, or the marker of an order confirmed by the quote after
        // its answer was lost: both continue on the success page.
        const orderId = await flowActions().placeOrder();
        if (orderId !== null) {
            navigateTo(decideRedirectTarget(getCheckoutConfig().defaultSuccessPageUrl));
            return;
        }
        renderer?.afterPlaceOrderFailed?.();
    };

    /**
     * Pressed too early: show every pending error, name the first missing
     * piece and move the focus to the first invalid field (or to the hint
     * when the missing piece is not a field: a method, the agreements).
     * Nothing is missing while the order is only being updated: the hint
     * is announced as a status and the focus stays where it is.
     */
    private async _revealMissing(): Promise<void> {
        const store = getStore();
        if (!this._selectors.emailValid.get()) {
            const err = emailValidator(store.email.get());
            if (err) store.fieldErrors.set({ ...store.fieldErrors.get(), email: t(err) });
        }
        requestValidation();
        this._hint = placeOrderHint(store, this._selectors);
        if (this._hint === checkoutUpdatingMessage()) return;
        // The forms render their errors on their own update cycle.
        await this.updateComplete;
        await new Promise((resolve) => setTimeout(resolve, 0));
        const root: ParentNode = this.closest('checkout-app') ?? document;
        const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]');
        const target = invalid ?? this.querySelector<HTMLElement>('[data-place-order-hint]');
        target?.focus();
    }

    /** The button stays in its loading state while the browser leaves the page. */
    private async _placeThroughRenderer(
        placeOrder: NonNullable<PaymentRenderer['placeOrder']>,
        renderer: PaymentRenderer
    ): Promise<void> {
        const store = getStore();
        this._preparing = true;
        let target: string | null = null;
        try {
            const url = await placeOrder();
            target = url === null ? null : resolveSameOriginUrl(url);
            if (url !== null && target === null) {
                store.globalError.set(t('Hyperion_Checkout::unexpected_error'));
            }
        } catch (err) {
            store.globalError.set((err as Error).message || t('Hyperion_Checkout::unexpected_error'));
        }
        if (target !== null) {
            navigateTo(target);
            return;
        }
        this._preparing = false;
        renderer.afterPlaceOrderFailed?.();
    }
}

if (!customElements.get('place-order-button')) {
    customElements.define('place-order-button', PlaceOrderButton);
}

declare global {
    interface HTMLElementTagNameMap { 'place-order-button': PlaceOrderButton; }
}
