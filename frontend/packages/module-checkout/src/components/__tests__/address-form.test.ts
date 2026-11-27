// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig, NameFieldsConfig } from '../../types/config.js';
import { requestValidation, resetValidationRequestsForTests } from '../../store/validation-request.js';
import { isAddressComplete } from '../../utils/address-validation.js';
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
        expect(middlename.autocomplete).toBe('shipping additional-name');

        const suffix = field(el, 'suffix') as HTMLSelectElement;
        expect(suffix.tagName).toBe('SELECT');
        expect(suffix.required).toBe(false);
    });

    it('renders a text input when no option list is configured', async () => {
        installConfig({ prefix: { show: 'opt', options: [] }, middlename: { show: 'no' }, suffix: { show: 'req' } });
        const el = await mount(BASE_ADDRESS);
        const prefix = field(el, 'prefix') as HTMLInputElement;
        expect(prefix.tagName).toBe('INPUT');
        expect(prefix.autocomplete).toBe('shipping honorific-prefix');
        expect(prefix.required).toBe(false);
        const suffix = field(el, 'suffix') as HTMLInputElement;
        expect(suffix.tagName).toBe('INPUT');
        expect(suffix.required).toBe(true);
    });

    it('keeps the emitted address incomplete until a required prefix is chosen and emits it in the address', async () => {
        installConfig({ prefix: { show: 'req', options: ['Mr', 'Mrs'] }, middlename: { show: 'no' }, suffix: { show: 'no' } });
        const el = await mount();
        const valid: boolean[] = [];
        const addresses: Address[] = [];
        el.addEventListener('address-change', (e) => valid.push(isAddressComplete((e as CustomEvent<Address>).detail)));
        el.addEventListener('address-change', (e) => addresses.push((e as CustomEvent<Address>).detail));

        el.value = BASE_ADDRESS;
        await el.updateComplete;
        // Any field edit re-evaluates completeness.
        const city = field(el, 'city') as HTMLInputElement;
        city.value = 'Calder Heights';
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
        return input?.parentElement?.querySelector(`#${input.id}-msg[data-tone="error"]`)?.textContent?.trim() ?? '';
    }

    function warningText(el: Element, name: string): string {
        const input = field(el, name);
        return input?.parentElement?.querySelector(`#${input.id}-msg[data-tone="warning"]`)?.textContent?.trim() ?? '';
    }

    it('a postcode outside the country patterns is a warning after blur: described, not invalid, the address stays valid', async () => {
        const el = await mount(BASE_ADDRESS);
        const valid: boolean[] = [];
        el.addEventListener('address-change', (e) => valid.push(isAddressComplete((e as CustomEvent<Address>).detail)));

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
        const warning = el.querySelector(`#${postcode.id}-msg`) as HTMLElement;
        expect(describedBy.split(' ')).toContain(warning.id);
        expect(warning.getAttribute('aria-live')).toBeNull();
        expect(warning.getAttribute('role')).toBeNull();
    });

    it('an empty required postcode stays an error and a corrected value clears both the error and the warning', async () => {
        const el = await mount(BASE_ADDRESS);
        const valid: boolean[] = [];
        el.addEventListener('address-change', (e) => valid.push(isAddressComplete((e as CustomEvent<Address>).detail)));

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
        expect(postcode.getAttribute('aria-describedby')).toBe(`${postcode.id}-msg`);
        expect(valid.at(-1)).toBe(false);

        postcode.value = '49628';
        postcode.dispatchEvent(new Event('input', { bubbles: true }));
        await el.updateComplete;
        expect(errorText(el, 'postcode')).toBe('');
        expect(warningText(el, 'postcode')).toBe('');
        expect(postcode.getAttribute('aria-invalid')).toBe('false');
        expect(postcode.hasAttribute('aria-describedby')).toBe(false);
        expect(valid.at(-1)).toBe(true);
    });

    it('an empty postcode of an optional zip country is neither an error nor a warning', async () => {
        setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), optionalZipCountries: ['IE'] });
        const el = await mount({ ...BASE_ADDRESS, country_id: 'IE', region_id: null, postcode: '' });
        const valid: boolean[] = [];
        el.addEventListener('address-change', (e) => valid.push(isAddressComplete((e as CustomEvent<Address>).detail)));

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

const DIRECTORY = {
    US: { name: 'United States', is_region_required: true, regions: { 33: { code: 'MI', name: 'Michigan' }, 12: { code: 'CA', name: 'California' } } },
    DE: { name: 'Germany', is_region_required: false, regions: { 82: { code: 'BER', name: 'Berlin' } } },
    GB: { name: 'United Kingdom', is_region_required: false },
    IE: { name: 'Ireland', is_region_required: false },
    FR: { name: 'France', is_region_required: false, is_region_visible: false },
};

