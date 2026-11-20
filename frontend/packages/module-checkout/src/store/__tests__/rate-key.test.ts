// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig, ShippingPreselect } from '../../types/config.js';
import type { ShippingMethod } from '../../types/shipping.js';
import type { AddressFieldConfig } from '../../utils/address-validation.js';
import { DEFAULT_RATE_FIELDS, isEstimable, mergeRefreshedRates, pickShippingMethod, rateKey } from '../rate-key.js';

const DIRECTORY = {
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
    GB: { name: 'United Kingdom', is_region_required: false },
    IE: { name: 'Ireland', is_region_required: false },
    AU: { name: 'Australia', is_region_required: true },
};

const CFG: AddressFieldConfig = {
    streetLines: 2,
    showCompany: 'opt',
    showTelephone: 'req',
    showFax: 'no',
    showVat: false,
    optionalZipCountries: ['IE'],
    postCodes: {},
    directoryData: DIRECTORY,
};

function rate(carrier: string, method: string, priceInclTax: number): ShippingMethod {
    return {
        carrier_code: carrier,
        method_code: method,
        carrier_title: carrier,
        method_title: method,
        amount: priceInclTax,
        base_amount: priceInclTax,
        available: true,
        error_message: '',
        price_excl_tax: priceInclTax,
        price_incl_tax: priceInclTax,
    };
}

describe('rateKey', () => {
    it('uses country, region and postcode by default', () => {
        expect(DEFAULT_RATE_FIELDS).toEqual(['country_id', 'region', 'postcode']);
        const key = rateKey({ country_id: 'US', region_id: '33', postcode: '49628' });
        expect(key).toBe(rateKey({ country_id: 'US', region_id: '33', postcode: '49628' }, DEFAULT_RATE_FIELDS));
        expect(key).toBe(rateKey({ country_id: 'US', region_id: '33', postcode: '49628' }, []));
    });

    it('does not change for a field outside the list', () => {
        const a: Partial<Address> = { country_id: 'US', region_id: '33', postcode: '49628', city: 'Calder' };
        const b: Partial<Address> = {
            ...a,
            firstname: 'Veronica',
            telephone: '555',
            city: 'Detroit',
            street: ['6146 Honey Bluff Parkway'],
        };
        expect(rateKey(b)).toBe(rateKey(a));
    });

    it('changes with the country, the region and the postcode', () => {
        const base: Partial<Address> = { country_id: 'US', region_id: '33', postcode: '49628' };
        const key = rateKey(base);
        expect(rateKey({ ...base, country_id: 'DE' })).not.toBe(key);
        expect(rateKey({ ...base, region_id: '12' })).not.toBe(key);
        expect(rateKey({ ...base, postcode: '90210' })).not.toBe(key);
    });

    it('trims the values and compares the postcode in upper case', () => {
        expect(rateKey({ country_id: 'GB', postcode: ' sw1a 1aa ' })).toBe(
            rateKey({ country_id: 'GB', postcode: 'SW1A 1AA' })
        );
    });

    it('reads the region id of the address as text or number, whatever its region object holds', () => {
        const flat = rateKey({ country_id: 'US', region_id: '33', postcode: '49628' });
        const withObject = rateKey({
            country_id: 'US',
            region_id: '33',
            region: { region: 'Michigan', region_code: 'MI', region_id: 33 },
            postcode: '49628',
        });
        const numeric = rateKey({ country_id: 'US', region_id: 33 as unknown as string, postcode: '49628' });
        expect(withObject).toBe(flat);
        expect(numeric).toBe(flat);
    });

    it('falls back to the free-text region, typed as a string or held in a region object', () => {
        const typed = rateKey({ country_id: 'GB', region: ' Kent ' as unknown as NonNullable<Address['region']>, postcode: 'CT1' });
        const held = rateKey({ country_id: 'GB', region: { region: 'Kent', region_id: 0 }, postcode: 'CT1' });
        expect(typed).toBe(held);
        expect(typed).not.toBe(rateKey({ country_id: 'GB', postcode: 'CT1' }));
    });

    it('treats region and region_id in the field list as the same field', () => {
        const addr: Partial<Address> = { country_id: 'US', region_id: '33', postcode: '49628' };
        expect(rateKey(addr, ['country_id', 'region_id', 'postcode'])).toBe(rateKey(addr));
    });

    it('follows the configured optional fields (city, street)', () => {
        const fields = ['country_id', 'region', 'postcode', 'city', 'street'];
        const base: Partial<Address> = {
            country_id: 'US',
            region_id: '33',
            postcode: '49628',
            city: 'Calder',
            street: ['6146 Honey Bluff Parkway', ''],
        };
        const key = rateKey(base, fields);
        expect(rateKey({ ...base, city: ' Calder ' }, fields)).toBe(key);
        expect(rateKey({ ...base, street: ['6146 Honey Bluff Parkway'] }, fields)).toBe(key);
        expect(rateKey({ ...base, city: 'Detroit' }, fields)).not.toBe(key);
        expect(rateKey({ ...base, street: ['1 Main Street'] }, fields)).not.toBe(key);
        expect(rateKey({ ...base, firstname: 'Veronica' }, fields)).toBe(key);
    });

    it('keeps the values of two fields apart', () => {
        expect(rateKey({ country_id: 'US', city: 'AB', postcode: 'C' }, ['city', 'postcode'])).not.toBe(
            rateKey({ country_id: 'US', city: 'A', postcode: 'BC' }, ['city', 'postcode'])
        );
    });

    it('gives the key of an empty address when there is none', () => {
        expect(rateKey(null)).toBe(rateKey({}));
        expect(rateKey(undefined)).toBe(rateKey({}));
        expect(rateKey(null)).not.toBe(rateKey({ country_id: 'US' }));
    });
});

