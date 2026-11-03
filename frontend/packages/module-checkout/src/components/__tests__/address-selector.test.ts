// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import customerFixture from '../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../address-selector.js';
import type { AddressSelector } from '../address-selector.js';

const SAVED: Address = {
    id: '1',
    customer_id: '1',
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['6146 Honey Bluff Parkway'],
    city: 'Calder',
    postcode: '49628-7978',
    country_id: 'US',
    region_id: '33',
    region: { region: 'Michigan', region_code: 'MI', region_id: 33 },
    telephone: '(555) 229-3326',
    default_shipping: true,
    default_billing: true,
};

async function settle(el: Element): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
        await Promise.all(
            Array.from(el.querySelectorAll('address-selector, address-form, hc-text-input, hc-select-input, hc-checkbox, hc-button'))
                .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve())
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function mount(store: Store): Promise<AddressSelector> {
    const el = document.createElement('address-selector') as AddressSelector;
    el.mode = 'shipping';
    document.body.appendChild(el);
    await settle(el);
    expect(store.shippingAddress.get()?.id).toBe('1');
    return el;
}

function buttons(el: Element): HTMLElement[] {
    return Array.from(el.querySelectorAll<HTMLElement>('hc-button'));
}

function input(el: Element, name: string): HTMLInputElement {
    const node = el.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!node) throw new Error(`no input ${name}`);
    return node;
}

describe('<address-selector> "Add new address"', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(customerFixture as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.isGuest.set(false);
        store.customer.set({ ...(customerFixture as unknown as CheckoutConfig).customerData, firstname: 'Veronica', lastname: 'Costello' } as never);
        store.savedAddresses.set([SAVED]);
        store.selectedShippingAddressId.set('1');
        store.shippingAddress.set(SAVED);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('opens an empty form seeded with the name and telephone only, never the saved id, flagged for the address book', async () => {
        const el = await mount(store);
        buttons(el)[0]!.click();
        await settle(el);

        const form = el.querySelector('address-form');
        expect(form).not.toBeNull();
        expect(input(el, 'firstname').value).toBe('Veronica');
        expect(input(el, 'lastname').value).toBe('Costello');
        expect(input(el, 'telephone').value).toBe('(555) 229-3326');
        expect(input(el, 'street_0').value).toBe('');
        expect(input(el, 'city').value).toBe('');
        expect(input(el, 'postcode').value).toBe('');
        const box = el.querySelector('hc-checkbox[name="save_in_address_book"]') as (HTMLElement & { checked: boolean }) | null;
        expect(box?.checked).toBe(true);

        // The store now holds the new address: no saved identity, flagged for saving.
        const current = store.shippingAddress.get();
        expect(store.selectedShippingAddressId.get()).toBeNull();
        expect(current).not.toHaveProperty('id');
        expect(current).not.toHaveProperty('customer_id');
        expect(current?.save_in_address_book).toBe(true);
        expect(current?.country_id).toBe((customerFixture as unknown as CheckoutConfig).defaultCountryId);
    });

    it('keeps what the shopper types across re-renders and still emits no id', async () => {
        const el = await mount(store);
        buttons(el)[0]!.click();
        await settle(el);

        const city = input(el, 'city');
        city.value = 'Austin';
        city.dispatchEvent(new Event('input', { bubbles: true }));
        await settle(el);
        expect(store.shippingAddress.get()?.city).toBe('Austin');

        // Any store change re-renders the selector; the typed value must survive.
        store.totals.set({ grand_total: '1' } as never);
        await settle(el);
        expect(input(el, 'city').value).toBe('Austin');
        expect(store.shippingAddress.get()).not.toHaveProperty('id');
        expect(store.shippingAddress.get()?.firstname).toBe('Veronica');
    });

    it('selecting a saved card again restores the saved address with its id', async () => {
        const el = await mount(store);
        buttons(el)[0]!.click();
        await settle(el);
        expect(store.shippingAddress.get()).not.toHaveProperty('id');

        const radio = el.querySelector<HTMLInputElement>('input[type="radio"]')!;
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        await settle(el);

        expect(store.selectedShippingAddressId.get()).toBe('1');
        expect(store.shippingAddress.get()?.id).toBe('1');
        expect(el.querySelector('address-form')).toBeNull();
    });
});
