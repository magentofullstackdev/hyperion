// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/flow-actions.js', () => ({ flowActions: () => ({ flushShippingForm: vi.fn() }) }));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { TotalSegment, Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { installShippingExtensions, resetShippingExtensionsForTests } from '../shipping-extension-host.js';
import '../summary-totals.js';
import { readGrandTotal, type SummaryTotals } from '../summary-totals.js';

const seg = (code: string, title: string, value: string | null): TotalSegment => ({ code, title, value: value as string, area: null });

function totals(segments: TotalSegment[], extra: Partial<Totals> = {}): Totals {
    return {
        ...(guestFixture.totalsData as unknown as Totals),
        subtotal: '52.00',
        subtotal_incl_tax: '52.00',
        shipping_amount: '5.00',
        shipping_incl_tax: '5.00',
        tax_amount: '0.00',
        grand_total: '57.00',
        total_segments: segments,
        ...extra,
    };
}

const BEFORE_SHIPPING = [
    seg('subtotal', 'Subtotal', '52.00'),
    seg('shipping', 'Shipping & Handling', '0.00'),
    seg('tax', 'Tax', '0.00'),
    seg('grand_total', 'Grand Total', '52.00'),
];

const WITH_SHIPPING = [
    seg('subtotal', 'Subtotal', '52.00'),
    seg('shipping', 'Shipping & Handling (Flat Rate - Fixed)', '5.00'),
    seg('tax', 'Tax', '4.29'),
    seg('grand_total', 'Grand Total', '61.29'),
];

