// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-paypal-buttons -- PayPal Express Checkout smart buttons.
 *
 * Replaces Magento_Paypal's RequireJS widgets (`js/in-context/button`,
 * `product-express-checkout`, `express-checkout-smart-buttons`) on the
 * cart page, in the mini-cart drawer and on the product page. The
 * requests are the core ones:
 *
 *   onClick      guest checkout not allowed, product options missing:
 *                the click is rejected with a message, no PayPal window.
 *   createOrder  product context only: post the add-to-cart form first
 *                (same request as the Add to Cart button, so options,
 *                swatches and quantities are honoured and validated);
 *                then POST `getTokenUrl` with `quote_id`, `customer_id`,
 *                `form_key`, `button` and hand the token to PayPal.
 *   onApprove    POST `onAuthorizeUrl` with `paymentToken`, `payerId`,
 *                `paypalFundingSource`, `form_key`; follow `redirectUrl`
 *                (the PayPal review page, or the success page).
 *   onCancel     GET `onCancelUrl` (drops the token), toast the message.
 *
 * Attributes:
 *   context          `cart` | `minicart` | `product`
 *   config           JSON from HyperionCheckout\ViewModel\PaypalExpress:
 *                    sdkUrl, dataAttributes, styles, getTokenUrl,
 *                    onAuthorizeUrl, onCancelUrl, quoteId, customerId,
 *                    button, declined
 *   form             selector of the add-to-cart form (product context)
 *   sign-in-message  shown when `declined` (guest checkout not allowed)
 *   options-message  shown when a configurable option is not chosen
 *   error-message    generic failure
 *   cancel-message   fallback when the server sends no cancel message
 *   busy-message     shown while the approval is being processed
 *
 * The SDK is loaded by lib/paypal-sdk.js: not before the element is near
 * the viewport and the page has finished loading.
 *
 * Events (bubbling, composed): `hyperion-paypal-ready` once the buttons
 * are rendered, `hyperion-paypal-error` with `{ message }`.
 */

import { html, nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';

// Resolve `value` against the page and return the absolute URL when it is
// same-origin, null otherwise (a JSON answer must not send the shopper to
// another host).
function resolveSameOriginUrl(value) {
    if (typeof value !== 'string' || value === '') return null;
    try {
        const url = new URL(value, location.href);
        return url.origin === location.origin ? url.href : null;
    } catch {
        return null;
    }
}
import {
    loadPaypalSdk,
    whenWanted,
    whenPageIdle,
    readCookie,
    notify,
    drainMessages,
} from '../lib/paypal-sdk.js';

const DEFAULT_FORM = '#product_addtocart_form';
const SUPER_ATTRIBUTE_SELECTOR = '[data-hyperion-super]';
const CONTAINER_SELECTOR = '[data-hyperion-paypal-container]';
const REQUEST_HEADERS = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
};

/** An error whose message the shopper has already been shown. */
class HandledError extends Error {
    constructor(message) {
        super(message);
        this.handled = true;
    }
}

export class HyperionPaypalButtons extends HyperionLightElement {
    static properties = {
        context: { type: String },
        config: { type: String },
        form: { type: String },
        signInMessage: { type: String, attribute: 'sign-in-message' },
        optionsMessage: { type: String, attribute: 'options-message' },
        errorMessage: { type: String, attribute: 'error-message' },
        cancelMessage: { type: String, attribute: 'cancel-message' },
        busyMessage: { type: String, attribute: 'busy-message' },
        _busy: { state: true },
    };

    constructor() {
        super();
        this.context = 'cart';
        this.config = '';
        this.form = DEFAULT_FORM;
        this.signInMessage = 'To check out, please sign in with your email address.';
        this.optionsMessage = 'Please choose the product options first.';
        this.errorMessage = 'Something went wrong with your request. Please try again later.';
        this.cancelMessage = 'Express Checkout has been canceled.';
        this.busyMessage = 'Processing your PayPal approval...';
        this._busy = false;
        this._settings = null;
        this._waiting = null;
        this._buttons = null;
        this._fundingSource = '';
        this._failureShown = false;
        this._connection = 0;
    }

    render() {
        return html`
            <div data-hyperion-paypal-container></div>
            ${this._busy
                ? html`<p class="mt-2 text-center text-xs text-muted" role="status">${this.busyMessage}</p>`
                : nothing}
        `;
    }

