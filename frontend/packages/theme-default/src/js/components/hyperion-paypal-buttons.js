// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-paypal-buttons -- PayPal Express Checkout smart buttons, the
 * first-party `paypal_express` entry of the express button pool.
 *
 * Replaces Magento_Paypal's RequireJS widgets (`js/in-context/button`,
 * `product-express-checkout`, `express-checkout-smart-buttons`) on the
 * cart page, in the mini-cart drawer and on the product page. Created by
 * `<hyperion-express-slot>`, which sets the properties of an express element
 * before connecting it:
 *
 *   context    the ExpressContext (lib/express-context.js)
 *   options    the button configuration from
 *              HyperionCheckout\ViewModel\PaypalExpress: sdkUrl,
 *              dataAttributes, styles, getTokenUrl, onAuthorizeUrl,
 *              onCancelUrl, quoteId, customerId, button, declined
 *   placement  `cart` | `minicart` | `product`
 *
 * Its messages are entry phrases (`context.t()`). The requests are the core
 * ones:
 *
 *   onClick      guest checkout not allowed, product options missing:
 *                the click is rejected with a message, no PayPal window.
 *   createOrder  product placement only: `context.addCurrentProductToCart()`
 *                first (same request as the Add to Cart button, so options,
 *                swatches and quantities are honored and validated);
 *                then POST `getTokenUrl` with `quote_id`, `customer_id`,
 *                `form_key`, `button` and hand the token to PayPal.
 *   onApprove    POST `onAuthorizeUrl` with `paymentToken`, `payerId`,
 *                `paypalFundingSource`, `form_key`; follow `redirectUrl`
 *                (the PayPal review page, or the success page).
 *   onCancel     GET `onCancelUrl` (drops the token), toast the message.
 *
 * The SDK is loaded by lib/paypal-sdk.js after the context's loading
 * policy: the box near the viewport and the page loaded, a shopper engaged,
 * an idle slot.
 *
 * Events (bubbling, composed): `hyperion-express:ready` once the buttons
 * are rendered, `hyperion-express:unavailable` when there is nothing to
 * render (no configuration, PayPal not eligible, the SDK failed), and
 * `hyperion-express:error` with `{ message }` for an SDK error.
 */

