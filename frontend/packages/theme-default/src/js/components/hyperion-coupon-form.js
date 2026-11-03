// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css, nothing } from 'lit';

/**
 * hyperion-coupon-form -- reusable discount-code UI.
 *
 * Appears on BOTH the Shopping Cart page and the Checkout page. Per the
 * project's SRP rule (see `memory/feedback_srp_components.md`), every
 * discrete piece of UI lives in its own Lit component. This one owns:
 *
 *   - the expand/collapse state of the "Apply Discount Code" section;
 *   - the pending/loading toggle on the submit button (htmx:beforeRequest
 *     -> disabled, htmx:afterRequest -> re-enabled);
 *   - the Apply <-> Cancel toggle of the button copy depending on whether
 *     a coupon is currently applied.
 *
 * HTTP side-effects are delegated to HTMX attributes on the internal
 * <form>. The form POSTs to Magento's native `checkout/cart/couponPost`
 * route, which is intercepted by `Hyperion\Core\Plugin\Checkout\
 * Controller\Cart\CouponPostPlugin` -- that plugin returns the fresh
 * component markup (swapped via hx-target) plus OOB swaps of
 * `#hyperion-cart-totals` and `#hyperion-notification`.
 *
 * The component renders in Light DOM so the phtml shell stays server-
 * renderable and HTMX can reach the form target by id without piercing
 * Shadow DOM boundaries. That also means Tailwind utility classes on
 * the template resolve against the page's main stylesheet.
 *
 * Server rendered children. The phtml shell may carry a
 * `<template data-hyperion-coupon-children>` whose content is the HTML of
 * the block's children: core's `Magento_ReCaptchaCheckoutSalesRule` adds
 * the `coupon_code` reCAPTCHA there (`<hyperion-recaptcha>` with its hidden
 * `g-recaptcha-response` input and the v3 legal notice). The content is
 * captured in `connectedCallback` and, once the form exists, moved into
 * `[data-coupon-extra-slot]` INSIDE the `<form>`: `<hyperion-recaptcha>`
 * gates the submit of its closest form, so the token is minted before HTMX
 * sends the request and the hidden input travels with the form body. The
 * HTMX answer is a fresh shell with the children again, so a swap repeats
 * the same path on the new element.
 *
 * The `remove` flag is sent ONLY in cancel mode: core's coupon reCAPTCHA
 * observer skips the validation whenever the parameter is present, even
 * as `remove=0`, so an apply request must not carry it.
 *
 * Attributes (all strings):
 * - `applied-coupon` -- when non-empty, the form renders in "cancel" mode
 *   with a readonly input and a "Cancel Coupon" button.
 * - `action-url` -- `checkout/cart/couponPost` URL (store-scoped).
 * - `form-key` -- Magento form_key for CSRF.
 * - `heading-label`, `placeholder-label`, `apply-label`, `cancel-label`,
 *   `input-label` -- translated copy; the English strings are the defaults.
 */
export class HyperionCouponForm extends LitElement {
    static properties = {
        appliedCoupon: { type: String, attribute: 'applied-coupon' },
        actionUrl: { type: String, attribute: 'action-url' },
        formKey: { type: String, attribute: 'form-key' },
        headingLabel: { type: String, attribute: 'heading-label' },
        placeholderLabel: { type: String, attribute: 'placeholder-label' },
        applyLabel: { type: String, attribute: 'apply-label' },
        cancelLabel: { type: String, attribute: 'cancel-label' },
        inputLabel: { type: String, attribute: 'input-label' },
        _loading: { state: true },
    };

    // Light DOM -- Tailwind utility classes on the template need to resolve
    // against the page's stylesheet, and HTMX's out-of-band swaps target
    // elements by id which can't cross a Shadow boundary.
    createRenderRoot() {
        return this;
    }

    static styles = css``; // unused; render root is light DOM.

    constructor() {
        super();
        this.appliedCoupon = '';
        this.actionUrl = '';
        this.formKey = '';
        this.headingLabel = 'Apply Discount Code';
        this.placeholderLabel = 'Enter discount code';
        this.applyLabel = 'Apply Discount';
        this.cancelLabel = 'Cancel Coupon';
        this.inputLabel = 'Discount code';
        this._loading = false;
        this._extraChildren = null;
        this._onBefore = this._onBefore.bind(this);
        this._onAfter  = this._onAfter.bind(this);
    }

