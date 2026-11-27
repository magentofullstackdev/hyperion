// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

import { afterEach, describe, expect, it } from 'vitest';
import {
    API_MAJOR,
    API_VERSION,
    createMockCheckoutContext,
    createMockExpressContext,
    createMockPaymentContext,
    createMockShippingContext,
    createSnapshot,
    createSpy,
    mountExpressElement,
    mountPaymentElement,
    mountShippingElement,
    mountSlotElement,
    runPaymentRendererContract,
    runShippingExtensionContract,
} from '../index.js';
import { EXTENSION_API } from '../../src/extension/version.ts';
import { defineReferenceElements } from './reference-elements.js';

defineReferenceElements();

afterEach(() => {
    document.body.innerHTML = '';
});

describe('API version', () => {
    it('mirrors the version the checkout publishes', () => {
        expect(API_VERSION).toBe(EXTENSION_API);
        expect(API_VERSION.startsWith(`${API_MAJOR}.`)).toBe(true);
    });
});

describe('createSnapshot', () => {
    it('answers a complete frozen guest snapshot', () => {
        const snapshot = createSnapshot();
        expect(snapshot.isGuest).toBe(true);
        expect(snapshot.totals?.base.currency).toBe('USD');
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.totals?.base)).toBe(true);
        expect(Object.isFrozen(snapshot.items)).toBe(true);
    });

    it('merges plain objects key by key and replaces arrays and null', () => {
        const snapshot = createSnapshot({
            currency: { display: 'EUR', rate: 0.9 },
            totals: { base: { grandTotal: 20 } },
            items: [],
            shippingAddress: null,
        });
        expect(snapshot.currency).toEqual({ display: 'EUR', base: 'USD', rate: 0.9 });
        expect(snapshot.totals?.base.grandTotal).toBe(20);
        expect(snapshot.totals?.base.currency).toBe('USD');
        expect(snapshot.totals?.display.grandTotal).toBe(57);
        expect(snapshot.items).toEqual([]);
        expect(snapshot.shippingAddress).toBeNull();
    });
});

describe('createSpy', () => {
    it('records calls and answers through the current implementation', () => {
        const spy = createSpy((/** @type {number} */ a) => a * 2);
        expect(spy(2)).toBe(4);
        spy.implement((a) => a + 1);
        expect(spy(2)).toBe(3);
        expect(spy.calls).toEqual([[2], [2]]);
        spy.reset();
        expect(spy.calls).toEqual([]);
    });
});

