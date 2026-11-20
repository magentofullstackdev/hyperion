// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/flow-actions.js', () => {
    const queue = { registerFlusher: () => () => {}, enqueue: vi.fn(), flush: vi.fn() };
    const actions = new Proxy({ queue } as Record<string, unknown>, {
        get: (target, name: string) => target[name] ?? (target[name] = vi.fn()),
    });
    return { flowActions: () => actions };
});

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-app.js';
import type { CheckoutApp } from '../checkout-app.js';

const CONFIG = guestFixture as unknown as CheckoutConfig;

type Listener = () => void;

/** A `matchMedia` whose answer the test sets and changes. */
function installMatchMedia(matches: boolean): { set(next: boolean): void } {
    const listeners = new Set<Listener>();
    const query = {
        matches,
        addEventListener: (_type: string, listener: Listener) => { listeners.add(listener); },
        removeEventListener: (_type: string, listener: Listener) => { listeners.delete(listener); },
    };
    vi.stubGlobal('matchMedia', () => query);
    return {
        set(next: boolean): void {
            query.matches = next;
            listeners.forEach((listener) => listener());
        },
    };
}

describe('<checkout-app> shell', () => {
    let store: Store;

    async function settle(root: Element): Promise<void> {
        for (let i = 0; i < 4; i += 1) {
            await Promise.all(Array.from(root.querySelectorAll('*'))
                .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve()));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    async function mount(): Promise<CheckoutApp> {
        const el = document.createElement('checkout-app') as CheckoutApp;
        document.body.appendChild(el);
        await el.updateComplete;
        await settle(el);
        return el;
    }

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(CONFIG);
        resetFlowSelectorsForTests();
        store = createStore();
        setStoreForTests(store);
        store.items.set(CONFIG.quoteItemData);
        store.totals.set(CONFIG.totalsData as Totals);
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
        resetFlowSelectorsForTests();
        vi.unstubAllGlobals();
    });

    const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const grid = (el: Element): Element => el.firstElementChild!;

    function duplicateIds(root: Element): string[] {
        const seen = new Set<string>();
        const twice = new Set<string>();
        root.querySelectorAll('[id]').forEach((node) => {
            if (seen.has(node.id)) twice.add(node.id);
            seen.add(node.id);
        });
        return [...twice];
    }

    it('adds no main landmark and titles the page with one h1 of the published text', async () => {
        installMatchMedia(true);
        const el = await mount();

        expect(el.querySelector('main, [role="main"]')).toBeNull();
        expect(el.querySelectorAll('h1')).toHaveLength(1);
        expect(text(el.querySelector('h1'))).toBe('Checkout');
        expect(enUS['Hyperion_Checkout::checkout_heading']).toBe('Checkout');
    });

    it('narrow layout: the collapsed summary bar is the first block and the bar of Place Order repeats the grand total', async () => {
        installMatchMedia(false);
        const el = await mount();
        const first = grid(el).firstElementChild!;

        expect(first.matches('order-summary[collapsible]')).toBe(true);
        expect(first.querySelector('details')!.open).toBe(false);
        expect(text(first.querySelector('[data-hyperion-summary-bar-total]'))).not.toBe('');
        expect(el.querySelectorAll('order-summary')).toHaveLength(1);
        expect(el.querySelector('[data-hyperion-summary-rail]')).toBeNull();

        const bar = el.querySelector('[data-hyperion-place-order-bar]')!;
        const total = bar.querySelector('[data-hyperion-place-order-total]')!;
        expect(bar.classList.contains('sticky')).toBe(true);
        expect(bar.classList.contains('bottom-0')).toBe(true);
        expect(text(total)).toBe(`${text(first.querySelector('[data-total="grand_total"] dt'))} ${text(first.querySelector('[data-hyperion-summary-bar-total]'))}`);
        expect(total.getAttribute('aria-hidden')).toBe('true');
        expect(total.nextElementSibling!.matches('place-order-button')).toBe(true);
    });

    it('wide layout: the summary is the rail after the sections and the bar holds the button alone', async () => {
        installMatchMedia(true);
        const el = await mount();
        const children = Array.from(grid(el).children);

        expect(children.map((child) => child.tagName.toLowerCase())).toEqual(['div', 'aside']);
        expect(children[1]!.hasAttribute('data-hyperion-summary-rail')).toBe(true);
        expect(children[1]!.querySelector('order-summary')!.hasAttribute('collapsible')).toBe(false);
        expect(el.querySelector('details')).toBeNull();
        expect(el.querySelector('[data-hyperion-place-order-total]')).toBeNull();
        expect(el.querySelector('[data-hyperion-place-order-bar] place-order-button')).not.toBeNull();
    });

    it('follows the viewport across the breakpoint with one summary at a time', async () => {
        const media = installMatchMedia(false);
        const el = await mount();
        expect(grid(el).firstElementChild!.matches('order-summary[collapsible]')).toBe(true);

        media.set(true);
        await el.updateComplete;
        await settle(el);
        expect(el.querySelectorAll('order-summary')).toHaveLength(1);
        expect(grid(el).lastElementChild!.matches('aside[data-hyperion-summary-rail]')).toBe(true);
    });

    it.each([[false], [true]])('holds one live grand total, no duplicate id and the hook of the button (wide: %s)', async (wide) => {
        installMatchMedia(wide);
        const el = await mount();

        expect(el.querySelectorAll('[data-hyperion-grand-total-live]')).toHaveLength(1);
        expect(duplicateIds(el)).toEqual([]);
        expect(el.querySelectorAll('[data-hyperion-place-order]')).toHaveLength(1);
        expect(el.querySelector('[data-hyperion-place-order] button')).not.toBeNull();
    });

    it('places the section statuses of shipping methods, payment, coupon and order once each', async () => {
        installMatchMedia(true);
        const el = await mount();
        const sections = Array.from(el.querySelectorAll('hc-section-status')).map((node) => node.getAttribute('section'));

        for (const section of ['shipping-methods', 'payment', 'coupon', 'order']) {
            expect(sections.filter((name) => name === section), section).toHaveLength(1);
        }
        const order = el.querySelector('hc-section-status[section="order"]')!;
        expect(order.nextElementSibling!.matches('[data-hyperion-place-order-bar]')).toBe(true);
        expect(el.querySelector('shipping-method-list hc-section-status[section="shipping-methods"]')).not.toBeNull();
        expect(el.querySelector('payment-method-list + hc-section-status[section="payment"]')).not.toBeNull();
    });

    it('has no shipping card for a quote that does not ship', async () => {
        installMatchMedia(true);
        store.isVirtual.set(true);
        const el = await mount();

        expect(el.querySelector('#hc-shipping-heading')).toBeNull();
        expect(el.querySelector('shipping-method-list')).toBeNull();
        expect(el.querySelector('#hc-payment-heading')).not.toBeNull();
    });
});
