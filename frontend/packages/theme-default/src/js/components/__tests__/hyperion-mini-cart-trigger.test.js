// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The light DOM trigger of <hyperion-mini-cart> is a link to the cart page,
// the no-JS fallback (header.phtml). Once the element upgrades the link sits
// inside the shadow `<button part="trigger">`, so it must stop being a second
// interactive control (axe `nested-interactive`): href and aria-label are
// parked in data attributes, the link is presentational and out of the tab
// order, and everything comes back when the element leaves the document.

import { describe, test, expect, afterEach, vi } from 'vitest';
import '../hyperion-mini-cart.js';
import { mount, spyFetch } from './helpers.js';

const TRIGGER = '<a slot="trigger" id="cart-link" href="/checkout/cart/" aria-label="Shopping cart"'
    + ' class="inline-flex items-center gap-1 p-2 rounded-md relative bg-primary/10 text-primary">'
    + '<svg class="w-5 h-5" aria-hidden="true"></svg><span class="sr-only">Cart</span>'
    + '<span id="hyperion-mini-cart-count" class="hidden"></span></a>';

function create() {
    const el = document.createElement('hyperion-mini-cart');
    el.setAttribute('trigger-label', 'Shopping cart');
    el.setAttribute('trigger-url', '/checkout/cart/');
    el.innerHTML = TRIGGER;
    return el;
}

describe('<hyperion-mini-cart> slotted trigger link', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('neutralizes the link at upgrade and keeps its classes and children', async () => {
        spyFetch();
        const el = await mount(create());
        const link = el.querySelector('#cart-link');
        expect(link).not.toBeNull();
        expect(link.hasAttribute('href')).toBe(false);
        expect(link.getAttribute('data-hyperion-href')).toBe('/checkout/cart/');
        expect(link.hasAttribute('aria-label')).toBe(false);
        expect(link.getAttribute('data-hyperion-aria-label')).toBe('Shopping cart');
        expect(link.getAttribute('role')).toBe('presentation');
        expect(link.getAttribute('tabindex')).toBe('-1');
        // Footprint: same classes, icon and badge as the server rendered link.
        expect(link.getAttribute('class')).toBe('inline-flex items-center gap-1 p-2 rounded-md relative bg-primary/10 text-primary');
        expect(link.querySelector('svg')).not.toBeNull();
        expect(link.querySelector('#hyperion-mini-cart-count')).not.toBeNull();
        expect(link.getAttribute('slot')).toBe('trigger');
        // The shadow button stays the one control, named by trigger-label.
        const button = el.shadowRoot.querySelector('[part="trigger"]');
        expect(button.getAttribute('aria-label')).toBe('Shopping cart');
        expect(button.getAttribute('aria-haspopup')).toBe('dialog');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.getAttribute('aria-controls')).toBe('hyperion-mini-cart-panel');
    });

    test('restores the link when the element leaves the document and neutralizes it again on reconnect', async () => {
        spyFetch();
        const el = await mount(create());
        const link = el.querySelector('#cart-link');
        el.remove();
        expect(link.getAttribute('href')).toBe('/checkout/cart/');
        expect(link.getAttribute('aria-label')).toBe('Shopping cart');
        expect(link.hasAttribute('data-hyperion-href')).toBe(false);
        expect(link.hasAttribute('data-hyperion-aria-label')).toBe(false);
        expect(link.hasAttribute('role')).toBe(false);
        expect(link.hasAttribute('tabindex')).toBe(false);

        await mount(el);
        expect(link.hasAttribute('href')).toBe(false);
        expect(link.getAttribute('data-hyperion-href')).toBe('/checkout/cart/');
        expect(link.getAttribute('tabindex')).toBe('-1');
        el.remove();
    });

    test('a link slotted after the upgrade is neutralized too (slotchange)', async () => {
        spyFetch();
        const el = await mount(create());
        el.querySelector('#cart-link').remove();
        el.insertAdjacentHTML('afterbegin', '<a slot="trigger" id="late-link" href="/checkout/cart/">Cart</a>');
        await el.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        const link = el.querySelector('#late-link');
        expect(link.hasAttribute('href')).toBe(false);
        expect(link.getAttribute('data-hyperion-href')).toBe('/checkout/cart/');
        expect(link.getAttribute('role')).toBe('presentation');
        expect(link.getAttribute('tabindex')).toBe('-1');
        el.remove();
    });

    test('leaves a non-link trigger and an element without a trigger alone', async () => {
        spyFetch();
        const el = document.createElement('hyperion-mini-cart');
        el.innerHTML = '<button slot="trigger" id="btn" type="button">Cart</button>';
        await mount(el);
        const button = el.querySelector('#btn');
        expect(button.hasAttribute('role')).toBe(false);
        expect(button.hasAttribute('tabindex')).toBe(false);
        el.remove();
        const bare = document.createElement('hyperion-mini-cart');
        await mount(bare);
        bare.remove();
    });
});

