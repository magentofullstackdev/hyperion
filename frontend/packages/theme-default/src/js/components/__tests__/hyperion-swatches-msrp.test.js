// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
//
// MAP guard: a variant whose price is hidden (config.msrp[id]) never writes
// its real price into the page; the schema.org meta tags survive a normal
// price swap.
import { describe, test, expect, beforeEach } from 'vitest';
import '../hyperion-swatches.js';
import '../hyperion-msrp-popup.js';
import { mount } from './helpers.js';

const config = {
    productId: '1',
    currencyFormat: '$%s',
    attributes: { 93: { id: '93', code: 'color', label: 'Color', position: '0', options: [{ id: '49', label: 'Black', products: ['11'] }, { id: '50', label: 'Blue', products: ['12'] }] } },
    optionPrices: {
        11: { finalPrice: { amount: 10 }, msrpPrice: { amount: null } },
        12: { finalPrice: { amount: 12 }, msrpPrice: { amount: 20 } },
    },
    msrp: { 12: { gesture: true, message: '' } },
    images: {}, index: {}, swatches: {},
};

function fixture(priceHtml) {
    document.body.innerHTML = `
        <form id="product_addtocart_form"><input type="hidden" name="super_attribute[93]"></form>
        <div id="hyperion-product-price">${priceHtml}<meta itemprop="priceCurrency" content="USD"></div>`;
    const el = document.createElement('hyperion-swatches');
    el.setAttribute('config', JSON.stringify(config));
    el.setAttribute('form-id', 'product_addtocart_form');
    el.setAttribute('price-target', '#hyperion-product-price');
    return el;
}
const pick = (el, optionId) => el._selectOption('93', optionId);

describe('<hyperion-swatches> MAP guard', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('a normal variant writes its price and keeps the schema meta tags', async () => {
        const el = await mount(fixture('<span class="price">$9.00</span>'));
        pick(el, '49');
        await el.updateComplete;
        const target = document.getElementById('hyperion-product-price');
        expect(target.textContent).toContain('$10.00');
        expect(target.querySelector('meta[itemprop="priceCurrency"]')).not.toBeNull();
    });

    test('the Offer nested in the price container survives the swap with the variant price', async () => {
        const el = await mount(fixture(`
            <div class="price-box"><span class="normal-price">
                <span class="price-container" itemprop="offers" itemscope itemtype="http://schema.org/Offer">
                    <span class="price-wrapper"><span class="price">$9.00</span></span>
                    <meta itemprop="price" content="9">
                    <meta itemprop="priceCurrency" content="USD">
                    <meta itemprop="availability" content="https://schema.org/InStock">
                </span>
            </span></div>`));
        pick(el, '49');
        await el.updateComplete;
        const target = document.getElementById('hyperion-product-price');
        expect(target.textContent).toContain('$10.00');
        expect(target.textContent).not.toContain('$9.00');
        const offers = target.querySelectorAll('[itemprop="offers"][itemscope]');
        expect(offers.length).toBe(1);
        expect(offers[0].getAttribute('itemtype')).toBe('http://schema.org/Offer');
        expect(offers[0].querySelector('meta[itemprop="price"]').getAttribute('content')).toBe('10');
        expect(offers[0].querySelector('meta[itemprop="priceCurrency"]').getAttribute('content')).toBe('USD');
        expect(offers[0].querySelector('meta[itemprop="availability"]').getAttribute('content')).toBe('https://schema.org/InStock');
        // The fixture's direct child meta (the old contract) is kept as well, inside the scope.
        expect(target.querySelectorAll('meta[itemprop="priceCurrency"]').length).toBe(2);
    });

    test('a MAP variant updates the struck MSRP and the popup, never the visible price', async () => {
        const el = await mount(fixture(`
            <div data-hyperion-msrp="gesture">
                <span class="old-price map-old-price"><span class="price">$15.00</span></span>
                <hyperion-msrp-popup product-id="1" product-name="Tee">
                    <button type="button" data-hyperion-msrp-open>Click for price</button>
                    <template data-hyperion-msrp-dialog><dl><dd class="actual-price"><span class="price">$9.00</span></dd></dl></template>
                </hyperion-msrp-popup>
            </div>`));
        pick(el, '50');
        await el.updateComplete;
        const target = document.getElementById('hyperion-product-price');
        expect(target.textContent).not.toContain('$12.00');
        expect(target.querySelector('.map-old-price .price').textContent).toBe('$20.00');
        expect(target.querySelector('[data-hyperion-msrp-open]')).not.toBeNull();
        const template = target.querySelector('template[data-hyperion-msrp-dialog]').content;
        expect(template.querySelector('.actual-price').textContent).toContain('$12.00');
    });

    test('a MAP variant without a server MSRP block renders the struck MSRP and no real price', async () => {
        const el = await mount(fixture('<span class="price">$9.00</span>'));
        pick(el, '50');
        await el.updateComplete;
        const target = document.getElementById('hyperion-product-price');
        expect(target.textContent).toContain('$20.00');
        expect(target.textContent).not.toContain('$12.00');
        expect(target.querySelector('[data-hyperion-msrp="gesture"]')).not.toBeNull();
    });
});

describe('<hyperion-swatches> translated labels', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('the MAP message and the old price label come from config.labels, English otherwise', async () => {
        const translated = { ...config, labels: { regularPrice: 'Prezzo normale', clickForPrice: 'Clicca per il prezzo' } };
        const el = await mount(fixture('<span class="price">$9.00</span>'));
        el.setAttribute('config', JSON.stringify(translated));
        await el.updateComplete;
        pick(el, '50');
        await el.updateComplete;
        expect(document.getElementById('hyperion-product-price').textContent).toContain('Clicca per il prezzo');
        expect(el._label('regularPrice', 'Regular Price')).toBe('Prezzo normale');

        const plain = await mount(fixture('<span class="price">$9.00</span>'));
        pick(plain, '50');
        await plain.updateComplete;
        expect(document.getElementById('hyperion-product-price').textContent).toContain('Click for price');
        expect(plain._label('regularPrice', 'Regular Price')).toBe('Regular Price');
    });
});
