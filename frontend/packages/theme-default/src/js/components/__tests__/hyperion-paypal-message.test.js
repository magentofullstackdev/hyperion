// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-paypal-message -- configured style attributes, amount that
// follows the price, SDK requested lazily.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { parsePrice } from '../hyperion-paypal-message.js';
import { resetPaypalSdk } from '../../lib/paypal-sdk.js';
import { mount } from './helpers.js';
import {
    installIntersectionObserver,
    interceptSdkScripts,
    sdkScripts,
    finishSdkLoad,
    settle,
} from './paypal-helpers.js';

const SDK_URL = 'https://www.paypal.com/sdk/js?client-id=test&components=messages%2Cbuttons';
const CART_STYLE = {
    'data-pp-style-layout': 'text',
    'data-pp-style-logo-type': 'primary',
    'data-pp-style-logo-position': 'left',
    'data-pp-style-text-color': 'black',
    'data-pp-style-text-size': '12',
    'data-pp-placement': 'cart',
};

function element(attributes = {}, message = CART_STYLE) {
    const el = document.createElement('hyperion-paypal-message');
    el.setAttribute('sdk-url', SDK_URL);
    el.setAttribute('sdk-attributes', JSON.stringify({ 'data-partner-attribution-id': 'Magento_2_Community' }));
    el.setAttribute('message', JSON.stringify(message));
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    return el;
}

const messageOf = (el) => el.querySelector('[data-pp-message]');

describe('parsePrice', () => {
    test.each([
        ['$48.11', 48.11],
        ['$1,234.50', 1234.5],
        ['1.234,50 €', 1234.5],
        ['1 234,5 zł', 1234.5],
        ['¥1,234', 1234],
        ['CHF 1\'234.00', 1234],
        ['As low as €9', 9],
        ['', NaN],
        ['Free', NaN],
    ])('%s', (text, expected) => {
        expect(parsePrice(text)).toBe(expected);
    });
});

describe('hyperion-paypal-message', () => {
    let observers;
    let scripts;

    beforeEach(() => {
        resetPaypalSdk();
        observers = installIntersectionObserver();
        scripts = interceptSdkScripts();
    });

    afterEach(() => {
        observers.restore();
        scripts.restore();
        resetPaypalSdk();
        delete window.paypal;
        vi.restoreAllMocks();
    });

    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-paypal-message')).toBeTypeOf('function');
    });

    test('prints the configured data-pp attributes and nothing else', async () => {
        const el = await mount(element({}, { ...CART_STYLE, 'data-pp-style-color': null, onclick: 'x' }));
        const message = messageOf(el);
        expect(message.getAttribute('data-pp-style-layout')).toBe('text');
        expect(message.getAttribute('data-pp-style-logo-type')).toBe('primary');
        expect(message.getAttribute('data-pp-style-logo-position')).toBe('left');
        expect(message.getAttribute('data-pp-style-text-color')).toBe('black');
        expect(message.getAttribute('data-pp-style-text-size')).toBe('12');
        expect(message.getAttribute('data-pp-placement')).toBe('cart');
        expect(message.hasAttribute('data-pp-style-color')).toBe(false);
        expect(message.hasAttribute('onclick')).toBe(false);
        expect(message.hasAttribute('data-pp-amount')).toBe(false);
    });

    test('requests the SDK only once the message is near the viewport, then renders', async () => {
        const el = await mount(element({ amount: '48.11' }));
        await settle();
        expect(sdkScripts()).toHaveLength(0);

        observers.triggerAll(true);
        await settle();
        expect(sdkScripts()).toHaveLength(1);

        const paypal = finishSdkLoad();
        await settle();
        expect(paypal.messageRenders).toEqual([messageOf(el)]);
        expect(messageOf(el).getAttribute('data-pp-amount')).toBe('48.11');
    });

    test('renders nothing without an SDK URL', async () => {
        const el = document.createElement('hyperion-paypal-message');
        await mount(el);
        expect(messageOf(el)).toBeNull();
        expect(observers.instances).toHaveLength(0);
    });

    describe('product amount', () => {
        function page() {
            document.body.innerHTML = `
                <div id="hyperion-product-price"><span data-price-type="finalPrice"><span class="price">$45.00</span></span></div>
                <form id="product_addtocart_form"><input type="number" name="qty" value="1"></form>
            `;
        }

        test('follows the swatch price and the quantity', async () => {
            page();
            const el = await mount(element({ amount: '45.00', 'amount-source': 'product' }));
            expect(messageOf(el).getAttribute('data-pp-amount')).toBe('45.00');

            document.dispatchEvent(new CustomEvent('hyperion-swatch-change', { detail: { price: 52 } }));
            expect(messageOf(el).getAttribute('data-pp-amount')).toBe('52.00');

            const qty = document.querySelector('[name="qty"]');
            qty.value = '3';
            qty.dispatchEvent(new Event('change', { bubbles: true }));
            expect(messageOf(el).getAttribute('data-pp-amount')).toBe('156.00');
        });

        test('follows the price the options components display', async () => {
            page();
            const el = await mount(element({ amount: '45.00', 'amount-source': 'product' }));
            document.querySelector('#hyperion-product-price .price').textContent = '$57.50';
            await settle();
            expect(messageOf(el).getAttribute('data-pp-amount')).toBe('57.50');
        });

        test('stops listening when removed', async () => {
            page();
            const el = await mount(element({ amount: '45.00', 'amount-source': 'product' }));
            const message = messageOf(el);
            el.remove();
            document.dispatchEvent(new CustomEvent('hyperion-swatch-change', { detail: { price: 52 } }));
            expect(message.getAttribute('data-pp-amount')).toBe('45.00');
        });
    });

    describe('cart amount', () => {
        test('follows the cart total after an HTMX swap and hides with an empty cart', async () => {
            document.body.innerHTML = '<div id="totals" data-hyperion-paypal-amount="48.11"></div>';
            const el = await mount(element({ amount: '48.11', 'amount-source': 'cart' }));

            document.querySelector('#totals').setAttribute('data-hyperion-paypal-amount', '96.22');
            document.body.dispatchEvent(new CustomEvent('htmx:afterSettle', { bubbles: true }));
            expect(messageOf(el).getAttribute('data-pp-amount')).toBe('96.22');
            expect(el.hidden).toBe(false);

            document.querySelector('#totals').remove();
            document.body.dispatchEvent(new CustomEvent('htmx:afterSettle', { bubbles: true }));
            expect(el.hidden).toBe(true);
        });

        test('without an amount (billing agreements) none is ever sent', async () => {
            document.body.innerHTML = '<div data-hyperion-paypal-amount="48.11"></div>';
            const el = await mount(element({ 'amount-source': 'cart' }));
            document.body.dispatchEvent(new CustomEvent('htmx:afterSettle', { bubbles: true }));
            expect(messageOf(el).hasAttribute('data-pp-amount')).toBe(false);
            expect(el.hidden).toBe(false);
        });
    });
});
