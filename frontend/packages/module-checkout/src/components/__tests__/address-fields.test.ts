// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddressFieldConfig as DeclaredField } from '../../../extension-api.js';
import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { hydrateStore } from '../../store/hydrate.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { requestValidation, resetValidationRequestsForTests } from '../../store/validation-request.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig, GuestQuoteConfig } from '../../types/config.js';
import { isAddressComplete, missingAddressFields } from '../../utils/address-validation.js';
import { setActiveCatalogForTests, t } from '../../utils/i18n.js';
import { fieldProblem } from '../address-fields.js';
import '../address-form.js';
import type { AddressForm } from '../address-form.js';

function declared(overrides: Partial<DeclaredField>): DeclaredField {
    return {
        code: 'fiscal_code',
        label: 'Fiscal code',
        type: 'text',
        target: 'custom_attributes',
        forms: ['billing'],
        required: true,
        pattern: '[A-Z0-9]{16}',
        maxLength: 16,
        options: [],
        countries: ['IT'],
        autocomplete: null,
        hint: '16 letters and digits',
        sortOrder: 10,
        ...overrides,
    };
}

const FIELDS: readonly DeclaredField[] = [
    declared({}),
    declared({
        code: 'sdi_code',
        label: 'SDI code',
        target: 'extension_attributes',
        forms: ['shipping', 'billing'],
        required: false,
        pattern: null,
        maxLength: 7,
        countries: [],
        hint: null,
        sortOrder: 20,
    }),
    declared({
        code: 'invoice_requested',
        label: 'I need an invoice',
        type: 'checkbox',
        target: 'extension_attributes',
        forms: ['billing'],
        required: false,
        pattern: null,
        maxLength: null,
        countries: [],
        hint: null,
        sortOrder: 5,
    }),
];

const ITALIAN: Address = {
    firstname: 'Giulia',
    lastname: 'Rossi',
    street: ['Via Roma 1'],
    city: 'Milano',
    postcode: '20121',
    country_id: 'IT',
    telephone: '0212345678',
};

function installConfig(fields: readonly DeclaredField[] = FIELDS, extra: Partial<CheckoutConfig['hyperion']> = {}): void {
    const base = guestFixture as unknown as CheckoutConfig;
    setCheckoutConfig({
        ...base,
        directoryData: {},
        hyperion: { ...base.hyperion, addressFields: fields, ...extra },
    } as unknown as CheckoutConfig);
}

async function settle(el: Element): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await Promise.all(Array.from(el.querySelectorAll('*'))
            .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve()));
    }
}

async function mount(mode: 'shipping' | 'billing', value: Address): Promise<AddressForm> {
    const el = document.createElement('address-form') as AddressForm;
    el.mode = mode;
    el.value = value;
    document.body.appendChild(el);
    await el.updateComplete;
    await settle(el);
    return el;
}

function codesShown(el: Element): string[] {
    return Array.from(el.querySelectorAll('[data-address-field]')).map((node) => node.getAttribute('data-address-field') ?? '');
}