describe('createMockCheckoutContext', () => {
    it('records rest calls and answers the newest matching answer', async () => {
        const context = createMockCheckoutContext();
        context.answerRest('carts/mine/totals', { grand_total: 1 });
        context.answerRest(/totals$/, { grand_total: 2 });
        context.answerRest((path) => path.startsWith('directory/'), (/** @type {string} */ path) => ({ path }));
        expect(await context.rest('carts/mine/totals')).toEqual({ grand_total: 2 });
        expect(await context.rest('directory/countries/IT', { method: 'GET' })).toEqual({ path: 'directory/countries/IT' });
        expect(context.calls.rest.map((call) => call.path)).toEqual(['carts/mine/totals', 'directory/countries/IT']);
        expect(context.calls.rest[1]?.init).toEqual({ method: 'GET' });
    });

    it('records a storefront() call as the request the checkout sends: GET without a body, else a POST with one', async () => {
        const context = createMockCheckoutContext();
        context.answerStorefront((_path, init) => init?.method === 'POST', { posted: true });
        context.answerStorefront((_path, init) => init?.method === 'GET', { posted: false });
        expect(await context.storefront('sample/state', { body: { ignored: true } })).toEqual({ posted: false });
        expect(await context.storefront('sample/start', { method: 'POST' })).toEqual({ posted: true });
        expect(await context.storefront('sample/start', { method: 'POST', body: { a: 1 } })).toEqual({ posted: true });
        // A method value outside the contract, from plain JavaScript, is sent as a POST.
        expect(await context.storefront('sample/start', /** @type {any} */ ({ method: 'DELETE' }))).toEqual({ posted: true });
        expect(context.calls.storefront.map((call) => call.init)).toEqual([
            { method: 'GET' },
            { method: 'POST', body: {} },
            { method: 'POST', body: { a: 1 } },
            { method: 'POST', body: {} },
        ]);
        const express = createMockExpressContext();
        express.answerStorefront('sample/express', { ok: true });
        await express.storefront('sample/express', { method: 'POST', body: { placement: 'product' } });
        expect(express.calls.storefront[0]?.init).toEqual({ method: 'POST', body: { placement: 'product' } });
    });

    it('rejects an Error answer, an unanswered path and an aborted request', async () => {
        const context = createMockCheckoutContext();
        context.answerStorefront('sample/start', new Error('refused'));
        await expect(context.storefront('sample/start')).rejects.toThrow('refused');
        await expect(context.rest('nowhere')).rejects.toMatchObject({ kind: 'not-found', status: 404 });
        const controller = new AbortController();
        controller.abort();
        context.answerRest('carts/mine', {});
        await expect(context.rest('carts/mine', { signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' });
    });

    it('builds the cart path of a guest and of a customer', () => {
        const guest = createMockCheckoutContext({ snapshot: { cartId: 'abc' } });
        expect(guest.cartPath()).toBe('guest-carts/abc');
        expect(guest.cartPath('/totals')).toBe('guest-carts/abc/totals');
        const customer = createMockCheckoutContext({ snapshot: { isGuest: false, customerId: 1, cartId: '7' } });
        expect(customer.cartPath('payment-information')).toBe('carts/mine/payment-information');
    });

    it('translates from its phrases and applies parameters', () => {
        const context = createMockCheckoutContext({ phrases: { 'Pay {amount}': 'Paga {amount}' } });
        expect(context.t('Pay {amount}', { amount: '10,00 EUR' })).toBe('Paga 10,00 EUR');
        expect(context.t('Card {last4}', { last4: 1234 })).toBe('Card 1234');
        expect(context.t('Unknown {name}')).toBe('Unknown {name}');
    });

    it('formats prices in the display and in the base currency', () => {
        const context = createMockCheckoutContext({ snapshot: { currency: { display: 'EUR', base: 'USD' } } });
        expect(context.formatPrice(10)).toContain('€');
        expect(context.formatPrice(10, 'base')).toContain('$');
    });

    it('notifies subscribers on setSnapshot and stops after unsubscribe', () => {
        const context = createMockCheckoutContext();
        /** @type {number[]} */
        const seen = [];
        const unsubscribe = context.subscribe((snapshot) => seen.push(snapshot.totals?.base.grandTotal ?? 0));
        const next = context.setSnapshot({ totals: { base: { grandTotal: 99 } } });
        expect(seen).toEqual([99]);
        expect(context.snapshot()).toBe(next);
        expect(Object.isFrozen(next)).toBe(true);
        expect(context.subscriberCount()).toBe(1);
        unsubscribe();
        context.setSnapshot({ isSettling: true });
        expect(seen).toEqual([99]);
        expect(context.subscriberCount()).toBe(0);
    });

    it('sanitizes active content out of HTML', () => {
        const context = createMockCheckoutContext();
        const html = context.sanitizeHtml('<p onclick="x()">Hi<script>x()</script><a href="javascript:x()">a</a></p>');
        expect(html).toBe('<p>Hi<a>a</a></p>');
    });

    it('replaces a member through an override and records loadScript', async () => {
        const context = createMockCheckoutContext({ cspNonce: 'nonce-1' });
        expect(context.cspNonce).toBe('nonce-1');
        await context.loadScript('https://sdk.example/sdk.js', { crossorigin: 'anonymous' });
        expect(context.calls.loadScript).toEqual([['https://sdk.example/sdk.js', { crossorigin: 'anonymous' }]]);
        expect(context.urls.base).toBe('https://shop.example/');
    });
});

describe('createMockPaymentContext', () => {
    it('spies on the pipeline with programmable answers', async () => {
        const context = createMockPaymentContext();
        expect(await context.placeOrder({ additional_data: { nonce: 'n' } })).toEqual({ status: 'placed', orderId: 1 });
        context.placeOrder.implement(async () => ({ status: 'failed', message: 'Declined' }));
        expect(await context.placeOrder({})).toEqual({ status: 'failed', message: 'Declined' });
        expect(context.placeOrder.calls[0]).toEqual([{ additional_data: { nonce: 'n' } }]);
        expect(await context.savePaymentInformation({})).toBe(true);
        expect(await context.requestCheckoutValidation()).toBe(true);
        context.setError('Card declined');
        context.setError(null);
        expect(context.errors).toEqual(['Card declined', null]);
    });
});

describe('createMockShippingContext', () => {
    it('carries the extension id', () => {
        expect(createMockShippingContext().extensionId).toBe('test-extension');
        expect(createMockShippingContext({ extensionId: 'locker' }).extensionId).toBe('locker');
    });
});

describe('createMockExpressContext', () => {
    it('holds the loading policy until it is released in manual mode', async () => {
        const context = createMockExpressContext({ loading: 'manual', placement: 'cart' });
        let wanted = false;
        context.whenWanted().then(() => {
            wanted = true;
        });
        await Promise.resolve();
        expect(wanted).toBe(false);
        context.release('wanted');
        await context.whenWanted();
        expect(wanted).toBe(true);
        expect(context.placement).toBe('cart');
    });

    it('records redirects, notifications and answers the cart', async () => {
        const context = createMockExpressContext();
        context.redirect('https://shop.example/sample/hosted');
        context.notify('Added', 'success');
        expect(context.redirects).toEqual(['https://shop.example/sample/hosted']);
        expect(context.notify.calls).toEqual([['Added', 'success']]);
        expect((await context.getCart())?.itemsCount).toBe(1);
        expect(await context.addCurrentProductToCart()).toEqual({ ok: true });
    });
});

describe('mount helpers', () => {
    it('sets the payment properties before the element is connected', () => {
        const token = { publicHash: 'h', paymentMethodCode: 'sample_vault', details: {} };
        const { element, context, host } = mountPaymentElement('reference-payment', {
            method: { code: 'sample', title: 'Sample' },
            config: { mode: 'test' },
            token,
        });
        const seen = /** @type {any} */ (element).seenAtConnect;
        expect(seen.context).toBe(context);
        expect(seen.method).toEqual({ code: 'sample', title: 'Sample' });
        expect(seen.config).toEqual({ mode: 'test' });
        expect(seen.token).toBe(token);
        expect(host.localName).toBe('checkout-app');
        expect(element.parentElement).toBe(host);
    });

    it('records an event that leaves the shadow root and waits for it', async () => {
        const { events } = mountPaymentElement('reference-payment');
        const ready = await events.waitFor('hyperion-payment:ready');
        expect(ready.bubbles).toBe(true);
        expect(ready.composed).toBe(true);
        expect(ready.reachedHost).toBe(true);
        await expect(events.waitFor('hyperion-payment:error', 20)).rejects.toThrow('no hyperion-payment:error');
    });

    it('records what the element dispatches itself', async () => {
        const { element, events } = mountPaymentElement('reference-payment');
        expect(/** @type {any} */ (element).validate()).toBe(false);
        expect(events.last('hyperion-payment:invalid')?.detail).toEqual({ message: 'Enter a reference.' });
        events.clear();
        expect(events.all).toEqual([]);
    });

    it('refuses to mount an element that is not defined', () => {
        expect(() => mountPaymentElement('not-defined-element')).toThrow('is not defined');
    });

    it('refuses, for every kind, an element the checkout would not use: no static hyperionApi or another major', () => {
        if (customElements.get('kit-no-api') === undefined) customElements.define('kit-no-api', class extends HTMLElement {});
        if (customElements.get('kit-api-two') === undefined) {
            customElements.define('kit-api-two', class extends HTMLElement {
                static hyperionApi = '2';
            });
        }
        for (const mountIt of [mountPaymentElement, mountShippingElement, mountSlotElement, mountExpressElement]) {
            expect(() => mountIt('kit-no-api')).toThrow('the element class must declare static hyperionApi');
            expect(() => mountIt('kit-api-two')).toThrow('hyperionApi declares major 2, the checkout supports 1');
        }
        expect(document.body.children.length).toBe(0);
    });

    it('hands a shipping element the snapshot method and its value', () => {
        const { element, context } = mountShippingElement('reference-shipping', { value: { state: { point: 'P1' } } });
        expect(/** @type {any} */ (element).method).toEqual(context.snapshot().shippingMethod);
        expect(element.textContent).toBe('P1');
    });

    it('hands a slot element its slot and an express button its placement', async () => {
        const slot = mountSlotElement('reference-slot', { slot: 'after-email' });
        expect(slot.element.slot).toBe('after-email');
        const express = mountExpressElement('reference-express', { placement: 'checkout-top' });
        expect(/** @type {any} */ (express.element).placementAtConnect).toBe('checkout-top');
        await express.events.waitFor('hyperion-express:ready');
        express.unmount();
        expect(express.host.isConnected).toBe(false);
    });
});

describe('payment contract on the reference element', () => {
    runPaymentRendererContract({
        tag: 'reference-payment',
        it,
        expect,
        options: {
            awaitsReady: true,
            prepare(element) {
                const input = /** @type {HTMLInputElement} */ (element.shadowRoot?.querySelector('input'));
                input.value = 'REF-1';
            },
        },
    });
});

describe('shipping contract on the reference element', () => {
    runShippingExtensionContract({
        tag: 'reference-shipping',
        it,
        expect,
        options: {
            value: { state: { point: 'P2' } },
            interact(element) {
                /** @type {any} */ (element).choose('P1');
            },
            expectRestored(element) {
                if (element.textContent !== 'P2') throw new Error('the point was not restored');
            },
        },
    });
});