function withDirectory(extra: Record<string, unknown> = {}): CheckoutConfig {
    return { ...(guestFixture as unknown as CheckoutConfig), directoryData: DIRECTORY, ...extra } as unknown as CheckoutConfig;
}

describe('<address-form> order, ids and attributes', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(withDirectory());
        resetValidationRequestsForTests();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function names(el: Element): string[] {
        return Array.from(el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type="checkbox"]), select'))
            .map((control) => control.name);
    }

    async function mountMode(mode: 'shipping' | 'billing', value: Address | null = null): Promise<AddressForm> {
        const el = document.createElement('address-form') as AddressForm;
        el.mode = mode;
        if (value) el.value = value;
        document.body.appendChild(el);
        await settleForm(el);
        return el;
    }

    async function settleForm(el: AddressForm): Promise<void> {
        for (let i = 0; i < 3; i += 1) {
            await el.updateComplete;
            await Promise.all(
                Array.from(el.querySelectorAll('hc-text-input, hc-select-input, hc-checkbox')).map(
                    (child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete
                )
            );
        }
    }

    function messageOf(el: Element, name: string): string {
        const control = field(el, name);
        return control?.parentElement?.querySelector(`#${control.id}-msg`)?.textContent?.trim() ?? '';
    }

    it('puts the country before the street, then postcode, city and region', async () => {
        const el = await mountMode('shipping', BASE_ADDRESS);
        const order = names(el);
        const at = (name: string): number => order.indexOf(name);
        expect(at('country_id')).toBeGreaterThan(at('lastname'));
        expect(at('country_id')).toBeLessThan(at('street_0'));
        expect(at('street_0')).toBeLessThan(at('postcode'));
        expect(at('postcode')).toBeLessThan(at('city'));
        expect(at('city')).toBeLessThan(at('region_id'));
        expect(at('region_id')).toBeLessThan(at('telephone'));
    });

    it('mounting the shipping and the billing form together gives no duplicate id', async () => {
        await mountMode('shipping', BASE_ADDRESS);
        await mountMode('billing', BASE_ADDRESS);
        const ids = Array.from(document.querySelectorAll('[id]')).map((node) => node.id);
        expect(ids.length).toBeGreaterThan(20);
        expect(new Set(ids).size).toBe(ids.length);
        expect(document.getElementById('hc-shipping-city')).not.toBeNull();
        expect(document.getElementById('hc-billing-city')).not.toBeNull();
        for (const label of Array.from(document.querySelectorAll('label[for]'))) {
            expect(document.getElementById(label.getAttribute('for') ?? '')).not.toBeNull();
        }
    });

    it('carries the section in every autocomplete token and omits empty attributes', async () => {
        const shipping = await mountMode('shipping', BASE_ADDRESS);
        const billing = await mountMode('billing', BASE_ADDRESS);
        expect(field(shipping, 'firstname')?.getAttribute('autocomplete')).toBe('shipping given-name');
        expect(field(shipping, 'street_0')?.getAttribute('autocomplete')).toBe('shipping address-line1');
        expect(field(shipping, 'street_1')?.getAttribute('autocomplete')).toBe('shipping address-line2');
        expect(field(shipping, 'country_id')?.getAttribute('autocomplete')).toBe('shipping country');
        expect(field(shipping, 'region_id')?.getAttribute('autocomplete')).toBe('shipping address-level1');
        expect(field(billing, 'postcode')?.getAttribute('autocomplete')).toBe('billing postal-code');
        expect(field(billing, 'telephone')?.getAttribute('autocomplete')).toBe('billing tel');

        const city = field(shipping, 'city')!;
        expect(city.hasAttribute('inputmode')).toBe(false);
        expect(city.hasAttribute('placeholder')).toBe(false);
        expect(city.getAttribute('autocapitalize')).toBe('words');
        expect(city.getAttribute('enterkeyhint')).toBe('next');
        expect(field(shipping, 'firstname')?.getAttribute('autocapitalize')).toBe('words');
        expect(field(shipping, 'postcode')?.getAttribute('spellcheck')).toBe('false');
        expect(field(shipping, 'street_0')?.hasAttribute('spellcheck')).toBe(false);
        // The telephone is the last text field of the default field set.
        expect(field(shipping, 'telephone')?.hasAttribute('enterkeyhint')).toBe(false);
    });

    it('shows the street error after the first street line lost the focus', async () => {
        const el = await mountMode('shipping');
        const street = field(el, 'street_0') as HTMLInputElement;
        expect(messageOf(el, 'street_0')).toBe('');
        street.dispatchEvent(new Event('blur', { bubbles: true }));
        await settleForm(el);
        expect(messageOf(el, 'street_0')).toBe(t('Hyperion_Checkout::validation_required'));
        expect(street.getAttribute('aria-invalid')).toBe('true');
        expect(street.getAttribute('aria-describedby')).toBe(`${street.id}-msg`);
    });

    it('a required region shows its error after the select lost the focus, wired to the control', async () => {
        const el = await mountMode('shipping', { ...BASE_ADDRESS, region_id: null });
        const region = field(el, 'region_id') as HTMLSelectElement;
        expect(region.required).toBe(true);
        expect(messageOf(el, 'region_id')).toBe('');
        expect(region.hasAttribute('aria-describedby')).toBe(false);

        region.dispatchEvent(new Event('blur', { bubbles: true }));
        await settleForm(el);
        expect(messageOf(el, 'region_id')).toBe(t('Hyperion_Checkout::validation_required'));
        expect(region.getAttribute('aria-invalid')).toBe('true');
        expect(region.getAttribute('aria-describedby')).toBe(`${region.id}-msg`);
        expect(document.getElementById(`${region.id}-msg`)).not.toBeNull();
    });

    it('a country that lists regions without requiring one shows no asterisk and no error', async () => {
        const el = await mountMode('shipping', { ...BASE_ADDRESS, country_id: 'DE', region_id: null, postcode: '10117' });
        const valid: boolean[] = [];
        el.addEventListener('address-change', (e) => valid.push(isAddressComplete((e as CustomEvent<Address>).detail)));

        const region = field(el, 'region_id') as HTMLSelectElement;
        expect(region.tagName).toBe('SELECT');
        expect(region.required).toBe(false);
        expect(region.closest('hc-select-input')?.querySelector('label')?.textContent).not.toContain('*');

        requestValidation();
        region.dispatchEvent(new Event('blur', { bubbles: true }));
        await settleForm(el);
        expect(messageOf(el, 'region_id')).toBe('');
        expect(region.getAttribute('aria-invalid')).toBe('false');

        const city = field(el, 'city') as HTMLInputElement;
        city.value = 'Berlin';
        city.dispatchEvent(new Event('input', { bubbles: true }));
        expect(valid.at(-1)).toBe(true);
    });

    it('the fax field shows its required error', async () => {
        setCheckoutConfig(withDirectory({ faxConfig: 'req' }));
        const el = await mountMode('shipping', BASE_ADDRESS);
        const fax = field(el, 'fax') as HTMLInputElement;
        fax.dispatchEvent(new Event('blur', { bubbles: true }));
        await settleForm(el);
        expect(messageOf(el, 'fax')).toBe(t('Hyperion_Checkout::validation_required'));
        expect(fax.getAttribute('aria-invalid')).toBe('true');
    });

    it('lists the top destinations first, then a divider, then every country, with one option selected', async () => {
        const base = guestFixture as unknown as CheckoutConfig;
        setCheckoutConfig(withDirectory({ hyperion: { ...base.hyperion, topDestinations: ['US', 'ZZ'] } }));
        const el = await mountMode('shipping', BASE_ADDRESS);
        const country = field(el, 'country_id') as HTMLSelectElement;
        const options = Array.from(country.options);
        expect(options[0]?.value).toBe('US');
        expect(options[1]?.disabled).toBe(true);
        expect(options.filter((o) => o.value === 'US').length).toBe(2);
        expect(country.selectedIndex).toBe(0);
        expect(country.value).toBe('US');

        setCheckoutConfig(withDirectory());
        document.body.innerHTML = '';
        const plain = await mountMode('shipping', BASE_ADDRESS);
        const plainOptions = Array.from((field(plain, 'country_id') as HTMLSelectElement).options);
        expect(plainOptions.some((o) => o.disabled)).toBe(false);
    });
});

