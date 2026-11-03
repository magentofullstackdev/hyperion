// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig, NameFieldsConfig } from '../../types/config.js';
import { requestValidation, resetValidationRequestsForTests } from '../../store/validation-request.js';
import { setActiveCatalogForTests, t } from '../../utils/i18n.js';
import '../address-form.js';
import type { AddressForm } from '../address-form.js';

function installConfig(nameFields?: NameFieldsConfig): void {
    const base = guestFixture as unknown as CheckoutConfig;
    setCheckoutConfig({
        ...base,
        hyperion: { ...base.hyperion, ...(nameFields ? { nameFields } : {}) },
    });
}

const BASE_ADDRESS: Address = {
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['6146 Honey Bluff Parkway'],
    city: 'Calder',
    postcode: '49628-7978',
    country_id: 'US',
    region_id: '33',
    telephone: '(555) 229-3326',
};

async function mount(value: Address | null = null): Promise<AddressForm> {
    const el = document.createElement('address-form') as AddressForm;
    if (value) el.value = value;
    document.body.appendChild(el);
    await el.updateComplete;
    // Nested hc-* inputs render on their own update cycle.
    await Promise.all(
        Array.from(el.querySelectorAll('hc-text-input, hc-select-input')).map(
            (child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete
        )
    );
    return el;
}

function field(el: Element, name: string): HTMLInputElement | HTMLSelectElement | null {
    return el.querySelector<HTMLInputElement | HTMLSelectElement>(`input[name="${name}"], select[name="${name}"]`);
}

describe('<address-form> name prefix / middle name / suffix', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders none of the fields when the section is absent or set to no', async () => {
        installConfig();
        let el = await mount(BASE_ADDRESS);
        expect(field(el, 'prefix')).toBeNull();
        expect(field(el, 'middlename')).toBeNull();
        expect(field(el, 'suffix')).toBeNull();

        installConfig({ prefix: { show: 'no', options: ['Mr'] }, middlename: { show: 'no' }, suffix: { show: 'no' } });
        document.body.innerHTML = '';
        el = await mount(BASE_ADDRESS);
        expect(field(el, 'prefix')).toBeNull();
        expect(field(el, 'suffix')).toBeNull();
    });

    it('renders a required select with the configured options', async () => {
        installConfig({
            prefix: { show: 'req', options: ['Mr', 'Mrs', 'Ms'] },
            middlename: { show: 'opt' },
            suffix: { show: 'opt', options: ['Jr', 'Sr'] },
        });
        const el = await mount(BASE_ADDRESS);

        const prefix = field(el, 'prefix') as HTMLSelectElement;
        expect(prefix.tagName).toBe('SELECT');
        expect(prefix.required).toBe(true);
        expect(Array.from(prefix.options).map((o) => o.value)).toEqual(['', 'Mr', 'Mrs', 'Ms']);

        const middlename = field(el, 'middlename') as HTMLInputElement;
        expect(middlename.tagName).toBe('INPUT');
        expect(middlename.required).toBe(false);
        expect(middlename.autocomplete).toBe('additional-name');

        const suffix = field(el, 'suffix') as HTMLSelectElement;
        expect(suffix.tagName).toBe('SELECT');
        expect(suffix.required).toBe(false);
    });

    it('renders a text input when no option list is configured', async () => {
        installConfig({ prefix: { show: 'opt', options: [] }, middlename: { show: 'no' }, suffix: { show: 'req' } });
        const el = await mount(BASE_ADDRESS);
        const prefix = field(el, 'prefix') as HTMLInputElement;
        expect(prefix.tagName).toBe('INPUT');
        expect(prefix.autocomplete).toBe('honorific-prefix');
        expect(prefix.required).toBe(false);
        const suffix = field(el, 'suffix') as HTMLInputElement;
        expect(suffix.tagName).toBe('INPUT');
        expect(suffix.required).toBe(true);
    });

    it('holds address-valid back until a required prefix is chosen and emits it in the address', async () => {
        installConfig({ prefix: { show: 'req', options: ['Mr', 'Mrs'] }, middlename: { show: 'no' }, suffix: { show: 'no' } });
        const el = await mount();
        const valid: boolean[] = [];
        const addresses: Address[] = [];
        el.addEventListener('address-valid', (e) => valid.push((e as CustomEvent<boolean>).detail));
        el.addEventListener('address-change', (e) => addresses.push((e as CustomEvent<Address>).detail));

        el.value = BASE_ADDRESS;
        await el.updateComplete;
        // Any field edit re-evaluates completeness.
        const city = field(el, 'city') as HTMLInputElement;
        city.value = 'Calder';
        city.dispatchEvent(new Event('input', { bubbles: true }));
        expect(valid.at(-1)).toBe(false);

        const prefix = field(el, 'prefix') as HTMLSelectElement;
        prefix.value = 'Mrs';
        prefix.dispatchEvent(new Event('change', { bubbles: true }));
        expect(valid.at(-1)).toBe(true);
        expect(addresses.at(-1)?.prefix).toBe('Mrs');
    });

    it('prefills the fields from the given address and keeps an unlisted stored value selectable', async () => {
        installConfig({
            prefix: { show: 'opt', options: ['Mr', 'Mrs'] },
            middlename: { show: 'opt' },
            suffix: { show: 'opt', options: [] },
        });
        const el = await mount({ ...BASE_ADDRESS, prefix: 'Dr', middlename: 'Anne', suffix: 'PhD' });
        const prefix = field(el, 'prefix') as HTMLSelectElement;
        expect(Array.from(prefix.options).map((o) => o.value)).toEqual(['', 'Dr', 'Mr', 'Mrs']);
        expect(prefix.value).toBe('Dr');
        expect((field(el, 'middlename') as HTMLInputElement).value).toBe('Anne');
        expect((field(el, 'suffix') as HTMLInputElement).value).toBe('PhD');
    });
});

