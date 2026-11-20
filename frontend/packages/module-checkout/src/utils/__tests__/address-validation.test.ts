// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, it, expect } from 'vitest';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import {
    isAddressComplete,
    missingAddressFields,
    isPostcodeMissing,
    isRegionMissing,
    postcodeWarning,
    readAddressFieldConfig,
    regionIdOf,
    regionTextOf,
} from '../address-validation.js';

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

    it('honors required company and fax', () => {
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

    describe('region (required only where the directory says so)', () => {
        const directoryData = {
            US: {
                name: 'United States',
                is_region_required: true,
                regions: { '12': { code: 'CA', name: 'California' }, '33': { code: 'MI', name: 'Michigan' } },
            },
            DE: {
                name: 'Germany',
                is_region_required: false,
                regions: { '82': { code: 'BER', name: 'Berlin' } },
            },
            AU: { name: 'Australia', is_region_required: true },
            GB: { name: 'United Kingdom', is_region_required: false },
        };

        function installDirectory(): void {
            install({ telephoneConfig: 'no', directoryData });
        }

        it('makes a United States address without a state incomplete', () => {
            installDirectory();
            expect(isRegionMissing(base)).toBe(true);
            expect(isAddressComplete(base)).toBe(false);
            expect(isAddressComplete({ ...base, region_id: '' })).toBe(false);
            expect(isAddressComplete({ ...base, region_id: '33' })).toBe(true);
        });

        it('leaves a German address without a state complete, although the country has a region list', () => {
            installDirectory();
            const german = { ...base, country_id: 'DE', postcode: '10115' };
            expect(isRegionMissing(german)).toBe(false);
            expect(isAddressComplete(german)).toBe(true);
        });

        it('does not accept the typed region name in place of the id of a list country', () => {
            installDirectory();
            const typed = { ...base, region: 'Michigan' as unknown as NonNullable<Address['region']> };
            expect(isRegionMissing(typed)).toBe(true);
        });

        it('counts only the region id of the address itself, the one a request carries, and ignores a zero id', () => {
            installDirectory();
            const region = { region: 'Michigan', region_code: 'MI', region_id: 33 };
            expect(isRegionMissing({ ...base, region })).toBe(true);
            expect(isRegionMissing({ ...base, region, region_id: '33' })).toBe(false);
            expect(isRegionMissing({ ...base, region_id: '0' })).toBe(true);
        });

        it('needs the typed region of a country that requires one and has no list', () => {
            installDirectory();
            const australian = { ...base, country_id: 'AU', postcode: '2000' };
            expect(isAddressComplete(australian)).toBe(false);
            expect(isAddressComplete({ ...australian, region: '  ' as unknown as NonNullable<Address['region']> })).toBe(false);
            expect(isAddressComplete({ ...australian, region: 'NSW' as unknown as NonNullable<Address['region']> })).toBe(true);
            expect(isAddressComplete({ ...australian, region: { region: 'NSW' } })).toBe(true);
        });

        it('requires no region for a country outside the directory or without directory data', () => {
            installDirectory();
            expect(isRegionMissing({ ...base, country_id: 'FR' })).toBe(false);
            expect(isRegionMissing(null)).toBe(false);

            install({ telephoneConfig: 'no' });
            expect(readAddressFieldConfig().directoryData).toEqual({});
            expect(isAddressComplete(base)).toBe(true);
        });

        it('reads the region id and the region name in both shapes', () => {
            expect(regionIdOf({ region_id: ' 33 ' })).toBe('33');
            expect(regionIdOf({ region_id: 33 as unknown as string })).toBe('33');
            expect(regionIdOf({ region: { region_id: 12 } })).toBe('');
            expect(regionIdOf({ region_id: null, region: null })).toBe('');
            expect(regionTextOf({ region: ' Kent ' as unknown as NonNullable<Address['region']> })).toBe('Kent');
            expect(regionTextOf({ region: { region: ' Kent ' } })).toBe('Kent');
            expect(regionTextOf({})).toBe('');
        });
    });
});

describe('missingAddressFields', () => {
    afterEach(() => {
        setCheckoutConfig(null as unknown as CheckoutConfig);
    });

    const DIRECTORY = {
        US: { name: 'United States', is_region_required: true, regions: { 33: { code: 'MI', name: 'Michigan' } } },
        DE: { name: 'Germany', is_region_required: false, regions: { 82: { code: 'BER', name: 'Berlin' } } },
    };

    it('names what is missing in form order and is empty for a complete address', () => {
        install({ telephoneConfig: 'req', companyConfig: 'req', faxConfig: 'req', directoryData: DIRECTORY });
        expect(missingAddressFields({ country_id: 'US' })).toEqual([
            'firstname', 'lastname', 'company', 'street', 'postcode', 'city', 'region', 'telephone', 'fax',
        ]);
        expect(missingAddressFields(null)).toContain('country_id');
        const complete = { ...base, region_id: '33', telephone: '555', company: 'Acme', fax: '556' };
        expect(missingAddressFields(complete)).toEqual([]);
        expect(isAddressComplete(complete)).toBe(true);
    });

    it('agrees with the completeness predicate on the region of a list country', () => {
        install({ telephoneConfig: 'opt', directoryData: DIRECTORY });
        expect(missingAddressFields({ ...base })).toEqual(['region']);
        expect(isAddressComplete({ ...base })).toBe(false);
        const german = { ...base, country_id: 'DE', postcode: '10117' };
        expect(missingAddressFields(german)).toEqual([]);
        expect(isAddressComplete(german)).toBe(true);
    });

    it('names a required name field of a typed address, never of a saved one', () => {
        install({
            telephoneConfig: 'opt',
            hyperion: { checkoutVersion: '2.0.0', enabled: true, nameFields: { prefix: { show: 'req' }, middlename: { show: 'no' }, suffix: { show: 'no' } } },
        });
        expect(missingAddressFields({ ...base })).toEqual(['prefix']);
        expect(missingAddressFields({ ...base, id: '5' } as Partial<Address>)).toEqual([]);
    });
});
