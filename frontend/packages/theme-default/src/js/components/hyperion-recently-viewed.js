// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hyperion-recently-viewed> -- the Recently Viewed / Recently Compared
 * Products widgets, rendered from the localStorage history of
 * lib/product-history.js (so the widget markup is identical for every
 * visitor and cache-safe). The product of the current product page is left
 * out; the list re-renders when the history changes on the page (a
 * compare from a tile with the compared widget in the sidebar).
 *
 * Attributes (see Magento_Catalog::product/widget/history.phtml): kind
 * (viewed | compared), mode (grid | list | sidebar), limit, scope, heading,
 * show-attributes (name,image,price,learn_more), show-buttons
 * (add_to_cart,add_to_wishlist,add_to_compare), cart-url, wishlist-url,
 * compare-url, can-cart, wishlist-enabled, compare-enabled and the labels
 * cart-label, adding-label, options-label, wishlist-label, compare-label, more-label.
 */
import { html, nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';
import { COMPARED_KEY, HISTORY_EVENT, VIEWED_KEY, currentProductMeta, getHistory } from '../lib/product-history.js';
import { ensureFormKey, getCachedFormKey } from '../lib/form-key.js';
import { renderProductCard } from '../lib/product-card.js';

const csv = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

export class HyperionRecentlyViewed extends HyperionLightElement {
    static properties = {
        kind: { type: String },
        mode: { type: String },
        limit: { type: Number },
        scope: { type: String },
        heading: { type: String },
        showAttributes: { type: String, attribute: 'show-attributes' },
        showButtons: { type: String, attribute: 'show-buttons' },
        cartUrl: { type: String, attribute: 'cart-url' },
        wishlistUrl: { type: String, attribute: 'wishlist-url' },
        compareUrl: { type: String, attribute: 'compare-url' },
        canCart: { type: Boolean, attribute: 'can-cart' },
        wishlistEnabled: { type: Boolean, attribute: 'wishlist-enabled' },
        compareEnabled: { type: Boolean, attribute: 'compare-enabled' },
        cartLabel: { type: String, attribute: 'cart-label' },
        addingLabel: { type: String, attribute: 'adding-label' },
        optionsLabel: { type: String, attribute: 'options-label' },
        wishlistLabel: { type: String, attribute: 'wishlist-label' },
        compareLabel: { type: String, attribute: 'compare-label' },
        moreLabel: { type: String, attribute: 'more-label' },
        items: { state: true },
    };

    constructor() {
        super();
        this.kind = 'viewed';
        this.mode = 'grid';
        this.limit = 5;
        this.scope = 'default';
        this.heading = '';
        this.showAttributes = 'name,image,price';
        this.showButtons = '';
        this.cartUrl = '';
        this.wishlistUrl = '';
        this.compareUrl = '';
        this.canCart = false;
        this.wishlistEnabled = false;
        this.compareEnabled = false;
        this.cartLabel = 'Add to Cart';
        this.addingLabel = 'Adding to cart...';
        this.optionsLabel = 'Select Options';
        this.wishlistLabel = 'Add to Wish List';
        this.compareLabel = 'Add to Compare';
        this.moreLabel = 'Learn More';
        this.items = [];
        this.refresh = this.refresh.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener(HISTORY_EVENT, this.refresh);
        this.refresh();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener(HISTORY_EVENT, this.refresh);
    }

    /** Re-read the history; the current product page's product is excluded. */
    refresh() {
        const key = this.kind === 'compared' ? COMPARED_KEY : VIEWED_KEY;
        const exclude = currentProductMeta()?.id || 0;
        this.items = getHistory(key, this.scope, { limit: this.limit, exclude });
        this.hidden = this.items.length === 0;
    }

    updated() {
        ensureFormKey(this);
        window.htmx?.process?.(this);
    }

    render() {
        if (this.items.length === 0) return nothing;
        const attributes = csv(this.showAttributes);
        const buttons = csv(this.showButtons);
        const options = {
            mode: this.mode,
            showImage: attributes.includes('image'),
            showName: attributes.includes('name'),
            showPrice: attributes.includes('price'),
            showMore: attributes.includes('learn_more'),
            canCart: this.canCart && buttons.includes('add_to_cart'),
            cartUrl: this.cartUrl,
            wishlistEnabled: this.wishlistEnabled && buttons.includes('add_to_wishlist'),
            wishlistUrl: this.wishlistUrl,
            compareEnabled: this.compareEnabled && buttons.includes('add_to_compare'),
            compareUrl: this.compareUrl,
            labels: { cart: this.cartLabel, adding: this.addingLabel, options: this.optionsLabel, wishlist: this.wishlistLabel, compare: this.compareLabel, more: this.moreLabel },
            formKey: getCachedFormKey() || '',
        };
        const listClass = this.mode === 'sidebar'
            ? 'flex flex-col'
            : this.mode === 'list'
                ? 'flex flex-col gap-4'
                : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6';
        return html`<section class=${this.mode === 'sidebar' ? 'bg-surface rounded-xl border border-subtle p-4 mb-6' : 'mb-10'} data-hyperion-history=${this.kind}>
            ${this.heading ? html`<h2 class=${this.mode === 'sidebar' ? 'text-base font-semibold text-secondary mb-2' : 'text-2xl font-bold text-secondary mb-6 tracking-tight'}>${this.heading}</h2>` : nothing}
            <div class=${listClass}>
                ${this.items.map((item) => renderProductCard(item, options))}
            </div>
        </section>`;
    }
}

if (!customElements.get('hyperion-recently-viewed')) {
    customElements.define('hyperion-recently-viewed', HyperionRecentlyViewed);
}