describe('<address-form> save_in_address_book initial state (R7)', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        installConfig();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('a new address of a customer is flagged for the address book and the checkbox shows it', async () => {
        const el = document.createElement('address-form') as AddressForm;
        el.showSaveInAddressBook = true;
        const emitted: Address[] = [];
        el.addEventListener('address-change', (e) => emitted.push((e as CustomEvent<Address>).detail));
        document.body.appendChild(el);
        await el.updateComplete;

        expect(emitted.at(-1)?.save_in_address_book).toBe(true);
        const box = el.querySelector('hc-checkbox[name="save_in_address_book"]') as (HTMLElement & { checked: boolean }) | null;
        expect(box?.checked).toBe(true);
    });

    it('a guest address is never flagged', async () => {
        const el = document.createElement('address-form') as AddressForm;
        const emitted: Address[] = [];
        el.addEventListener('address-change', (e) => emitted.push((e as CustomEvent<Address>).detail));
        document.body.appendChild(el);
        await el.updateComplete;

        expect(emitted.at(-1)?.save_in_address_book).toBe(false);
        expect(el.querySelector('hc-checkbox[name="save_in_address_book"]')).toBeNull();
    });

    it('unticking the box is reflected in the emitted address', async () => {
        const el = document.createElement('address-form') as AddressForm;
        el.showSaveInAddressBook = true;
        document.body.appendChild(el);
        await el.updateComplete;
        const emitted: Address[] = [];
        el.addEventListener('address-change', (e) => emitted.push((e as CustomEvent<Address>).detail));

        const box = el.querySelector('hc-checkbox[name="save_in_address_book"]')!;
        box.dispatchEvent(new CustomEvent('value-change', { detail: { checked: false }, bubbles: true }));

        expect(emitted.at(-1)?.save_in_address_book).toBe(false);
    });
});

describe('<address-form> mounted with an address', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        installConfig();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function mountListening(value: Address): { el: AddressForm; emitted: Address[] } {
        const el = document.createElement('address-form') as AddressForm;
        const emitted: Address[] = [];
        el.addEventListener('address-change', (e) => emitted.push((e as CustomEvent<Address>).detail));
        el.value = value;
        document.body.appendChild(el);
        return { el, emitted };
    }

    it('a complete hydrated address emits nothing at mount and fills the fields', async () => {
        const { el, emitted } = mountListening({ ...BASE_ADDRESS, save_in_address_book: false });
        await el.updateComplete;
        await Promise.all(
            Array.from(el.querySelectorAll('hc-text-input, hc-select-input')).map(
                (child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete
            )
        );

        expect(emitted).toEqual([]);
        expect((field(el, 'city') as HTMLInputElement).value).toBe('Calder');
        expect((field(el, 'postcode') as HTMLInputElement).value).toBe('49628-7978');
    });

    it('an address missing the flag or the country emits the whole address plus the default, never an emptied one', async () => {
        const { el, emitted } = mountListening(BASE_ADDRESS);
        await el.updateComplete;
        expect(emitted.length).toBe(1);
        expect(emitted[0]).toMatchObject({ ...BASE_ADDRESS, save_in_address_book: false });

        document.body.innerHTML = '';
        const second = mountListening({ ...BASE_ADDRESS, country_id: '' });
        await second.el.updateComplete;
        expect(second.emitted.length).toBe(1);
        expect(second.emitted[0]).toMatchObject({ ...BASE_ADDRESS, country_id: 'US' });
        for (const address of [...emitted, ...second.emitted]) {
            expect(address.city).toBe('Calder');
            expect(address.street).toEqual(['6146 Honey Bluff Parkway']);
        }
    });
});

