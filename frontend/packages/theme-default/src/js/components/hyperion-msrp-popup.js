// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-msrp-popup -- MAP ("minimum advertised price") dialog.
 *
 * Replaces core's RequireJS `addToCart` widget + Magento_Msrp::popup.phtml.
 * The theme's Magento_Msrp::product/price/msrp.phtml renders one instance
 * per "Click for price" link (and one per "What's this?" link on the PDP):
 *
 *     <hyperion-msrp-popup product-id="12" product-name="Joust Duffle Bag"
 *                          add-label="Add to Cart" close-label="Close">
 *         <button type="button" data-hyperion-msrp-open>Click for price</button>
 *         <template data-hyperion-msrp-dialog>
 *             ...MSRP, actual price, explanation (server rendered)...
 *         </template>
 *     </hyperion-msrp-popup>
 *
 * The dialog body stays inside the inert <template> until the shopper
 * asks for it, so the actual price is never on the page before the
 * click. On open, a native `<dialog>` is built in light DOM (Tailwind
 * utilities apply) with the template content, a Close button and, unless
 * `info` / `no-cart` is set, an Add to Cart button. That button submits
 * the page's own add-to-cart form for the product (the tile form on
 * listings, `#product_addtocart_form` on the PDP), so selected options
 * and the HTMX toast / mini-cart update behave exactly as a direct click.
 *
 * Attributes:
 *   product-id     product entity id, used to find the add-to-cart form
 *   product-name   dialog heading
 *   add-label      Add to Cart button text (default "Add to Cart")
 *   close-label    Close button text and aria-label (default "Close")
 *   info           boolean, information-only dialog (no Add to Cart)
 *   no-cart        boolean, product is not saleable (no Add to Cart)
 */

import { LitElement, nothing } from 'lit';

const TAG = 'hyperion-msrp-popup';
const CART_ADD_PATH = '/checkout/cart/add';

const CLOSE_ICON = '<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"'
    + ' aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';

const DIALOG_CLASSES = 'm-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-subtle bg-surface p-0'
    + ' text-secondary shadow-xl backdrop:bg-black/50';
const SECONDARY_BUTTON = 'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-surface border'
    + ' border-subtle text-secondary hover:border-primary hover:text-primary transition-colors focus:outline-none'
    + ' focus:ring-2 focus:ring-primary';
const PRIMARY_BUTTON = 'inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider'
    + ' bg-primary text-on-primary shadow-sm hover:bg-primary-hover hover:shadow-md transition-all'
    + ' focus:outline-none focus:ring-2 focus:ring-primary';

let dialogCounter = 0;

export class HyperionMsrpPopup extends LitElement {
    static properties = {
        productId: { type: String, attribute: 'product-id' },
        productName: { type: String, attribute: 'product-name' },
        addLabel: { type: String, attribute: 'add-label' },
        closeLabel: { type: String, attribute: 'close-label' },
        info: { type: Boolean },
        noCart: { type: Boolean, attribute: 'no-cart' },
    };

    constructor() {
        super();
        this.productId = '';
        this.productName = '';
        this.addLabel = 'Add to Cart';
        this.closeLabel = 'Close';
        this.info = false;
        this.noCart = false;
        this._dialog = null;
    }

