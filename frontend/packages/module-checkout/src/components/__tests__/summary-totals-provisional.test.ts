// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../summary-totals.js';
import type { SummaryTotals } from '../summary-totals.js';

function totals(shipping: string, grand: string): Totals {
    return {
        ...(guestFixture.totalsData as unknown as Totals),
        shipping_amount: shipping,
        shipping_incl_tax: shipping,
        grand_total: grand,
        total_segments: [
            { code: 'subtotal', title: 'Subtotal', value: '52.00', area: null },
            { code: 'shipping', title: 'Shipping', value: shipping, area: null },
            { code: 'grand_total', title: 'Grand Total', value: grand, area: 'footer' },
        ],
    };
}

describe('<summary-totals> while a change is unanswered', () => {
    let store: Store;
    let el: SummaryTotals;

    beforeEach(async () => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.totals.set(totals('5.00', '57.00'));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        el = document.createElement('summary-totals') as SummaryTotals;
        document.body.appendChild(el);
        await el.updateComplete;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    const grandRow = (): HTMLElement => el.querySelector<HTMLElement>('[data-total="grand_total"]')!;
    const announced = (): string => el.querySelector('[role="status"]')!.textContent!.replace(/\s+/g, ' ').trim();

    it('shows the confirmed totals with no marker when nothing is pending, and repeats nothing in the live region', () => {
        expect(grandRow().textContent).toContain('57.00');
        expect(grandRow().hasAttribute('data-provisional')).toBe(false);
        expect(grandRow().hasAttribute('aria-busy')).toBe(false);
        expect(announced()).toBe('');
    });

    it('shows the expected totals at once, marks the grand total as provisional and announces only the confirmed total', async () => {
        store.optimisticTotals.set(totals('9.00', '61.00'));
        store.isSettlingTotals.set(true);
        await el.updateComplete;

        expect(grandRow().textContent).toContain('61.00');
        expect(el.querySelector('[data-total="shipping"]')?.textContent).toContain('9.00');
        expect(grandRow().hasAttribute('data-provisional')).toBe(true);
        expect(grandRow().getAttribute('aria-busy')).toBe('true');
        expect(announced()).not.toContain('61.00');

        // The answer of the save: the confirmed totals replace the expected ones.
        store.totals.set(totals('9.00', '60.50'));
        store.optimisticTotals.set(null);
        store.isSettlingTotals.set(false);
        await el.updateComplete;

        expect(grandRow().textContent).toContain('60.50');
        expect(grandRow().hasAttribute('data-provisional')).toBe(false);
        expect(grandRow().hasAttribute('aria-busy')).toBe(false);
        expect(announced()).toContain('60.50');
    });
});
