// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <place-order-button>: primary CTA.
 *
 * Not rendered while the selected method's element owns Place Order (it
 * completes the order with its own control: the element's
 * `ownsPlaceOrder`, else its entry's flag). Otherwise gated by the
 * `canPlaceOrder` selector: while it is false the button is soft-disabled
 * (`aria-disabled`, still focusable and clickable, Enter / Space as any
 * button). Its label carries the amount once the totals are settled
 * ("Place order, 57.00"), and the plain label while they are not. The
 * button fills the width of its container and carries
 * `data-hyperion-place-order`. A press does nothing once an order attempt
 * left the `none` outcome (being placed, placed, or waiting for the check
 * of a lost answer). Otherwise it runs the order pipeline of the payment
 * host (`payment-host/pipeline.ts`): the latch, every pending edit put on
 * the quote, the gate, the payment element's own step, the order, where
 * to continue.
 *
 * When something is missing the press reveals it instead of doing
 * nothing: every form shows its pending errors (`requestValidation()`),
 * the email error is set, one hint line names the first missing piece,
 * an error summary under it lists every invalid field as a link that
 * focuses it, and the keyboard focus moves to the first invalid field (or
 * to the hint).
 *
 * Once the order exists the button gives way to a status line with a link
 * to the success page, for the moment the browser takes to leave. The
 * error summary and that line come with the payment host chunk
 * (`payment-host/row-view.ts`), which every press loads.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import type { PrepareOrderBlockReason } from '../store/flow-actions.js';
import { initFlowSelectors } from '../store/flow-selectors.js';
import { checkoutUpdatingMessage, placeOrderBlockerMessage, placeOrderHint } from '../store/place-order-hint.js';
import { requestValidation } from '../store/validation-request.js';
import { t } from '../utils/i18n.js';
import { email as emailValidator } from '../validation/rules.js';
import { decideRedirectTarget } from '../utils/safe-redirect.js';
import { matchEntry } from './payment-host/entries.js';
import { paymentHostNow, placeOrderFromButton } from './payment-host/host.js';
import { selectedRowKey } from './payment-host/payment-rows.js';
import { rowState } from './payment-host/row-state.js';
import { readGrandTotal } from './summary-totals.js';
import './payment-host/importer.js';
import './ui/button.js';

export { placeOrderHint };

/** The selected method completes the order with a control of its own. Reads signals. */
export function selectedOwnsPlaceOrder(code: string | null): boolean {
    if (code === null) return false;
    const key = selectedRowKey(code);
    const owns = key === null ? null : rowState(key).ownsPlaceOrder;
    return owns ?? matchEntry(code)?.ownsPlaceOrder === true;
}

export class PlaceOrderButton extends SignalWatcher(LitElement) {
    private readonly _selectors = initFlowSelectors();

    /** What the last early press found missing; cleared once the gate opens. */
    @state() private _hint: string | null = null;
    /** The invalid fields the last early press found, by id and label. */
    @state() private _invalid: ReadonlyArray<{ id: string; label: string }> = [];

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
            this._invalid = [];
        } else if (this._hint === checkoutUpdatingMessage()) {
            // The update ended without opening the gate: name what is
            // missing now instead of an update that is no longer running.
            this._hint = placeOrderHint(store, this._selectors);
        }
    }

    public override render(): unknown {
        const store = getStore();
        const host = paymentHostNow();
        if (store.orderOutcome.get() === 'placed' && host !== null) {
            return host.renderOrderPlaced(decideRedirectTarget(getCheckoutConfig().defaultSuccessPageUrl ?? ''));
        }
        if (selectedOwnsPlaceOrder(store.selectedPaymentMethod.get())) return nothing;
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
            ${this._hint !== null && host !== null ? host.renderErrorSummary(this._invalid) : nothing}
        `;
    }

    private _onClick = async (): Promise<void> => {
        if (getStore().orderOutcome.get() !== 'none') return;
        // A second press while the first is still at work does nothing
        // (the pipeline answers `busy`).
        const result = await placeOrderFromButton();
        if (result.status === 'blocked') await this._revealMissing(result.reason);
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
        const fields = Array.from(root.querySelectorAll<HTMLElement>('[aria-invalid="true"]'));
        this._invalid = paymentHostNow()?.invalidFieldsOf(fields) ?? [];
        const target = fields[0] ?? this.querySelector<HTMLElement>('[data-place-order-hint]');
        target?.focus();
    }
}

if (!customElements.get('place-order-button')) {
    customElements.define('place-order-button', PlaceOrderButton);
}

declare global {
    interface HTMLElementTagNameMap { 'place-order-button': PlaceOrderButton; }
}
