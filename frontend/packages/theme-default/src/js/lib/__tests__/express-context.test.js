// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// express-context -- what an express button may ask of the storefront.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExpressContext, DISPOSE, productFormProblem } from '../express-context.js';
import { installIntersectionObserver } from '../../components/__tests__/paypal-helpers.js';

const ENTRY = {
    id: 'vendor_express',
    phrases: { 'Pay now': 'Paga ora', 'Hello {name}': 'Ciao {name}' },
    redirectHosts: ['pay.vendor.example'],
};

function json(body, status = 200) {
    return new Response(body === null ? 'null' : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function slot(attributes = {}) {
    const el = document.createElement('div');
    for (const [name, value] of Object.entries({ placement: 'cart', ...attributes })) el.setAttribute(name, value);
    document.body.appendChild(el);
    return el;
}

function productForm({ superValue = '5', action = 'https://shop.test/checkout/cart/add/product/1/' } = {}) {
    const form = document.createElement('form');
    form.id = 'product_addtocart_form';
    form.setAttribute('action', action);
    form.innerHTML = `
        <input type="hidden" name="form_key" value="STALE">
        <input type="hidden" name="product" value="1">
        <input type="hidden" name="super_attribute[93]" value="${superValue}" data-hyperion-super="93">
        <input type="number" name="qty" value="2">
    `;
    document.body.appendChild(form);
    return form;
}

describe('express context', () => {
    beforeEach(() => {
        document.cookie = 'form_key=KEY123; path=/';
        document.body.innerHTML = '<div id="hyperion-notification" data-hyperion-notification hidden></div>';
    });

    afterEach(() => {
        delete window.htmx;
        vi.restoreAllMocks();
    });

    test('is frozen and states the API version and the placement', () => {
        const context = createExpressContext(slot({ placement: 'minicart' }), ENTRY);
        expect(Object.isFrozen(context)).toBe(true);
        expect(context.apiVersion).toBe('1.0-beta');
        expect(context.placement).toBe('minicart');
    });

    test('t() reads the entry phrases, then the source, with placeholders', () => {
        const context = createExpressContext(slot(), ENTRY);
        expect(context.t('Pay now')).toBe('Paga ora');
        expect(context.t('Hello {name}', { name: 'Ada' })).toBe('Ciao Ada');
        expect(context.t('Untranslated {n}', { n: 3 })).toBe('Untranslated 3');
    });

    test('getCart() GETs the cart summary under the store base URL, without a form key', async () => {
        const summary = { cartId: 'MASKED', isGuest: true, itemsCount: 1 };
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(summary));
        const context = createExpressContext(slot({ 'base-url': `${location.origin}/it/` }), ENTRY);

        await expect(context.getCart()).resolves.toEqual(summary);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(new URL(url).pathname).toBe('/it/hyperion/cart/summary');
        expect(init.method).toBe('GET');
        expect(new URL(url).searchParams.has('form_key')).toBe(false);
        expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
        expect(init.credentials).toBe('same-origin');
    });

    test('storefront() sends GET without a body and everything else as a JSON POST with the form key', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(json({ ok: true })));
        const context = createExpressContext(slot(), ENTRY);

        await context.storefront('vendor/express/state');
        await context.storefront('vendor/express/state', { method: 'GET', body: { ignored: true } });
        await context.storefront('vendor/express/token', { method: 'POST', body: { a: 1 } });
        await context.storefront('vendor/express/token', { method: 'POST' });
        for (const method of ['PUT', 'DELETE', 'PATCH']) {
            await context.storefront('vendor/express/token', { method, body: { a: 1 } });
        }
        const calls = fetchSpy.mock.calls.map(([url, init]) => ({
            method: init.method,
            formKey: new URL(url).searchParams.get('form_key'),
            body: init.body === undefined ? undefined : JSON.parse(init.body),
            type: init.headers['Content-Type'],
            ajax: init.headers['X-Requested-With'],
            origin: new URL(url).origin,
            credentials: init.credentials,
        }));
        const get = { method: 'GET', formKey: null, body: undefined, type: undefined };
        const post = { method: 'POST', formKey: 'KEY123', type: 'application/json' };
        const common = { ajax: 'XMLHttpRequest', origin: location.origin, credentials: 'same-origin' };
        expect(calls).toEqual([
            { ...get, ...common },
            { ...get, ...common },
            { ...post, body: { a: 1 }, ...common },
            { ...post, body: {}, ...common },
            { ...post, body: { a: 1 }, ...common },
            { ...post, body: { a: 1 }, ...common },
            { ...post, body: { a: 1 }, ...common },
        ]);
    });

    test('storefront() rejects a non-2xx answer with a CheckoutError whose message is the generic one', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'Internal: SQLSTATE[42S02]' }, 400));
        const error = await createExpressContext(slot({ 'error-message': 'Something went wrong.' }), ENTRY)
            .storefront('vendor/express/token', { method: 'POST' })
            .catch((err) => err);
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ name: 'CheckoutError', kind: 'validation', status: 400, message: 'Something went wrong.' });
    });

    test('storefront() stays on the page origin even with a foreign base URL', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}));
        await createExpressContext(slot({ 'base-url': 'https://evil.example/it/' }), ENTRY).storefront('vendor/x');
        expect(new URL(fetchSpy.mock.calls[0][0]).origin).toBe(location.origin);
    });

    test('getCart() answers null for an empty cart', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(null));
        await expect(createExpressContext(slot(), ENTRY).getCart()).resolves.toBeNull();
    });

    test('storefront() refuses absolute and climbing paths and classifies failures', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 429));
        const context = createExpressContext(slot(), ENTRY);

        await expect(context.storefront('https://evil.example/x')).rejects.toMatchObject({ kind: 'validation' });
        await expect(context.storefront('//evil.example/x')).rejects.toMatchObject({ kind: 'validation' });
        await expect(context.storefront('a/../../admin')).rejects.toMatchObject({ kind: 'validation' });
        expect(fetchSpy).not.toHaveBeenCalled();
        await expect(context.storefront('vendor/express/token')).rejects.toMatchObject({ kind: 'rate-limited', status: 429 });
    });

    test('storefront() rethrows an abort as it is', async () => {
        const abort = new DOMException('stopped', 'AbortError');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(abort);
        await expect(createExpressContext(slot(), ENTRY).storefront('vendor/x')).rejects.toBe(abort);
    });

    test('notify() shows plain text in the toast', () => {
        createExpressContext(slot(), ENTRY).notify('<b>Paid</b>', 'success');
        const toast = document.querySelector('#hyperion-notification');
        expect(toast.hidden).toBe(false);
        expect(toast.textContent).toBe('Paid');
        expect(toast.querySelector('b')).toBeNull();
        expect(toast.getAttribute('data-tone')).toBe('success');
    });

    test('redirect() follows the same origin and the entry hosts over https only', () => {
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
        const context = createExpressContext(slot(), ENTRY);

        context.redirect('/checkout/onepage/success/');
        context.redirect('https://pay.vendor.example/approve?id=1');
        expect(assign.mock.calls.map((call) => call[0])).toEqual([
            `${location.origin}/checkout/onepage/success/`,
            'https://pay.vendor.example/approve?id=1',
        ]);
        expect(() => context.redirect('http://pay.vendor.example/approve')).toThrow();
        expect(() => context.redirect('https://evil.example/')).toThrow();
        expect(assign).toHaveBeenCalledTimes(2);
    });

    describe('addCurrentProductToCart()', () => {
        test('posts the form with its options and the live form key', async () => {
            productForm();
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<p></p>', { status: 200 }));
            const changed = vi.fn();
            document.addEventListener('hyperion:cart-changed', changed, { once: true });
            const context = createExpressContext(slot({ placement: 'product', form: '#product_addtocart_form' }), ENTRY);

            await expect(context.addCurrentProductToCart()).resolves.toEqual({ ok: true });
            const [url, init] = fetchSpy.mock.calls[0];
            expect(url).toBe('https://shop.test/checkout/cart/add/product/1/');
            expect(init.headers['HX-Request']).toBe('true');
            // The mark that keeps the server from answering with the redirect to the cart.
            expect(init.headers['X-Hyperion-Express']).toBe('1');
            expect(init.body.get('super_attribute[93]')).toBe('5');
            expect(init.body.get('qty')).toBe('2');
            expect(init.body.get('form_key')).toBe('KEY123');
            expect(changed).toHaveBeenCalledTimes(1);
        });

        test('goes through htmx when it is on the page, with the express mark, and tells the page the cart changed', async () => {
            const form = productForm();
            window.htmx = {
                ajax: vi.fn((verb, url, request) => {
                    request.source.dispatchEvent(new CustomEvent('htmx:afterRequest', {
                        bubbles: true,
                        detail: { elt: request.source, xhr: { status: 200 } },
                    }));
                    return Promise.resolve();
                }),
            };
            const changed = vi.fn();
            document.addEventListener('hyperion:cart-changed', changed, { once: true });
            const context = createExpressContext(slot({ placement: 'product' }), ENTRY);

            await expect(context.addCurrentProductToCart()).resolves.toEqual({ ok: true });
            expect(window.htmx.ajax).toHaveBeenCalledWith('POST', 'https://shop.test/checkout/cart/add/product/1/', {
                source: form,
                headers: { 'X-Hyperion-Express': '1' },
            });
            expect(changed).toHaveBeenCalledTimes(1);
        });

        test('a refusal through htmx is not reported a second time and leaves the cart unchanged', async () => {
            productForm();
            window.htmx = {
                ajax: vi.fn((verb, url, request) => {
                    request.source.dispatchEvent(new CustomEvent('htmx:afterRequest', {
                        bubbles: true,
                        detail: { elt: request.source, xhr: { status: 422 } },
                    }));
                    return Promise.resolve();
                }),
            };
            const changed = vi.fn();
            document.addEventListener('hyperion:cart-changed', changed);
            const context = createExpressContext(slot({ placement: 'product' }), ENTRY);

            await expect(context.addCurrentProductToCart()).resolves.toEqual({ ok: false });
            document.removeEventListener('hyperion:cart-changed', changed);
            expect(window.htmx.ajax.mock.calls[0][2].headers).toEqual({ 'X-Hyperion-Express': '1' });
            expect(changed).not.toHaveBeenCalled();
        });

        test('an option not chosen posts nothing and says why', async () => {
            productForm({ superValue: '' });
            const fetchSpy = vi.spyOn(globalThis, 'fetch');
            const context = createExpressContext(
                slot({ placement: 'product', 'options-message': 'Scegli le opzioni' }),
                ENTRY
            );

            await expect(context.addCurrentProductToCart()).resolves.toEqual({ ok: false, message: 'Scegli le opzioni' });
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        test('a refusal shows the reason of the response and returns no second message', async () => {
            productForm();
            vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
                '<hyperion-notification data-hyperion-notification><p>Not enough stock</p></hyperion-notification>',
                { status: 422 }
            ));
            const context = createExpressContext(slot({ placement: 'product' }), ENTRY);

            await expect(context.addCurrentProductToCart()).resolves.toEqual({ ok: false });
            expect(document.querySelector('#hyperion-notification').textContent).toBe('Not enough stock');
        });

        test('is refused outside the product placement', async () => {
            const result = await createExpressContext(slot({ placement: 'cart' }), ENTRY).addCurrentProductToCart();
            expect(result.ok).toBe(false);
        });

        test('productFormProblem() tells a missing form from missing options', () => {
            expect(productFormProblem(null)).toBe('missing-form');
            expect(productFormProblem(productForm({ superValue: '' }))).toBe('options');
        });
    });

    describe('loading policy', () => {
        let observers;
        beforeEach(() => { observers = installIntersectionObserver(); });
        afterEach(() => { observers.restore(); });

        test('whenWanted() waits for the box to near the viewport', async () => {
            const box = document.createElement('div');
            const context = createExpressContext(slot(), ENTRY, box);
            let wanted = false;
            context.whenWanted().then(() => { wanted = true; });
            await Promise.resolve();
            expect(wanted).toBe(false);
            expect(observers.instances[0].targets).toEqual([box]);

            observers.instances[0].trigger(true);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(wanted).toBe(true);
        });

        test('a disposed context stops waiting and never resolves', async () => {
            const context = createExpressContext(slot(), ENTRY);
            let wanted = false;
            context.whenWanted().then(() => { wanted = true; });
            context[DISPOSE]();
            expect(observers.instances[0].disconnected).toBe(true);
            observers.instances[0].trigger(true);
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(wanted).toBe(false);
        });
    });
});
