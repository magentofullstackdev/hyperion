// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-bundle-options -- running total for the bundle option form.
 *
 * The options are server-rendered (Magento_Bundle::catalog/product/view/
 * type/bundle/options.phtml) with `data-price` / `data-qty` / `data-name` on
 * every selection; this element recomputes "Price as configured" and the
 * "Your Customization" list (qty x selection) whenever a selection or a
 * quantity changes. The template renders the lines of the initial selection
 * with the same markup, so the upgrade changes nothing in the layout. Purely
 * cosmetic: the form posts the same fields with or without it. A quantity
 * input only scales the selections of a fieldset marked
 * `data-hyperion-bundle-can-change-qty="1"`.
 *
 * data-base-price   starting amount (fixed-price bundles), else 0
 * data-currency     ISO code for Intl.NumberFormat
 * data-locale       BCP 47 locale for Intl.NumberFormat
 */

import { LitElement, nothing } from 'lit';

const TOTAL_SELECTOR = '[data-hyperion-bundle-total]';
const SUMMARY_SELECTOR = '[data-hyperion-bundle-summary-list]';

export class HyperionBundleOptions extends LitElement {
    constructor() {
        super();
        this._onChange = this._onChange.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('change', this._onChange);
        this.addEventListener('input', this._onChange);
        this._formatter = this._buildFormatter();
        this._update();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('change', this._onChange);
        this.removeEventListener('input', this._onChange);
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

    /** The chosen selections: `{ name, qty, price }` per line, and the total. */
    getConfiguration() {
        let total = parseFloat(this.getAttribute('data-base-price') || '0') || 0;
        const lines = [];
        for (const fieldset of this.querySelectorAll('[data-hyperion-bundle-option]')) {
            const optionId = fieldset.getAttribute('data-hyperion-bundle-option');
            const canChange = fieldset.getAttribute('data-hyperion-bundle-can-change-qty') !== '0';
            const qtyInput = canChange ? fieldset.querySelector(`[data-hyperion-bundle-qty="${optionId}"]`) : null;
            const qtyOverride = qtyInput ? parseFloat(qtyInput.value) : NaN;
            const chosen = fieldset.querySelectorAll('input:checked, option:checked');
            for (const el of chosen) {
                if (!el.value) continue;
                const price = parseFloat(el.getAttribute('data-price') || '0') || 0;
                const baseQty = parseFloat(el.getAttribute('data-qty') || '1') || 1;
                // data-price already includes the selection's default quantity;
                // scale it when the shopper changed the quantity.
                const qty = Number.isFinite(qtyOverride) && qtyOverride > 0 ? qtyOverride : baseQty;
                const linePrice = price * (qty / baseQty);
                total += linePrice;
                const label = el.getAttribute('data-name')
                    || (el.tagName === 'OPTION'
                        ? el.textContent
                        : el.closest('label')?.querySelector('span')?.textContent || el.value);
                lines.push({ name: String(label || '').replace(/\s+/g, ' ').trim(), qty, price: linePrice });
            }
        }
        return { total, lines };
    }

    _update() {
        const target = this.querySelector(TOTAL_SELECTOR);
        if (!target || !this._formatter) return;
        const { total, lines } = this.getConfiguration();
        target.textContent = this._formatter.format(total);
        const list = this.querySelector(SUMMARY_SELECTOR);
        if (list) {
            list.replaceChildren(...lines.map((line) => {
                const item = document.createElement('li');
                item.className = 'flex items-center justify-between gap-3';
                const name = document.createElement('span');
                name.textContent = `${line.qty} x ${line.name}`;
                const price = document.createElement('span');
                price.className = 'text-muted';
                price.textContent = this._formatter.format(line.price);
                item.append(name, price);
                return item;
            }));
        }
    }
}

if (!customElements.get('hyperion-bundle-options')) {
    customElements.define('hyperion-bundle-options', HyperionBundleOptions);
}
