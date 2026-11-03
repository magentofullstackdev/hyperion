// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-checkout -- HTMX-driven One-Page Checkout.
 *
 * Architecture:
 *   * Shadow DOM provides the layout chrome (section skeleton, semantic CSS
 *     Custom Properties) and projects server-rendered slots for each step:
 *       <slot name="address-form">      <- initial + state-prefill
 *       <slot name="shipping-methods">  <- swapped by HTMX after address change
 *       <slot name="totals">            <- swapped by HTMX after shipping select
 *       <slot name="payment-methods">   <- static; we just observe change events
 *       <slot name="actions">           <- Place Order button
 *   * The server template (onepage/checkout.phtml) emits hx-* attributes on
 *     the form elements themselves, so HTMX natively fires the XHRs. This
 *     component's job is purely to observe htmx events + manage a step
 *     machine for visual feedback.
 *   * Target ids the template MUST render so HTMX can swap:
 *       #hyperion-checkout-shipping-methods  (inside shipping slot)
 *       #hyperion-checkout-totals            (inside totals slot)
 *       #hyperion-checkout-feedback          (below actions for place-order)
 *
 * Behavior -> step state machine:
 *   connectedCallback -> step='address'
 *   htmx:afterSwap on #hyperion-checkout-shipping-methods -> step='shipping'
 *   htmx:afterSwap on #hyperion-checkout-totals           -> step='totals'
 *   change on [name=payment_method]                       -> step='payment'
 *   htmx:beforeRequest on form#hyperion-checkout-place-order -> step='placing'
 *   htmx:responseError on place-order                     -> step='error'
 *   HX-Redirect header on place-order -> browser redirects (HTMX native)
 *
 * No RequireJS/Knockout/jQuery -- this file imports NONE of them and the
 * template ships no widget-init JS.
 */

import { LitElement, html, css } from 'lit';

const STEP_ADDRESS  = 'address';
const STEP_SHIPPING = 'shipping';
const STEP_TOTALS   = 'totals';
const STEP_PAYMENT  = 'payment';
const STEP_PLACING  = 'placing';
const STEP_DONE     = 'done';
const STEP_ERROR    = 'error';

export class HyperionCheckout extends LitElement {
    static properties = {
        formKey: { type: String, attribute: 'form-key' },
        estimateShippingUrl: { type: String, attribute: 'estimate-shipping-url' },
        setShippingMethodUrl: { type: String, attribute: 'set-shipping-method-url' },
        setPaymentMethodUrl: { type: String, attribute: 'set-payment-method-url' },
        placeOrderUrl: { type: String, attribute: 'place-order-url' },
        getCheckoutDataUrl: { type: String, attribute: 'get-checkout-data-url' },
        stepLabels: { type: String, attribute: 'step-labels' },

        _step: { state: true },
        _errorMessage: { state: true },
    };

    static styles = css`
        :host {
            --checkout-background: rgb(var(--color-surface));
            --checkout-border-radius: 0.5rem;
            --checkout-section-gap: 1.5rem;
            --checkout-section-bg: rgb(var(--color-surface));
            --checkout-section-border: rgb(var(--color-subtle));
            --checkout-label-color: rgb(var(--color-muted));
            --checkout-label-active: rgb(var(--color-primary));
            --checkout-step-connector: rgb(var(--color-subtle));
            --checkout-text-color: rgb(var(--color-secondary));
            display: block;
            background: var(--checkout-background);
            border-radius: var(--checkout-border-radius);
        }

        [part="stepper"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            padding: 0 0.25rem 1rem;
            list-style: none;
            margin: 0;
            color: var(--checkout-label-color);
            font-size: 0.875rem;
        }

        [part="stepper"] li {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            min-width: 0;
        }

        [part="stepper"] li[data-current="true"] {
            color: var(--checkout-label-active);
            font-weight: 600;
        }

        [part="stepper"] li[data-done="true"] {
            color: var(--checkout-text-color);
        }

        [part="stepper"] li:not(:last-child)::after {
            content: '';
            display: block;
            height: 1px;
            background: var(--checkout-step-connector);
            flex: 1;
        }

        [part="sections"] {
            display: grid;
            gap: var(--checkout-section-gap);
            grid-template-columns: 1fr;
        }

        @media (min-width: 64rem) {
            [part="sections"] {
                grid-template-columns: 1fr 22rem;
            }
        }

        [part="primary-column"] {
            display: flex;
            flex-direction: column;
            gap: var(--checkout-section-gap);
        }

        [part="address-section"],
        [part="shipping-section"],
        [part="payment-section"],
        [part="totals-section"],
        [part="actions-section"] {
            background: var(--checkout-section-bg);
            border: 1px solid var(--checkout-section-border);
            border-radius: var(--checkout-border-radius);
            padding: 1rem 1.25rem;
        }

        [part="error"] {
            color: rgb(var(--color-error));
            padding-top: 0.5rem;
            font-size: 0.875rem;
        }

        [part="error"][hidden] {
            display: none;
        }

        ::slotted(*) {
            min-width: 0;
        }
    `;

