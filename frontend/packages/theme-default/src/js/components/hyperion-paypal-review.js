// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-paypal-review -- behaviour of the PayPal review page.
 *
 * Replaces Magento_Paypal's RequireJS `orderReview` widget. The markup is
 * server-rendered (Magento_Paypal::express/review.phtml) and works
 * without this element: the shipping form and the Place Order form are
 * plain forms, the agreements are `required` checkboxes. The element adds:
 *
 *   * Place Order stays disabled while no shipping method is chosen or
 *     the totals are being refreshed;
 *   * a failed shipping update (the controller answers with a script
 *     redirect in place of the details) reloads the page, which shows
 *     the message;
 *   * one submission only: the button is disabled once the order is
 *     being placed.
 *
 * Hooks (data attributes of the children):
 *   data-review-shipping        shipping method <select>
 *   data-review-shipping-form   its form (HTMX `hx-post`)
 *   data-review-updating        "updating" status text
 *   data-review-form            Place Order form
 *   data-review-submit          Place Order button
 *   data-review-submitting      "submitting" status text
 *   data-review-hint            "select a shipping method" hint
 *   data-review-no-rates        present when no shipping rate is available
 */

import { nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';

const DETAILS_MARKER = 'hyperion-paypal-review-items';

export class HyperionPaypalReview extends HyperionLightElement {
    constructor() {
        super();
        this._updating = false;
        this._submitting = false;
        this._onBeforeRequest = this._onBeforeRequest.bind(this);
        this._onBeforeSwap = this._onBeforeSwap.bind(this);
        this._onAfterRequest = this._onAfterRequest.bind(this);
        this._onSubmit = this._onSubmit.bind(this);
        this._onPageShow = this._onPageShow.bind(this);
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.addEventListener('htmx:beforeSwap', this._onBeforeSwap);
        this.addEventListener('htmx:afterRequest', this._onAfterRequest);
        this.addEventListener('submit', this._onSubmit);
        window.addEventListener('pageshow', this._onPageShow);
        this._sync();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.removeEventListener('htmx:beforeSwap', this._onBeforeSwap);
        this.removeEventListener('htmx:afterRequest', this._onAfterRequest);
        this.removeEventListener('submit', this._onSubmit);
        window.removeEventListener('pageshow', this._onPageShow);
    }

    _isShippingRequest(event) {
        // htmx:beforeSwap carries the swap target in `elt`, the requester in `requestConfig`.
        const source = event.detail?.requestConfig?.elt ?? event.detail?.elt;
        return source instanceof Element && source.closest('[data-review-shipping-form]') !== null;
    }

    _onBeforeRequest(event) {
        if (!this._isShippingRequest(event)) return;
        this._updating = true;
        this._sync();
    }

    _onBeforeSwap(event) {
        if (!this._isShippingRequest(event)) return;
        const body = event.detail?.xhr?.responseText ?? '';
        if (body.includes(DETAILS_MARKER)) return;
        event.detail.shouldSwap = false;
        event.preventDefault();
        window.location.reload();
    }

    _onAfterRequest(event) {
        if (!this._isShippingRequest(event)) return;
        this._updating = false;
        this._sync();
    }

    _onSubmit(event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.matches('[data-review-form]')) return;
        if (this._submitting || this._updating || !this._hasShippingMethod()) {
            event.preventDefault();
            return;
        }
        this._submitting = true;
        // Disable after the browser has collected the form data.
        setTimeout(() => this._sync(), 0);
    }

    /** A page restored from the back/forward cache must be usable again. */
    _onPageShow(event) {
        if (!event.persisted) return;
        this._submitting = false;
        this._sync();
    }

    _hasShippingMethod() {
        if (this.querySelector('[data-review-no-rates]')) return false;
        const select = this.querySelector('[data-review-shipping]');
        return !select || select.value !== '';
    }

    _sync() {
        const ready = this._hasShippingMethod();
        const button = this.querySelector('[data-review-submit]');
        if (button) button.disabled = !ready || this._updating || this._submitting;
        const select = this.querySelector('[data-review-shipping]');
        if (select) select.disabled = this._submitting;
        this._toggle('[data-review-updating]', this._updating);
        this._toggle('[data-review-submitting]', this._submitting);
        this._toggle('[data-review-hint]', !ready);
    }

    _toggle(selector, visible) {
        const element = this.querySelector(selector);
        if (element) element.hidden = !visible;
    }
}

if (!customElements.get('hyperion-paypal-review')) {
    customElements.define('hyperion-paypal-review', HyperionPaypalReview);
}
