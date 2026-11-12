// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// lib/product-card.js: the request synchronization and the Add to Cart busy
// state markup of the client-rendered cards.

import { describe, test, expect, beforeEach } from 'vitest';
import { render } from 'lit';
import { renderProductCard } from '../product-card.js';

const ITEM = { id: 7, url: '/bag.html', name: 'Bag', saleable: true, buy_from_list: true };
const OPTIONS = {
    canCart: true,
    cartUrl: '/checkout/cart/add/',
    wishlistEnabled: true,
    wishlistUrl: '/wishlist/index/add/',
    compareEnabled: true,
    compareUrl: '/catalog/product_compare/add/',
    formKey: 'KEY',
};

describe('renderProductCard', () => {
    let root;
    beforeEach(() => {
        document.body.innerHTML = '';
        root = document.createElement('div');
        document.body.appendChild(root);
    });

    test('every card form drops a second submit while its request is in flight', () => {
        render(renderProductCard(ITEM, OPTIONS), root);
        const forms = [...root.querySelectorAll('form')];
        expect(forms).toHaveLength(3);
        for (const form of forms) {
            expect(form.getAttribute('hx-sync')).toBe('this:drop');
            expect(form.hasAttribute('hx-disabled-elt')).toBe(false);
        }
    });

    test('the Add to Cart button holds its label and the busy text as sibling spans', () => {
        render(renderProductCard(ITEM, { ...OPTIONS, labels: { cart: 'Aggiungi', adding: 'Aggiunta...' } }), root);
        const button = root.querySelector('button[data-hyperion-atc]');
        expect(button.closest('form').getAttribute('action')).toBe('/checkout/cart/add/');
        const label = button.querySelector(':scope > [data-hyperion-atc-label]');
        const busy = button.querySelector(':scope > [data-hyperion-atc-busy]');
        expect(label.textContent).toBe('Aggiungi');
        expect(busy.textContent).toBe('Aggiunta...');
        expect(busy.getAttribute('aria-hidden')).toBe('true');
        expect(busy.hasAttribute('hidden')).toBe(false);
        expect(label.nextElementSibling).toBe(busy);
    });

    test('the busy text falls back to English without a translated label', () => {
        render(renderProductCard(ITEM, OPTIONS), root);
        expect(root.querySelector('[data-hyperion-atc-busy]').textContent).toBe('Adding to cart...');
    });

    test('a product with required options links to its page without the busy markup', () => {
        render(renderProductCard({ ...ITEM, buy_from_list: false }, OPTIONS), root);
        expect(root.querySelector('[data-hyperion-atc]')).toBeNull();
    });
});
