// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-custom-options -- live price for the customizable options.
 *
 * The options are server-rendered (Magento_Catalog::product/view/
 * options.phtml and options/type/*.phtml) with `data-price` on every
 * priced control; this element adds the chosen ones to the base price and
 * mirrors the total into the PDP price element. Purely cosmetic: the form
 * posts the same fields with or without it.
 *
 * data-base-price    product final price before options
 * data-currency      ISO code for Intl.NumberFormat
 * data-locale        BCP 47 locale for Intl.NumberFormat
 * data-price-target  selector of the element that shows the PDP price
 *
 * A configurable product changes its base price when a variant is
 * picked: <hyperion-swatches> announces it with `hyperion-swatch-change`
 * and rewrites the price element, so the total is applied again after it.
 */

import { LitElement, nothing } from 'lit';

const PRICED_SELECTOR = '[data-price]';

export class HyperionCustomOptions extends LitElement {
    constructor() {
        super();
        this._onChange = this._onChange.bind(this);
        this._onSwatchChange = this._onSwatchChange.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this._basePrice = parseFloat(this.getAttribute('data-base-price') || '0') || 0;
        this._formatter = this._buildFormatter();
        this.addEventListener('change', this._onChange);
        this.addEventListener('input', this._onChange);
        document.addEventListener('hyperion-swatch-change', this._onSwatchChange);
        if (this._optionsTotal() !== 0) {
            this._update();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('change', this._onChange);
        this.removeEventListener('input', this._onChange);
        document.removeEventListener('hyperion-swatch-change', this._onSwatchChange);
    }

    _buildFormatter() {
        const currency = this.getAttribute('data-currency') || '';
        const locale = this.getAttribute('data-locale') || undefined;
        try {
            return currency
                ? new Intl.NumberFormat(locale, { style: 'currency', currency })
                : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } catch (_e) {
            return null;
        }
    }

    _onChange() {
        this._update();
    }

    _onSwatchChange(event) {
        const price = Number(event.detail?.price);
        if (Number.isFinite(price)) {
            this._basePrice = price;
        }
        this._update();
    }

    /** Sum of the prices of the controls the shopper filled in or selected. */
    _optionsTotal() {
        let total = 0;
        // The whole add-to-cart form, not just this element: a product can have
        // customizable options AND priced downloadable links, each in its own
        // wrapper, and the price shown is base + all of them.
        for (const el of (this.closest('form') ?? this).querySelectorAll(PRICED_SELECTOR)) {
            const price = parseFloat(el.getAttribute('data-price') || '0') || 0;
            if (price === 0) continue;
            if (el instanceof HTMLOptionElement) {
                if (el.selected) total += price;
            } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
                if (el.checked) total += price;
            } else if (el instanceof HTMLInputElement && el.type === 'file') {
                if (el.files && el.files.length > 0) total += price;
            } else if (String(el.value || '').trim() !== '') {
                total += price;
            }
        }
        return total;
    }

    _update() {
        const selector = this.getAttribute('data-price-target');
        const target = selector ? document.querySelector(selector) : null;
        if (!target || !this._formatter) return;
        // Server markup keeps the amount in `.price`; after a swatch change
        // the element holds the spans written by <hyperion-swatches>.
        const amountEl = target.querySelector('[data-price-type="finalPrice"] .price')
            || target.querySelector(':scope > span');
        if (!amountEl) return;
        amountEl.textContent = this._formatter.format(this._basePrice + this._optionsTotal());
    }
}

if (!customElements.get('hyperion-custom-options')) {
    customElements.define('hyperion-custom-options', HyperionCustomOptions);
}
