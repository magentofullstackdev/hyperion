// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-msrp-popup -- MAP "Click for price" dialog built from a server
// rendered <template>; its Add to Cart submits the product's own form.

import { describe, test, expect } from 'vitest';
import '../hyperion-msrp-popup.js';
import { mount } from './helpers.js';

function fixture({ info = false, noCart = false, withForm = true } = {}) {
    const article = document.createElement('article');
    const el = document.createElement('hyperion-msrp-popup');
    el.setAttribute('product-id', '12');
    el.setAttribute('product-name', 'Joust Duffle Bag');
    el.setAttribute('add-label', 'Add to Cart');
    el.setAttribute('close-label', 'Close');
    if (info) el.setAttribute('info', '');
    if (noCart) el.setAttribute('no-cart', '');
    el.innerHTML = `
        <button type="button" data-hyperion-msrp-open>Click for price</button>
        <template data-hyperion-msrp-dialog>
            <dd class="actual-price"><span class="price">$34.00</span></dd>
        </template>
    `;
    article.appendChild(el);
    if (withForm) {
        // Wishlist form first: same product input, must be skipped.
        const wishlist = document.createElement('form');
        wishlist.setAttribute('hx-post', 'https://shop.test/wishlist/index/add/');
        wishlist.innerHTML = '<input type="hidden" name="product" value="12">';
        const cart = document.createElement('form');
        cart.id = 'hyperion-atc-12';
        cart.setAttribute('hx-post', 'https://shop.test/checkout/cart/add/uenc/x/product/12/');
        cart.innerHTML = '<input type="hidden" name="product" value="12"><button type="submit">Add</button>';
        article.append(wishlist, cart);
    }
    document.body.appendChild(article);
    return { el, article };
}

describe('hyperion-msrp-popup', () => {
    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-msrp-popup')).toBeTypeOf('function');
    });

    test('keeps the actual price inside the inert template until opened', async () => {
        const { el } = fixture();
        await mount(el);
        expect(el.querySelector('dialog')).toBeNull();
        expect(el.textContent).not.toContain('$34.00');
    });

    test('opens a dialog with the product name, the template content and both buttons', async () => {
        const { el } = fixture();
        await mount(el);
        el.querySelector('[data-hyperion-msrp-open]').click();
        const dialog = el.querySelector('dialog');
        expect(dialog).not.toBeNull();
        expect(el.isOpen).toBe(true);
        expect(dialog.querySelector('h2').textContent).toBe('Joust Duffle Bag');
        expect(dialog.querySelector('.actual-price .price').textContent).toBe('$34.00');
        expect(dialog.querySelector('[data-hyperion-msrp-add]').textContent).toBe('Add to Cart');
        expect(dialog.querySelectorAll('[data-hyperion-msrp-close]').length).toBe(2);
    });

    test('Add to Cart submits the product cart form (not the wishlist form) and closes', async () => {
        const { el, article } = fixture();
        await mount(el);
        const submitted = [];
        for (const form of article.querySelectorAll('form')) {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                submitted.push(form.id || form.getAttribute('hx-post'));
            });
        }
        expect(el.findCartForm().id).toBe('hyperion-atc-12');
        el.open();
        el.querySelector('[data-hyperion-msrp-add]').click();
        expect(submitted).toEqual(['hyperion-atc-12']);
        expect(el.isOpen).toBe(false);
    });

    test('info dialogs and non-saleable products get no Add to Cart button', async () => {
        const info = fixture({ info: true });
        await mount(info.el);
        info.el.open();
        expect(info.el.querySelector('[data-hyperion-msrp-add]')).toBeNull();

        const noCart = fixture({ noCart: true });
        await mount(noCart.el);
        noCart.el.open();
        expect(noCart.el.querySelector('[data-hyperion-msrp-add]')).toBeNull();

        // Other tiles' forms must not be picked up: start from an empty page.
        document.body.innerHTML = '';
        const noForm = fixture({ withForm: false });
        await mount(noForm.el);
        noForm.el.open();
        expect(noForm.el.querySelector('[data-hyperion-msrp-add]')).toBeNull();
    });

    test('the Close button closes the dialog and reopening reuses it', async () => {
        const { el } = fixture();
        await mount(el);
        el.open();
        el.querySelector('[data-hyperion-msrp-close]').click();
        expect(el.isOpen).toBe(false);
        el.open();
        expect(el.isOpen).toBe(true);
        expect(el.querySelectorAll('dialog').length).toBe(1);
    });
});
