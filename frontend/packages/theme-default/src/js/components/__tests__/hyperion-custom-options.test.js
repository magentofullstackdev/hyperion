// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-custom-options -- adds the prices of the chosen options to the
// base price and mirrors the total into the PDP price element.

import { describe, test, expect } from 'vitest';
import '../hyperion-custom-options.js';
import { mount } from './helpers.js';

function fixture() {
    const price = document.createElement('div');
    price.id = 'price';
    price.innerHTML = '<span data-price-type="finalPrice"><span class="price">25.00</span></span>';
    document.body.appendChild(price);

    const el = document.createElement('hyperion-custom-options');
    el.setAttribute('data-base-price', '25');
    el.setAttribute('data-currency', 'EUR');
    el.setAttribute('data-locale', 'en-US');
    el.setAttribute('data-price-target', '#price');
    el.innerHTML = `
        <input type="text" name="options[1]" data-price="5">
        <select name="options[2]">
            <option value="">none</option>
            <option value="7" data-price="2.5">gold</option>
        </select>
        <input type="checkbox" name="options[3][]" value="9" data-price="4">
    `;
    return { el, amount: () => price.querySelector('.price').textContent };
}

describe('hyperion-custom-options', () => {
    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-custom-options')).toBeTypeOf('function');
    });

    test('leaves the server-rendered price alone until an option is chosen', async () => {
        const { el, amount } = fixture();
        await mount(el);
        expect(amount()).toBe('25.00');
    });

    test('adds text, select and checkbox option prices to the base price', async () => {
        const { el, amount } = fixture();
        await mount(el);

        const text = el.querySelector('input[type="text"]');
        text.value = 'HYPERION';
        text.dispatchEvent(new Event('input', { bubbles: true }));
        expect(amount()).toBe('€30.00');

        el.querySelector('select').value = '7';
        el.querySelector('select').dispatchEvent(new Event('change', { bubbles: true }));
        expect(amount()).toBe('€32.50');

        const box = el.querySelector('input[type="checkbox"]');
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        expect(amount()).toBe('€36.50');

        text.value = '   ';
        text.dispatchEvent(new Event('input', { bubbles: true }));
        expect(amount()).toBe('€31.50');
    });

    test('takes the variant price announced by the swatches as the new base', async () => {
        const { el, amount } = fixture();
        await mount(el);
        const box = el.querySelector('input[type="checkbox"]');
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));

        document.dispatchEvent(new CustomEvent('hyperion-swatch-change', { detail: { price: 40 } }));
        expect(amount()).toBe('€44.00');
    });
});
