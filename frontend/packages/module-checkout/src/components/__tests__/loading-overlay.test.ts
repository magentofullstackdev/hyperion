// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../loading-overlay.js';
import { OVERLAY_PREPARE_DELAY_MS, type LoadingOverlay } from '../loading-overlay.js';

describe('<loading-overlay>', () => {
    let store: Store;
    let app: HTMLElement;
    let content: HTMLElement;
    let field: HTMLInputElement;
    let dialog: HTMLElement;
    let el: LoadingOverlay;

    async function rendered(): Promise<void> {
        await vi.advanceTimersByTimeAsync(0);
        await el.updateComplete;
    }

    const overlay = (): HTMLElement | null => el.querySelector<HTMLElement>('[data-loading-overlay]');

    beforeEach(async () => {
        vi.useFakeTimers();
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        // The shape of the mounted app: the content, the dialog of an ended
        // session and the overlay as children of `<checkout-app>`.
        app = document.createElement('checkout-app');
        dialog = document.createElement('hc-session-expired');
        content = document.createElement('div');
        field = document.createElement('input');
        content.appendChild(field);
        el = document.createElement('loading-overlay');
        app.append(dialog, content, el);
        const outside = document.createElement('footer');
        outside.id = 'outside';
        document.body.append(app, outside);
        await el.updateComplete;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
        vi.useRealTimers();
    });

    function startPreparing(): void {
        store.orderOutcome.set('placing');
        store.isPlacingOrder.set(true);
        store.orderStep.set('preparing');
    }

    it('is absent while no order is on its way', () => {
        expect(overlay()).toBeNull();
        expect(content.hasAttribute('inert')).toBe(false);
    });

    it('does not flash for saves that end quickly', async () => {
        startPreparing();
        await rendered();
        await vi.advanceTimersByTimeAsync(OVERLAY_PREPARE_DELAY_MS - 1);
        await el.updateComplete;
        expect(overlay()).toBeNull();

        store.orderStep.set('payment');
        await rendered();
        await vi.advanceTimersByTimeAsync(OVERLAY_PREPARE_DELAY_MS);
        await el.updateComplete;
        expect(overlay()).toBeNull();
    });

    it('covers saves that take longer than the delay', async () => {
        startPreparing();
        await rendered();
        await vi.advanceTimersByTimeAsync(OVERLAY_PREPARE_DELAY_MS);
        await el.updateComplete;

        expect(overlay()).not.toBeNull();
        expect(content.hasAttribute('inert')).toBe(true);
    });

    it('is down, with the page usable, while the payment method does its own step, even after slow saves', async () => {
        startPreparing();
        await rendered();
        await vi.advanceTimersByTimeAsync(OVERLAY_PREPARE_DELAY_MS);
        await el.updateComplete;
        expect(overlay()).not.toBeNull();

        store.orderStep.set('payment');
        await rendered();

        expect(store.isPlacingOrder.get()).toBe(true);
        expect(overlay()).toBeNull();
        expect(content.hasAttribute('inert')).toBe(false);
    });

    it('covers the page from the order request on, as a status with its text', async () => {
        startPreparing();
        store.orderStep.set('payment');
        await rendered();
        store.orderStep.set('submitting');
        await rendered();

        expect(overlay()?.getAttribute('role')).toBe('status');
        expect(overlay()?.textContent).toContain(enUS['Hyperion_Checkout::placing_order']);
        expect(content.hasAttribute('inert')).toBe(true);
    });

    it('makes the content inert, never the app element, the dialog of an ended session or anything outside the checkout', async () => {
        store.orderStep.set('submitting');
        await rendered();

        expect(content.hasAttribute('inert')).toBe(true);
        expect(app.hasAttribute('inert')).toBe(false);
        expect(el.hasAttribute('inert')).toBe(false);
        expect(dialog.hasAttribute('inert')).toBe(false);
        expect(document.getElementById('outside')?.hasAttribute('inert')).toBe(false);
    });

    it('reaches the content from a nested position too', async () => {
        const wrapper = document.createElement('div');
        const sibling = document.createElement('p');
        wrapper.append(sibling, el);
        app.appendChild(wrapper);
        await el.updateComplete;

        store.orderStep.set('submitting');
        await rendered();

        expect(sibling.hasAttribute('inert')).toBe(true);
        expect(content.hasAttribute('inert')).toBe(true);
        expect(wrapper.hasAttribute('inert')).toBe(false);
    });

    it('gives back only what it made inert, and the focus, when it leaves', async () => {
        const already = document.createElement('div');
        already.setAttribute('inert', '');
        app.insertBefore(already, el);
        field.focus();

        store.orderOutcome.set('placing');
        store.orderStep.set('submitting');
        await rendered();
        field.blur();

        store.orderOutcome.set('none');
        store.orderStep.set('idle');
        await rendered();

        expect(overlay()).toBeNull();
        expect(content.hasAttribute('inert')).toBe(false);
        expect(already.hasAttribute('inert')).toBe(true);
        expect(document.activeElement).toBe(field);
    });

    it('says the order is being confirmed while the quote is read, and comes down while the answer is awaited', async () => {
        store.orderOutcome.set('unknown');
        store.orderStep.set('confirming');
        await rendered();
        expect(overlay()?.textContent).toContain('Confirming your order...');

        store.orderStep.set('idle');
        store.isPlacingOrder.set(false);
        await rendered();
        expect(overlay()).toBeNull();
        expect(content.hasAttribute('inert')).toBe(false);
    });

    it('shows the order number learned from the quote while the browser leaves', async () => {
        store.orderOutcome.set('placed');
        store.orderPlaced.set(true);
        store.isPlacingOrder.set(true);
        store.orderNumber.set('000000205');
        await rendered();

        expect(overlay()?.textContent).toContain('Your order 000000205 was received.');
    });

    it('holds for a placed order without a number, with the usual text', async () => {
        store.orderOutcome.set('placed');
        store.isPlacingOrder.set(true);
        await rendered();
        expect(overlay()?.textContent).toContain(enUS['Hyperion_Checkout::placing_order']);
    });

    it('covers the page while a payment method that places the order itself holds the latch', async () => {
        store.isPlacingOrder.set(true);
        await rendered();
        expect(overlay()).not.toBeNull();
    });
});