describe('isEstimable', () => {
    it('needs a country', () => {
        expect(isEstimable(null, CFG)).toBe(false);
        expect(isEstimable({}, CFG)).toBe(false);
        expect(isEstimable({ country_id: ' ', postcode: '49628' }, CFG)).toBe(false);
    });

    it('needs a postcode unless the country is an optional postcode country', () => {
        expect(isEstimable({ country_id: 'GB' }, CFG)).toBe(false);
        expect(isEstimable({ country_id: 'GB', postcode: '  ' }, CFG)).toBe(false);
        expect(isEstimable({ country_id: 'GB', postcode: 'SW1A 1AA' }, CFG)).toBe(true);
        expect(isEstimable({ country_id: 'IE' }, CFG)).toBe(true);
    });

    it('needs a region where the country requires one', () => {
        expect(isEstimable({ country_id: 'US', postcode: '49628' }, CFG)).toBe(false);
        expect(isEstimable({ country_id: 'US', postcode: '49628', region_id: '33' }, CFG)).toBe(true);
        expect(isEstimable({ country_id: 'AU', postcode: '2000' }, CFG)).toBe(false);
        expect(
            isEstimable({ country_id: 'AU', postcode: '2000', region: 'NSW' as unknown as NonNullable<Address['region']> }, CFG)
        ).toBe(true);
    });

    it('needs no region where the country does not require one, with or without a region list', () => {
        expect(isEstimable({ country_id: 'DE', postcode: '10115' }, CFG)).toBe(true);
        expect(isEstimable({ country_id: 'GB', postcode: 'SW1A 1AA' }, CFG)).toBe(true);
    });

    it('is less than a complete address: no name, street, city or telephone', () => {
        expect(isEstimable({ country_id: 'US', postcode: '49628', region_id: '33' }, CFG)).toBe(true);
    });

    describe('with the checkout configuration as the default', () => {
        afterEach(() => {
            setCheckoutConfig(null as unknown as CheckoutConfig);
        });

        it('reads the optional postcode countries and the directory data', () => {
            setCheckoutConfig({
                hyperion: { checkoutVersion: '2.0.0', enabled: true },
                optionalZipCountries: ['IE'],
                directoryData: DIRECTORY,
            } as unknown as CheckoutConfig);
            expect(isEstimable({ country_id: 'IE' })).toBe(true);
            expect(isEstimable({ country_id: 'US', postcode: '49628' })).toBe(false);
            expect(isEstimable({ country_id: 'US', postcode: '49628', region_id: '12' })).toBe(true);
        });

        it('requires no region without directory data', () => {
            expect(isEstimable({ country_id: 'US', postcode: '49628' })).toBe(true);
        });
    });
});

