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

describe('<address-selector> saved address step', () => {
    let store: Store;

    const SECOND: Address = {
        ...SAVED,
        id: '2',
        street: ['1 Second Street'],
        city: 'Austin',
        default_shipping: false,
        default_billing: false,
    };

    const DIRECTORY = {
        US: { name: 'United States', is_region_required: true, regions: { 33: { code: 'MI', name: 'Michigan' } } },
        DE: { name: 'Germany', is_region_required: false },
    };

    async function mountBare(mode: 'shipping' | 'billing' = 'shipping'): Promise<{ el: AddressSelector; picks: Address[] }> {
        const el = document.createElement('address-selector') as AddressSelector;
        el.mode = mode;
        const picks: Address[] = [];
        el.addEventListener('saved-address-select', (e) => picks.push((e as CustomEvent<{ address: Address }>).detail.address));
        document.body.appendChild(el);
        await settle(el);
        return { el, picks };
    }

    function button(el: Element, marker: string): HTMLButtonElement {
        const node = el.querySelector<HTMLButtonElement>(`hc-button[${marker}] button`);
        if (!node) throw new Error(`no button ${marker}`);
        return node;
    }

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig({ ...(customerFixture as unknown as CheckoutConfig), directoryData: DIRECTORY } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.isGuest.set(false);
        store.customer.set({ ...(customerFixture as unknown as CheckoutConfig).customerData, firstname: 'Veronica', lastname: 'Costello' } as never);
        store.savedAddresses.set([SAVED, SECOND]);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('renders the cards as one labeled radio group with the country by name', async () => {
        store.selectedShippingAddressId.set('1');
        store.shippingAddress.set(SAVED);
        const { el } = await mountBare();
        const group = el.querySelector('[role="radiogroup"]')!;
        expect(group.getAttribute('aria-label')).toBe('Shipping Address');
        expect(group.querySelectorAll('input[type="radio"]').length).toBe(2);
        expect(group.querySelector('address-card')?.textContent).toContain('United States');
        expect(group.querySelector('address-card')?.textContent).not.toMatch(/\bUS\b/);
    });

    it('"Cancel" gives back the card that was selected and tells the step', async () => {
        store.selectedShippingAddressId.set('2');
        store.shippingAddress.set(SECOND);
        const { el, picks } = await mountBare();
        button(el, 'data-hyperion-address-new').click();
        await settle(el);
        expect(store.selectedShippingAddressId.get()).toBeNull();
        expect(store.shippingAddress.get()).not.toHaveProperty('id');

        button(el, 'data-hyperion-address-cancel').click();
        await settle(el);
        expect(el.querySelector('address-form')).toBeNull();
        expect(store.selectedShippingAddressId.get()).toBe('2');
        expect(store.shippingAddress.get()).toBe(SECOND);
        expect(picks).toEqual([SECOND]);
        const radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
        expect(radios.map((r) => r.checked)).toEqual([false, true]);
    });

    it('opening the new form makes the shipping step wait for an address again (shipping mode only)', async () => {
        store.selectedShippingAddressId.set('1');
        store.shippingAddress.set(SAVED);
        store.estimateState.set('ready');
        const shipping = await mountBare();
        button(shipping.el, 'data-hyperion-address-new').click();
        expect(store.estimateState.get()).toBe('idle');

        document.body.innerHTML = '';
        store.estimateState.set('ready');
        store.selectedBillingAddressId.set('1');
        store.billingAddress.set(SAVED);
        const billing = await mountBare('billing');
        button(billing.el, 'data-hyperion-address-new').click();
        expect(store.estimateState.get()).toBe('ready');
    });

    it('without a default address the first saved address of an allowed country is selected at mount', async () => {
        const abroad: Address = { ...SAVED, id: '9', country_id: 'ZZ' };
        store.savedAddresses.set([abroad, SECOND, SAVED]);
        const { el, picks } = await mountBare();
        expect(store.selectedShippingAddressId.get()).toBe('2');
        expect(store.shippingAddress.get()).toBe(SECOND);
        expect(picks).toEqual([SECOND]);
        expect(el.querySelector('address-form')).toBeNull();
    });

    it('a customer without saved addresses gets the form with the name and the address book box ticked', async () => {
        store.savedAddresses.set([]);
        const { el } = await mountBare();
        expect(el.querySelector('[role="radiogroup"]')).toBeNull();
        expect(input(el, 'firstname').value).toBe('Veronica');
        expect(input(el, 'lastname').value).toBe('Costello');
        const box = el.querySelector('hc-checkbox[name="save_in_address_book"]') as (HTMLElement & { checked: boolean }) | null;
        expect(box?.checked).toBe(true);
        expect(store.shippingAddress.get()?.save_in_address_book).toBe(true);
        expect(store.shippingAddress.get()).not.toHaveProperty('id');
    });

    it('a typed address already in the store opens the form filled from it and nothing is emitted at mount', async () => {
        const typed: Address = {
            firstname: 'Veronica',
            lastname: 'Costello',
            street: ['12 Typed Road'],
            city: 'Lansing',
            postcode: '48901',
            country_id: 'US',
            region_id: '33',
            telephone: '555',
            save_in_address_book: false,
        };
        for (const saved of [[SAVED, SECOND], []] as const) {
            document.body.innerHTML = '';
            store.savedAddresses.set(saved);
            store.selectedShippingAddressId.set(null);
            store.shippingAddress.set(typed);
            const el = document.createElement('address-selector') as AddressSelector;
            el.mode = 'shipping';
            const changes: unknown[] = [];
            const picks: unknown[] = [];
            el.addEventListener('address-change', (e) => changes.push((e as CustomEvent).detail));
            el.addEventListener('saved-address-select', (e) => picks.push((e as CustomEvent).detail));
            document.body.appendChild(el);
            await settle(el);

            expect(el.querySelector('address-form')).not.toBeNull();
            expect(input(el, 'street_0').value).toBe('12 Typed Road');
            expect(input(el, 'city').value).toBe('Lansing');
            const box = el.querySelector('hc-checkbox[name="save_in_address_book"]') as (HTMLElement & { checked: boolean }) | null;
            expect(box?.checked).toBe(false);
            expect(changes).toEqual([]);
            expect(picks).toEqual([]);
            expect(store.shippingAddress.get()).toBe(typed);
            expect(store.selectedShippingAddressId.get()).toBeNull();
            if (saved.length > 0) {
                const radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
                expect(radios.some((r) => r.checked)).toBe(false);
            }
        }
    });

    it('a saved address that lacks a required field names it, and "Edit" opens the form on a copy without its id', async () => {
        const incomplete: Address = { ...SECOND, id: '3', region_id: null, region: null, telephone: '' };
        store.savedAddresses.set([SAVED, incomplete]);
        store.selectedShippingAddressId.set('1');
        store.shippingAddress.set(SAVED);
        const { el } = await mountBare();

        expect(el.querySelector('[data-hyperion-address-card="1"] [data-hyperion-address-incomplete]')).toBeNull();
        const notice = el.querySelector('[data-hyperion-address-card="3"] [data-hyperion-address-incomplete]');
        expect(notice?.textContent?.trim()).toBe('This address is missing: State/Province, Phone Number.');

        button(el, 'data-hyperion-address-edit').click();
        await settle(el);
        // One form at a time: no second "Edit" while it is open.
        expect(el.querySelector('[data-hyperion-address-edit]')).toBeNull();
        expect(input(el, 'street_0').value).toBe('1 Second Street');
        expect(input(el, 'city').value).toBe('Austin');
        const current = store.shippingAddress.get();
        expect(current).not.toHaveProperty('id');
        expect(current).not.toHaveProperty('customer_id');
        expect(current?.save_in_address_book).toBe(true);
        expect(store.selectedShippingAddressId.get()).toBeNull();

        button(el, 'data-hyperion-address-cancel').click();
        await settle(el);
        expect(store.selectedShippingAddressId.get()).toBe('1');
    });
});
