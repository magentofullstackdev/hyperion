// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-paypal-message -- PayPal Pay Later message.
 *
 * Replaces Magento_Paypal's Knockout component (`js/view/paylater` and
 * its amount providers). The message is PayPal's own `data-pp-message`
 * element: the merchant's style settings are its `data-pp-style-*`
 * attributes, the amount is `data-pp-amount`, and PayPal re-renders the
 * message whenever an attribute changes.
 *
 * Attributes:
 *   sdk-url          URL of the PayPal SDK (Magento\Paypal\Model\SdkUrl)
 *   sdk-attributes   JSON, `data-*` attributes of the SDK script tag
 *   message          JSON, the `data-pp-*` attributes of the message
 *                    (HyperionCheckout\ViewModel\PaypalPayLater)
 *   amount           initial amount; leave out to show a message
 *                    without an amount
 *   amount-source    `product`: follow the displayed product price
 *                    (`price-target`, swatch changes, options, quantity);
 *                    `cart`: follow the cart total after HTMX swaps
 *                    (`[data-hyperion-paypal-amount]`)
 *   price-target     selector of the product price element
 *   qty-selector     selector of the quantity input
 *
 * The SDK is loaded by lib/paypal-sdk.js: not before the element is near
 * the viewport and the page has finished loading.
 */

import { nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';
import { loadPaypalSdk, whenWanted, whenPageIdle } from '../lib/paypal-sdk.js';

const DEFAULT_PRICE_TARGET = '#hyperion-product-price';
const DEFAULT_QTY_SELECTOR = '#product_addtocart_form [name="qty"]';
const CART_AMOUNT_SELECTOR = '[data-hyperion-paypal-amount]';
const FINAL_PRICE_SELECTORS = [
    '[data-price-type="finalPrice"] .price',
    '[data-price-type="finalPrice"]',
    ':scope > span',
];

function parseJson(text) {
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
        return {};
    }
}

/**
 * Amount of a formatted price ("$1,234.50", "1.234,50 EUR", "1 234 Ft").
 * The last separator is the decimal one when one or two digits follow it.
 *
 * @param {string} text
 * @returns {number} NaN when the text holds no number
 */
