// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach } from 'vitest';
import '../hyperion-recently-viewed.js';
import { mount } from './helpers.js';
import { recordCompared, recordViewed } from '../../lib/product-history.js';

const meta = (id, extra = {}) => ({ id, sku: 'SKU-' + id, name: 'Product ' + id, url: '/p' + id + '.html', image: '/i' + id + '.jpg', price: 10, price_formatted: '$10.00', scope: 'default-USD', saleable: true, buy_from_list: true, ...extra });

function widget(attrs = {}) {
    const el = document.createElement('hyperion-recently-viewed');
    el.setAttribute('scope', 'default-USD');
    el.setAttribute('heading', 'Recently Viewed Products');
    el.setAttribute('cart-url', '/checkout/cart/add/');
    el.setAttribute('wishlist-url', '/wishlist/index/add/');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

describe('<hyperion-recently-viewed>', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });

    test('stays hidden without history', async () => {
        const el = await mount(widget());
        expect(el.hidden).toBe(true);
    });

    test('renders the newest viewed products first, limited, without the current product', async () => {
        for (let i = 1; i <= 4; i++) recordViewed(meta(i));
        document.body.innerHTML = `<section data-hyperion-product-view data-hyperion-product-meta='${JSON.stringify(meta(4))}'></section>`;
        const el = await mount(widget({ limit: '2' }));
        expect(el.hidden).toBe(false);
        const cards = el.querySelectorAll('article[data-hyperion-product-id]');
        expect(Array.from(cards).map((c) => c.getAttribute('data-hyperion-product-id'))).toEqual(['3', '2']);
        expect(el.textContent).toContain('Recently Viewed Products');
        expect(cards[0].querySelector('img').getAttribute('src')).toBe('/i3.jpg');
        expect(cards[0].textContent).toContain('$10.00');
        // No buttons without show-buttons / can-cart.
        expect(cards[0].querySelector('form')).toBeNull();
    });

    test('honours show-attributes and show-buttons and the compared kind', async () => {
        recordCompared(meta(8, { buy_from_list: false }));
        recordCompared(meta(9));
        const el = await mount(widget({ kind: 'compared', 'show-attributes': 'name,price', 'show-buttons': 'add_to_cart,add_to_wishlist', 'can-cart': '', 'wishlist-enabled': '' }));
        const cards = el.querySelectorAll('article[data-hyperion-product-id]');
        expect(cards).toHaveLength(2);
        expect(cards[0].querySelector('img')).toBeNull();
        const cart = cards[0].querySelector('form[hx-post="/checkout/cart/add/"]');
        expect(cart.querySelector('input[name="product"]').value).toBe('9');
        expect(cart.querySelector('input[name="form_key"]')).not.toBeNull();
        expect(cards[0].querySelector('form[hx-post="/wishlist/index/add/"]')).not.toBeNull();
        // The product that needs options links to its page instead.
        expect(cards[1].querySelector('form[hx-post="/checkout/cart/add/"]')).toBeNull();
        expect(cards[1].querySelector('a[href="/p8.html"]')).not.toBeNull();
    });

    test('re-renders when the history changes on the page', async () => {
        recordViewed(meta(1));
        const el = await mount(widget());
        expect(el.querySelectorAll('article')).toHaveLength(1);
        recordViewed(meta(2));
        await el.updateComplete;
        expect(el.querySelectorAll('article')).toHaveLength(2);
    });
});
