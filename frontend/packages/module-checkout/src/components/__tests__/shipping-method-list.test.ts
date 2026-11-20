// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const selectShippingMethod = vi.fn();
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ selectShippingMethod }),
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { ShippingMethod } from '../../types/shipping.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../shipping-method-list.js';
import type { ShippingMethodList } from '../shipping-method-list.js';

function rate(carrier: string, method: string, price: number, titles: [string, string] = [carrier, method]): ShippingMethod {
    return {
        carrier_code: carrier,
        method_code: method,
        carrier_title: titles[0],
        method_title: titles[1],
        amount: price,
        base_amount: price,
        available: true,
        error_message: '',
        price_excl_tax: price,
        price_incl_tax: price,
    };
}

const FLATRATE = rate('flatrate', 'flatrate', 5, ['Flat Rate', 'Fixed']);
const TABLERATE = rate('tablerate', 'bestway', 7, ['Best Way', 'Table Rate']);
const UPS_ERROR: ShippingMethod = {
    ...rate('ups', '', 0, ['United Parcel Service', '']),
    available: false,
    error_message: 'Not available for this address.',
};

describe('<shipping-method-list> by the state of the estimate', () => {
    let store: Store;
    let el: ShippingMethodList;

    async function settle(): Promise<void> {
        await el.updateComplete;
        await Promise.all(Array.from(el.querySelectorAll('shipping-method-row')).map((row) => row.updateComplete));
    }

    beforeEach(async () => {
        selectShippingMethod.mockReset();
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        el = document.createElement('shipping-method-list') as ShippingMethodList;
        document.body.appendChild(el);
        await settle();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const rows = (): Element[] => Array.from(el.querySelectorAll('shipping-method-row'));
    const radios = (): HTMLInputElement[] => Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const progress = (): Element => el.querySelector('[data-shipping-methods-progress]')!;
    const block = (): Element => el.querySelector('[data-estimate-state]')!;

    it('idle: says what the address needs and shows no rate of an earlier address', async () => {
        store.availableShippingMethods.set([FLATRATE]);
        store.estimateState.set('idle');
        await settle();

        expect(text(el.querySelector('[data-shipping-methods-idle]')))
            .toBe('Enter your country and postcode to see shipping options.');
        expect(rows()).toHaveLength(0);
        expect(el.querySelector('[role="radiogroup"]')).toBeNull();
        expect(text(progress())).toBe('');
    });

    it('loading without rows: two placeholder rows of the height of a real row, announced once', async () => {
        store.estimateState.set('loading');
        await settle();

        const placeholders = Array.from(el.querySelectorAll('[data-shipping-methods-loading] > div'));
        expect(placeholders).toHaveLength(2);
        expect(placeholders.every((p) => p.classList.contains('h-[2.875rem]'))).toBe(true);
        expect(el.querySelector('[data-shipping-methods-loading]')!.getAttribute('aria-hidden')).toBe('true');
        expect(el.querySelector('[data-shipping-methods-idle]')).toBeNull();
        expect(text(progress())).toBe(enUS['Hyperion_Checkout::shipping_calculating']);
        expect(el.querySelectorAll('[role="status"]')).toHaveLength(1);
    });

    it('ready: the rows in one radio group, the selected one checked, a click handed to the flow', async () => {
        store.availableShippingMethods.set([FLATRATE, TABLERATE]);
        store.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
        store.estimateState.set('ready');
        await settle();

        const group = el.querySelector('[role="radiogroup"]')!;
        expect(group.hasAttribute('aria-busy')).toBe(false);
        expect(group.classList.contains('opacity-60')).toBe(false);
        expect(rows().map((row) => text(row.querySelector('[data-shipping-method-title]'))))
            .toEqual(['Flat Rate: Fixed', 'Best Way: Table Rate']);
        expect(radios().map((radio) => [radio.checked, radio.disabled])).toEqual([[false, false], [true, false]]);
        expect(el.querySelector('[data-shipping-carrier]')).toBeNull();
        expect(el.querySelector('[data-shipping-methods-loading]')).toBeNull();
        expect(text(progress())).toBe('');

        radios()[0]!.dispatchEvent(new Event('change', { bubbles: true }));
        expect(selectShippingMethod).toHaveBeenCalledWith({ carrier_code: 'flatrate', method_code: 'flatrate' });
    });

    it('refresh: the rows stay, dimmed and busy, their radios disabled, the text in the status outside the group', async () => {
        store.availableShippingMethods.set([FLATRATE, TABLERATE]);
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.estimateState.set('ready');
        await settle();
        const before = rows();

        store.estimateState.set('loading');
        await settle();

        const group = el.querySelector('[role="radiogroup"]')!;
        expect(group.getAttribute('aria-busy')).toBe('true');
        expect(group.classList.contains('opacity-60')).toBe(true);
        expect(radios().map((radio) => [radio.checked, radio.disabled])).toEqual([[true, true], [false, true]]);
        expect(el.querySelector('[data-shipping-methods-loading]')).toBeNull();
        expect(text(progress())).toBe(enUS['Hyperion_Checkout::shipping_updating']);
        expect(group.contains(progress())).toBe(false);
        // Keyed rows: the same elements, not new ones.
        expect(rows()).toEqual(before);
    });

    it('empty: says that nothing serves the address and lists the carriers\' messages', async () => {
        store.availableShippingMethods.set([UPS_ERROR]);
        store.estimateState.set('empty');
        await settle();

        expect(text(el.querySelector('[data-shipping-methods-none]')))
            .toBe('No shipping method is available for this address. Check the country and postcode, or contact us.');
        expect(rows()).toHaveLength(1);
        expect(text(rows()[0]!)).toContain('Not available for this address.');
        expect(radios().every((radio) => radio.disabled && !radio.checked)).toBe(true);
    });

    it('error: the list of the other address is not shown, the section status has the place', async () => {
        store.availableShippingMethods.set([FLATRATE]);
        store.estimateState.set('error');
        await settle();

        expect(rows()).toHaveLength(0);
        expect(el.querySelector('[data-shipping-methods-none]')).toBeNull();
        expect(el.querySelector('[data-shipping-methods-idle]')).toBeNull();
        expect(block().querySelector('hc-section-status')!.getAttribute('section')).toBe('shipping-methods');
    });

    it('keeps the height of two rows in every state', async () => {
        for (const state of ['idle', 'loading', 'ready', 'empty', 'error'] as const) {
            store.estimateState.set(state);
            await settle();
            expect(block().classList.contains('min-h-[6.25rem]'), state).toBe(true);
            expect(block().getAttribute('data-estimate-state')).toBe(state);
        }
    });

    it('groups the methods of one carrier under a presentational subheading', async () => {
        store.availableShippingMethods.set([
            rate('ups', 'ground', 9, ['UPS', 'Ground']),
            FLATRATE,
            rate('ups', 'air', 19, ['UPS', 'Next Day Air']),
            UPS_ERROR,
        ]);
        store.estimateState.set('ready');
        await settle();

        const headings = Array.from(el.querySelectorAll('[data-shipping-carrier]'));
        expect(headings.map((h) => [text(h), h.getAttribute('aria-hidden')])).toEqual([['UPS', 'true']]);
        expect(headings[0]!.nextElementSibling).toBe(rows()[0]);
        expect(rows().map((row) => text(row.querySelector('[data-shipping-method-title]'))))
            .toEqual(['UPS: Ground', 'Flat Rate: Fixed', 'UPS: Next Day Air', 'United Parcel Service']);
        expect(rows().map((row) => row.querySelector('[data-shipping-method-title] .sr-only') !== null))
            .toEqual([true, false, true, false]);
    });
});