describe('pickShippingMethod', () => {
    const flat = rate('flatrate', 'flatrate', 10);
    const table = rate('tablerate', 'bestway', 5);
    const express = rate('ups', 'express', 5);

    it('returns null for an empty list', () => {
        expect(pickShippingMethod([], null, 'cheapest')).toBeNull();
        expect(pickShippingMethod([], { carrier_code: 'flatrate', method_code: 'flatrate' }, 'first')).toBeNull();
    });

    it('keeps a selection that is still offered, whatever the setting', () => {
        const current = { carrier_code: 'flatrate', method_code: 'flatrate' };
        for (const preselect of ['cheapest', 'first', 'none'] as const) {
            expect(pickShippingMethod([table, flat, express], current, preselect)).toBe(flat);
        }
    });

    it('matches the selection on carrier and method together', () => {
        const current = { carrier_code: 'ups', method_code: 'bestway' };
        expect(pickShippingMethod([flat, table, express], current, 'first')).toBe(flat);
    });

    it('selects the only rate, also when the setting is none or the selection is gone', () => {
        expect(pickShippingMethod([flat], null, 'none')).toBe(flat);
        expect(pickShippingMethod([flat], { carrier_code: 'ups', method_code: 'express' }, 'none')).toBe(flat);
    });

    it('selects the cheapest rate by the price including tax, the earlier one on a tie', () => {
        expect(pickShippingMethod([flat, table, express], null, 'cheapest')).toBe(table);
        expect(pickShippingMethod([flat, express, table], null, 'cheapest')).toBe(express);
        const taxed = { ...rate('dhl', 'eco', 12), price_excl_tax: 1 };
        expect(pickShippingMethod([taxed, flat], null, 'cheapest')).toBe(flat);
    });

    it('selects a free rate as the cheapest', () => {
        const free = rate('freeshipping', 'freeshipping', 0);
        expect(pickShippingMethod([flat, free, table], null, 'cheapest')).toBe(free);
    });

    it('selects the first rate of the answer when asked to', () => {
        expect(pickShippingMethod([flat, table, express], null, 'first')).toBe(flat);
        expect(pickShippingMethod([flat, table], { carrier_code: 'ups', method_code: 'express' }, 'first')).toBe(flat);
    });

    it('selects nothing among several rates when the setting is none', () => {
        expect(pickShippingMethod([flat, table], null, 'none')).toBeNull();
        expect(pickShippingMethod([flat, table], { carrier_code: 'ups', method_code: 'express' }, 'none')).toBeNull();
    });

    it('selects like cheapest for a setting it does not know', () => {
        expect(pickShippingMethod([flat, table], null, undefined as unknown as ShippingPreselect)).toBe(table);
    });
});

describe('mergeRefreshedRates', () => {
    const codes = (rates: readonly ShippingMethod[]): string[] => rates.map((r) => `${r.carrier_code}:${r.method_code}`);

    it('takes the answer as it comes when nothing is on screen', () => {
        const fresh = [rate('tablerate', 'bestway', 10), rate('flatrate', 'flatrate', 5)];
        expect(mergeRefreshedRates([], fresh)).toBe(fresh);
    });

    it('keeps the rows on screen where they are and puts a new rate below them, whatever the order of the answer', () => {
        const shown = [rate('tablerate', 'bestway', 10)];
        const fresh = [rate('flatrate', 'flatrate', 5), rate('tablerate', 'bestway', 10)];
        expect(codes(mergeRefreshedRates(shown, fresh))).toEqual(['tablerate:bestway', 'flatrate:flatrate']);
    });

    it('gives the same order when the same answer comes again', () => {
        const fresh = [rate('flatrate', 'flatrate', 5), rate('tablerate', 'bestway', 10)];
        const first = mergeRefreshedRates([rate('tablerate', 'bestway', 10)], fresh);
        expect(codes(mergeRefreshedRates(first, fresh))).toEqual(codes(first));
    });

    it('shows the fresh data of a rate that stays', () => {
        const merged = mergeRefreshedRates([rate('flatrate', 'flatrate', 5)], [rate('flatrate', 'flatrate', 7)]);
        expect(merged[0]!.price_incl_tax).toBe(7);
    });

    it('drops a rate that is no longer offered', () => {
        const shown = [rate('flatrate', 'flatrate', 5), rate('tablerate', 'bestway', 10)];
        expect(codes(mergeRefreshedRates(shown, [rate('tablerate', 'bestway', 10)]))).toEqual(['tablerate:bestway']);
    });

    it('keeps the rates of one carrier together: a new method goes after the last row of its carrier', () => {
        const shown = [rate('ups', 'GND', 9), rate('flatrate', 'flatrate', 5)];
        const fresh = [rate('flatrate', 'flatrate', 5), rate('ups', '2DA', 19), rate('ups', 'GND', 9), rate('dhl', 'EXP', 30)];
        expect(codes(mergeRefreshedRates(shown, fresh))).toEqual(['ups:GND', 'ups:2DA', 'flatrate:flatrate', 'dhl:EXP']);
    });
});
