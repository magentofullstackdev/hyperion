// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, it, expect } from 'vitest';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { CheckoutConfig } from '../../types/config.js';
import { isAddressComplete, isPostcodeMissing, postcodeWarning, readAddressFieldConfig } from '../address-validation.js';

function install(extra: Record<string, unknown>): void {
    setCheckoutConfig({ hyperion: { checkoutVersion: '2.0.0', enabled: true }, ...extra } as unknown as CheckoutConfig);
}

const base = {
    country_id: 'US',
    firstname: 'Veronica',
    lastname: 'Costello',
    city: 'Calder',
    street: ['6146 Honey Bluff Parkway'],
    postcode: '49628',
};

describe('address validation', () => {
    afterEach(() => {
        setCheckoutConfig(null as unknown as CheckoutConfig);
    });

    it('requires the telephone only when the merchant configured it as required', () => {
        install({ telephoneConfig: 'req' });
        expect(isAddressComplete({ ...base, telephone: '' })).toBe(false);
        expect(isAddressComplete({ ...base, telephone: '555' })).toBe(true);

        install({ telephoneConfig: 'opt' });
        expect(isAddressComplete({ ...base, telephone: '' })).toBe(true);

        install({ telephoneConfig: 'no' });
        expect(isAddressComplete(base)).toBe(true);
    });

    it('defaults to core (telephone required, company optional, fax hidden) without config keys', () => {
        setCheckoutConfig(null as unknown as CheckoutConfig);
        const cfg = readAddressFieldConfig();
        expect(cfg).toMatchObject({ showTelephone: 'req', showCompany: 'opt', showFax: 'no', streetLines: 2 });
        expect(isAddressComplete({ ...base, telephone: '' })).toBe(false);
    });

    it('honours required company and fax', () => {
        install({ telephoneConfig: 'no', companyConfig: 'req', faxConfig: 'req' });
        expect(isAddressComplete(base)).toBe(false);
        expect(isAddressComplete({ ...base, company: 'Luma' })).toBe(false);
        expect(isAddressComplete({ ...base, company: 'Luma', fax: '555' })).toBe(true);
    });

    it('still needs the always-required fields and a non-empty street line', () => {
        install({ telephoneConfig: 'no' });
        expect(isAddressComplete({ ...base, street: ['', '  '] })).toBe(false);
        expect(isAddressComplete({ ...base, city: '' })).toBe(false);
        expect(isAddressComplete(null)).toBe(false);
    });

    describe('postcode (a format mismatch warns, only a missing postcode blocks)', () => {
        const postCodes = {
            US: {
                pattern_1: { example: '12345-6789', pattern: '^[0-9]{5}\\-[0-9]{4}$' },
                pattern_2: { example: '12345', pattern: '^[0-9]{5}$' },
            },
        };

        it('an empty postcode of a country that requires one blocks the address', () => {
            install({ telephoneConfig: 'no', postCodes });
            expect(isAddressComplete({ ...base, postcode: '' })).toBe(false);
            expect(isAddressComplete({ ...base, postcode: '   ' })).toBe(false);
            expect(isAddressComplete({ ...base, postcode: null })).toBe(false);
            expect(isPostcodeMissing('', 'US')).toBe(true);
            expect(postcodeWarning('', 'US')).toBeNull();
        });

        it('an empty postcode of an optional zip country is accepted', () => {
            install({ telephoneConfig: 'no', postCodes, optionalZipCountries: ['AQ', 'IE'] });
            expect(isAddressComplete({ ...base, country_id: 'IE', postcode: '' })).toBe(true);
            expect(isPostcodeMissing('', 'IE')).toBe(false);
            expect(postcodeWarning('', 'IE')).toBeNull();
        });

        it('a postcode outside the country patterns keeps the address complete and only warns with the examples', () => {
            install({ telephoneConfig: 'no', postCodes });
            expect(isAddressComplete({ ...base, postcode: 'ABCDE' })).toBe(true);
            expect(isPostcodeMissing('ABCDE', 'US')).toBe(false);
            expect(postcodeWarning('ABCDE', 'US')).toEqual({ examples: ['12345-6789', '12345'] });
        });

        it('a postcode matching one of the patterns raises no warning', () => {
            install({ telephoneConfig: 'no', postCodes });
            expect(postcodeWarning('49628-7978', 'US')).toBeNull();
            expect(postcodeWarning('49628', 'US')).toBeNull();
            expect(postcodeWarning(' 49628 ', 'US')).toBeNull();
            expect(isAddressComplete({ ...base, postcode: '49628-7978' })).toBe(true);
            expect(isAddressComplete({ ...base, postcode: '49628' })).toBe(true);
        });

        it('a country without patterns accepts any value without a warning', () => {
            install({ telephoneConfig: 'no', postCodes });
            expect(isAddressComplete({ ...base, country_id: 'IT', postcode: 'anything' })).toBe(true);
            expect(postcodeWarning('anything', 'IT')).toBeNull();
            expect(postcodeWarning('anything', '')).toBeNull();
            expect(postcodeWarning('anything', null)).toBeNull();
        });

        it('a missing, empty or unusable pattern configuration is a safe fallback, never a crash or a restriction', () => {
            install({ telephoneConfig: 'no' });
            expect(readAddressFieldConfig().postCodes).toEqual({});
            expect(postcodeWarning('ABCDE', 'US')).toBeNull();
            expect(isAddressComplete({ ...base, postcode: 'ABCDE' })).toBe(true);

            install({ telephoneConfig: 'no', postCodes: 'not an object' });
            expect(postcodeWarning('ABCDE', 'US')).toBeNull();

            install({ telephoneConfig: 'no', postCodes: { US: {} } });
            expect(postcodeWarning('ABCDE', 'US')).toBeNull();

            install({ telephoneConfig: 'no', postCodes: { US: { p: { example: 'x', pattern: '' }, q: { example: 'y' }, r: null } } });
            expect(readAddressFieldConfig().postCodes['US']).toBeUndefined();
            expect(postcodeWarning('ABCDE', 'US')).toBeNull();
        });

        it('a pattern JS cannot compile is skipped: alone it means no warning, beside a valid one the valid one decides', () => {
            install({ telephoneConfig: 'no', postCodes: { US: { p: { example: 'x', pattern: '(?<=' } } } });
            expect(readAddressFieldConfig().postCodes['US']).toHaveLength(1);
            expect(() => postcodeWarning('ABCDE', 'US')).not.toThrow();
            expect(postcodeWarning('ABCDE', 'US')).toBeNull();
            expect(isAddressComplete({ ...base, postcode: 'ABCDE' })).toBe(true);

            install({
                telephoneConfig: 'no',
                postCodes: {
                    US: {
                        broken: { example: 'x', pattern: '(?<=' },
                        pattern_2: { example: '12345', pattern: '^[0-9]{5}$' },
                    },
                },
            });
            expect(postcodeWarning('ABCDE', 'US')).toEqual({ examples: ['12345'] });
            expect(postcodeWarning('49628', 'US')).toBeNull();
        });
    });
});
