// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <loading-overlay>: covers the checkout while an order is on its way.
 *
 * Shown while the order request is out, while the quote is read to learn
 * what became of a request that lost its answer, once the order exists
 * (until the browser leaves), and while a payment method that completes
 * the order by itself holds the latch. The saves that precede the order
 * show it only when they take longer than a moment, so a press on a
 * settled checkout does not flash it.
 *
 * Never shown during the payment method's own step between the saves and
 * the order request (`orderStep` is `payment`): a card tokenization, a 3D
 * Secure challenge or a wallet sheet happens on this page and must stay
 * reachable. The same holds for a gateway that sends the order itself in
 * that step; the button shows its loading state meanwhile.
 *
 * While the overlay is up everything else inside `<checkout-app>` is
 * `inert`; the overlay is a live status with its text, and the focus goes
 * back to where it was when the overlay leaves.
 */
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';
import './section-status.js';
import './session-expired-dialog.js';

/** How long the saves before the order may take before the overlay covers them. */
export const OVERLAY_PREPARE_DELAY_MS = 400;

/** Elements the overlay never makes inert: the dialog of an ended session is the way out. */
const EXEMPT_TAG = 'HC-SESSION-EXPIRED';

export class LoadingOverlay extends SignalWatcher(LitElement) {
    /** The saves before the order have been running for longer than the delay. */
    private _slow = false;
    private _slowTimer: ReturnType<typeof setTimeout> | null = null;
    private _shown = false;
    /** The elements this overlay made inert, so only those are given back. */
    private readonly _inerted = new Set<Element>();
    private _focusBefore: HTMLElement | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._stopSlowTimer();
        this._release();
        this._shown = false;
    }

    private _visible(): boolean {
        const store = getStore();
        const outcome = store.orderOutcome.get();
        const step = store.orderStep.get();
        if (outcome === 'placed' || step === 'submitting' || step === 'confirming') return true;
        if (step === 'preparing') return this._slow;
        // A payment method that places the order by itself holds the latch
        // without an order attempt of the checkout.
        return store.isPlacingOrder.get() && outcome === 'none';
    }

    private _text(): string {
        const store = getStore();
        const number = store.orderNumber.get();
        if (store.orderOutcome.get() === 'placed' && number !== null) {
            return t('Hyperion_Checkout::order_received_number', { number });
        }
        if (store.orderStep.get() === 'confirming') return t('Hyperion_Checkout::order_confirming');
        return t('Hyperion_Checkout::placing_order');
    }

    public override render(): unknown {
        if (!this._visible()) return nothing;
        return html`
            <div role="status"
                 data-loading-overlay
                 class="fixed inset-0 z-50 bg-brand/60 flex items-center justify-center">
                <div class="bg-surface rounded-md p-6 shadow-lg max-w-sm text-center space-y-3">
                    <span class="inline-block w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"
                          aria-hidden="true"></span>
                    <p class="text-sm font-medium text-brand">${this._text()}</p>
                </div>
            </div>
        `;
    }

    public override updated(): void {
        const preparing = getStore().orderStep.get() === 'preparing';
        if (preparing && !this._slow && this._slowTimer === null) {
            this._slowTimer = setTimeout(() => {
                this._slowTimer = null;
                this._slow = true;
                this.requestUpdate();
            }, OVERLAY_PREPARE_DELAY_MS);
        } else if (!preparing && (this._slow || this._slowTimer !== null)) {
            this._stopSlowTimer();
            this._slow = false;
        }

        const visible = this._visible();
        if (visible === this._shown) return;
        this._shown = visible;
        if (visible) {
            this._cover();
        } else {
            this._release();
        }
    }

    private _stopSlowTimer(): void {
        if (this._slowTimer !== null) clearTimeout(this._slowTimer);
        this._slowTimer = null;
    }

    /**
     * Make everything of the checkout but the overlay inert: at each level
     * between the overlay and `<checkout-app>`, the siblings. The app
     * element itself stays live, or the status inside it would be silenced
     * with the rest.
     */
    private _cover(): void {
        const active = document.activeElement;
        this._focusBefore = active instanceof HTMLElement && active !== document.body ? active : null;
        const app = this.closest('checkout-app');
        let node: Element = this;
        while (node.parentElement !== null) {
            const parent: Element = node.parentElement;
            for (const sibling of Array.from(parent.children)) {
                if (sibling === node || sibling.tagName === EXEMPT_TAG || sibling.hasAttribute('inert')) continue;
                sibling.setAttribute('inert', '');
                this._inerted.add(sibling);
            }
            if (app === null || parent === app) break;
            node = parent;
        }
    }

    private _release(): void {
        for (const element of this._inerted) element.removeAttribute('inert');
        this._inerted.clear();
        const target = this._focusBefore;
        this._focusBefore = null;
        // The inert content dropped the focus: give it back unless the
        // shopper or a failure message took it meanwhile.
        if (target !== null && target.isConnected && (document.activeElement === null || document.activeElement === document.body)) {
            target.focus({ preventScroll: true });
        }
    }
}

if (!customElements.get('loading-overlay')) {
    customElements.define('loading-overlay', LoadingOverlay);
}

declare global {
    interface HTMLElementTagNameMap { 'loading-overlay': LoadingOverlay; }
}
