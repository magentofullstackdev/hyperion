// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Product card templates for the client-rendered lists (wishlist sidebar,
// recently viewed / compared widgets). The records are the
// `data-hyperion-product-meta` shape (HyperionCore\ViewModel\Catalog\
// ProductSummary); the markup mirrors the server-rendered tiles of
// Magento_CatalogWidget::product/widget/content/grid.phtml. Forms carry the
// same HTMX attributes as the tiles (toast target, out-of-band header
// fragments); the caller runs `htmx.process()` and `ensureFormKey()` on
// the rendered root.

import { html, nothing } from 'lit';

const TOAST_TARGET = '#hyperion-notification';

export function formKeyInput(formKey) {
    return html`<input type="hidden" name="form_key" value=${formKey || ''} />`;
}

export function cartIcon() {
    return html`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
    </svg>`;
}

const primaryButton = 'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-on-primary shadow-sm hover:bg-primary-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary transition-all';
const secondaryButton = 'inline-flex w-full items-center justify-center gap-1 rounded-lg border border-subtle bg-surface px-2 py-2 text-xs font-medium text-muted hover:text-primary hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary transition-colors';

/** HTMX POST form that only shows the toast (the fragments ride out of band). */
export function toastForm(action, fields, formKey, content, extra = {}) {
    return html`<form action=${action} method="post" hx-post=${action} hx-target=${TOAST_TARGET}
                      hx-swap="outerHTML" hx-select=${TOAST_TARGET} class=${extra.class || 'flex'}
                      hx-confirm=${extra.confirm || nothing}>
        ${formKeyInput(formKey)}
        ${Object.entries(fields).map(([name, value]) => html`<input type="hidden" name=${name} value=${value} />`)}
        ${content}
    </form>`;
}

/**
 * @param {object} item product record
 * @param {object} o options: mode, showImage, showName, showPrice, showMore, canCart, cartUrl,
 *   wishlistEnabled, wishlistUrl, compareEnabled, compareUrl, labels {cart, options, wishlist, compare, more}, formKey
 */
export function renderProductCard(item, o) {
    const labels = o.labels || {};
    const sidebar = o.mode === 'sidebar';
    const list = o.mode === 'list';
    const image = o.showImage !== false && item.image
        ? html`<a href=${item.url} class=${sidebar ? 'block w-16 h-16 shrink-0 overflow-hidden rounded-lg bg-surface-raised' : 'block aspect-square overflow-hidden bg-surface-raised' + (list ? ' w-32 shrink-0 rounded-lg' : '')} tabindex="-1" aria-hidden="true">
                <img src=${item.image} alt="" class="w-full h-full object-cover" loading="lazy" width="300" height="300" />
            </a>`
        : nothing;
    const cart = o.canCart && item.saleable
        ? (item.buy_from_list
            ? toastForm(o.cartUrl, { product: item.id, qty: 1 }, o.formKey, html`<button type="submit" class=${primaryButton}>${cartIcon()}<span>${labels.cart || 'Add to Cart'}</span></button>`)
            : html`<a href=${item.url} class=${primaryButton}>${labels.options || 'Select Options'}</a>`)
        : nothing;
    const wishlist = o.wishlistEnabled
        ? toastForm(o.wishlistUrl, { product: item.id }, o.formKey, html`<button type="submit" class=${secondaryButton} title=${labels.wishlist || 'Add to Wish List'}>${labels.wishlist || 'Add to Wish List'}</button>`, { class: 'flex-1' })
        : nothing;
    const compare = o.compareEnabled
        ? toastForm(o.compareUrl, { product: item.id }, o.formKey, html`<button type="submit" class=${secondaryButton} title=${labels.compare || 'Add to Compare'}>${labels.compare || 'Add to Compare'}</button>`, { class: 'flex-1' })
        : nothing;
    const actions = cart !== nothing || wishlist !== nothing || compare !== nothing || o.showMore
        ? html`<div class="mt-auto pt-3 flex flex-col gap-2">
            ${cart}
            ${wishlist !== nothing || compare !== nothing ? html`<div class="flex items-center gap-2">${wishlist}${compare}</div>` : nothing}
            ${o.showMore ? html`<a href=${item.url} class="text-xs font-medium text-primary hover:underline">${labels.more || 'Learn More'}</a>` : nothing}
        </div>`
        : nothing;
    const body = html`<div class=${sidebar ? 'min-w-0 flex-1 space-y-1' : 'p-4 space-y-2 flex-1 flex flex-col'}>
        ${o.showName !== false ? html`<a href=${item.url} class="block text-sm font-medium text-secondary hover:text-primary transition-colors line-clamp-2">${item.name}</a>` : nothing}
        ${o.showPrice !== false && item.price_formatted ? html`<div class="text-sm font-bold text-secondary">${item.price_formatted}</div>` : nothing}
        ${actions}
    </div>`;
    return html`<article class=${sidebar
            ? 'flex gap-3 py-3 border-b border-subtle last:border-b-0'
            : 'group bg-surface rounded-xl border border-subtle overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-200 flex ' + (list ? 'flex-row gap-4 p-4' : 'flex-col')}
                     data-hyperion-product-id=${item.id}>
        ${image}
        ${body}
    </article>`;
}