    createRenderRoot() {
        return this;
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('click', this._onClick);
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._onClick);
        if (this._dialog) {
            this._dialog.remove();
            this._dialog = null;
        }
        super.disconnectedCallback();
    }

    _onClick = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('[data-hyperion-msrp-open]')) {
            event.preventDefault();
            this.open();
        } else if (target.closest('[data-hyperion-msrp-add]')) {
            event.preventDefault();
            this.addToCart();
        } else if (target.closest('[data-hyperion-msrp-close]')) {
            event.preventDefault();
            this.close();
        } else if (this._dialog && target === this._dialog) {
            // The dialog element itself is only hit on the backdrop.
            this.close();
        }
    };

    /** @returns {boolean} true when the dialog is open */
    get isOpen() {
        return !!(this._dialog && this._dialog.open);
    }

    open() {
        const dialog = this._ensureDialog();
        if (!dialog) return;
        if (!dialog.open) {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
        }
        dialog.querySelector('[data-hyperion-msrp-add], [data-hyperion-msrp-close]')?.focus();
    }

    close() {
        const dialog = this._dialog;
        if (!dialog) return;
        if (typeof dialog.close === 'function' && dialog.open) {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    }

    /**
     * The add-to-cart form of this product: the closest tile's form on a
     * listing, `#product_addtocart_form` on the PDP. Wishlist and compare
     * forms also carry a `product` input, so the URL is checked too.
     *
     * @returns {HTMLFormElement|null}
     */
    findCartForm() {
        const id = String(this.productId || '');
        if (id === '') return null;
        const matches = (form) => {
            const input = form.querySelector('input[name="product"]');
            if (!input || String(input.value) !== id) return false;
            const url = form.getAttribute('hx-post') || form.getAttribute('action') || '';
            return url.includes(CART_ADD_PATH);
        };
        const scope = this.closest('article, li');
        const roots = scope ? [scope, document] : [document];
        for (const root of roots) {
            for (const form of root.querySelectorAll('form')) {
                if (matches(form)) return form;
            }
        }
        return null;
    }

    addToCart() {
        const form = this.findCartForm();
        this.close();
        if (!form) return;
        if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
        } else {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
    }

    /**
     * Replace the "Actual Price" of the dialog (template and, when already
     * built, the live dialog): <hyperion-swatches> calls it for MAP variants.
     */
    setActualPriceHtml(html) {
        const roots = [this.querySelector('template[data-hyperion-msrp-dialog]')?.content, this._dialog].filter(Boolean);
        for (const root of roots) {
            const cell = root.querySelector('.actual-price');
            if (cell) cell.innerHTML = html;
        }
    }

    _ensureDialog() {
        if (this._dialog) return this._dialog;
        const template = this.querySelector('template[data-hyperion-msrp-dialog]');
        if (!template) return null;

        const headingId = `hyperion-msrp-heading-${++dialogCounter}`;
        const dialog = document.createElement('dialog');
        dialog.className = DIALOG_CLASSES;
        dialog.setAttribute('aria-labelledby', headingId);

        const panel = document.createElement('div');
        panel.className = 'p-6';

        const header = document.createElement('div');
        header.className = 'flex items-start justify-between gap-4';
        const heading = document.createElement('h2');
        heading.id = headingId;
        heading.className = 'text-lg font-bold leading-snug text-secondary';
        heading.textContent = this.productName;
        const closeIcon = document.createElement('button');
        closeIcon.type = 'button';
        closeIcon.setAttribute('data-hyperion-msrp-close', '');
        closeIcon.setAttribute('aria-label', this.closeLabel);
        closeIcon.className = 'shrink-0 rounded p-1 text-muted hover:text-primary focus:outline-none focus:ring-2'
            + ' focus:ring-primary';
        closeIcon.innerHTML = CLOSE_ICON;
        header.append(heading, closeIcon);

        const body = document.createElement('div');
        body.className = 'mt-4';
        body.setAttribute('data-hyperion-msrp-body', '');
        body.appendChild(template.content.cloneNode(true));

        const actions = document.createElement('div');
        actions.className = 'mt-6 flex flex-wrap justify-end gap-3';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.setAttribute('data-hyperion-msrp-close', '');
        closeButton.className = SECONDARY_BUTTON;
        closeButton.textContent = this.closeLabel;
        actions.appendChild(closeButton);
        if (!this.info && !this.noCart && this.findCartForm()) {
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.setAttribute('data-hyperion-msrp-add', '');
            addButton.className = PRIMARY_BUTTON;
            addButton.textContent = this.addLabel;
            actions.appendChild(addButton);
        }

        panel.append(header, body, actions);
        dialog.appendChild(panel);
        this.appendChild(dialog);
        this._dialog = dialog;
        return dialog;
    }
}

if (!customElements.get(TAG)) {
    customElements.define(TAG, HyperionMsrpPopup);
}