describe('declared address fields', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        installConfig();
        store = createStore();
        resetValidationRequestsForTests();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('renders the fields of the form and the country after the built-in fields, in sort order', async () => {
        let el = await mount('billing', ITALIAN);
        expect(codesShown(el)).toEqual(['invoice_requested', 'fiscal_code', 'sdi_code']);
        const names = Array.from(el.querySelectorAll('input, select')).map((node) => node.getAttribute('name'));
        expect(names.indexOf('fiscal_code')).toBeGreaterThan(names.indexOf('telephone'));

        document.body.innerHTML = '';
        el = await mount('billing', { ...ITALIAN, country_id: 'DE' });
        expect(codesShown(el)).toEqual(['invoice_requested', 'sdi_code']);

        document.body.innerHTML = '';
        el = await mount('shipping', ITALIAN);
        expect(codesShown(el)).toEqual(['sdi_code']);
    });

    it('shows the billing fields on the shipping form while the shipping address is also the billing address', async () => {
        setStoreForTests(store);
        store.billingSameAsShipping.set(true);
        const el = await mount('shipping', ITALIAN);
        expect(codesShown(el)).toEqual(['invoice_requested', 'fiscal_code', 'sdi_code']);
    });

    it('uses the form controls: unique ids, required state, hint, error on blur, values in the address', async () => {
        const el = await mount('billing', ITALIAN);
        const addresses: Address[] = [];
        el.addEventListener('address-change', (e) => addresses.push((e as CustomEvent<Address>).detail));
        const input = el.querySelector<HTMLInputElement>('input[name="fiscal_code"]')!;
        expect(input.id).toBe('hc-billing-fiscal_code');
        expect(input.getAttribute('aria-required')).toBe('true');
        expect(el.querySelector(`#${input.getAttribute('aria-describedby') ?? 'none'}`)?.textContent).toBe('16 letters and digits');

        input.dispatchEvent(new Event('blur'));
        await settle(el);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(el.querySelector('#hc-billing-fiscal_code-msg')?.textContent).toBe(t('Hyperion_Checkout::validation_required'));

        input.value = 'RSSGLI80A41F205X';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const sdi = el.querySelector<HTMLInputElement>('input[name="sdi_code"]')!;
        sdi.value = 'ABC1234';
        sdi.dispatchEvent(new Event('input', { bubbles: true }));
        const box = el.querySelector<HTMLInputElement>('input[name="invoice_requested"]')!;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));

        const last = addresses.at(-1)!;
        expect(last.custom_attributes).toEqual([{ attribute_code: 'fiscal_code', value: 'RSSGLI80A41F205X' }]);
        expect(last.extension_attributes).toEqual({ sdi_code: 'ABC1234', invoice_requested: true });
        expect(isAddressComplete(last, undefined, 'billing')).toBe(true);
    });

    it('reveals every declared error once Place Order asked for a validation', async () => {
        const el = await mount('billing', ITALIAN);
        requestValidation();
        el.requestUpdate();
        await settle(el);
        expect(el.querySelector<HTMLInputElement>('input[name="fiscal_code"]')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('joins the one completeness predicate per form and country', () => {
        expect(missingAddressFields(ITALIAN, undefined, 'billing')).toContain('fiscal_code');
        expect(missingAddressFields(ITALIAN, undefined, 'shipping')).not.toContain('fiscal_code');
        expect(missingAddressFields({ ...ITALIAN, country_id: 'DE' }, undefined, 'billing')).toEqual([]);

        const withCode = (value: string): Address => ({ ...ITALIAN, custom_attributes: [{ attribute_code: 'fiscal_code', value }] });
        expect(missingAddressFields(withCode('rss'), undefined, 'billing')).toEqual(['fiscal_code']);
        expect(missingAddressFields(withCode('RSSGLI80A41F205X'), undefined, 'billing')).toEqual([]);
        expect(fieldProblem(FIELDS[0]!, 'RSSGLI80A41F205XX')).toBe('length');
        expect(fieldProblem(FIELDS[0]!, 'rssgli80a41f205x')).toBe('format');
        expect(fieldProblem({ ...FIELDS[0]!, maxLength: null, pattern: '[A-Z]{2}' }, 'XABX')).toBe('format');
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(fieldProblem({ ...FIELDS[0]!, pattern: '(?<=A' }, 'RSSGLI80A41F205X')).toBe('format');
        errors.mockRestore();
        expect(fieldProblem(FIELDS[2]!, false)).toBeNull();
        expect(fieldProblem({ ...FIELDS[2]!, required: true }, '0')).toBe('required');
    });

    it('judges an address by the part it plays when the caller names no form', () => {
        setStoreForTests(store);
        store.shippingAddress.set(ITALIAN);
        expect(isAddressComplete(ITALIAN)).toBe(false);
        store.billingSameAsShipping.set(false);
        expect(isAddressComplete(ITALIAN)).toBe(true);
        store.billingAddress.set({ ...ITALIAN });
        expect(isAddressComplete(store.billingAddress.get())).toBe(false);
    });

    it('carries the values of the declared fields of a quote address through the hydration', () => {
        const base = guestFixture as unknown as CheckoutConfig;
        const raw = {
            firstname: 'Giulia',
            lastname: 'Rossi',
            street: ['Via Roma 1'],
            city: 'Milano',
            postcode: '20121',
            country_id: 'IT',
            telephone: '0212345678',
            custom_attributes: [{ attribute_code: 'fiscal_code', value: 'RSSGLI80A41F205X' }],
            extension_attributes: { sdi_code: 'ABC1234' },
        };
        const guestQuote: GuestQuoteConfig = { email: 'giulia@example.com', shippingAddress: raw, billingAddress: { ...raw, extension_attributes: undefined } };
        hydrateStore(store, {
            ...base,
            hyperion: { ...base.hyperion, addressFields: FIELDS, guestQuote },
        } as unknown as CheckoutConfig);
        expect(store.shippingAddress.get()?.custom_attributes).toEqual([{ attribute_code: 'fiscal_code', value: 'RSSGLI80A41F205X' }]);
        expect(store.shippingAddress.get()?.extension_attributes).toEqual({ sdi_code: 'ABC1234' });
        expect(store.billingAddress.get()?.custom_attributes).toEqual([{ attribute_code: 'fiscal_code', value: 'RSSGLI80A41F205X' }]);
        expect(store.billingAddress.get()).not.toHaveProperty('extension_attributes');
    });
});