describe('<address-form> country change and the region', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(withDirectory());
        resetValidationRequestsForTests();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    async function settleForm(el: AddressForm): Promise<void> {
        for (let i = 0; i < 3; i += 1) {
            await el.updateComplete;
            await Promise.all(
                Array.from(el.querySelectorAll('hc-text-input, hc-select-input')).map(
                    (child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete
                )
            );
        }
    }

    async function mountListening(value: Address): Promise<{ el: AddressForm; emitted: Address[] }> {
        const el = document.createElement('address-form') as AddressForm;
        const emitted: Address[] = [];
        el.value = { ...value, save_in_address_book: false };
        document.body.appendChild(el);
        await settleForm(el);
        el.addEventListener('address-change', (e) => emitted.push((e as CustomEvent<Address>).detail));
        return { el, emitted };
    }

    async function pickCountry(el: AddressForm, id: string): Promise<void> {
        const country = field(el, 'country_id') as HTMLSelectElement;
        country.value = id;
        country.dispatchEvent(new Event('change', { bubbles: true }));
        await settleForm(el);
    }

    it('keeps a typed region when the new country has no region list either', async () => {
        const { el, emitted } = await mountListening({ ...BASE_ADDRESS, country_id: 'GB', region_id: null, region: 'Greater London' as never, postcode: 'SW1A 1AA' });
        await pickCountry(el, 'IE');
        expect(emitted.at(-1)?.country_id).toBe('IE');
        expect(emitted.at(-1)?.region).toBe('Greater London');
        expect(emitted.at(-1)?.postcode).toBe('SW1A 1AA');
        expect((field(el, 'region') as HTMLInputElement).value).toBe('Greater London');
    });

    it('matches a typed region by name or by code against the list of the new country', async () => {
        const byName = await mountListening({ ...BASE_ADDRESS, country_id: 'GB', region_id: null, region: 'berlin' as never });
        await pickCountry(byName.el, 'DE');
        expect(byName.emitted.at(-1)?.region_id).toBe('82');
        expect(byName.emitted.at(-1)?.region).toMatchObject({ region: 'Berlin', region_code: 'BER' });
        expect((field(byName.el, 'region_id') as HTMLSelectElement).value).toBe('82');

        document.body.innerHTML = '';
        const byCode = await mountListening({ ...BASE_ADDRESS, country_id: 'GB', region_id: null, region: 'MI' as never });
        await pickCountry(byCode.el, 'US');
        expect(byCode.emitted.at(-1)?.region_id).toBe('33');
    });

    it('drops a typed region the new list does not know and a region picked from the previous list', async () => {
        const typed = await mountListening({ ...BASE_ADDRESS, country_id: 'GB', region_id: null, region: 'Greater London' as never });
        await pickCountry(typed.el, 'US');
        expect(typed.emitted.at(-1)?.region_id).toBeNull();
        expect(typed.emitted.at(-1)?.region).toBeNull();

        document.body.innerHTML = '';
        const picked = await mountListening({ ...BASE_ADDRESS, region: { region: 'Michigan', region_code: 'MI', region_id: 33 } });
        await pickCountry(picked.el, 'GB');
        expect(picked.emitted.at(-1)?.region_id).toBeNull();
        expect(picked.emitted.at(-1)?.region).toBeNull();
        expect((field(picked.el, 'region') as HTMLInputElement).value).toBe('');
    });

    it('keeps the region as typed, spaces included, while the shopper types it', async () => {
        const { el, emitted } = await mountListening({ ...BASE_ADDRESS, country_id: 'GB', region_id: null, region: null });
        const region = field(el, 'region') as HTMLInputElement;
        for (const text of ['Greater', 'Greater ', 'Greater L']) {
            region.value = text;
            region.dispatchEvent(new Event('input', { bubbles: true }));
            await settleForm(el);
            expect(region.value).toBe(text);
        }
        expect(emitted.at(-1)?.region).toBe('Greater L');
    });

    it('keeps no region for a country that shows none, and matches the region object of an address from a country without a list', async () => {
        const hidden = await mountListening({ ...BASE_ADDRESS, country_id: 'GB', region_id: null, region: 'Greater London' as never });
        await pickCountry(hidden.el, 'FR');
        expect(hidden.emitted.at(-1)?.region).toBeNull();
        expect(hidden.emitted.at(-1)?.region_id).toBeNull();

        document.body.innerHTML = '';
        const saved = await mountListening({ ...BASE_ADDRESS, country_id: 'GB', region_id: null, region: { region: 'Berlin' } });
        await pickCountry(saved.el, 'DE');
        expect(saved.emitted.at(-1)?.region_id).toBe('82');
    });

    it('a change event that carries the selected country changes nothing', async () => {
        const { el, emitted } = await mountListening({ ...BASE_ADDRESS, region: { region: 'Michigan', region_code: 'MI', region_id: 33 } });
        const country = field(el, 'country_id') as HTMLSelectElement;
        country.dispatchEvent(new Event('change', { bubbles: true }));
        await settleForm(el);
        expect(emitted).toEqual([]);
        expect((field(el, 'region_id') as HTMLSelectElement).value).toBe('33');
    });

    it('keeps one place for the region as a select, a text field or hidden', async () => {
        const { el } = await mountListening(BASE_ADDRESS);
        const row = (): Element => field(el, 'city')!.closest('.hc-field-row')!;
        expect(row().children.length).toBe(3);
        expect(row().querySelector('select[name="region_id"]')).not.toBeNull();

        await pickCountry(el, 'GB');
        expect(row().children.length).toBe(3);
        expect(row().querySelector('input[name="region"]')).not.toBeNull();

        await pickCountry(el, 'FR');
        expect(row().children.length).toBe(3);
        expect(field(el, 'region')).toBeNull();
        expect(field(el, 'region_id')).toBeNull();
        expect(row().querySelector('[data-hyperion-region-placeholder]')?.getAttribute('aria-hidden')).toBe('true');
    });
});
