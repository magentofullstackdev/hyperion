// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @vitest-environment jsdom
// jsdom retargets a click that leaves a shadow root to its host, as a browser does.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { installCheckoutLinkBusy } from '../checkout-link-busy.js';

const markup = `
<aside data-hyperion-cart-totals>
  <a id="card" href="/checkout/" data-hyperion-checkout-link>Proceed to Checkout</a>
</aside>
<div data-hyperion-checkout-bar>
  <a id="bar" href="/checkout/" data-hyperion-checkout-bar-link>Proceed to Checkout</a>
</div>
<a id="blocked" role="link" aria-disabled="true" tabindex="0" data-hyperion-checkout-link>Proceed to Checkout</a>
<a id="other" href="/checkout/cart/">View and Edit Cart</a>`;

// A click as the browser dispatches it; `composed` lets it leave a shadow root.
const click = (el, init = {}) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0, ...init });
    el.dispatchEvent(event);
    return event;
};
const busy = (el) => el.getAttribute('aria-busy');
const byId = (id) => document.getElementById(id);

describe('checkout-link-busy', () => {
    let uninstall;
    // The navigation a test click would start is not followed by the test DOM.
    const stopNavigation = (event) => { event.preventDefault(); };

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = markup;
        uninstall = installCheckoutLinkBusy(document);
        window.addEventListener('click', stopNavigation);
    });

    afterEach(() => {
        window.removeEventListener('click', stopNavigation);
        uninstall?.();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    test('a plain click marks the summary link and the phone bar link busy without preventing it', () => {
        // Registered after the helper on the same node: it sees the event the helper left.
        let prevented = null;
        const probe = (event) => { prevented = event.defaultPrevented; };
        document.addEventListener('click', probe);
        click(byId('card'));
        document.removeEventListener('click', probe);
        expect(busy(byId('card'))).toBe('true');
        expect(prevented).toBe(false);
        click(byId('bar'));
        expect(busy(byId('bar'))).toBe('true');
    });

    test('a click on the label inside the link counts as a click on the link', () => {
        byId('card').innerHTML = '<span id="label">Proceed to Checkout</span>';
        click(byId('label'));
        expect(busy(byId('card'))).toBe('true');
    });

    test.each([
        ['ctrl', { ctrlKey: true }],
        ['meta', { metaKey: true }],
        ['shift', { shiftKey: true }],
        ['alt', { altKey: true }],
        ['middle button', { button: 1 }],
    ])('a %s click leaves the link alone', (_name, init) => {
        click(byId('card'), init);
        expect(busy(byId('card'))).toBeNull();
    });

    test('a disabled link (minimum order) is never marked', () => {
        click(byId('blocked'));
        expect(busy(byId('blocked'))).toBeNull();
    });

    test('a click another handler already prevented is not a navigation', () => {
        const card = byId('card');
        card.addEventListener('click', (event) => event.preventDefault());
        click(card);
        expect(busy(card)).toBeNull();
    });

    test('a link that opens another tab or downloads is not marked', () => {
        const card = byId('card');
        card.setAttribute('target', '_blank');
        click(card);
        expect(busy(card)).toBeNull();
        card.removeAttribute('target');
        card.setAttribute('download', '');
        click(card);
        expect(busy(card)).toBeNull();
    });

    test('other links are not touched', () => {
        click(byId('other'));
        expect(busy(byId('other'))).toBeNull();
    });

    test('a second plain click while busy is prevented, a modified one is not', () => {
        window.removeEventListener('click', stopNavigation);
        const card = byId('card');
        expect(click(card).defaultPrevented).toBe(false);
        expect(click(card).defaultPrevented).toBe(true);
        expect(click(card, { ctrlKey: true }).defaultPrevented).toBe(false);
        expect(busy(card)).toBe('true');
    });

    test('pageshow resets every busy link, a restore from the back/forward cache too', () => {
        click(byId('card'));
        click(byId('bar'));
        const event = new Event('pageshow');
        Object.defineProperty(event, 'persisted', { value: true });
        window.dispatchEvent(event);
        expect(busy(byId('card'))).toBeNull();
        expect(busy(byId('bar'))).toBeNull();
        // Usable again: the next click marks it once more.
        click(byId('card'));
        expect(busy(byId('card'))).toBe('true');
    });

    test('a navigation that never happens releases the link after ten seconds', () => {
        click(byId('card'));
        vi.advanceTimersByTime(9000);
        expect(busy(byId('card'))).toBe('true');
        vi.advanceTimersByTime(1000);
        expect(busy(byId('card'))).toBeNull();
    });

    test('a link rendered after the install is covered, and arrives idle', () => {
        click(byId('card'));
        document.querySelector('[data-hyperion-cart-totals]').outerHTML
            = '<aside data-hyperion-cart-totals><a id="card" href="/checkout/" data-hyperion-checkout-link>Proceed to Checkout</a></aside>';
        const fresh = byId('card');
        expect(busy(fresh)).toBeNull();
        click(fresh);
        expect(busy(fresh)).toBe('true');
    });

    test('a link inside a shadow root (the mini-cart drawer) is found through the composed path', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<footer><a id="drawer" href="/checkout/" data-hyperion-checkout-link><span>Proceed to Checkout</span></a></footer>';
        const link = shadow.getElementById('drawer');
        click(link.querySelector('span'));
        expect(busy(link)).toBe('true');
        window.dispatchEvent(new Event('pageshow'));
        expect(busy(link)).toBeNull();
    });

    test('uninstall removes the listeners and clears the busy state', () => {
        click(byId('card'));
        uninstall();
        uninstall = null;
        expect(busy(byId('card'))).toBeNull();
        click(byId('card'));
        expect(busy(byId('card'))).toBeNull();
    });
});
