// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-swatches -- configurable product swatches; `defaultValues` (the
// options of a wish list or cart item's buy request) preselect on first
// render; `stockNotices` fill the `stock-target` element for the matched
// variant.

import { describe, test, expect } from 'vitest';
import '../hyperion-swatches.js';
import { mount } from './helpers.js';

function config(extra = {}) {
    return {
        productId: '1',
        sku: 'HYP-TEE',
        currencyFormat: '$%s',
        attributes: {
            93: {
                id: '93', code: 'color', label: 'Color', position: '0',
                options: [
                    { id: '49', label: 'Black', products: ['11', '12'] },
                    { id: '50', label: 'Blue', products: ['13'] },
                ],
            },
            144: {
                id: '144', code: 'size', label: 'Size', position: '1',
                options: [
                    { id: '166', label: 'XS', products: ['11', '13'] },
                    { id: '167', label: 'S', products: ['12'] },
                ],
            },
        },
        optionPrices: {
            11: { finalPrice: { amount: 10 } },
            12: { finalPrice: { amount: 12 } },
            13: { finalPrice: { amount: 13 } },
        },
        images: {},
        index: {},
        swatches: {},
        ...extra,
    };
}

function fixture(cfg) {
    const form = document.createElement('form');
    form.id = 'product_addtocart_form';
    form.innerHTML = `
        <input type="hidden" name="super_attribute[93]" value="">
        <input type="hidden" name="super_attribute[144]" value="">
    `;
    document.body.appendChild(form);

    const price = document.createElement('span');
    price.id = 'hyperion-product-price';
    document.body.appendChild(price);

    const stock = document.createElement('p');
    stock.id = 'hyperion-variant-stock';
    stock.hidden = true;
    document.body.appendChild(stock);

    const el = document.createElement('hyperion-swatches');
    el.setAttribute('config', JSON.stringify(cfg));
    el.setAttribute('form-id', 'product_addtocart_form');
    el.setAttribute('price-target', '#hyperion-product-price');
    el.setAttribute('stock-target', '#hyperion-variant-stock');
    return { el, form, price, stock };
}

const checked = (el) => [...el.shadowRoot.querySelectorAll('[aria-checked="true"]')]
    .map((button) => button.dataset.optionId);

describe('hyperion-swatches', () => {
    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-swatches')).toBeTypeOf('function');
    });

    test('renders without a selection when the config has no defaultValues', async () => {
        const { el, form } = fixture(config());
        await mount(el);
        expect(checked(el)).toEqual([]);
        expect(form.querySelector('[name="super_attribute[93]"]').value).toBe('');
    });

    test('defaultValues pre-select the options and sync inputs, price and change event', async () => {
        const { el, form, price } = fixture(config({ defaultValues: { 93: '49', 144: '167' } }));
        let detail = null;
        el.addEventListener('hyperion-swatch-change', (event) => { detail = event.detail; });
        await mount(el);

        expect(checked(el)).toEqual(['49', '167']);
        expect(form.querySelector('[name="super_attribute[93]"]').value).toBe('49');
        expect(form.querySelector('[name="super_attribute[144]"]').value).toBe('167');
        expect(price.textContent).toContain('$12.00');
        expect(detail).not.toBeNull();
        expect(detail.productId).toBe(12);
        expect(detail.superAttributes).toEqual({ 93: '49', 144: '167' });
    });

    test('skips a default that the other defaults make unreachable', async () => {
        // Blue only exists in XS; size S is dropped, colour Blue stays.
        const { el, form } = fixture(config({ defaultValues: { 93: '50', 144: '167' } }));
        await mount(el);
        expect(checked(el)).toEqual(['50']);
        expect(form.querySelector('[name="super_attribute[144]"]').value).toBe('');
    });

    test('a click after the defaults still changes the selection', async () => {
        const { el, form } = fixture(config({ defaultValues: { 93: '49', 144: '167' } }));
        await mount(el);
        el.shadowRoot.querySelector('[data-option-id="166"]').click();
        await el.updateComplete;
        expect(checked(el)).toEqual(['49', '166']);
        expect(form.querySelector('[name="super_attribute[144]"]').value).toBe('166');
    });

    test('server-filled hidden inputs (cart item edit) agree with the defaults', async () => {
        const { el, form } = fixture(config({ defaultValues: { 93: '50', 144: '166' } }));
        form.querySelector('[name="super_attribute[93]"]').value = '50';
        form.querySelector('[name="super_attribute[144]"]').value = '166';
        await mount(el);
        expect(checked(el)).toEqual(['50', '166']);
        expect(form.querySelector('[name="super_attribute[93]"]').value).toBe('50');
        expect(form.querySelector('[name="super_attribute[144]"]').value).toBe('166');
    });
});

describe('hyperion-swatches stock notices', () => {
    const notices = { stockNotices: { 12: 'Only 3 left' } };

    test('the notice of the matched variant shows, another variant hides it again', async () => {
        const { el, stock } = fixture(config(notices));
        await mount(el);
        expect(stock.hidden).toBe(true);

        el.shadowRoot.querySelector('[data-option-id="49"]').click();
        await el.updateComplete;
        expect(stock.hidden).toBe(true); // Black alone matches two variants

        el.shadowRoot.querySelector('[data-option-id="167"]').click();
        await el.updateComplete;
        expect(stock.hidden).toBe(false);
        expect(stock.textContent).toBe('Only 3 left');

        el.shadowRoot.querySelector('[data-option-id="166"]').click();
        await el.updateComplete;
        expect(stock.hidden).toBe(true);
        expect(stock.textContent).toBe('');
    });

    test('defaults that resolve a low stock variant show the notice at mount', async () => {
        const { el, stock } = fixture(config({ ...notices, defaultValues: { 93: '49', 144: '167' } }));
        let detail = null;
        el.addEventListener('hyperion-swatch-change', (event) => { detail = event.detail; });
        await mount(el);
        expect(stock.hidden).toBe(false);
        expect(stock.textContent).toBe('Only 3 left');
        expect(detail.stockNotice).toBe('Only 3 left');
    });

    test('a variant without a notice and a config without notices leave the element hidden', async () => {
        const { el, stock } = fixture(config());
        await mount(el);
        el.shadowRoot.querySelector('[data-option-id="49"]').click();
        el.shadowRoot.querySelector('[data-option-id="167"]').click();
        await el.updateComplete;
        expect(stock.hidden).toBe(true);
        expect(stock.textContent).toBe('');
    });

    test('without a stock-target nothing in the page is touched', async () => {
        const { el, stock } = fixture(config(notices));
        el.removeAttribute('stock-target');
        stock.textContent = 'untouched';
        await mount(el);
        el.shadowRoot.querySelector('[data-option-id="49"]').click();
        el.shadowRoot.querySelector('[data-option-id="167"]').click();
        await el.updateComplete;
        expect(stock.textContent).toBe('untouched');
        expect(stock.hidden).toBe(true);
    });
});
