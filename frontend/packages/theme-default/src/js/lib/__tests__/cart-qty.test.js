// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { installCartQty, qtyRulesOf } from '../cart-qty.js';

const line = ({ id, qty = 2, min = 1, max = '', step = 1 }) => `
<li data-hyperion-cart-item data-item-id="${id}">
  <div role="group" data-hyperion-qty-control>
    <button type="button" data-hyperion-qty-step="-1" ${qty <= min ? 'disabled' : ''}>-</button>
    <input type="number" data-hyperion-qty name="cart[${id}][qty]" value="${qty}" min="${min}" ${max === '' ? '' : `max="${max}"`} step="${step}">
    <button type="button" data-hyperion-qty-step="1">+</button>
  </div>
  <a href="#" data-hyperion-cart-edit>Edit</a>
</li>`;

const cart = (lines) => `
<section id="hyperion-cart-items" data-hyperion-cart-root>
  <form id="hyperion-cart-form"><ul id="hyperion-cart-lines">${lines.map(line).join('')}</ul></form>
</section>
<a id="elsewhere" href="#">x</a>`;

const item = (id) => document.querySelector(`[data-item-id="${id}"]`);
const input = (id) => item(id).querySelector('[data-hyperion-qty]');
const minus = (id) => item(id).querySelector('[data-hyperion-qty-step="-1"]');
const plus = (id) => item(id).querySelector('[data-hyperion-qty-step="1"]');
const form = () => document.querySelector('#hyperion-cart-form');
const htmx = (type, elt) => (elt ?? document.body).dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { elt } }));
// What the answer of the cart update does: the whole section is replaced.
const swap = (lines) => {
    htmx('htmx:beforeSwap', document.querySelector('#hyperion-cart-items'));
    document.querySelector('#hyperion-cart-items').outerHTML = cart(lines).split('<a id="elsewhere"')[0];
    htmx('htmx:afterSwap', document.querySelector('#hyperion-cart-items'));
};

