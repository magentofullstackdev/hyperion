// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prepareOrder = vi.fn();
const submitOrder = vi.fn();
const cancelOrder = vi.fn();
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ prepareOrder, submitOrder, cancelOrder }),
}));
vi.mock('../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../place-order-button.js';
import type { PlaceOrderButton } from '../place-order-button.js';

const CONFIG = guestFixture as unknown as CheckoutConfig;

function totals(grand: string): Totals {
    return {
        ...(CONFIG.totalsData as Totals),
        grand_total: grand,
        total_segments: [{ code: 'grand_total', title: 'Grand Total', value: grand, area: 'footer' }],
    };
}

describe('<place-order-button> label, hook and latch', () => {
    let store: Store;
    let el: PlaceOrderButton;

    async function settle(): Promise<void> {
        await el.updateComplete;
        await el.querySelector('hc-button')!.updateComplete;
    }

    beforeEach(async () => {
        prepareOrder.mockReset();
        prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'busy' });
        submitOrder.mockReset();
        cancelOrder.mockReset();
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(CONFIG);
        resetFlowSelectorsForTests();
        store = createStore();
        setStoreForTests(store);
        store.totals.set(totals('57.00'));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        el = document.createElement('place-order-button') as PlaceOrderButton;
        document.body.appendChild(el);
        await settle();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
        resetFlowSelectorsForTests();
    });

    const button = (): HTMLButtonElement => el.querySelector<HTMLButtonElement>('[data-hyperion-place-order] button')!;
    const label = (): string => button().textContent!.replace(/\s+/g, ' ').trim();

    it('carries the hook the layout measurements look for, on the element around the button', () => {
        expect(el.querySelectorAll('[data-hyperion-place-order]')).toHaveLength(1);
        expect(el.querySelector('[data-hyperion-place-order]')!.tagName.toLowerCase()).toBe('hc-button');
    });

    it('names the amount once the totals are settled', () => {
        expect(label()).toBe('Place order, €57.00');
    });

    it('shows the plain label while the totals settle or follow an unanswered change', async () => {
        store.isSettlingTotals.set(true);
        await settle();
        expect(label()).toBe('Place Order');

        store.isSettlingTotals.set(false);
        store.optimisticTotals.set(totals('61.00'));
        await settle();
        expect(label()).toBe('Place Order');

        store.totals.set(totals('60.50'));
        store.optimisticTotals.set(null);
        await settle();
        expect(label()).toBe('Place order, €60.50');
    });

    it('shows the plain label while the shipping cost is not known or there are no totals', async () => {
        store.appliedShippingMethod.set(null);
        await settle();
        expect(label()).toBe('Place Order');

        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.totals.set(null);
        await settle();
        expect(label()).toBe('Place Order');
    });

    it('names the amount of a quote that does not ship', async () => {
        store.appliedShippingMethod.set(null);
        store.isVirtual.set(true);
        await settle();
        expect(label()).toBe('Place order, €57.00');
    });

    it('starts the order pipeline on a press while no attempt is under way', async () => {
        button().click();
        await Promise.resolve();
        expect(prepareOrder).toHaveBeenCalledTimes(1);
    });

    it.each(['placing', 'placed', 'unknown'] as const)('ignores a press once the attempt is "%s"', async (outcome) => {
        store.orderOutcome.set(outcome);
        await settle();
        const control = button();
        // The loading state disables the native button; the handler must hold on its own too.
        control.disabled = false;
        control.click();
        await Promise.resolve();
        expect(prepareOrder).not.toHaveBeenCalled();
    });
});