    connectedCallback() {
        super.connectedCallback();
        this._settings = this._parseConfig();
        if (!this._settings) return;
        const connection = ++this._connection;
        this._waiting = whenWanted(this);
        this._waiting
            .then(() => whenPageIdle())
            .then(() => (connection === this._connection
                ? loadPaypalSdk(this._settings.sdkUrl, this._settings.dataAttributes)
                : null))
            .then((paypal) => (paypal && connection === this._connection ? this._renderButtons(paypal) : null))
            .catch((error) => this._report(error));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._connection++;
        this._waiting?.cancel();
        this._waiting = null;
        this._closeButtons();
    }

    _parseConfig() {
        if (!this.config) return null;
        try {
            const parsed = JSON.parse(this.config);
            return parsed && typeof parsed === 'object' && parsed.sdkUrl ? parsed : null;
        } catch (_e) {
            return null;
        }
    }

    _closeButtons() {
        const buttons = this._buttons;
        this._buttons = null;
        if (buttons && typeof buttons.close === 'function') {
            Promise.resolve(buttons.close()).catch(() => {});
        }
    }

    async _renderButtons(paypal) {
        await this.updateComplete;
        const container = this.querySelector(CONTAINER_SELECTOR);
        if (!container || typeof paypal.Buttons !== 'function') return;
        const buttons = paypal.Buttons({
            style: this._settings.styles || {},
            onClick: (data, actions) => this._onClick(data, actions),
            createOrder: () => this._createOrder(),
            onApprove: (data, actions) => this._onApprove(data, actions),
            onCancel: () => this._onCancel(),
            onError: (error) => this._onError(error),
        });
        if (typeof buttons.isEligible === 'function' && !buttons.isEligible()) return;
        this._buttons = buttons;
        await buttons.render(container);
        this.dispatchEvent(new CustomEvent('hyperion-paypal-ready', { bubbles: true, composed: true }));
    }

    // --- onClick -----------------------------------------------------------

    /**
     * What can be checked without the server is checked here: rejecting
     * the click keeps the PayPal window closed.
     */
    _onClick(data, actions) {
        this._fundingSource = data?.fundingSource || '';
        this._failureShown = false;
        const problem = this._findProblem();
        if (!problem) {
            return typeof actions?.resolve === 'function' ? actions.resolve() : undefined;
        }
        this._fail(problem.message, 'warning');
        return typeof actions?.reject === 'function' ? actions.reject() : undefined;
    }

    /** @returns {{ message: string } | null} */
    _findProblem() {
        if (this._settings.declined) {
            return { message: this.signInMessage };
        }
        if (this.context !== 'product') return null;
        const form = this._productForm();
        if (!form) return { message: this.errorMessage };
        const missing = [...form.querySelectorAll(SUPER_ATTRIBUTE_SELECTOR)].some((input) => !input.value);
        if (missing) return { message: this.optionsMessage };
        if (!form.checkValidity()) {
            form.reportValidity();
            return { message: this.optionsMessage };
        }
        return null;
    }

    _productForm() {
        const form = document.querySelector(this.form || DEFAULT_FORM);
        return form instanceof HTMLFormElement ? form : null;
    }

    // --- createOrder -------------------------------------------------------