describe('<address-form> postcode errors and the "show what is missing" request', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        installConfig();
        resetValidationRequestsForTests();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function errorText(el: Element, name: string): string {
        const input = field(el, name);
        return input?.parentElement?.querySelector(`#${input.id}-err`)?.textContent?.trim() ?? '';
    }

    function warningText(el: Element, name: string): string {
        const input = field(el, name);
        return input?.parentElement?.querySelector(`#${input.id}-warn`)?.textContent?.trim() ?? '';
    }

    it('a postcode outside the country patterns is a warning after blur: described, not invalid, the address stays valid', async () => {
        const el = await mount(BASE_ADDRESS);
        const valid: boolean[] = [];
        el.addEventListener('address-valid', (e) => valid.push((e as CustomEvent<boolean>).detail));

        const postcode = field(el, 'postcode') as HTMLInputElement;
        postcode.value = 'ABCDE';
        postcode.dispatchEvent(new Event('input', { bubbles: true }));
        await el.updateComplete;
        // Not touched yet: nothing shows while the shopper is still typing.
        expect(warningText(el, 'postcode')).toBe('');
        expect(errorText(el, 'postcode')).toBe('');
        expect(valid.at(-1)).toBe(true);

        postcode.dispatchEvent(new Event('blur', { bubbles: true }));
        await el.updateComplete;

        const expected = t('Hyperion_Checkout::validation_postcode', { example: '12345-6789, 12345' });
        expect(warningText(el, 'postcode')).toBe(expected);
        expect(errorText(el, 'postcode')).toBe('');
        expect(valid.at(-1)).toBe(true);
        expect(postcode.getAttribute('aria-invalid')).toBe('false');
        expect(el.querySelector('[aria-invalid="true"]')).toBeNull();
        const describedBy = postcode.getAttribute('aria-describedby') ?? '';
        const warning = el.querySelector(`#${postcode.id}-warn`) as HTMLElement;
        expect(describedBy.split(' ')).toContain(warning.id);
        expect(warning.getAttribute('aria-live')).toBeNull();
        expect(warning.getAttribute('role')).toBeNull();
    });

    it('an empty required postcode stays an error and a corrected value clears both the error and the warning', async () => {
        const el = await mount(BASE_ADDRESS);
        const valid: boolean[] = [];
        el.addEventListener('address-valid', (e) => valid.push((e as CustomEvent<boolean>).detail));

        const postcode = field(el, 'postcode') as HTMLInputElement;
        postcode.value = 'ABCDE';
        postcode.dispatchEvent(new Event('input', { bubbles: true }));
        postcode.dispatchEvent(new Event('blur', { bubbles: true }));
        await el.updateComplete;
        expect(warningText(el, 'postcode')).not.toBe('');

        postcode.value = '';
        postcode.dispatchEvent(new Event('input', { bubbles: true }));
        await el.updateComplete;
        expect(errorText(el, 'postcode')).toBe(t('Hyperion_Checkout::validation_required'));
        expect(warningText(el, 'postcode')).toBe('');
        expect(postcode.getAttribute('aria-invalid')).toBe('true');
        expect(postcode.getAttribute('aria-describedby')).toBe(`${postcode.id}-err`);
        expect(valid.at(-1)).toBe(false);

        postcode.value = '49628';
        postcode.dispatchEvent(new Event('input', { bubbles: true }));
        await el.updateComplete;
        expect(errorText(el, 'postcode')).toBe('');
        expect(warningText(el, 'postcode')).toBe('');
        expect(postcode.getAttribute('aria-invalid')).toBe('false');
        expect(postcode.getAttribute('aria-describedby')).toBe('');
        expect(valid.at(-1)).toBe(true);
    });

    it('an empty postcode of an optional zip country is neither an error nor a warning', async () => {
        setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), optionalZipCountries: ['IE'] });
        const el = await mount({ ...BASE_ADDRESS, country_id: 'IE', region_id: null, postcode: '' });
        const valid: boolean[] = [];
        el.addEventListener('address-valid', (e) => valid.push((e as CustomEvent<boolean>).detail));

        const postcode = field(el, 'postcode') as HTMLInputElement;
        expect(postcode.required).toBe(false);
        postcode.dispatchEvent(new Event('blur', { bubbles: true }));
        requestValidation();
        await el.updateComplete;
        expect(errorText(el, 'postcode')).toBe('');
        expect(warningText(el, 'postcode')).toBe('');

        postcode.value = 'D02 X285';
        postcode.dispatchEvent(new Event('input', { bubbles: true }));
        await el.updateComplete;
        expect(valid.at(-1)).toBe(true);
    });

    it('a validation request after mount reveals the errors of every untouched field', async () => {
        const el = await mount();
        expect(errorText(el, 'firstname')).toBe('');
        expect(errorText(el, 'postcode')).toBe('');

        requestValidation();
        await el.updateComplete;

        expect(errorText(el, 'firstname')).toBe(t('Hyperion_Checkout::validation_required'));
        expect(errorText(el, 'street_0')).toBe(t('Hyperion_Checkout::validation_required'));
        expect(errorText(el, 'postcode')).toBe(t('Hyperion_Checkout::validation_required'));
        expect(el.querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThan(3);
    });

    it('a form mounted after the request starts clean', async () => {
        requestValidation();
        const el = await mount();
        expect(errorText(el, 'firstname')).toBe('');
        expect(el.querySelector('[aria-invalid="true"]')).toBeNull();
    });
});
