// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <place-order-button>: primary CTA.
 *
 * Not rendered while the selected method's renderer `ownsPlaceOrder`
 * (it completes the order with its own control). Otherwise gated by the
 * `canPlaceOrder` selector: while it is false the button is soft-disabled
 * (`aria-disabled`, still focusable and clickable, Enter / Space as any
 * button). Its label carries the amount once the totals are settled
 * ("Place order, 57.00"), and the plain label while they are not. The
 * button fills the width of its container and carries
 * `data-hyperion-place-order`. A press does nothing once an order attempt
 * left the `none` outcome (being placed, placed, or waiting for the check
 * of a lost answer). Otherwise it runs the order pipeline of the flow
 * actions:
 *   1. `prepareOrder()` takes the latch, puts every pending edit on the
 *      quote (a form that is ahead of it, a billing address, a payment
 *      method) and evaluates the gate on what the server confirmed. When
 *      something is missing the press reveals it instead of doing nothing:
 *      every form shows its pending errors (`requestValidation()`), the
 *      email error is set, one hint line names the first missing piece and
 *      the keyboard focus moves to the first invalid field (or to the
 *      hint). The order is never placed while the gate is closed.
 *   2. The selected method's `beforePlaceOrder` hook collects the
 *      token / nonce / PO number into `paymentMethodData`. It runs after
 *      step 1, so a tokenization or a 3D Secure challenge sees the settled
 *      totals. Gateway hooks can take a while: the button shows its loading
 *      state (the latch) and ignores further presses.
 *   3. `submitOrder()` sends the order, or the renderer's `placeOrder`
 *      does when it has one (redirect gateways).
 *   4. On success the browser goes to `/checkout/onepage/success` (stock
 *      Magento success page) or to the URL the renderer resolved with; the
 *      loading state stays until the browser leaves. On failure the latch
 *      is released and the renderer's `afterPlaceOrderFailed` hook runs.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { flowActions, type PrepareOrderBlockReason } from '../store/flow-actions.js';
import { renderersVersion } from './payment-renderers/lazy-renderers.js';
import { getPaymentRenderer, type PaymentRenderer } from './payment-renderers/registry.js';
import { initFlowSelectors } from '../store/flow-selectors.js';
import { checkoutUpdatingMessage, placeOrderBlockerMessage, placeOrderHint } from '../store/place-order-hint.js';
import { requestValidation } from '../store/validation-request.js';
import { t } from '../utils/i18n.js';
import { email as emailValidator } from '../validation/rules.js';
import { navigateTo } from '../utils/navigate.js';
import { decideRedirectTarget, resolveSameOriginUrl } from '../utils/safe-redirect.js';
import { readGrandTotal } from './summary-totals.js';
import './ui/button.js';

export { placeOrderHint };

export class PlaceOrderButton extends SignalWatcher(LitElement) {
    private readonly _selectors = initFlowSelectors();

    /** What the last early press found missing; cleared once the gate opens. */
    @state() private _hint: string | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override willUpdate(): void {
        if (this._hint === null) return;
        const store = getStore();
        // An order under way or of unknown outcome, a session that ended,
        // a quote that is gone: each has its own message next to the
        // button, and what an earlier press found missing no longer counts.
        const latched = store.orderOutcome.get() !== 'none' || store.sessionExpired.get() || store.quoteGone.get();
        if (latched || this._selectors.canPlaceOrder.get()) {
            this._hint = null;
        } else if (this._hint === checkoutUpdatingMessage()) {
            // The update ended without opening the gate: name what is
            // missing now instead of an update that is no longer running.
            this._hint = placeOrderHint(store, this._selectors);
        }
    }

    public override render(): unknown {
        renderersVersion.get();
        const store = getStore();
        const method = store.selectedPaymentMethod.get();
        if (method && getPaymentRenderer(method)?.ownsPlaceOrder?.()) return nothing;
        const can = this._selectors.canPlaceOrder.get();
        const placing = store.isPlacingOrder.get() || store.orderOutcome.get() === 'placing';
        const total = readGrandTotal(store);
        let label = t('Hyperion_Checkout::place_order');
        if (placing) {
            label = t('Hyperion_Checkout::placing_order');
        } else if (total !== null && total.settled) {
            label = t('Hyperion_Checkout::place_order_amount', { total: total.text });
        }
        return html`
            <hc-button variant="primary"
                       class="block"
                       data-hyperion-place-order
                       .label=${label}
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
        if (store.orderOutcome.get() !== 'none') return;
        const flow = flowActions();
        // A second press while the first is still at work does nothing
        // (`prepareOrder()` answers `busy`).
        const prepared = await flow.prepareOrder();
        if (prepared.status === 'blocked') {
            await this._revealMissing(prepared.reason);
            return;
        }
        const method = store.selectedPaymentMethod.get();
        if (!method) {
            flow.cancelOrder();
            return;
        }

        // The renderer's step, on the settled quote.
        const renderer = getPaymentRenderer(method);
        if (renderer?.beforePlaceOrder) {
            store.globalError.set(null);
            try {
                const data = await renderer.beforePlaceOrder();
                const current = store.paymentMethodData.get();
                store.paymentMethodData.set({ ...current, [method]: data });
            } catch (err) {
                flow.cancelOrder();
                store.globalError.set((err as Error).message || t('Hyperion_Checkout::unexpected_error'));
                return;
            }
        }

        if (renderer?.placeOrder) {
            await this._placeThroughRenderer(renderer.placeOrder, renderer);
            return;
        }

        // A number, or the marker of an order confirmed by the quote after
        // its answer was lost: both continue on the success page.
        const orderId = await flow.submitOrder();
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
     * is announced as a status and the focus stays where it is. A press
     * that found an attempt under way, or whose save failed (the failure
     * is shown where it was reported), adds no hint.
     */
    private async _revealMissing(reason: PrepareOrderBlockReason): Promise<void> {
        if (reason === 'busy' || reason === 'write-failed' || reason === 'outcome-unknown') return;
        const store = getStore();
        if (!this._selectors.emailValid.get()) {
            const err = emailValidator(store.email.get());
            if (err) store.fieldErrors.set({ ...store.fieldErrors.get(), email: t(err) });
        }
        requestValidation();
        this._hint = placeOrderBlockerMessage(store, reason);
        if (reason === 'updating') return;
        // The forms render their errors on their own update cycle.
        await this.updateComplete;
        await new Promise((resolve) => setTimeout(resolve, 0));
        const root: ParentNode = this.closest('checkout-app') ?? document;
        const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]');
        const target = invalid ?? this.querySelector<HTMLElement>('[data-place-order-hint]');
        target?.focus();
    }

    /**
     * The order of a redirect gateway, under the latch `prepareOrder()` took:
     * it holds while the browser leaves the page and is given back when the
     * renderer could not start the payment.
     */
    private async _placeThroughRenderer(
        placeOrder: NonNullable<PaymentRenderer['placeOrder']>,
        renderer: PaymentRenderer
    ): Promise<void> {
        const store = getStore();
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
        flowActions().cancelOrder();
        renderer.afterPlaceOrderFailed?.();
    }
}

if (!customElements.get('place-order-button')) {
    customElements.define('place-order-button', PlaceOrderButton);
}

declare global {
    interface HTMLElementTagNameMap { 'place-order-button': PlaceOrderButton; }
}
