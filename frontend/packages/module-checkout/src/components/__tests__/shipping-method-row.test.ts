// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { ShippingMethod } from '../../types/shipping.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../shipping-method-row.js';
import { isUsableShippingRate, type ShippingMethodRow } from '../shipping-method-row.js';

const RATE: ShippingMethod = {
    carrier_code: 'flatrate',
    method_code: 'flatrate',
    carrier_title: 'Flat Rate',
    method_title: 'Fixed',
    amount: 5,
    base_amount: 5,
    available: true,
    error_message: '',
    price_excl_tax: 5,
    price_incl_tax: 6.1,
};

const ERROR_RATE: ShippingMethod = {
    ...RATE,
    carrier_code: 'ups',
    method_code: '',
    carrier_title: 'United Parcel Service',
    method_title: '',
    available: false,
    error_message: 'This shipping method is not available for the address.',
};

describe('<shipping-method-row>', () => {
    async function mount(method: ShippingMethod, props: Partial<ShippingMethodRow> = {}, config: Partial<CheckoutConfig> = {}): Promise<ShippingMethodRow> {
        setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), ...config });
        const el = document.createElement('shipping-method-row') as ShippingMethodRow;
        el.method = method;
        Object.assign(el, props);
        document.body.appendChild(el);
        await el.updateComplete;
        return el;
    }

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('titles a rate "Carrier: Method" and prints the price the store shows', async () => {
        const el = await mount(RATE, {}, { isDisplayShippingPriceExclTax: false });
        expect(text(el.querySelector('[data-shipping-method-title]'))).toBe('Flat Rate: Fixed');
        expect(text(el.querySelector('[data-shipping-method-price]'))).toBe('€6.10');

        const excl = await mount({ ...RATE, method_code: 'excl' }, {}, { isDisplayShippingPriceExclTax: true });
        expect(text(excl.querySelector('[data-shipping-method-price]'))).toBe('€5.00');
    });

    it('spells out both prices in one phrase when the store shows both', async () => {
        const el = await mount(RATE, {}, { isDisplayShippingBothPrices: true });
        expect(text(el.querySelector('[data-shipping-method-price]'))).toBe('€5.00 excl. tax, €6.10 incl. tax');
    });

    it('prints one price when both are equal and "Free" for a zero price', async () => {
        const same = await mount({ ...RATE, price_incl_tax: 5 }, {}, { isDisplayShippingBothPrices: true });
        expect(text(same.querySelector('[data-shipping-method-price]'))).toBe('€5.00');

        const free = await mount({ ...RATE, method_code: 'free', amount: 0, price_excl_tax: 0, price_incl_tax: 0 });
        expect(text(free.querySelector('[data-shipping-method-price]'))).toBe('Free');
    });

    it('prints only the method under a carrier subheading and keeps the carrier in the accessible name', async () => {
        const el = await mount(RATE, { grouped: true });
        const title = el.querySelector('[data-shipping-method-title]')!;
        expect(text(title)).toBe('Flat Rate: Fixed');
        expect(text(title.querySelector('.sr-only'))).toBe('Flat Rate:');
    });

    it('checks the radio of the selected rate and reports a choice', async () => {
        const el = await mount(RATE, { selected: true });
        const radio = el.querySelector<HTMLInputElement>('input[type="radio"]')!;
        expect(radio.checked).toBe(true);
        expect(radio.disabled).toBe(false);

        const onSelect = vi.fn();
        el.addEventListener('method-select', (e) => onSelect((e as CustomEvent).detail));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        expect(onSelect).toHaveBeenCalledWith({ carrier_code: 'flatrate', method_code: 'flatrate' });
    });

    it('keeps the selection and disables the radio while the list is refreshed', async () => {
        const el = await mount(RATE, { selected: true, disabled: true });
        const radio = el.querySelector<HTMLInputElement>('input[type="radio"]')!;
        expect(radio.checked).toBe(true);
        expect(radio.disabled).toBe(true);
        expect(el.querySelector('label')!.classList.contains('cursor-pointer')).toBe(false);
    });

    it('shows a carrier error with its message, no price, no pointer and a described, disabled radio', async () => {
        const el = await mount(ERROR_RATE, { selected: true });
        const radio = el.querySelector<HTMLInputElement>('input[type="radio"]')!;
        const message = document.getElementById(radio.getAttribute('aria-describedby') ?? '');

        expect(isUsableShippingRate(ERROR_RATE)).toBe(false);
        expect(text(el.querySelector('[data-shipping-method-title]'))).toBe('United Parcel Service');
        expect(text(message)).toBe('This shipping method is not available for the address.');
        expect(el.querySelector('[data-shipping-method-price]')).toBeNull();
        expect(radio.disabled).toBe(true);
        expect(radio.checked).toBe(false);
        expect(el.querySelector('label')!.classList.contains('cursor-pointer')).toBe(false);
    });
});
