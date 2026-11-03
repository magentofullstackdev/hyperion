// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach } from 'vitest';
import '../hyperion-wishlist-sidebar.js';
import { mount } from './helpers.js';

const items = [
    { id: 5, item: 50, qty: 2, name: 'Fusion Backpack', url: '/fusion-backpack.html', image: '/fb.jpg', price_formatted: '$59.00', saleable: true, buy_from_list: true },
    { id: 6, item: 60, qty: 1, name: 'Hero Hoodie', url: '/hero-hoodie.html', image: '', price_formatted: '$54.00', saleable: true, buy_from_list: false },
];

function anchor(summary, map) {
    const a = document.createElement('a');
    a.id = 'hyperion-wishlist-count';
    a.setAttribute('data-hyperion-wishlist-items', JSON.stringify(map));
    a.setAttribute('data-hyperion-wishlist-summary', JSON.stringify(summary));
    document.body.appendChild(a);
    a.dispatchEvent(new CustomEvent('htmx:oobAfterSwap', { bubbles: true }));
    return a;
}

function sidebar() {
    const el = document.createElement('hyperion-wishlist-sidebar');
    el.setAttribute('wishlist-url', '/wishlist/');
    el.setAttribute('remove-url', '/wishlist/index/remove/');
    el.setAttribute('cart-url', '/wishlist/index/cart/');
    el.setAttribute('heading', 'My Wish List');
    el.setAttribute('confirm-label', 'Remove?');
    return el;
}

describe('<hyperion-wishlist-sidebar>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('stays hidden without wishlist items (guests, empty lists)', async () => {
        anchor([], {});
        const el = await mount(sidebar());
        expect(el.hidden).toBe(true);
        expect(el.querySelector('[data-hyperion-wishlist-sidebar]')).toBeNull();
    });

    test('renders the header-state items with remove and add-to-cart actions', async () => {
        anchor(items, { 5: 50, 6: 60, 7: 70 });
        const el = await mount(sidebar());
        expect(el.hidden).toBe(false);
        expect(el.textContent).toContain('My Wish List');
        expect(el.textContent).toContain('3 items');
        const rows = el.querySelectorAll('li[data-hyperion-product-id]');
        expect(rows).toHaveLength(2);
        const remove = rows[0].querySelector('form[hx-post="/wishlist/index/remove/"]');
        expect(remove.querySelector('input[name="item"]').value).toBe('50');
        expect(remove.getAttribute('hx-target')).toBe('#hyperion-notification');
        expect(remove.getAttribute('hx-confirm')).toBe('Remove?');
        const cart = rows[0].querySelector('form[action="/wishlist/index/cart/"]');
        expect(cart.querySelector('input[name="item"]').value).toBe('50');
        expect(cart.querySelector('input[name="qty"]').value).toBe('2');
        expect(cart.querySelector('input[name="form_key"]')).not.toBeNull();
        // A product that needs options links to its page instead of posting.
        expect(rows[1].querySelector('form[action="/wishlist/index/cart/"]')).toBeNull();
        expect(rows[1].querySelector('a[href="/hero-hoodie.html"]')).not.toBeNull();
        expect(el.querySelector('[data-hyperion-wishlist-sidebar-link]').getAttribute('href')).toBe('/wishlist/');
    });

    test('re-renders when the fragment is swapped out of band', async () => {
        const a = anchor(items, { 5: 50, 6: 60 });
        const el = await mount(sidebar());
        expect(el.querySelectorAll('li[data-hyperion-product-id]')).toHaveLength(2);
        a.setAttribute('data-hyperion-wishlist-summary', JSON.stringify([items[1]]));
        a.setAttribute('data-hyperion-wishlist-items', JSON.stringify({ 6: 60 }));
        a.dispatchEvent(new CustomEvent('htmx:oobAfterSwap', { bubbles: true }));
        await el.updateComplete;
        expect(el.querySelectorAll('li[data-hyperion-product-id]')).toHaveLength(1);
        expect(el.textContent).toContain('1 item');
    });
});