    async _createOrder() {
        const problem = this._findProblem();
        if (problem) {
            throw this._fail(problem.message, 'warning');
        }
        if (this.context === 'product') {
            await this._addProductToCart();
        }
        let result;
        try {
            const response = await fetch(this._settings.getTokenUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: REQUEST_HEADERS,
                body: new URLSearchParams({
                    quote_id: this.context === 'product' ? '' : String(this._settings.quoteId ?? ''),
                    customer_id: this.context === 'product' ? '' : String(this._settings.customerId ?? ''),
                    form_key: readCookie('form_key'),
                    button: String(this._settings.button ?? 1),
                }),
            });
            result = await response.json();
        } catch (_e) {
            throw this._fail(this.errorMessage);
        }
        if (!result || !result.success || !result.token) {
            // The controller also queued the message for the next page.
            drainMessages();
            throw this._fail(result?.error_message || this.errorMessage);
        }
        return result.token;
    }

    /**
     * Post the add-to-cart form the way its own button does. With HTMX the
     * response also refreshes the header badge and shows the toast.
     */
    async _addProductToCart() {
        const form = this._productForm();
        const status = await this._submitForm(form);
        if (status < 200 || status >= 300) {
            // 422: the response carried the reason and it is on screen already.
            if (status !== 422) throw this._fail(this.errorMessage);
            this._failureShown = true;
            throw new HandledError('add to cart rejected');
        }
        document.dispatchEvent(new CustomEvent('hyperion:cart-changed'));
    }

    /** @returns {Promise<number>} HTTP status of the add-to-cart request */
    _submitForm(form) {
        const url = form.getAttribute('action') || '';
        const htmx = window.htmx;
        if (htmx && typeof htmx.ajax === 'function') {
            return new Promise((resolve) => {
                const onAfterRequest = (event) => {
                    if (event.detail?.elt !== form) return;
                    form.removeEventListener('htmx:afterRequest', onAfterRequest);
                    resolve(event.detail?.xhr?.status ?? 0);
                };
                form.addEventListener('htmx:afterRequest', onAfterRequest);
                Promise.resolve(htmx.ajax('POST', url, { source: form })).catch(() => {
                    form.removeEventListener('htmx:afterRequest', onAfterRequest);
                    resolve(0);
                });
            });
        }
        const data = new FormData(form);
        data.set('form_key', readCookie('form_key') || String(data.get('form_key') ?? ''));
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'HX-Request': 'true' },
            body: data,
        }).then(async (response) => {
            if (response.status === 422) {
                const body = new DOMParser().parseFromString(await response.text(), 'text/html');
                notify(body.querySelector('[data-hyperion-notification]')?.textContent?.trim() || this.errorMessage);
            }
            return response.status;
        }).catch(() => 0);
    }

    // --- onApprove / onCancel / onError ------------------------------------

    async _onApprove(data, actions) {
        this._busy = true;
        try {
            const response = await fetch(this._settings.onAuthorizeUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: REQUEST_HEADERS,
                body: new URLSearchParams({
                    paymentToken: String(data?.orderID ?? ''),
                    payerId: String(data?.payerID ?? ''),
                    paypalFundingSource: this._fundingSource,
                    form_key: readCookie('form_key'),
                }),
            });
            const result = await response.json();
            if (!result || result.success === false || !result.redirectUrl) {
                drainMessages();
                throw this._fail(result?.error_message || this.errorMessage);
            }
            // The answer comes from the store, but a redirect target is only
            // ever followed when it stays on this origin.
            const redirectUrl = resolveSameOriginUrl(result.redirectUrl);
            if (!redirectUrl) {
                throw this._fail(this.errorMessage);
            }
            if (actions && typeof actions.redirect === 'function') {
                await actions.redirect(redirectUrl);
            } else {
                window.location.assign(redirectUrl);
            }
        } catch (error) {
            this._busy = false;
            if (!error?.handled) this._fail(this.errorMessage);
        }
    }

    async _onCancel() {
        this._busy = false;
        let message = '';
        let tone = 'info';
        try {
            await fetch(this._settings.onCancelUrl, {
                credentials: 'same-origin',
                redirect: 'manual',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const messages = drainMessages();
            if (messages.length > 0) {
                message = messages.map((entry) => entry.text).join(' ');
                tone = messages.some((entry) => entry.type === 'error') ? 'error' : 'info';
            }
        } catch (_e) {
            message = '';
        }
        notify(message || this.cancelMessage, tone);
    }

    _onError(error) {
        this._busy = false;
        // PayPal wraps what createOrder threw, so the flag is kept here.
        if (this._failureShown || error?.handled) return;
        this._report(error);
        notify(this.errorMessage);
    }

    // --- Feedback ----------------------------------------------------------

    /** Toast the message and return the error to throw. */
    _fail(message, tone = 'error') {
        this._failureShown = true;
        notify(message, tone);
        this.dispatchEvent(new CustomEvent('hyperion-paypal-error', {
            bubbles: true,
            composed: true,
            detail: { message },
        }));
        return new HandledError(message);
    }

    _report(error) {
        if (!error || error.handled) return;
        // eslint-disable-next-line no-console
        console.error('[hyperion-paypal-buttons]', error);
    }
}

if (!customElements.get('hyperion-paypal-buttons')) {
    customElements.define('hyperion-paypal-buttons', HyperionPaypalButtons);
}
