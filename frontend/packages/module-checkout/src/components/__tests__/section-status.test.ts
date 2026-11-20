// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/drafts.js', () => ({ discardDrafts: vi.fn() }));

import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { discardDrafts } from '../../store/drafts.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { clearFailure, reportFailure } from '../../store/section-status.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { SectionId } from '../../types/section.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../section-status.js';
import type { SectionStatusElement } from '../section-status.js';

describe('<hc-section-status>', () => {
    let store: Store;

    async function mount(section: SectionId): Promise<SectionStatusElement> {
        const el = document.createElement('hc-section-status');
        el.setAttribute('section', section);
        document.body.appendChild(el);
        await el.updateComplete;
        return el;
    }

    async function rendered(el: SectionStatusElement): Promise<void> {
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        await el.updateComplete;
    }

    const box = (el: Element): HTMLElement | null => el.querySelector<HTMLElement>('[data-section-status]');
    const action = (el: Element): HTMLElement | null => el.querySelector<HTMLElement>('[data-section-status-action]');

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig({
            cartUrl: 'https://shop.test/checkout/cart/',
            hyperion: { checkoutVersion: '2.0.0', enabled: true, cartUrl: 'https://shop.test/en/checkout/cart/' },
        } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        vi.mocked(discardDrafts).mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('renders nothing, and takes no space, while its section has no failure', async () => {
        const el = await mount('shipping-methods');
        expect(el.children.length).toBe(0);
        expect(el.textContent?.trim()).toBe('');
    });

    it('shows only the failure of its own section', async () => {
        const el = await mount('billing');
        reportFailure('payment', { kind: 'network', message: 'Payment failed' }, { source: 'background' });
        await rendered(el);
        expect(box(el)).toBeNull();
    });

    it('a background failure is a status with "Try again", and never takes the focus', async () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        const el = await mount('shipping-methods');
        const retry = vi.fn();

        reportFailure(
            'shipping-methods',
            { kind: 'unavailable', message: 'The store is temporarily unavailable. Please try again in a moment.' },
            { source: 'background', retry }
        );
        await rendered(el);

        expect(box(el)?.getAttribute('role')).toBe('status');
        expect(box(el)?.textContent).toContain('The store is temporarily unavailable.');
        expect(document.activeElement).toBe(input);
        expect(action(el)?.textContent?.trim()).toBe('Try again');
        action(el)?.click();
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it('a failed action is an alert', async () => {
        const el = await mount('shipping-methods');
        reportFailure('shipping-methods', { kind: 'network', message: 'We could not reach the store. Please try again.' }, { source: 'action', retry: vi.fn() });
        await rendered(el);
        expect(box(el)?.getAttribute('role')).toBe('alert');
    });

    it.each<SectionId>(['order', 'coupon', 'contact'])('a failed action of the %s section moves the focus to the message', async (section) => {
        const el = await mount(section);
        reportFailure(section, { kind: 'network', message: 'We could not reach the store. Please try again.' }, { source: 'action' });
        await rendered(el);
        expect(document.activeElement).toBe(box(el));
    });

    it.each<SectionId>(['shipping-address', 'shipping-methods', 'billing', 'payment', 'gift'])(
        'a failed action of the %s section leaves the focus where it is',
        async (section) => {
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.focus();
            const el = await mount(section);
            reportFailure(section, { kind: 'network', message: 'We could not reach the store. Please try again.' }, { source: 'action' });
            await rendered(el);
            expect(document.activeElement).toBe(input);
        }
    );

    it('a background failure of the order section does not take the focus either', async () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        const el = await mount('order');
        reportFailure('order', { kind: 'offline', message: 'You appear to be offline. Check your connection and try again.' }, { source: 'background' });
        await rendered(el);
        expect(box(el)?.getAttribute('role')).toBe('status');
        expect(document.activeElement).toBe(input);
    });

    it('a failure that arrives while the page is still inert takes the focus once the page is given back', async () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('inert', '');
        document.body.appendChild(wrapper);
        const el = document.createElement('hc-section-status');
        el.setAttribute('section', 'order');
        wrapper.appendChild(el);
        await el.updateComplete;
        vi.useFakeTimers();

        reportFailure('order', { kind: 'order-unknown', message: 'We could not reach the store. Your order was not placed. Please try again.' }, { source: 'action' });
        await vi.advanceTimersByTimeAsync(0);
        await el.updateComplete;
        wrapper.removeAttribute('inert');
        await vi.advanceTimersByTimeAsync(1);

        expect(document.activeElement).toBe(box(el));
    });

    it('the focus moves once per failure, not on every render of the same one', async () => {
        const input = document.createElement('input');
        document.body.appendChild(input);
        const el = await mount('order');
        reportFailure('order', { kind: 'network', message: 'We could not reach the store. Please try again.' }, { source: 'action' });
        await rendered(el);
        input.focus();

        el.requestUpdate();
        await rendered(el);

        expect(document.activeElement).toBe(input);
    });

    it('is cleared by a later success of the same section', async () => {
        const el = await mount('shipping-methods');
        reportFailure('shipping-methods', { kind: 'network', message: 'We could not reach the store. Please try again.' }, { source: 'background', retry: vi.fn() });
        await rendered(el);
        expect(box(el)).not.toBeNull();

        clearFailure('shipping-methods');
        await rendered(el);

        expect(box(el)).toBeNull();
        expect(el.textContent?.trim()).toBe('');
    });

    it('an order whose outcome is not known offers "Check again"', async () => {
        const el = await mount('order');
        const retry = vi.fn();
        reportFailure(
            'order',
            { kind: 'order-unknown', message: 'We could not confirm whether your order was placed. Please do not pay again yet.' },
            { source: 'action', retry }
        );
        await rendered(el);

        expect(action(el)?.textContent?.trim()).toBe('Check again');
        action(el)?.click();
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it('a failure with nothing to run again shows no button', async () => {
        const el = await mount('order');
        reportFailure('order', { kind: 'order-unknown', message: 'We could not reach the store. Your order was not placed. Please try again.' }, { source: 'action' });
        await rendered(el);
        expect(action(el)).toBeNull();
    });

    it('a cart that is gone offers the way back to the cart and drops the draft on the way', async () => {
        const el = await mount('order');
        reportFailure('order', { kind: 'quote-gone', message: 'Your cart has changed or expired.' }, { source: 'action' });
        await rendered(el);

        const link = action(el) as HTMLAnchorElement;
        expect(link.tagName).toBe('A');
        expect(link.textContent?.trim()).toBe('Return to cart');
        expect(link.getAttribute('href')).toBe('https://shop.test/en/checkout/cart/');
        link.addEventListener('click', (event) => event.preventDefault());
        link.click();
        expect(discardDrafts).toHaveBeenCalledTimes(1);
    });

    it('an item out of stock links to the cart and keeps the draft', async () => {
        const el = await mount('order');
        reportFailure('order', { kind: 'stock', message: 'Some of the products are out of stock.' }, { source: 'action' });
        await rendered(el);

        const link = action(el) as HTMLAnchorElement;
        expect(link.textContent?.trim()).toBe('Review your cart');
        expect(link.getAttribute('href')).toBe('https://shop.test/en/checkout/cart/');
        link.addEventListener('click', (event) => event.preventDefault());
        link.click();
        expect(discardDrafts).not.toHaveBeenCalled();
    });

    it('a blocked request offers a reload instead of a retry', async () => {
        const el = await mount('payment');
        reportFailure('payment', { kind: 'blocked', message: 'Your request was blocked. Reload the page or contact us.' }, { source: 'action', retry: vi.fn() });
        await rendered(el);
        expect(action(el)?.textContent?.trim()).toBe('Reload the page');
    });

    it('a rate limit holds "Try again" back until the wait is over, without rewriting the message meanwhile', async () => {
        const el = await mount('coupon');
        vi.useFakeTimers();
        const retry = vi.fn();
        reportFailure(
            'coupon',
            { kind: 'rate-limited', message: 'Too many requests. Please wait 3 seconds.', retryAfterMs: 3000 },
            { source: 'action', retry }
        );
        await vi.advanceTimersByTimeAsync(0);
        await el.updateComplete;

        const text = box(el)?.querySelector('p');
        expect(text?.textContent).toBe('Too many requests. Please wait 3 seconds.');
        expect(action(el)?.getAttribute('aria-disabled')).toBe('true');
        action(el)?.click();
        expect(retry).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2999);
        await el.updateComplete;
        expect(action(el)?.getAttribute('aria-disabled')).toBe('true');
        expect(box(el)?.querySelector('p')).toBe(text);

        await vi.advanceTimersByTimeAsync(1);
        await el.updateComplete;
        expect(action(el)?.getAttribute('aria-disabled')).toBe('false');
        action(el)?.click();
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