export function parsePrice(text) {
    const match = String(text ?? '').match(/\d[\d.,\s\u00a0\u202f']*/);
    if (!match) return NaN;
    const raw = match[0].replace(/[\s\u00a0\u202f']/g, '').replace(/[.,]+$/, '');
    const decimal = raw.match(/[.,](\d{1,2})$/);
    const integer = (decimal ? raw.slice(0, decimal.index) : raw).replace(/[.,]/g, '');
    if (integer === '') return NaN;
    return parseFloat(decimal ? `${integer}.${decimal[1]}` : integer);
}

export class HyperionPaypalMessage extends HyperionLightElement {
    static properties = {
        sdkUrl: { type: String, attribute: 'sdk-url' },
        sdkAttributes: { type: String, attribute: 'sdk-attributes' },
        message: { type: String },
        amount: { type: String },
        amountSource: { type: String, attribute: 'amount-source' },
        priceTarget: { type: String, attribute: 'price-target' },
        qtySelector: { type: String, attribute: 'qty-selector' },
    };

    constructor() {
        super();
        this.sdkUrl = '';
        this.sdkAttributes = '';
        this.message = '';
        this.amount = '';
        this.amountSource = '';
        this.priceTarget = DEFAULT_PRICE_TARGET;
        this.qtySelector = DEFAULT_QTY_SELECTOR;
        this._element = null;
        this._waiting = null;
        this._priceObserver = null;
        this._price = NaN;
        this._connection = 0;
        this._onSwatchChange = this._onSwatchChange.bind(this);
        this._onQtyChange = this._onQtyChange.bind(this);
        this._onSettle = this._onSettle.bind(this);
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        if (!this.sdkUrl) return;
        this._price = parseFloat(this.amount);
        this._mountMessage();
        this._watchAmount();
        const connection = ++this._connection;
        this._waiting = whenWanted(this);
        this._waiting
            .then(() => whenPageIdle())
            .then(() => (connection === this._connection
                ? loadPaypalSdk(this.sdkUrl, parseJson(this.sdkAttributes))
                : null))
            .then((paypal) => (paypal && connection === this._connection ? this._renderMessage(paypal) : null))
            .catch((error) => {
                console.error('[hyperion-paypal-message]', error);
            });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._connection++;
        this._waiting?.cancel();
        this._waiting = null;
        this._priceObserver?.disconnect();
        this._priceObserver = null;
        document.removeEventListener('hyperion-swatch-change', this._onSwatchChange);
        document.removeEventListener('change', this._onQtyChange);
        document.body.removeEventListener('htmx:afterSettle', this._onSettle);
    }

    // --- Message element ---------------------------------------------------

    _mountMessage() {
        if (!this._element) {
            this._element = document.createElement('div');
            this._element.className = 'pay-later-message';
            this._element.setAttribute('data-pp-message', '');
            for (const [name, value] of Object.entries(parseJson(this.message))) {
                if (/^data-pp-[a-z-]+$/.test(name) && value !== null && value !== '') {
                    this._element.setAttribute(name, String(value));
                }
            }
        }
        if (this._element.parentNode !== this) this.appendChild(this._element);
        this._applyAmount();
    }

    _renderMessage(paypal) {
        if (!this._element || typeof paypal.Messages !== 'function') return null;
        return paypal.Messages().render(this._element);
    }

    // --- Amount ------------------------------------------------------------

    _currentAmount() {
        if (!Number.isFinite(this._price) || this._price <= 0) return NaN;
        if (this.amountSource !== 'product') return this._price;
        const qty = parseFloat(document.querySelector(this.qtySelector)?.value ?? '1');
        return this._price * (Number.isFinite(qty) && qty > 0 ? qty : 1);
    }

    _applyAmount() {
        if (!this._element) return;
        const amount = this._currentAmount();
        if (!Number.isFinite(amount)) {
            this._element.removeAttribute('data-pp-amount');
            return;
        }
        const value = amount.toFixed(2);
        if (this._element.getAttribute('data-pp-amount') !== value) {
            this._element.setAttribute('data-pp-amount', value);
        }
    }

    _watchAmount() {
        if (this.amountSource === 'cart') {
            document.body.addEventListener('htmx:afterSettle', this._onSettle);
            return;
        }
        if (this.amount !== '' && this.amountSource === 'product') {
            document.addEventListener('hyperion-swatch-change', this._onSwatchChange);
            document.addEventListener('change', this._onQtyChange);
            const target = document.querySelector(this.priceTarget);
            if (target && typeof MutationObserver === 'function') {
                this._priceObserver = new MutationObserver(() => this._readDisplayedPrice(target));
                this._priceObserver.observe(target, { childList: true, subtree: true, characterData: true });
            }
        }
    }

    _onSwatchChange(event) {
        const price = Number(event.detail?.price);
        if (!Number.isFinite(price) || price <= 0) return;
        this._price = price;
        this._applyAmount();
    }

    _onQtyChange(event) {
        if (event.target instanceof Element && event.target.matches(this.qtySelector)) {
            this._applyAmount();
        }
    }

    /** The options components write the total into the price element. */
    _readDisplayedPrice(target) {
        let source = null;
        for (const selector of FINAL_PRICE_SELECTORS) {
            source = target.querySelector(selector);
            if (source) break;
        }
        const price = parsePrice(source?.textContent ?? '');
        if (!Number.isFinite(price) || price <= 0) return;
        this._price = price;
        this._applyAmount();
    }

    _onSettle() {
        const holder = document.querySelector(CART_AMOUNT_SELECTOR);
        const amount = parseFloat(holder?.getAttribute('data-hyperion-paypal-amount') ?? '');
        this.hidden = !holder || !(amount > 0);
        if (this.hidden || this.amount === '') return;
        this._price = amount;
        this._applyAmount();
    }
}

if (!customElements.get('hyperion-paypal-message')) {
    customElements.define('hyperion-paypal-message', HyperionPaypalMessage);
}