// The count badge is visible text inside the shadow trigger button, so the
// button's name has to carry it: the name follows the badge, whichever way
// the badge changes (text filled in, element replaced, cart emptied).
describe('<hyperion-mini-cart> trigger name', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    const BADGE = '#hyperion-mini-cart-count';
    const settle = async (el) => {
        // The badge observer runs as a microtask, then Lit renders.
        await new Promise((r) => setTimeout(r, 0));
        await el.updateComplete;
    };
    const nameOf = (el) => el.shadowRoot.querySelector('[part="trigger"]').getAttribute('aria-label');
    const createCounted = (phrase = 'Shopping cart, items: %1') => {
        const el = create();
        if (phrase !== null) el.setAttribute('trigger-count-label', phrase);
        return el;
    };

    test('an empty cart keeps the plain label', async () => {
        spyFetch();
        const el = await mount(createCounted());
        expect(nameOf(el)).toBe('Shopping cart');
        el.remove();
    });

    test('a badge filled before the upgrade is in the name from the first render', async () => {
        spyFetch();
        const el = createCounted();
        el.querySelector(BADGE).textContent = '2';
        await mount(el);
        await settle(el);
        expect(nameOf(el)).toBe('Shopping cart, items: 2');
        expect(nameOf(el)).toContain(el.querySelector(BADGE).textContent);
        el.remove();
    });

    test('the name follows a count that arrives after the upgrade', async () => {
        spyFetch();
        const el = await mount(createCounted());
        el.querySelector(BADGE).textContent = '3';
        await settle(el);
        expect(nameOf(el)).toBe('Shopping cart, items: 3');
        el.remove();
    });

    test('the name follows a badge replaced as a whole element, and an emptied cart', async () => {
        spyFetch();
        const el = await mount(createCounted());
        el.querySelector(BADGE).outerHTML = '<span id="hyperion-mini-cart-count">12</span>';
        await settle(el);
        expect(nameOf(el)).toBe('Shopping cart, items: 12');
        el.querySelector(BADGE).outerHTML = '<span id="hyperion-mini-cart-count" class="hidden"></span>';
        await settle(el);
        expect(nameOf(el)).toBe('Shopping cart');
        el.remove();
    });

    test('a decimal quantity is named as the badge prints it', async () => {
        spyFetch();
        const el = await mount(createCounted());
        el.querySelector(BADGE).textContent = '2';
        await settle(el);
        el.querySelector(BADGE).textContent = '2.5';
        await settle(el);
        expect(nameOf(el)).toBe('Shopping cart, items: 2.5');
        el.remove();
    });

    test('the dialog keeps the plain label whatever the count', async () => {
        spyFetch();
        const el = await mount(createCounted());
        el.querySelector(BADGE).textContent = '4';
        await settle(el);
        expect(el.shadowRoot.querySelector('[part="panel"]').getAttribute('aria-label')).toBe('Shopping cart');
        el.remove();
    });

    test('a phrase without a placeholder, or no phrase at all, still names the count', async () => {
        spyFetch();
        const plain = await mount(createCounted('Items in the shopping cart:'));
        plain.querySelector(BADGE).textContent = '5';
        await settle(plain);
        expect(nameOf(plain)).toBe('Items in the shopping cart: 5');
        plain.remove();

        const none = await mount(createCounted(null));
        none.querySelector(BADGE).textContent = '6';
        await settle(none);
        expect(nameOf(none)).toBe('Shopping cart 6');
        none.remove();
    });

    test('the parked link label comes back unchanged when the element leaves the document', async () => {
        spyFetch();
        const el = await mount(createCounted());
        el.querySelector(BADGE).textContent = '7';
        await settle(el);
        const link = el.querySelector('#cart-link');
        el.remove();
        expect(link.getAttribute('aria-label')).toBe('Shopping cart');
        expect(link.getAttribute('href')).toBe('/checkout/cart/');
    });
});