    connectedCallback() {
        this._captureChildren();
        super.connectedCallback();
        this.addEventListener('htmx:beforeRequest', this._onBefore);
        this.addEventListener('htmx:afterRequest',  this._onAfter);
        this.addEventListener('htmx:responseError', this._onAfter);
        this.addEventListener('htmx:sendError',     this._onAfter);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('htmx:beforeRequest', this._onBefore);
        this.removeEventListener('htmx:afterRequest',  this._onAfter);
        this.removeEventListener('htmx:responseError', this._onAfter);
        this.removeEventListener('htmx:sendError',     this._onAfter);
    }

    firstUpdated() {
        this._injectChildren();
        // The form is rendered after HTMX processed the page (the component
        // chunk arrives asynchronously), so ask HTMX to read its attributes.
        // `process()` is idempotent on an already initialised node.
        const form = this.querySelector('form[data-hyperion-coupon-form]');
        if (form && window.htmx && typeof window.htmx.process === 'function') {
            window.htmx.process(form);
        }
    }

    updated() {
        this._injectChildren();
    }

    _onBefore() { this._loading = true; }
    _onAfter()  { this._loading = false; }

    /**
     * Take the server rendered children out of their inert `<template>`
     * before Lit's first render. The fragment keeps them until the form
     * exists; the template itself is dropped so a second connection (a DOM
     * move) finds nothing to capture again.
     */
    _captureChildren() {
        const template = this.querySelector(':scope > template[data-hyperion-coupon-children]');
        if (!template) return;
        const content = template.content;
        if (content && content.childNodes.length > 0) {
            this._extraChildren = content;
        }
        template.remove();
    }

    /**
     * Move the captured children into the slot inside the form. Appending
     * a DocumentFragment empties it, so the second call is a no-op by
     * construction; the slot check keeps a re-render from touching the
     * nodes once they are in place.
     */
    _injectChildren() {
        const fragment = this._extraChildren;
        if (!fragment || fragment.childNodes.length === 0) return;
        const slot = this.querySelector('form[data-hyperion-coupon-form] [data-coupon-extra-slot]');
        if (!slot || slot.childNodes.length > 0) return;
        slot.appendChild(fragment);
        this._extraChildren = null;
    }

    render() {
        const applied  = (this.appliedCoupon || '').trim();
        const isCancel = applied !== '';
        const submitLabel = isCancel ? this.cancelLabel : this.applyLabel;
        // shrink-0 + nowrap: the label never breaks ("Applica sconto" wrapped and pushed the row
        // 4px past a 375px viewport); the input gives way (min-w-0) instead.
        const btnBase =
            'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-colors';
        const applyBtn =
            btnBase +
            ' bg-primary text-on-primary border border-primary hover:bg-primary-hover';
        const cancelBtn =
            btnBase +
            ' bg-surface-raised border border-subtle text-secondary hover:border-primary hover:text-primary';
        const btnClass = isCancel ? cancelBtn : applyBtn;

        return html`
            <section id="hyperion-coupon-form"
                     class="bg-surface rounded-xl border border-subtle p-4"
                     aria-label=${this.headingLabel}>
                <details class="group" ?open=${isCancel}>
                    <summary class="flex cursor-pointer items-center justify-between select-none">
                        <span class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">
                            ${this.headingLabel}
                        </span>
                        <svg class="w-4 h-4 text-muted transition-transform group-open:rotate-180"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <form method="post"
                          action=${this.actionUrl}
                          data-hyperion-coupon-form
                          class="mt-3 flex flex-col gap-2"
                          hx-post=${this.actionUrl}
                          hx-target="#hyperion-coupon-form"
                          hx-swap="outerHTML">
                        <input type="hidden" name="form_key" .value=${this.formKey}>
                        ${isCancel
                            ? html`<input type="hidden" name="remove" value="1" data-coupon-remove-flag>`
                            : nothing}
                        <div class="flex items-stretch gap-2 min-w-0">
                            <input type="text"
                                   name="coupon_code"
                                   .value=${applied}
                                   placeholder=${this.placeholderLabel}
                                   class="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg bg-surface border border-subtle text-secondary
                                          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                   ?readonly=${isCancel}
                                   aria-label=${this.inputLabel}>
                            <button type="submit"
                                    class=${btnClass}
                                    ?disabled=${this._loading}>
                                ${this._loading ? html`<span class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>` : submitLabel}
                            </button>
                        </div>
                        <div data-coupon-extra-slot class="empty:hidden"></div>
                    </form>
                </details>
            </section>
        `;
    }
}

if (!customElements.get('hyperion-coupon-form')) {
    customElements.define('hyperion-coupon-form', HyperionCouponForm);
}
