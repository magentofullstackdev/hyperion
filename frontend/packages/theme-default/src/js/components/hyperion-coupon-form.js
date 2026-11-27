// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, css, nothing } from 'lit';

/**
 * hyperion-coupon-form -- reusable discount-code UI.
 *
 * The discount code form of the Shopping Cart page. It owns:
 *
 *   - the expand/collapse state of the "Apply Discount Code" section;
 *   - the state of a refused code (see below);
 *   - the pending/loading toggle on the submit button (htmx:beforeRequest
 *     -> disabled, htmx:afterRequest -> re-enabled);
 *   - the Apply <-> Cancel toggle of the button copy depending on whether
 *     a coupon is currently applied.
 *
 * HTTP side-effects are delegated to HTMX attributes on the internal
 * <form>. The form POSTs to Magento's native `checkout/cart/couponPost`
 * route, which is intercepted by `HyperionCore\Plugin\Checkout\
 * Controller\Cart\CouponPostPlugin` -- that plugin returns the fresh
 * component markup (swapped via hx-target) plus OOB swaps of
 * `#hyperion-cart-totals` and `#hyperion-notification`.
 *
 * The component renders in Light DOM so the phtml shell stays server-
 * renderable and HTMX can reach the form target by id without piercing
 * Shadow DOM boundaries. That also means Tailwind utility classes on
 * the template resolve against the page's main stylesheet.
 *
 * A refused code. The answer to a failed apply request is a fresh shell
 * with `attempted-code` (the code that was sent) and `error-message` (why
 * it was refused). The form then renders open with the code in the field,
 * `aria-invalid="true"`, the message under the field (linked through
 * `aria-describedby`) and the focus on the field, so the shopper corrects
 * the code where it was typed. The error state ends at the first edit of
 * the field. The toast of the same answer is not touched.
 *
 * The message line under the field is always rendered, empty without a
 * message: the open form reserves its height (two text-sm lines on a
 * phone, where core's refusal with a typical code wraps, one line from
 * `sm`), so a message that arrives with an answer, or goes at the first
 * edit, moves nothing around the form. Hidden with the closed disclosure,
 * it costs the closed form nothing.
 *
 * Server rendered skeleton. The phtml shell carries a
 * `[data-hyperion-coupon-skeleton]` section: the markup this element
 * renders, in the state the server knows (closed, applied coupon, refused
 * code), as a working plain form. It gives the element its final geometry
 * before the chunk arrives, so the upgrade moves nothing. At the upgrade
 * the element takes over what the shopper did in it meanwhile (the
 * disclosure opened, a code typed, the focus in the field) and removes it
 * before its first render.
 *
 * Server rendered children. The skeleton's `[data-coupon-extra-slot]` holds
 * the HTML of the block's children: the image CAPTCHA of the coupon form
 * (`<hyperion-captcha>` with the `captcha[sales_rule_coupon_request]`
 * field) and, from core's `Magento_ReCaptchaCheckoutSalesRule`, the
 * `coupon_code` reCAPTCHA (`<hyperion-recaptcha>` with its hidden
 * `g-recaptcha-response` input and the v3 legal notice). The nodes are
 * captured in `connectedCallback` and, once the form exists, moved into
 * `[data-coupon-extra-slot]` INSIDE the rendered `<form>`:
 * `<hyperion-recaptcha>` gates the submit of its closest form, so the token
 * is minted before HTMX sends the request and the hidden input travels with
 * the form body. The HTMX answer is a fresh shell with the skeleton and the
 * children again, so a swap repeats the same path on the new element.
 *
 * The `remove` flag is sent ONLY in cancel mode: core's coupon reCAPTCHA
 * observer skips the validation whenever the parameter is present, even
 * as `remove=0`, so an apply request must not carry it.
 *
 * Attributes (strings unless noted):
 * - `applied-coupon` -- when non-empty, the form renders in "cancel" mode
 *   with a readonly input and a "Cancel Coupon" button.
 * - `expanded` (boolean) -- renders the form open; the answer to the form's
 *   own request (apply or cancel) sets it, so the form the shopper just used
 *   does not collapse and move the page when the answer arrives.
 * - `action-url` -- `checkout/cart/couponPost` URL (store-scoped).
 * - `form-key` -- Magento form_key for CSRF.
 * - `attempted-code`, `error-message` -- the refused code and the reason;
 *   ignored while a coupon is applied.
 * - `heading-label`, `placeholder-label`, `apply-label`, `cancel-label`,
 *   `input-label` -- translated copy; the English strings are the defaults.
 */
export class HyperionCouponForm extends LitElement {
    static properties = {
        appliedCoupon: { type: String, attribute: 'applied-coupon' },
        expanded: { type: Boolean },
        actionUrl: { type: String, attribute: 'action-url' },
        formKey: { type: String, attribute: 'form-key' },
        attemptedCode: { type: String, attribute: 'attempted-code' },
        errorMessage: { type: String, attribute: 'error-message' },
        headingLabel: { type: String, attribute: 'heading-label' },
        placeholderLabel: { type: String, attribute: 'placeholder-label' },
        applyLabel: { type: String, attribute: 'apply-label' },
        cancelLabel: { type: String, attribute: 'cancel-label' },
        inputLabel: { type: String, attribute: 'input-label' },
        _loading: { state: true },
        _edited: { state: true },
        _open: { state: true },
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
        this.expanded = false;
        this.actionUrl = '';
        this.formKey = '';
        this.attemptedCode = '';
        this.errorMessage = '';
        this.headingLabel = 'Apply Discount Code';
        this.placeholderLabel = 'Enter discount code';
        this.applyLabel = 'Apply Discount';
        this.cancelLabel = 'Cancel Coupon';
        this.inputLabel = 'Discount code';
        this._loading = false;
        this._edited = false;
        this._open = false;
        this._extraChildren = null;
        this._carried = null;
        this._onBefore = this._onBefore.bind(this);
        this._onAfter  = this._onAfter.bind(this);
    }