describe('cart-qty', () => {
    let uninstall;
    let changes;
    const onChange = (event) => { changes.push(event.target.value); };

    beforeEach(() => {
        document.body.innerHTML = cart([{ id: 7 }, { id: 9, qty: 1 }]);
        changes = [];
        document.addEventListener('change', onChange);
        uninstall = installCartQty(document);
    });
    afterEach(() => {
        uninstall();
        document.removeEventListener('change', onChange);
        document.body.innerHTML = '';
    });

    test('a stepper button moves the field by its step and fires the change the form listens to', () => {
        plus(7).click();
        expect(input(7).value).toBe('3');
        minus(7).click();
        minus(7).click();
        expect(input(7).value).toBe('1');
        expect(changes).toEqual(['3', '2', '1']);
        expect(item(7).hasAttribute('data-hyperion-qty-editing')).toBe(true);
        expect(item(9).hasAttribute('data-hyperion-qty-editing')).toBe(false);
    });

    test('the buttons stop at the minimum and the maximum of the line', () => {
        document.body.innerHTML = cart([{ id: 7, qty: 2, min: 2, max: 3 }]);
        minus(7).disabled = false;
        minus(7).click();
        expect(input(7).value).toBe('2');
        expect(changes).toEqual([]);
        plus(7).click();
        expect(input(7).value).toBe('3');
        expect(plus(7).disabled).toBe(true);
        expect(minus(7).disabled).toBe(false);
        plus(7).click();
        expect(input(7).value).toBe('3');
        expect(changes).toEqual(['3']);
    });

    test('quantity increments and decimal quantities follow the step of the field', () => {
        document.body.innerHTML = cart([{ id: 7, qty: 5, min: 5, step: 5 }, { id: 9, qty: 0.2, min: 0.1, step: 0.1 }]);
        plus(7).click();
        expect(input(7).value).toBe('10');
        plus(9).click();
        expect(input(9).value).toBe('0.3');
        expect(qtyRulesOf(input(9)).step).toBe(0.1);
    });

    test('a decimal quantity without increments moves by one and stays above zero', () => {
        document.body.innerHTML = cart([{ id: 7, qty: 1.5, min: '', step: 'any' }]);
        minus(7).click();
        expect(input(7).value).toBe('0.5');
        minus(7).click();
        expect(input(7).value).toBe('0.5');
        expect(minus(7).disabled).toBe(true);
    });

    test('a typed change repaints the buttons of its line', () => {
        input(7).value = '1';
        input(7).dispatchEvent(new Event('change', { bubbles: true }));
        expect(minus(7).disabled).toBe(true);
        expect(item(7).hasAttribute('data-hyperion-qty-editing')).toBe(true);
    });

    test('while the cart form posts, the stepper buttons of the edited line only are disabled', () => {
        plus(7).click();
        htmx('htmx:beforeRequest', form());
        expect(plus(7).disabled).toBe(true);
        expect(minus(7).disabled).toBe(true);
        expect(input(7).disabled).toBe(false);
        expect(plus(9).disabled).toBe(false);
    });

    test('a request of another element disables nothing', () => {
        plus(7).click();
        htmx('htmx:beforeRequest', document.getElementById('elsewhere'));
        expect(plus(7).disabled).toBe(false);
    });

    test('a request that ends without a swap gives the buttons back by the rules', () => {
        minus(7).click();
        htmx('htmx:beforeRequest', form());
        htmx('htmx:afterRequest', form());
        expect(plus(7).disabled).toBe(false);
        expect(minus(7).disabled).toBe(true);
    });

    test('after the swap the focus returns to the stepper button the shopper used', () => {
        plus(7).focus();
        plus(7).click();
        htmx('htmx:beforeRequest', form());
        // A disabled button drops the focus.
        document.activeElement.blur();
        const old = plus(7);
        swap([{ id: 7, qty: 3 }, { id: 9, qty: 1 }]);
        expect(document.activeElement).toBe(plus(7));
        expect(document.activeElement).not.toBe(old);
    });

    test('a button the new state disables hands the focus to the field of the line', () => {
        minus(7).focus();
        minus(7).click();
        htmx('htmx:beforeRequest', form());
        document.activeElement.blur();
        swap([{ id: 7, qty: 1 }, { id: 9, qty: 1 }]);
        expect(document.activeElement).toBe(input(7));
    });

    test('a typed quantity keeps the focus on the field of the same line', () => {
        input(9).focus();
        input(9).value = '4';
        input(9).dispatchEvent(new Event('change', { bubbles: true }));
        swap([{ id: 7 }, { id: 9, qty: 4 }]);
        expect(document.activeElement).toBe(input(9));
    });

    test('a focus moved to another control of the cart comes back to the field of the edited line', () => {
        input(7).value = '4';
        input(7).dispatchEvent(new Event('change', { bubbles: true }));
        item(9).querySelector('[data-hyperion-cart-edit]').focus();
        swap([{ id: 7, qty: 4 }, { id: 9, qty: 1 }]);
        expect(document.activeElement).toBe(input(7));
    });

    test('a focus moved outside the cart is left alone', () => {
        plus(7).click();
        document.getElementById('elsewhere').focus();
        swap([{ id: 7, qty: 3 }, { id: 9, qty: 1 }]);
        expect(document.activeElement).toBe(document.getElementById('elsewhere'));
    });

    test('a swap without an edit, or a line that is gone, moves no focus', () => {
        swap([{ id: 7 }, { id: 9, qty: 1 }]);
        expect(document.activeElement).toBe(document.body);
        plus(7).click();
        swap([{ id: 9, qty: 1 }]);
        expect(document.activeElement).toBe(document.body);
    });

    test('a swap elsewhere on the page waits for the cart to be replaced', () => {
        plus(7).click();
        htmx('htmx:afterSwap', document.getElementById('elsewhere'));
        expect(document.activeElement).toBe(document.body);
        swap([{ id: 7, qty: 3 }, { id: 9, qty: 1 }]);
        expect(document.activeElement).toBe(plus(7));
    });

    test('uninstall removes the listeners', () => {
        uninstall();
        plus(7).click();
        expect(input(7).value).toBe('2');
    });
});