    constructor() {
        super();
        this.formKey = '';
        this.estimateShippingUrl = '';
        this.setShippingMethodUrl = '';
        this.setPaymentMethodUrl = '';
        this.placeOrderUrl = '';
        this.getCheckoutDataUrl = '';
        this.stepLabels = '';
        this._step = STEP_ADDRESS;
        this._errorMessage = '';

        this._onAfterSwap     = this._onAfterSwap.bind(this);
        this._onBeforeRequest = this._onBeforeRequest.bind(this);
        this._onResponseError = this._onResponseError.bind(this);
        this._onPaymentChange = this._onPaymentChange.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        // Listen on the host so events bubbling from slotted light DOM reach us.
        this.addEventListener('htmx:afterSwap',     this._onAfterSwap);
        this.addEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.addEventListener('htmx:responseError', this._onResponseError);
        this.addEventListener('htmx:sendError',     this._onResponseError);
        // Change events on payment method radios bubble through Shadow DOM
        // from light-slotted children; we listen at the host.
        this.addEventListener('change', this._onPaymentChange);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('htmx:afterSwap',     this._onAfterSwap);
        this.removeEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.removeEventListener('htmx:responseError', this._onResponseError);
        this.removeEventListener('htmx:sendError',     this._onResponseError);
        this.removeEventListener('change', this._onPaymentChange);
    }

    _onAfterSwap(event) {
        const target = event?.detail?.target;
        if (!target) return;
        const id = target.id || '';
        if (id === 'hyperion-checkout-shipping-methods') {
            this._step = STEP_SHIPPING;
            this._errorMessage = '';
        } else if (id === 'hyperion-checkout-totals') {
            this._step = STEP_TOTALS;
            this._errorMessage = '';
        } else if (id === 'hyperion-checkout-feedback') {
            // Place-order response landed; upstream HX-Redirect header will
            // navigate on success. If we're still here, it was an error.
            if (this._step === STEP_PLACING) {
                this._step = STEP_ERROR;
            }
        }
    }

    _onBeforeRequest(event) {
        const elt = event?.detail?.elt;
        if (!elt) return;
        if (elt.id === 'hyperion-checkout-place-order'
            || elt.closest?.('#hyperion-checkout-place-order')) {
            this._step = STEP_PLACING;
            this._errorMessage = '';
        }
    }

    _onResponseError(event) {
        const xhr = event?.detail?.xhr;
        const status = xhr ? xhr.status : 0;
        const message = status === 419
            ? 'Session expired. Please reload the page.'
            : `Request failed (${status || 'network'}). Please try again.`;
        this._errorMessage = message;
        this._step = STEP_ERROR;
    }

    _onPaymentChange(event) {
        const t = event?.target;
        if (t?.name === 'payment_method') {
            this._step = STEP_PAYMENT;
        }
    }

    _getStepEntries() {
        const fallback = ['Address', 'Shipping', 'Payment', 'Review'];
        let labels = this.stepLabels ? this.stepLabels.split('|').map(s => s.trim()).filter(Boolean) : [];
        if (labels.length !== 4) labels = fallback;
        const steps = [
            { id: STEP_ADDRESS,  label: labels[0] },
            { id: STEP_SHIPPING, label: labels[1] },
            { id: STEP_PAYMENT,  label: labels[2] },
            { id: STEP_TOTALS,   label: labels[3] },
        ];
        return steps.map((s, i) => ({
            ...s,
            current: i === (this._step === STEP_ADDRESS ? 0
                : this._step === STEP_SHIPPING || this._step === STEP_TOTALS ? 1
                : this._step === STEP_PAYMENT ? 2
                : 3),
            done: (this._step === STEP_SHIPPING || this._step === STEP_TOTALS) && i < 1
                || (this._step === STEP_PAYMENT) && i < 2
                || (this._step === STEP_PLACING || this._step === STEP_DONE) && i < 3,
        }));
    }

    render() {
        const stepEntries = this._getStepEntries();
        return html`
            <ol part="stepper" aria-label="Checkout progress" role="list">
                ${stepEntries.map((s, i) => html`
                    <li
                        data-step="${s.id}"
                        data-current="${s.current}"
                        data-done="${s.done}"
                        aria-current="${s.current ? 'step' : 'false'}">
                        <span aria-hidden="true">${i + 1}.</span>
                        <span>${s.label}</span>
                    </li>
                `)}
            </ol>

            <div part="sections">
                <div part="primary-column">
                    <section part="address-section" aria-labelledby="hyperion-checkout-address-heading">
                        <slot name="address-form"></slot>
                    </section>

                    <section part="shipping-section" aria-labelledby="hyperion-checkout-shipping-heading">
                        <slot name="shipping-methods"></slot>
                    </section>

                    <section part="payment-section" aria-labelledby="hyperion-checkout-payment-heading">
                        <slot name="payment-methods"></slot>
                    </section>

                    <section part="actions-section">
                        <slot name="actions"></slot>
                        <p part="error" role="alert" ?hidden=${!this._errorMessage}>
                            ${this._errorMessage}
                        </p>
                    </section>
                </div>

                <aside part="totals-section" aria-labelledby="hyperion-checkout-totals-heading">
                    <slot name="totals"></slot>
                </aside>
            </div>
        `;
    }
}

if (!customElements.get('hyperion-checkout')) {
    customElements.define('hyperion-checkout', HyperionCheckout);
}
