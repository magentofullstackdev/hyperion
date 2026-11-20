// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * What decides the shipping rates of an address.
 *
 * `rateKey()` reduces an address to the fields whose change asks for new
 * rates, so an edit elsewhere (a name, a phone number) never starts an
 * estimate and a late answer is applied only when the key it was asked for
 * is still the current one. `isEstimable()` tells whether an address is
 * enough to ask for rates, which is less than a complete address.
 * `pickShippingMethod()` is the one place that preselects a rate.
 * `mergeRefreshedRates()` orders a list read again for the same address.
 */
import type { Address } from '../types/address.js';
import type { ShippingPreselect } from '../types/config.js';
import type { SelectedShippingMethod, ShippingMethod } from '../types/shipping.js';
import {
    isPostcodeMissing,
    isRegionMissing,
    readAddressFieldConfig,
    regionIdOf,
    regionTextOf,
} from '../utils/address-validation.js';
import type { AddressFieldConfig } from '../utils/address-validation.js';

/** The fields used when the configuration names none. `region` covers the region id and the free-text region. */
export const DEFAULT_RATE_FIELDS: readonly string[] = ['country_id', 'region', 'postcode'];

/** Between two values of a key: a control character no address field carries. */
const KEY_SEPARATOR = '\u001f';

function text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function fieldValue(addr: Partial<Address>, field: string): string {
    switch (field) {
        case 'region':
        case 'region_id': {
            // The id when the country has a region list, the typed name otherwise.
            const id = regionIdOf(addr);
            return id !== '' ? id : regionTextOf(addr).toUpperCase();
        }
        case 'postcode':
            return text(addr.postcode).toUpperCase();
        case 'country_id':
            return text(addr.country_id).toUpperCase();
        case 'street':
            return (addr.street ?? []).map(text).filter((line) => line !== '').join(' ');
        default:
            return text((addr as Readonly<Record<string, unknown>>)[field]);
    }
}

/**
 * The joined values of `fields` for `addr`: trimmed, the postcode in upper
 * case. Two addresses with the same key get the same rates. An empty
 * `fields` list means the default fields; no address gives the key of an
 * empty address.
 */
export function rateKey(
    addr: Partial<Address> | null | undefined,
    fields: readonly string[] = DEFAULT_RATE_FIELDS
): string {
    const names = fields.length > 0 ? fields : DEFAULT_RATE_FIELDS;
    const source: Partial<Address> = addr ?? {};
    return names.map((field) => fieldValue(source, field)).join(KEY_SEPARATOR);
}

/**
 * Whether rates can be asked for `addr`: a country, a postcode unless the
 * country is one of the optional postcode countries, a region when the
 * country requires one. `cfg` defaults to the address field configuration
 * of the checkout.
 */
export function isEstimable(
    addr: Partial<Address> | null | undefined,
    cfg: AddressFieldConfig = readAddressFieldConfig()
): boolean {
    if (!addr) return false;
    if (text(addr.country_id) === '') return false;
    return !isPostcodeMissing(addr.postcode, addr.country_id, cfg) && !isRegionMissing(addr, cfg);
}

function isSameMethod(rate: ShippingMethod, selected: SelectedShippingMethod): boolean {
    return rate.carrier_code === selected.carrier_code && rate.method_code === selected.method_code;
}

function priceOf(rate: ShippingMethod): number {
    const price = Number(rate.price_incl_tax);
    return Number.isFinite(price) ? price : Number.POSITIVE_INFINITY;
}

/**
 * The rate to select among `methods` (the usable rates of the current
 * list): `current` when it is still offered, else the only rate, else by
 * `preselect`: `cheapest` (lowest `price_incl_tax`, ties by list order),
 * `first`, or `none` (null). Null for an empty list. A value outside the
 * three known ones selects like `cheapest`.
 */
export function pickShippingMethod(
    methods: readonly ShippingMethod[],
    current: SelectedShippingMethod | null,
    preselect: ShippingPreselect
): ShippingMethod | null {
    const first = methods[0];
    if (first === undefined) return null;
    if (current) {
        const kept = methods.find((rate) => isSameMethod(rate, current));
        if (kept) return kept;
    }
    if (methods.length === 1) return first;
    if (preselect === 'none') return null;
    if (preselect === 'first') return first;
    let cheapest = first;
    for (const rate of methods) {
        if (priceOf(rate) < priceOf(cheapest)) cheapest = rate;
    }
    return cheapest;
}

/**
 * The list to show when the rates of an address are read again while a
 * list for that address is on screen. A refresh must not move what the
 * shopper looks at:
 *
 *   - a rate on screen that is still offered keeps its position and takes
 *     the fresh data (price, titles, availability);
 *   - a rate that is no longer offered leaves the list;
 *   - a rate that was not on screen goes below the rows on screen: after
 *     the last rate of its carrier when the carrier already has rows (a
 *     carrier's rates stay together, the list prints one subheading per
 *     carrier), at the end otherwise, in the order of the answer.
 *
 * With nothing on screen the answer is taken as it comes.
 */
export function mergeRefreshedRates(
    shown: readonly ShippingMethod[],
    fresh: readonly ShippingMethod[]
): readonly ShippingMethod[] {
    if (shown.length === 0) return fresh;
    const same = (a: ShippingMethod, b: ShippingMethod): boolean =>
        a.carrier_code === b.carrier_code && a.method_code === b.method_code;
    const merged: ShippingMethod[] = [];
    for (const rate of shown) {
        const current = fresh.find((candidate) => same(candidate, rate));
        if (current !== undefined && !merged.some((kept) => same(kept, current))) merged.push(current);
    }
    for (const rate of fresh) {
        if (merged.some((kept) => same(kept, rate))) continue;
        let after = -1;
        merged.forEach((kept, index) => {
            if (kept.carrier_code === rate.carrier_code) after = index;
        });
        if (after === -1) merged.push(rate);
        else merged.splice(after + 1, 0, rate);
    }
    return merged;
}
