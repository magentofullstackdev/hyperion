// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-paypal-buttons -- an express element: lazy SDK, core request
// shapes, visible failures.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import '../hyperion-paypal-buttons.js';
import { resetPaypalSdk } from '../../lib/paypal-sdk.js';
import { createExpressContext } from '../../lib/express-context.js';
import {
    installIntersectionObserver,
    interceptSdkScripts,
    sdkScripts,
    fakePaypal,
    finishSdkLoad,
    settle,
} from './paypal-helpers.js';

const CONFIG = {
    context: 'cart',
    sdkUrl: 'https://www.paypal.com/sdk/js?client-id=test&components=messages%2Cbuttons',
    dataAttributes: { 'data-partner-attribution-id': 'Magento_2_Community' },
    styles: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
    button: 1,
    quoteId: 'masked-quote',
    customerId: '',
    getTokenUrl: 'https://shop.test/paypal/express/getTokenData/',
    onAuthorizeUrl: 'https://shop.test/paypal/express/onAuthorization/',
    onCancelUrl: 'https://shop.test/paypal/express/cancel/',
    declined: false,
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SIGN_IN = 'To check out, please sign in with your email address.';
const OPTIONS = 'You need to choose options for your item.';
const ERROR = 'Something went wrong with your request. Please try again later.';

/**
 * The element as <hyperion-express-slot> creates it: inside its box, with
 * the context, the options and the placement set before it is connected.
 */
function element(placement = 'cart', config = {}, phrases = {}) {
    const slot = document.createElement('div');
    slot.setAttribute('data-test-slot', '');
    slot.setAttribute('placement', placement);
    if (placement === 'product') slot.setAttribute('form', '#product_addtocart_form');
    const box = document.createElement('div');
    slot.appendChild(box);
    const el = document.createElement('hyperion-paypal-buttons');
    el.context = createExpressContext(slot, { id: 'paypal_express', phrases }, box);
    el.options = config === null ? null : Object.freeze({ ...CONFIG, context: placement, ...config });
    el.placement = placement;
    el.box = box;
    el.slotElement = slot;
    return el;
}

/** Connect the element the way the express slot does. */
async function mount(el) {
    document.body.appendChild(el.slotElement);
    el.box.appendChild(el);
    await el.updateComplete;
    return el;
}

function toast() {
    return document.querySelector('#hyperion-notification');
}

describe('hyperion-paypal-buttons', () => {
    let observers;
    let scripts;

    beforeEach(() => {
        resetPaypalSdk();
        observers = installIntersectionObserver();
        scripts = interceptSdkScripts();
        document.cookie = 'form_key=KEY123; path=/';
        document.body.innerHTML = '<div id="hyperion-notification" data-hyperion-notification hidden></div>';
    });

    afterEach(() => {
        observers.restore();
        scripts.restore();
        resetPaypalSdk();
        delete window.paypal;
        delete window.htmx;
        vi.restoreAllMocks();
    });

    async function render(el, paypal = fakePaypal()) {
        await mount(el);
        observers.triggerAll(true);
        await settle();
        finishSdkLoad(paypal);
        await settle();
        return paypal;
    }

    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-paypal-buttons')).toBeTypeOf('function');
    });

    test('does not request the SDK while the placement is away from the viewport', async () => {
        await mount(element());
        observers.triggerAll(false);
        await settle();
        expect(sdkScripts()).toHaveLength(0);
    });

    test('requests the SDK once for several placements and renders the configured style', async () => {
        const first = element('cart');
        const second = element('minicart', { styles: { layout: 'horizontal', shape: 'pill' } });
        await mount(first);
        await mount(second);
        observers.triggerAll(true);
        await settle();
        expect(sdkScripts()).toHaveLength(1);
        expect(sdkScripts()[0].getAttribute('data-partner-attribution-id')).toBe('Magento_2_Community');

        const paypal = finishSdkLoad();
        await settle();
        expect(paypal.Buttons).toHaveBeenCalledTimes(2);
        expect(paypal.buttonOptions.map((options) => options.style)).toEqual([
            CONFIG.styles,
            { layout: 'horizontal', shape: 'pill' },
        ]);
        expect(paypal.buttonRenders[0]).toBe(first.querySelector('[data-hyperion-paypal-container]'));
    });

    test('declares the extension API major it was written for', () => {
        expect(customElements.get('hyperion-paypal-buttons').hyperionApi).toBe('1');
    });

    test('says it is unavailable without a configuration or when PayPal is not eligible', async () => {
        const unavailable = vi.fn();
        document.addEventListener('hyperion-express:unavailable', unavailable);
        await mount(element('cart', null));
        expect(observers.instances).toHaveLength(0);
        expect(unavailable).toHaveBeenCalledTimes(1);

        const paypal = await render(element(), fakePaypal({ eligible: false }));
        expect(paypal.buttonRenders).toHaveLength(0);
        expect(unavailable).toHaveBeenCalledTimes(2);
        document.removeEventListener('hyperion-express:unavailable', unavailable);
    });

    test('says it is ready once the buttons are rendered', async () => {
        const ready = vi.fn();
        document.addEventListener('hyperion-express:ready', ready);
        const el = element();
        await render(el);
        expect(ready).toHaveBeenCalledTimes(1);
        expect(ready.mock.calls[0][0].target).toBe(el);
        document.removeEventListener('hyperion-express:ready', ready);
    });

    test('a failed SDK makes it unavailable', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const unavailable = vi.fn();
        document.addEventListener('hyperion-express:unavailable', unavailable);
        await mount(element());
        observers.triggerAll(true);
        await settle();
        sdkScripts()[0].onerror();
        await settle();
        expect(unavailable).toHaveBeenCalledTimes(1);
        document.removeEventListener('hyperion-express:unavailable', unavailable);
    });

    test('requests nothing once removed, and closes rendered buttons', async () => {
        const waiting = element();
        await mount(waiting);
        waiting.remove();
        observers.triggerAll(true);
        await settle();
        expect(sdkScripts()).toHaveLength(0);

        const el = element();
        const paypal = await render(el);
        el.remove();
        expect(paypal.closed).toBe(1);
    });

    test('cart: createOrder posts the core token request and returns the token', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ success: true, token: 'EC-1' }));
        const paypal = await render(element('cart', { customerId: '7', quoteId: '42' }));

        await expect(paypal.buttonOptions[0].createOrder()).resolves.toBe('EC-1');
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(CONFIG.getTokenUrl);
        expect(init.method).toBe('POST');
        expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
        expect(Object.fromEntries(init.body)).toEqual({
            quote_id: '42',
            customer_id: '7',
            form_key: 'KEY123',
            button: '1',
        });
    });

    test('a refused token shows the server message and rejects', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ success: false, error_message: 'No token for you' }));
        const paypal = await render(element());

        await expect(paypal.buttonOptions[0].createOrder()).rejects.toThrow('No token for you');
        expect(toast().hidden).toBe(false);
        expect(toast().textContent).toBe('No token for you');
        expect(toast().getAttribute('data-tone')).toBe('error');

        // PayPal reports the rejection through onError: no second, generic toast.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        paypal.buttonOptions[0].onError(new Error('wrapped'));
        expect(toast().textContent).toBe('No token for you');
    });

    test('guest checkout not allowed: asks to sign in and requests nothing', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const paypal = await render(element('cart', { declined: true }, { [SIGN_IN]: 'Please sign in' }));

        await expect(paypal.buttonOptions[0].createOrder()).rejects.toThrow('Please sign in');
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(toast().getAttribute('data-tone')).toBe('warning');
    });

    test('onClick rejects the click, with the message, before PayPal opens', async () => {
        const paypal = await render(element('cart', { declined: true }, { [SIGN_IN]: 'Please sign in' }));
        const actions = { resolve: vi.fn(() => 'resolved'), reject: vi.fn(() => 'rejected') };

        expect(paypal.buttonOptions[0].onClick({ fundingSource: 'paypal' }, actions)).toBe('rejected');
        expect(actions.resolve).not.toHaveBeenCalled();
        expect(toast().textContent).toBe('Please sign in');

        await mount(element());
        observers.triggerAll(true);
        await settle();
        expect(paypal.buttonOptions[1].onClick({ fundingSource: 'paypal' }, actions)).toBe('resolved');
    });

    describe('product context', () => {
        function productForm({ superValue = '5' } = {}) {
            const form = document.createElement('form');
            form.id = 'product_addtocart_form';
            form.setAttribute('action', 'https://shop.test/checkout/cart/add/product/1/');
            form.innerHTML = `
                <input type="hidden" name="form_key" value="STALE">
                <input type="hidden" name="product" value="1">
                <input type="hidden" name="super_attribute[93]" value="${superValue}" data-hyperion-super="93">
                <input type="number" name="qty" value="2">
            `;
            document.body.appendChild(form);
            return form;
        }

        test('adds the product with the chosen options first, then asks for the token', async () => {
            productForm();
            const fetchSpy = vi.spyOn(globalThis, 'fetch')
                .mockResolvedValueOnce(new Response('<hyperion-notification></hyperion-notification>', { status: 200 }))
                .mockResolvedValueOnce(json({ success: true, token: 'EC-2' }));
            const changed = vi.fn();
            document.addEventListener('hyperion:cart-changed', changed, { once: true });
            const paypal = await render(element('product', { quoteId: 'ignored', customerId: 'ignored' }));

            await expect(paypal.buttonOptions[0].createOrder()).resolves.toBe('EC-2');
            expect(fetchSpy).toHaveBeenCalledTimes(2);
            const [addUrl, addInit] = fetchSpy.mock.calls[0];
            expect(addUrl).toBe('https://shop.test/checkout/cart/add/product/1/');
            expect(addInit.headers['HX-Request']).toBe('true');
            expect(addInit.headers['X-Hyperion-Express']).toBe('1');
            expect(addInit.body.get('super_attribute[93]')).toBe('5');
            expect(addInit.body.get('qty')).toBe('2');
            expect(addInit.body.get('form_key')).toBe('KEY123');
            expect(changed).toHaveBeenCalledTimes(1);

            const tokenBody = Object.fromEntries(fetchSpy.mock.calls[1][1].body);
            expect(tokenBody.quote_id).toBe('');
            expect(tokenBody.customer_id).toBe('');
        });

        test('submits through HTMX when it is on the page', async () => {
            const form = productForm();
            window.htmx = {
                ajax: vi.fn((verb, url, context) => {
                    context.source.dispatchEvent(new CustomEvent('htmx:afterRequest', {
                        bubbles: true,
                        detail: { elt: context.source, xhr: { status: 200 } },
                    }));
                    return Promise.resolve();
                }),
            };
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ success: true, token: 'EC-3' }));
            const paypal = await render(element('product'));

            await expect(paypal.buttonOptions[0].createOrder()).resolves.toBe('EC-3');
            expect(window.htmx.ajax).toHaveBeenCalledWith(
                'POST',
                'https://shop.test/checkout/cart/add/product/1/',
                { source: form, headers: { 'X-Hyperion-Express': '1' } }
            );
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        test('missing options: visible message, nothing is posted', async () => {
            productForm({ superValue: '' });
            const fetchSpy = vi.spyOn(globalThis, 'fetch');
            const paypal = await render(element('product', {}, { [OPTIONS]: 'Choose your options' }));

            await expect(paypal.buttonOptions[0].createOrder()).rejects.toThrow('Choose your options');
            expect(fetchSpy).not.toHaveBeenCalled();
            expect(toast().hidden).toBe(false);
            expect(toast().textContent).toBe('Choose your options');
        });

        test('a rejected add to cart shows its reason and asks for no token', async () => {
            productForm();
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
                '<hyperion-notification data-hyperion-notification><p>Not enough stock</p></hyperion-notification>',
                { status: 422 }
            ));
            const paypal = await render(element('product'));

            await expect(paypal.buttonOptions[0].createOrder()).rejects.toThrow();
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(toast().textContent).toBe('Not enough stock');
        });
    });

    test('onApprove posts the authorization and follows a same-origin redirectUrl', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValue(json({ success: true, redirectUrl: '/paypal/express/review/' }));
        const paypal = await render(element());
        const actions = { redirect: vi.fn(() => Promise.resolve()) };

        paypal.buttonOptions[0].onClick({ fundingSource: 'paylater' });
        await paypal.buttonOptions[0].onApprove({ orderID: 'EC-1', payerID: 'PAYER' }, actions);

        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(CONFIG.onAuthorizeUrl);
        expect(Object.fromEntries(init.body)).toEqual({
            paymentToken: 'EC-1',
            payerId: 'PAYER',
            paypalFundingSource: 'paylater',
            form_key: 'KEY123',
        });
        expect(actions.redirect).toHaveBeenCalledWith(`${location.origin}/paypal/express/review/`);
    });

    test('a redirectUrl on another origin is refused and shows the error', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValue(json({ success: true, redirectUrl: 'https://evil.example/paypal/express/review/' }));
        const paypal = await render(element());
        const actions = { redirect: vi.fn() };
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

        await paypal.buttonOptions[0].onApprove({ orderID: 'EC-1', payerID: 'PAYER' }, actions);
        expect(actions.redirect).not.toHaveBeenCalled();
        expect(assign).not.toHaveBeenCalled();
        expect(toast().textContent).toBe('Something went wrong with your request. Please try again later.');
    });

    test('a refused authorization shows the message and does not redirect', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ success: false, error_message: 'Declined' }));
        const paypal = await render(element());
        const actions = { redirect: vi.fn() };

        await paypal.buttonOptions[0].onApprove({ orderID: 'EC-1', payerID: 'PAYER' }, actions);
        expect(actions.redirect).not.toHaveBeenCalled();
        expect(toast().textContent).toBe('Declined');
    });

    test('onCancel drops the token on the server and toasts the message', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            const payload = [{ type: 'success', text: 'Express Checkout has been canceled.' }];
            document.cookie = `mage-messages=${encodeURIComponent(JSON.stringify(payload))}; path=/`;
            return Promise.resolve(new Response('', { status: 200 }));
        });
        const paypal = await render(element());

        await paypal.buttonOptions[0].onCancel();
        expect(fetchSpy.mock.calls[0][0]).toBe(CONFIG.onCancelUrl);
        expect(toast().textContent).toBe('Express Checkout has been canceled.');
        expect(toast().getAttribute('data-tone')).toBe('info');
        expect(document.cookie).not.toContain('mage-messages=[');
    });

    test('an SDK error is reported to the express slot with the generic message', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const errors = vi.fn();
        document.addEventListener('hyperion-express:error', errors);
        const paypal = await render(element('cart', {}, { [ERROR]: 'Try again later' }));

        paypal.buttonOptions[0].onError(new Error('boom'));
        expect(errors).toHaveBeenCalledTimes(1);
        expect(errors.mock.calls[0][0].detail).toEqual({ message: 'Try again later' });
        document.removeEventListener('hyperion-express:error', errors);
    });
});
