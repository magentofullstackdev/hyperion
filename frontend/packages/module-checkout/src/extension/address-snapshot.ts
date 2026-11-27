// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The checkout's `Address` and the public `AddressSnapshot` of the
 * extension API, both ways. The snapshot is Magento's REST shape with the
 * region flattened (`region`, `region_code`, `region_id`) and the custom
 * attributes as a map of attribute code to value.
 */
import type { AddressSnapshot } from '../../extension-api.js';
import type { Address, CustomAttribute, Region } from '../types/address.js';

function text(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    const s = String(value);
    return s === '' ? undefined : s;
}

/** An address as the snapshot shows it (not frozen). */
export function toAddressSnapshot(address: Address | null): AddressSnapshot | null {
    if (address === null) return null;
    const out: Record<string, unknown> = {
        firstname: address.firstname ?? '',
        lastname: address.lastname ?? '',
        street: [...(address.street ?? [])],
        city: address.city ?? '',
        postcode: address.postcode ?? '',
        country_id: address.country_id ?? '',
    };
    const optional = {
        middlename: text(address.middlename),
        prefix: text(address.prefix),
        suffix: text(address.suffix),
        company: text(address.company),
        telephone: text(address.telephone),
        vat_id: text(address.vat_id),
    };
    for (const [key, value] of Object.entries(optional)) {
        if (value !== undefined) out[key] = value;
    }
    const region: unknown = address.region;
    if (region !== null && typeof region === 'object') {
        const named = region as { region?: unknown; region_code?: unknown };
        const name = text(named.region);
        const code = text(named.region_code);
        if (name !== undefined) out.region = name;
        if (code !== undefined) out.region_code = code;
    } else if (typeof region === 'string' && region.trim() !== '') {
        out.region = region.trim();
    }
    const regionId = Number(address.region_id);
    if (address.region_id !== null && address.region_id !== undefined && address.region_id !== ''
        && Number.isInteger(regionId) && regionId > 0) {
        out.region_id = regionId;
    }
    if (address.custom_attributes && address.custom_attributes.length > 0) {
        const map: Record<string, unknown> = {};
        for (const attribute of address.custom_attributes) map[attribute.attribute_code] = attribute.value;
        out.custom_attributes = map;
    }
    if (address.extension_attributes && Object.keys(address.extension_attributes).length > 0) {
        out.extension_attributes = { ...address.extension_attributes };
    }
    return out as unknown as AddressSnapshot;
}

/** A snapshot address (an override sent by a shipping extension) as the checkout's `Address`. */
export function fromAddressSnapshot(snapshot: AddressSnapshot): Address {
    const address: Address = {
        firstname: String(snapshot.firstname ?? ''),
        lastname: String(snapshot.lastname ?? ''),
        street: Array.isArray(snapshot.street) ? snapshot.street.map((line) => String(line)) : [],
        city: String(snapshot.city ?? ''),
        postcode: String(snapshot.postcode ?? ''),
        country_id: String(snapshot.country_id ?? ''),
        telephone: String(snapshot.telephone ?? ''),
    };
    for (const key of ['middlename', 'prefix', 'suffix', 'company', 'vat_id'] as const) {
        const value = text(snapshot[key]);
        if (value !== undefined) address[key] = value;
    }
    const regionId = snapshot.region_id;
    if (typeof regionId === 'number' && Number.isInteger(regionId) && regionId > 0) {
        address.region_id = String(regionId);
        address.region = { region: snapshot.region ?? '', region_code: snapshot.region_code ?? '', region_id: regionId };
    } else if (text(snapshot.region) !== undefined) {
        address.region = snapshot.region as unknown as Partial<Region>;
    }
    if (snapshot.custom_attributes) {
        address.custom_attributes = Object.entries(snapshot.custom_attributes).map(
            ([attribute_code, value]): CustomAttribute => ({
                attribute_code,
                value: Array.isArray(value) ? value.map(String) : String(value ?? ''),
            })
        );
    }
    if (snapshot.extension_attributes) {
        address.extension_attributes = { ...snapshot.extension_attributes } as NonNullable<Address['extension_attributes']>;
    }
    return address;
}
