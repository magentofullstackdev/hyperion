// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hyperion-wishlist-sidebar> -- the wishlist sidebar of 2 / 3 column pages.
 *
 * Rendered from the header-state wishlist fragment (lib/list-state.js,
 * `state.wishlistItems`: the newest items as product records with the
 * wishlist item id and quantity), so a cached page shows the visitor's
 * own wishlist without a request of its own. Hidden for guests and empty
 * wishlists. Remove is an HTMX POST to `remove-url` (the wishlist plugin
 * answers with the toast and the refreshed fragment, which re-renders this
 * list); Add to Cart is a plain POST to `cart-url` (`wishlist/index/cart`,
 * which may redirect to the configure page).
 *
 * Attributes: wishlist-url, remove-url, cart-url, heading, cart-label,
 * remove-label, view-label, confirm-label.
 */
import { html, nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';
import { subscribe } from '../lib/list-state.js';
import { ensureFormKey, getCachedFormKey } from '../lib/form-key.js';
import { cartIcon, formKeyInput, toastForm } from '../lib/product-card.js';

export class HyperionWishlistSidebar extends HyperionLightElement {
    static properties = {
        wishlistUrl: { type: String, attribute: 'wishlist-url' },
        removeUrl: { type: String, attribute: 'remove-url' },
        cartUrl: { type: String, attribute: 'cart-url' },
        heading: { type: String },
        cartLabel: { type: String, attribute: 'cart-label' },
        removeLabel: { type: String, attribute: 'remove-label' },
        viewLabel: { type: String, attribute: 'view-label' },
        confirmLabel: { type: String, attribute: 'confirm-label' },
        items: { state: true },
        count: { state: true },
    };

    constructor() {
        super();
        this.wishlistUrl = '';
        this.removeUrl = '';
        this.cartUrl = '';
        this.heading = 'My Wish List';
        this.cartLabel = 'Add to Cart';
        this.removeLabel = 'Remove This Item';
        this.viewLabel = 'Go to Wish List';
        this.confirmLabel = '';
        this.items = [];
        this.count = 0;
        this._onState = this._onState.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();
        this._unsubscribe = subscribe(this._onState);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._unsubscribe?.();
        this._unsubscribe = null;
    }

    _onState(state) {
        this.items = Array.isArray(state.wishlistItems) ? state.wishlistItems : [];
        this.count = state.wishlist?.size || 0;
        this.hidden = this.items.length === 0;
    }

    updated() {
        ensureFormKey(this);
        window.htmx?.process?.(this);
    }

    render() {
        if (this.items.length === 0) return nothing;
        const formKey = getCachedFormKey() || '';
        return html`<section class="bg-surface rounded-xl border border-subtle p-4 mb-6" aria-labelledby="hyperion-wishlist-sidebar-heading" data-hyperion-wishlist-sidebar>
            <h2 id="hyperion-wishlist-sidebar-heading" class="text-base font-semibold text-secondary mb-1">${this.heading}</h2>
            <p class="text-xs text-muted mb-2">${this.count} ${this.count === 1 ? 'item' : 'items'}</p>
            <ol class="divide-y divide-subtle">
                ${this.items.map((item) => this._renderItem(item, formKey))}
            </ol>
            <a href=${this.wishlistUrl} class="mt-3 inline-block text-sm font-medium text-primary hover:underline" data-hyperion-wishlist-sidebar-link>${this.viewLabel}</a>
        </section>`;
    }

    _renderItem(item, formKey) {
        const cart = item.saleable
            ? (item.buy_from_list
                ? html`<form action=${this.cartUrl} method="post" class="flex">
                    ${formKeyInput(formKey)}
                    <input type="hidden" name="item" value=${item.item} />
                    <input type="hidden" name="qty" value=${item.qty || 1} />
                    <button type="submit" class="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-on-primary hover:bg-primary-hover" data-hyperion-wishlist-sidebar-cart>${cartIcon()}<span>${this.cartLabel}</span></button>
                </form>`
                : html`<a href=${item.url} class="inline-flex items-center rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-on-primary hover:bg-primary-hover">${this.cartLabel}</a>`)
            : nothing;
        const remove = toastForm(this.removeUrl, { item: item.item }, formKey,
            html`<button type="submit" class="text-xs text-muted hover:text-error underline-offset-2 hover:underline" title=${this.removeLabel} data-hyperion-wishlist-sidebar-remove>${this.removeLabel}</button>`,
            { class: 'flex', confirm: this.confirmLabel || undefined });
        return html`<li class="flex gap-3 py-3" data-hyperion-product-id=${item.id}>
            ${item.image ? html`<a href=${item.url} class="block w-16 h-16 shrink-0 overflow-hidden rounded-lg bg-surface-raised" tabindex="-1" aria-hidden="true"><img src=${item.image} alt="" class="w-full h-full object-cover" loading="lazy" width="64" height="64" /></a>` : nothing}
            <div class="min-w-0 flex-1 space-y-1">
                <a href=${item.url} class="block text-sm font-medium text-secondary hover:text-primary line-clamp-2">${item.name}</a>
                ${item.price_formatted ? html`<div class="text-sm font-bold text-secondary">${item.price_formatted}</div>` : nothing}
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">${cart}${remove}</div>
            </div>
        </li>`;
    }
}

if (!customElements.get('hyperion-wishlist-sidebar')) {
    customElements.define('hyperion-wishlist-sidebar', HyperionWishlistSidebar);
}