import { html, nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';
import { loadPaypalSdk, readCookie, drainMessages } from '../lib/paypal-sdk.js';
import { productForm, productFormProblem } from '../lib/express-context.js';

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

const SIGN_IN_MESSAGE = 'To check out, please sign in with your email address.';
const OPTIONS_MESSAGE = 'You need to choose options for your item.';
const ERROR_MESSAGE = 'Something went wrong with your request. Please try again later.';
const CANCEL_MESSAGE = 'Express Checkout has been canceled.';
const BUSY_MESSAGE = 'Submitting order information...';
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
    /** Major of the extension API this element was written for. */
    static hyperionApi = '1';

    static properties = {
        context: { attribute: false },
        options: { attribute: false },
        placement: { type: String },
        _busy: { state: true },
    };

    constructor() {
        super();
        this.context = null;
        this.options = null;
        this.placement = 'cart';
        this._busy = false;
        this._settings = null;
        this._buttons = null;
        this._fundingSource = '';
        this._failureShown = false;
        this._connection = 0;
    }

    render() {
        return html`
            <div data-hyperion-paypal-container></div>
            ${this._busy
                ? html`<p class="mt-2 text-center text-xs text-muted" role="status">${this._t(BUSY_MESSAGE)}</p>`
                : nothing}
        `;
    }

    connectedCallback() {
        super.connectedCallback();
        const connection = ++this._connection;
        this._settings = this._readSettings();
        if (!this._settings || !this.context) {
            this._signal('hyperion-express:unavailable');
            return;
        }
        Promise.resolve()
            .then(() => this.context.whenWanted())
            .then(() => this.context.whenEngaged())
            .then(() => this.context.whenPageIdle())
            .then(() => (connection === this._connection
                ? loadPaypalSdk(this._settings.sdkUrl, this._settings.dataAttributes)
                : null))
            .then((paypal) => (paypal && connection === this._connection ? this._renderButtons(paypal) : null))
            .catch((error) => {
                this._report(error);
                if (connection === this._connection) this._signal('hyperion-express:unavailable');
            });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._connection++;
        this._closeButtons();
    }

    _readSettings() {
        const options = this.options;
        return options && typeof options === 'object' && typeof options.sdkUrl === 'string' && options.sdkUrl !== ''
            ? options
            : null;
    }

    _t(source) {
        return this.context && typeof this.context.t === 'function' ? this.context.t(source) : source;
    }

    _signal(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
    }

    _notify(message, tone) {
        if (this.context && typeof this.context.notify === 'function') this.context.notify(message, tone);
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
        if (!container || typeof paypal.Buttons !== 'function') {
            this._signal('hyperion-express:unavailable');
            return;
        }
        const buttons = paypal.Buttons({
            style: this._settings.styles || {},
            onClick: (data, actions) => this._onClick(data, actions),
            createOrder: () => this._createOrder(),
            onApprove: (data, actions) => this._onApprove(data, actions),
            onCancel: () => this._onCancel(),
            onError: (error) => this._onError(error),
        });
        if (typeof buttons.isEligible === 'function' && !buttons.isEligible()) {
            this._signal('hyperion-express:unavailable');
            return;
        }
        this._buttons = buttons;
        await buttons.render(container);
        this._signal('hyperion-express:ready');
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
            return { message: this._t(SIGN_IN_MESSAGE) };
        }
        if (this.placement !== 'product') return null;
        const problem = productFormProblem(productForm(this.closest('hyperion-express-slot')));
        if (problem === 'missing-form') return { message: this._t(ERROR_MESSAGE) };
        if (problem === 'options') return { message: this._t(OPTIONS_MESSAGE) };
        return null;
    }

    // --- createOrder -------------------------------------------------------

    async _createOrder() {
        const problem = this._findProblem();
        if (problem) {
            throw this._fail(problem.message, 'warning');
        }
        if (this.placement === 'product') {
            await this._addProductToCart();
        }
        let result;
        try {
            const response = await fetch(this._settings.getTokenUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: REQUEST_HEADERS,
                body: new URLSearchParams({
                    quote_id: this.placement === 'product' ? '' : String(this._settings.quoteId ?? ''),
                    customer_id: this.placement === 'product' ? '' : String(this._settings.customerId ?? ''),
                    form_key: readCookie('form_key'),
                    button: String(this._settings.button ?? 1),
                }),
            });
            result = await response.json();
        } catch (_e) {
            throw this._fail(this._t(ERROR_MESSAGE));
        }
        if (!result || !result.success || !result.token) {
            // The controller also queued the message for the next page.
            drainMessages();
            throw this._fail(result?.error_message || this._t(ERROR_MESSAGE));
        }
        return result.token;
    }

    /**
     * Post the add to cart form through the context, the way its own
     * button does. With htmx the response also refreshes the header badge
     * and shows the toast.
     */
    async _addProductToCart() {
        const added = await this.context.addCurrentProductToCart();
        if (added?.ok) return;
        if (added?.message) throw this._fail(added.message);
        // The refusal and its reason are on screen already.
        this._failureShown = true;
        throw new HandledError('add to cart rejected');
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
                throw this._fail(result?.error_message || this._t(ERROR_MESSAGE));
            }
            // The answer comes from the store, but a redirect target is only
            // ever followed when it stays on this origin.
            const redirectUrl = resolveSameOriginUrl(result.redirectUrl);
            if (!redirectUrl) {
                throw this._fail(this._t(ERROR_MESSAGE));
            }
            if (actions && typeof actions.redirect === 'function') {
                await actions.redirect(redirectUrl);
            } else {
                this.context.redirect(redirectUrl);
            }
        } catch (error) {
            this._busy = false;
            if (!error?.handled) this._fail(this._t(ERROR_MESSAGE));
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
        this._notify(message || this._t(CANCEL_MESSAGE), tone);
    }

    _onError(error) {
        this._busy = false;
        // PayPal wraps what createOrder threw, so the flag is kept here.
        if (this._failureShown || error?.handled) return;
        this._report(error);
        // The slot shows the message of an error event in the page toast.
        this._signal('hyperion-express:error', { message: this._t(ERROR_MESSAGE) });
    }

    // --- Feedback ----------------------------------------------------------

    /** Toast the message and return the error to throw. */
    _fail(message, tone = 'error') {
        this._failureShown = true;
        this._notify(message, tone);
        return new HandledError(message);
    }

    _report(error) {
        if (!error || error.handled) return;
        console.error('[hyperion-paypal-buttons]', error);
    }
}

if (!customElements.get('hyperion-paypal-buttons')) {
    customElements.define('hyperion-paypal-buttons', HyperionPaypalButtons);
}