    connectedCallback() {
        this._captureSkeleton();
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
        // `process()` is idempotent on an already initialized node.
        const form = this.querySelector('form[data-hyperion-coupon-form]');
        if (form && window.htmx && typeof window.htmx.process === 'function') {
            window.htmx.process(form);
        }
        // A refused code, or a field the shopper was typing in before the
        // upgrade: the shopper continues in the field. The form sits below
        // the cart lines, the page must not jump to it.
        const field = form?.querySelector('input[name="coupon_code"]');
        const carried = this._carried;
        this._carried = null;
        if (field && carried && carried.typed !== null && !field.readOnly) {
            field.value = carried.typed;
        }
        if (this._failedCode() !== '' || carried?.focused) {
            field?.focus({ preventScroll: true });
        }
    }

    /**
     * The disclosure has one source of truth, `_open`: seeded before the first
     * render from what the server says (an answer to the form's own request,
     * an applied coupon, a refused code) and from the skeleton the shopper may
     * have opened, then kept in step with the `toggle` events of the
     * `<details>`. A later change of those properties can only OPEN the form
     * (a server state that renders open); nothing but the shopper closes it.
     */
    willUpdate(changed) {
        const serverOpen = this.expanded || (this.appliedCoupon || '').trim() !== '' || this._failedCode() !== '';
        if (!this.hasUpdated) {
            this._open = this._open || serverOpen;
            return;
        }
        if (serverOpen && !this._open && (changed.has('expanded') || changed.has('appliedCoupon') || changed.has('attemptedCode'))) {
            this._open = true;
        }
    }

    _onToggle(event) {
        const details = event.currentTarget;
        if (details && this._open !== details.open) this._open = details.open;
    }

    /** The refused code to show, empty while a coupon is applied. */
    _failedCode() {
        if ((this.appliedCoupon || '').trim() !== '') return '';
        return (this.attemptedCode || '').trim();
    }

    _onCodeInput() {
        this._edited = true;
    }

    updated() {
        this._injectChildren();
    }

    _onBefore() { this._loading = true; }
    _onAfter()  { this._loading = false; }

    /**
     * Before Lit's first render: take the server rendered children out of
     * the skeleton (the fragment keeps them until the form exists), read what
     * the shopper did in the skeleton form before the upgrade and remove it,
     * so a second connection (a DOM move) finds nothing to capture again. A
     * typed code that differs from the server value counts as an edit (a
     * refused code then loses its error state).
     */
    _captureSkeleton() {
        const skeleton = this.querySelector(':scope > [data-hyperion-coupon-skeleton]');
        if (!skeleton) return;
        const extra = skeleton.querySelector('[data-coupon-extra-slot]');
        if (extra && (extra.children.length > 0 || (extra.textContent || '').trim() !== '')) {
            const fragment = document.createDocumentFragment();
            fragment.append(...extra.childNodes);
            this._extraChildren = fragment;
        }
        const field = skeleton.querySelector('input[name="coupon_code"]');
        const typed = field && !field.readOnly && field.value !== field.defaultValue ? field.value : null;
        if (typed !== null) this._edited = true;
        if (skeleton.querySelector('details')?.open) this._open = true;
        this._carried = {
            typed,
            focused: !!field && field === document.activeElement,
        };
        skeleton.remove();
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
        const failedCode = this._failedCode();
        const error = failedCode !== '' && !this._edited ? (this.errorMessage || '').trim() : '';
        const invalid = failedCode !== '' && !this._edited;
        const submitLabel = isCancel ? this.cancelLabel : this.applyLabel;
        // shrink-0 + nowrap: the label never breaks ("Applica sconto" wrapped and pushed the row
        // 4px past a 375px viewport); the input gives way (min-w-0) instead. While a request
        // runs the label turns transparent under the spinner, so the button keeps its width and its name.
        const btnBase =
            'relative shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-colors';
        const applyBtn =
            btnBase +
            ' bg-primary text-on-primary border border-primary hover:bg-primary-hover';
        const cancelBtn =
            btnBase +
            ' bg-surface-raised border border-subtle text-secondary hover:border-primary hover:text-primary';
        const btnClass = isCancel ? cancelBtn : applyBtn;

        return html`
            <section class="bg-surface rounded-xl border border-subtle p-4"
                     aria-label=${this.headingLabel}>
                <details class="group" .open=${this._open} @toggle=${this._onToggle}>
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
                                   .value=${isCancel ? applied : failedCode}
                                   placeholder=${this.placeholderLabel}
                                   class="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg bg-surface border border-subtle text-secondary
                                          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                                          aria-[invalid=true]:border-error"
                                   ?readonly=${isCancel}
                                   aria-invalid=${invalid ? 'true' : nothing}
                                   aria-describedby=${error !== '' ? 'hyperion-coupon-error' : nothing}
                                   @input=${this._onCodeInput}
                                   aria-label=${this.inputLabel}>
                            <button type="submit"
                                    class=${btnClass}
                                    aria-busy=${this._loading ? 'true' : nothing}
                                    ?disabled=${this._loading}>
                                <span class=${this._loading ? 'opacity-0' : ''}>${submitLabel}</span>
                                ${this._loading ? html`<span class="absolute inset-0 m-auto w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>` : nothing}
                            </button>
                        </div>
                        <p id=${error !== '' ? 'hyperion-coupon-error' : nothing}
                           class="min-h-10 text-sm text-error sm:min-h-5"
                           data-hyperion-coupon-message
                           ?data-hyperion-coupon-error=${error !== ''}>${error}</p>
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
