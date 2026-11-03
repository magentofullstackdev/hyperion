// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-mini-cart quantity stepper: the drawer lines
// post cart[<item>][qty] to checkout/cart/updatePost through htmx.ajax.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import '../hyperion-mini-cart.js';
import { mount } from './helpers.js';
import { resetScrollLock } from '../../lib/scroll-lock.js';

const UPDATE_URL = '/checkout/cart/updatePost/';

function fragment(qty) {
    return `
        <section>
            <ul role="list" data-hyperion-minicart-update-url="${UPDATE_URL}">
                <li data-hyperion-minicart-item data-item-id="7">
                    <div role="group">
                        <button type="button" data-hyperion-minicart-qty-step="-1" ${qty <= 1 ? 'disabled' : ''}>-</button>
                        <input type="number" data-hyperion-minicart-qty name="qty" value="${qty}" min="1">
                        <button type="button" data-hyperion-minicart-qty-step="1">+</button>
                    </div>
                    <button type="button" data-hyperion-minicart-remove data-remove-url="/checkout/cart/delete/id/7/">x</button>
                </li>
            </ul>
        </section>`;
}

async function openWith(qty) {
    document.cookie = 'form_key=KEY123';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(fragment(qty), { status: 200, headers: { 'Content-Type': 'text/html' } })
    );
    const el = document.createElement('hyperion-mini-cart');
    el.setAttribute('fragment-url', '/hyperion/minicart/fragment');
    // The header badge is a light child: its text change is what tells the
    // drawer the cart changed (badge observer).
    el.innerHTML = `<a slot="trigger" href="/checkout/cart/">Cart</a><span id="hyperion-mini-cart-count">${qty}</span>`;
    await mount(el);
    await el.openPanel();
    await el.updateComplete;
    return el;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('<hyperion-mini-cart> quantity stepper', () => {
    let ajax;
    beforeEach(() => {
        resetScrollLock();
        document.body.innerHTML = '';
        ajax = vi.fn(() => Promise.resolve());
        window.htmx = { ajax };
    });
    afterEach(() => {
        vi.restoreAllMocks();
        delete window.htmx;
    });

    test('plus posts the next quantity of the line with the form key, swap none off the cart page', async () => {
        const el = await openWith(2);
        const sr = el.shadowRoot;
        sr.querySelector('[data-hyperion-minicart-qty-step="1"]').click();
        expect(ajax).toHaveBeenCalledTimes(1);
        const [method, url, options] = ajax.mock.calls[0];
        expect(method).toBe('POST');
        expect(url).toBe(UPDATE_URL);
        expect(options.swap).toBe('none');
        expect(options.values).toEqual({ update_cart_action: 'update_qty', 'cart[7][qty]': 3, form_key: 'KEY123' });
        // The controls of the line are held while the request runs.
        expect(sr.querySelector('[data-hyperion-minicart-qty]').disabled).toBe(true);
        await tick();
        // The drawer refetches the fragment after the answer.
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    test('minus at quantity 1 is disabled and never posts; a typed quantity posts on change', async () => {
        const el = await openWith(1);
        const sr = el.shadowRoot;
        const minus = sr.querySelector('[data-hyperion-minicart-qty-step="-1"]');
        expect(minus.disabled).toBe(true);
        minus.click();
        expect(ajax).not.toHaveBeenCalled();

        const input = sr.querySelector('[data-hyperion-minicart-qty]');
        input.value = '4';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        expect(ajax).toHaveBeenCalledTimes(1);
        expect(ajax.mock.calls[0][2].values['cart[7][qty]']).toBe(4);
    });

    test('an empty or zero quantity is not posted, the input goes back to the server value', async () => {
        const el = await openWith(2);
        const input = el.shadowRoot.querySelector('[data-hyperion-minicart-qty]');
        for (const bad of ['', '0', '-3', 'abc']) {
            input.value = bad;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            expect(ajax).not.toHaveBeenCalled();
            expect(input.value).toBe('2');
        }
    });

    test('on the cart page the response swaps #hyperion-cart-items', async () => {
        const cart = document.createElement('div');
        cart.id = 'hyperion-cart-items';
        document.body.appendChild(cart);
        const el = await openWith(2);
        el.shadowRoot.querySelector('[data-hyperion-minicart-qty-step="1"]').click();
        expect(ajax.mock.calls[0][2].target).toBe('#hyperion-cart-items');
        expect(ajax.mock.calls[0][2].swap).toBe('outerHTML');
    });

    test('the badge swap during the request is folded into the ONE refetch of the step, the focus survives', async () => {
        const el = await openWith(2);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        // The plugin's answer swaps the header badge out of band before the
        // htmx.ajax promise settles: the observer must not start a fetch of
        // its own beside the one `_post` issues when the request settled.
        ajax.mockImplementation(() => {
            el.querySelector('#hyperion-mini-cart-count').textContent = '3';
            return new Promise((resolve) => setTimeout(resolve, 5));
        });
        el.shadowRoot.querySelector('[data-hyperion-minicart-qty-step="1"]').click();
        await new Promise((resolve) => setTimeout(resolve, 10));
        await el.updateComplete;
        await tick();
        await tick();

        // One fetch for the open, one refetch for the step: never a third.
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(el.count).toBe(3);
        const plus = el.shadowRoot.querySelector('[data-hyperion-minicart-qty-step="1"]');
        expect(el.shadowRoot.activeElement).toBe(plus);
    });

    test('refreshes asked for while a fetch is in flight run once after it, never beside it', async () => {
        const el = await openWith(2);
        el.refresh();
        el.refresh();
        el.refresh();
        await tick();
        await tick();
        await el.updateComplete;
        // Open (1) + the first refresh (2) + the single queued follow up (3).
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    test('the plus button of the line has the focus again after the drawer re-rendered', async () => {
        const el = await openWith(2);
        // The open moves the focus to the close button on the next frame.
        await new Promise((resolve) => requestAnimationFrame(resolve));
        el.shadowRoot.querySelector('[data-hyperion-minicart-qty-step="1"]').click();
        await tick();
        await el.updateComplete;
        await tick();
        const plus = el.shadowRoot.querySelector('[data-hyperion-minicart-qty-step="1"]');
        expect(el.shadowRoot.activeElement).toBe(plus);
    });
});