describe('<summary-totals>', () => {
    let store: Store;
    let el: SummaryTotals;

    async function mount(config: Partial<CheckoutConfig> = {}): Promise<void> {
        setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), ...config });
        el = document.createElement('summary-totals') as SummaryTotals;
        document.body.appendChild(el);
        await el.updateComplete;
    }

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    const row = (code: string): HTMLElement | null => el.querySelector<HTMLElement>(`[data-total="${code}"]`);
    const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const live = (): Element => el.querySelector('[data-hyperion-grand-total-live]')!;

    it('says that shipping is calculated later and marks the grand total provisional until a method is confirmed', async () => {
        store.totals.set(totals(BEFORE_SHIPPING, { grand_total: '52.00' }));
        await mount();

        expect(text(row('shipping'))).toBe('Shipping & Handling Calculated at the next step');
        expect(row('grand_total')!.hasAttribute('data-provisional')).toBe(true);
        // Nothing is on its way to the server: the row is not busy.
        expect(row('grand_total')!.hasAttribute('aria-busy')).toBe(false);
        expect(readGrandTotal(store)).toEqual({ label: 'Grand Total', text: '€52.00', settled: false });

        store.totals.set(totals(WITH_SHIPPING, { grand_total: '61.29', tax_amount: '4.29' }));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await el.updateComplete;

        expect(text(row('shipping'))).toBe('Shipping & Handling (Flat Rate - Fixed) €5.00');
        expect(row('grand_total')!.hasAttribute('data-provisional')).toBe(false);
        expect(readGrandTotal(store)).toEqual({ label: 'Grand Total', text: '€61.29', settled: true });
    });

    it('prints the summary of an active shipping extension under the shipping row, and nothing without one', async () => {
        store.totals.set(totals(WITH_SHIPPING, { grand_total: '61.29', tax_amount: '4.29' }));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.shippingExtensionData.set({ vendor_note: { value: { information: { note: 'x' } }, valid: true, message: null } });
        await mount();
        expect(el.querySelector('[data-shipping-extension-summary]')).toBeNull();
        installShippingExtensions([{
            id: 'vendor_locker', match: { carrier: 'locker', method: null }, slot: 'below-method', tag: 'vendor-locker-picker',
            moduleUrl: null, kit: null, apiVersion: '1', required: false, sortOrder: 10, options: {}, phrases: {}, value: null,
        }]);
        await el.updateComplete;
        const list = el.querySelector('[data-hyperion-totals]')!;
        const childrenWithout = list.children.length;
        expect(el.querySelector('[data-shipping-extension-summary]')).toBeNull();

        store.shippingExtensionData.set({
            vendor_locker: {
                value: { summary: { label: 'Parcel locker', lines: ['Via Roma 1', 'Milano'] } },
                valid: true,
                message: null,
            },
        });
        await el.updateComplete;
        const summary = el.querySelector('[data-shipping-extension-summary]')!;
        expect(summary.previousElementSibling).toBe(row('shipping'));
        expect(summary.querySelector('dd')?.textContent).toBe('Parcel locker, Via Roma 1, Milano');
        expect(list.children.length).toBe(childrenWithout + 1);
        resetShippingExtensionsForTests();
    });

    it('never asks for shipping on a quote that does not ship', async () => {
        store.isVirtual.set(true);
        store.totals.set(totals([seg('subtotal', 'Subtotal', '9.99'), seg('grand_total', 'Grand Total', '9.99')]));
        await mount();

        expect(row('shipping')).toBeNull();
        expect(row('grand_total')!.hasAttribute('data-provisional')).toBe(false);
        expect(readGrandTotal(store)?.settled).toBe(true);
    });

    it('reserves the height of the rows a quote gains while the form is filled, with the grand total at the bottom', async () => {
        store.totals.set(totals(BEFORE_SHIPPING));
        await mount();
        const list = el.querySelector('[data-hyperion-totals]')!;

        expect(list.classList.contains('min-h-[6.9375rem]')).toBe(true);
        expect(row('tax')).toBeNull();
        expect(row('grand_total')!.classList.contains('mt-auto')).toBe(true);

        store.isVirtual.set(true);
        await el.updateComplete;
        expect(list.classList.contains('min-h-[5.3125rem]')).toBe(true);
    });

    it('keeps the element of every row when a row appears between them', async () => {
        store.totals.set(totals(BEFORE_SHIPPING));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await mount();
        const grand = row('grand_total');
        const shipping = row('shipping');
        expect(row('tax')).toBeNull();

        store.totals.set(totals(WITH_SHIPPING));
        await el.updateComplete;

        expect(row('tax')).not.toBeNull();
        expect(row('grand_total')).toBe(grand);
        expect(row('shipping')).toBe(shipping);
    });

    it('the pending shipping row is replaced as a whole when the amount is known, and a label fills its row', async () => {
        store.totals.set(totals(BEFORE_SHIPPING));
        await mount();
        const pending = row('shipping')!;
        expect(pending.querySelector('dt')!.classList.contains('flex-1')).toBe(true);
        expect(pending.querySelector('dd')!.classList.contains('text-muted')).toBe(true);

        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.totals.set(totals(WITH_SHIPPING));
        await el.updateComplete;

        const amount = row('shipping')!;
        expect(amount).not.toBe(pending);
        expect(amount.querySelector('dd')!.classList.contains('shrink-0')).toBe(true);
        expect(amount.querySelector('dd')!.classList.contains('text-muted')).toBe(false);
    });

    it('cuts a long label instead of wrapping it and keeps the full text as its title', async () => {
        store.totals.set(totals(WITH_SHIPPING));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await mount();

        const label = row('shipping')!.querySelector('dt')!;
        expect(label.classList.contains('truncate')).toBe(true);
        expect(label.getAttribute('title')).toBe('Shipping & Handling (Flat Rate - Fixed)');
    });

    it('prints an extension total in its place and a negative one like a discount', async () => {
        store.totals.set(totals([
            seg('subtotal', 'Subtotal', '52.00'),
            seg('discount', 'Discount (H20)', '-10.40'),
            seg('shipping', 'Shipping', '5.00'),
            seg('hyperion_test_fee', 'Test fee', '2.50'),
            seg('reward', 'Reward points', null),
            seg('grand_total', 'Grand Total', '49.10'),
        ]));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await mount();

        const codes = Array.from(el.querySelectorAll('[data-total]')).map((n) => n.getAttribute('data-total'));
        expect(codes).toEqual(['subtotal', 'discount', 'shipping', 'hyperion_test_fee', 'grand_total']);
        expect(row('discount')!.classList.contains('text-success')).toBe(true);
        expect(text(row('discount'))).toBe('Discount (H20) -€10.40');
        expect(row('hyperion_test_fee')!.classList.contains('text-success')).toBe(false);
        expect(text(row('hyperion_test_fee'))).toBe('Test fee €2.50');
    });

    it('orders the rows by the totals sort order of the configuration, like the cart', async () => {
        store.totals.set(totals([
            seg('subtotal', 'Subtotal', '52.00'),
            seg('shipping', 'Shipping', '5.00'),
            seg('tax', 'Tax', '4.29'),
            seg('weee_tax', 'FPT', '5.00'),
            seg('hyperion_test_fee', 'Test fee', '2.50'),
            seg('grand_total', 'Grand Total', '68.79'),
        ]));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        const base = guestFixture as unknown as CheckoutConfig;
        await mount({
            hyperion: {
                ...base.hyperion,
                totalsSort: { discount: 20, grand_total: 100, shipping: 30, subtotal: 10, tax: 40, weee: 35, weee_tax: 35 },
            },
        } as Partial<CheckoutConfig>);

        const codes = Array.from(el.querySelectorAll('[data-total]')).map((n) => n.getAttribute('data-total'));
        expect(codes).toEqual(['subtotal', 'shipping', 'weee_tax', 'hyperion_test_fee', 'tax', 'grand_total']);
    });

    it('formats the rates of the full tax summary for the locale', async () => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'de_DE');
        store.totals.set(totals([
            seg('subtotal', 'Subtotal', '52.00'),
            {
                code: 'tax', title: 'Tax', value: '4.29', area: 'taxes',
                extension_attributes: { tax_grandtotal_details: [{ amount: '4.29', rates: [{ percent: '8.25', title: 'US-MI' }] }] },
            },
            seg('grand_total', 'Grand Total', '61.29'),
        ]));
        store.isVirtual.set(true);
        await mount({ isFullTaxSummaryDisplayed: true });

        const label = text(row('tax_rate')!.querySelector('dt'));
        expect(label.startsWith('US-MI (8,25')).toBe(true);
        expect(label.endsWith('%)')).toBe(true);
    });

    it('names the amount charged in the base currency when the store displays another one', async () => {
        store.isVirtual.set(true);
        store.totals.set(totals([seg('grand_total', 'Grand Total', '57.00')], {
            base_currency_code: 'EUR', quote_currency_code: 'USD', base_grand_total: '52.29',
        }));
        await mount({
            basePriceFormat: { ...(guestFixture as unknown as CheckoutConfig).priceFormat, pattern: '%s EUR' },
        });
        expect(text(el.querySelector('[data-base-charge-notice]'))).toBe('Your card will be charged 52.29 EUR.');

        store.totals.set(totals([seg('grand_total', 'Grand Total', '57.00')], {
            base_currency_code: 'USD', quote_currency_code: 'USD',
        }));
        await el.updateComplete;
        expect(el.querySelector('[data-base-charge-notice]')).toBeNull();
    });

    it('holds one live region that stays empty at load and announces the confirmed total when it changes', async () => {
        store.totals.set(totals(BEFORE_SHIPPING, { grand_total: '52.00' }));
        await mount();

        expect(el.querySelectorAll('[aria-live]').length).toBe(1);
        expect(text(live())).toBe('');

        store.totals.set(totals(WITH_SHIPPING, { grand_total: '61.29' }));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await el.updateComplete;
        expect(text(live())).toBe('Order summary updated. Grand Total €61.29');
        expect(live().getAttribute('aria-live')).toBe('polite');
        expect(live().classList.contains('sr-only')).toBe(true);
    });

    it('announces only where a chain of recomputed totals ended, once the queue settled', async () => {
        store.totals.set(totals(WITH_SHIPPING, { grand_total: '61.29' }));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await mount();
        expect(text(live())).toBe('');

        // A coupon write: the answer recomputes the totals while the settling read is still on its way.
        store.isSettlingTotals.set(true);
        store.totals.set(totals([...WITH_SHIPPING.slice(0, 3), seg('grand_total', 'Grand Total', '55.29')]));
        await el.updateComplete;
        expect(text(live())).toBe('');

        store.totals.set(totals([...WITH_SHIPPING.slice(0, 3), seg('grand_total', 'Grand Total', '51.00')]));
        await el.updateComplete;
        expect(text(live())).toBe('');

        store.isSettlingTotals.set(false);
        await el.updateComplete;
        expect(text(live())).toBe('Order summary updated. Grand Total €51.00');

        // The same total confirmed again (a payment information read) is not announced twice.
        store.totals.set(totals([...WITH_SHIPPING.slice(0, 3), seg('grand_total', 'Grand Total', '51.00')]));
        await el.updateComplete;
        expect(text(live())).toBe('Order summary updated. Grand Total €51.00');
    });

    it('says nothing while the expected totals of an unanswered change are on screen', async () => {
        store.totals.set(totals(WITH_SHIPPING, { grand_total: '61.29' }));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await mount();

        const changed = totals([...WITH_SHIPPING.slice(0, 3), seg('grand_total', 'Grand Total', '66.29')]);
        store.optimisticTotals.set(changed);
        store.totals.set(changed);
        await el.updateComplete;
        expect(text(live())).toBe('');

        store.optimisticTotals.set(null);
        await el.updateComplete;
        expect(text(live())).toBe('Order summary updated. Grand Total €66.29');
    });

    it('a total that settles back to the one first shown is not news', async () => {
        store.totals.set(totals(WITH_SHIPPING, { grand_total: '61.29' }));
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await mount();

        store.isSettlingTotals.set(true);
        store.totals.set(totals([...WITH_SHIPPING.slice(0, 3), seg('grand_total', 'Grand Total', '70.00')]));
        await el.updateComplete;
        store.totals.set(totals(WITH_SHIPPING, { grand_total: '61.29' }));
        store.isSettlingTotals.set(false);
        await el.updateComplete;
        expect(text(live())).toBe('');
    });
});
