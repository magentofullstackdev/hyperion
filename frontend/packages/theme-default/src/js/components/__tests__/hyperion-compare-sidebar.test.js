// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach } from 'vitest';
import '../hyperion-compare-sidebar.js';
import { mount } from './helpers.js';

function anchor(items) {
    const a = document.createElement('a');
    a.id = 'hyperion-compare-count';
    a.setAttribute('data-hyperion-compare-ids', items.map((i) => i.id).join(','));
    a.setAttribute('data-hyperion-compare-items', JSON.stringify(items));
    document.body.appendChild(a);
    a.dispatchEvent(new CustomEvent('htmx:oobAfterSwap', { bubbles: true }));
    return a;
}

function sidebar() {
    const el = document.createElement('hyperion-compare-sidebar');
    el.setAttribute('compare-url', '/catalog/product_compare/');
    el.setAttribute('remove-url', '/catalog/product_compare/remove/');
    el.setAttribute('clear-url', '/catalog/product_compare/clear/');
    el.setAttribute('heading', 'Compare Products');
    return el;
}

describe('<hyperion-compare-sidebar>', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('stays hidden while nothing is compared', async () => {
        anchor([]);
        const el = await mount(sidebar());
        expect(el.hidden).toBe(true);
    });

    test('lists the compared products with remove, compare and clear actions', async () => {
        anchor([{ id: 1, name: 'Joust Duffle Bag', url: '/joust.html' }, { id: 2, name: 'Strive Shoulder Pack', url: '/strive.html' }]);
        const el = await mount(sidebar());
        expect(el.hidden).toBe(false);
        const rows = el.querySelectorAll('li[data-hyperion-product-id]');
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelector('a').getAttribute('href')).toBe('/joust.html');
        const remove = rows[1].querySelector('form[hx-post="/catalog/product_compare/remove/"]');
        expect(remove.querySelector('input[name="product"]').value).toBe('2');
        expect(el.querySelector('[data-hyperion-compare-sidebar-link]').getAttribute('href')).toBe('/catalog/product_compare/');
        const clear = el.querySelector('form[action="/catalog/product_compare/clear/"]');
        expect(clear.getAttribute('method')).toBe('post');
        expect(clear.querySelector('input[name="form_key"]')).not.toBeNull();
    });
});
