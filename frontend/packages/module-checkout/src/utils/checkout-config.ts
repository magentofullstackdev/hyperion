// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Normalisation of the raw `checkoutConfig` JSON island.
 *
 * Magento's config providers emit model data as it comes from the
 * database, so numeric fields can arrive as strings:
 * `Magento\CheckoutAgreements\Model\AgreementsConfigProvider` emits
 * `"mode": "1"` and `"agreementId": "2"`. The bundle compares `mode` with
 * the numeric `AGREEMENT_MODE_*` constants and keys the accepted set by
 * `agreementId`, so both are coerced to numbers once, here, and nothing
 * downstream has to care about the wire type.
 */
import type { Address, Region } from '../types/address.js';
import type { AgreementEntry, CheckoutConfig, QuoteAddressConfig } from '../types/config.js';

/** `value` as a trimmed string, null when absent or blank. */
function text(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s === '' ? null : s;
}

/**
 * The flat quote address of `hyperion.guestQuote` as the checkout's
 * `Address`: `street` as a list of non-empty lines, `region_id` as a string
 * plus the nested `region` object the saved-address shape carries when the
 * country has a region list, the typed region name otherwise. Null without
 * a country (the address was never entered).
 */
export function normaliseQuoteAddress(raw: QuoteAddressConfig | null | undefined): Address | null {
    if (!raw || typeof raw !== 'object') return null;
    const countryId = text(raw['country_id']);
    if (countryId === null) return null;
    const streetRaw = raw['street'];
    const street = (Array.isArray(streetRaw) ? streetRaw : [streetRaw])
        .map((line) => text(line))
        .filter((line): line is string => line !== null);
    const regionId = text(raw['region_id']);
    const regionName = text(raw['region']);
    const regionCode = text(raw['region_code']);
    const address: Address = {
        country_id: countryId,
        street,
        city: text(raw['city']) ?? '',
        firstname: text(raw['firstname']) ?? '',
        lastname: text(raw['lastname']) ?? '',
        telephone: text(raw['telephone']) ?? '',
        postcode: text(raw['postcode']),
        region_id: regionId,
        // A country without a region list keeps the typed name as a bare
        // string, the shape the address form and the payload mapper read.
        region: regionId !== null
            ? { region: regionName ?? '', region_code: regionCode ?? '', region_id: Number(regionId) }
            : (regionName as unknown as Partial<Region> | null),
    };
    for (const key of ['company', 'fax', 'vat_id', 'prefix', 'middlename', 'suffix'] as const) {
        const value = text(raw[key]);
        if (value !== null) address[key] = value;
    }
    return address;
}

export function normaliseCheckoutConfig(config: CheckoutConfig): CheckoutConfig {
    const agreements = config.checkoutAgreements;
    if (!agreements || !Array.isArray(agreements.agreements)) {
        return config;
    }
    return {
        ...config,
        checkoutAgreements: {
            ...agreements,
            isEnabled: Boolean(agreements.isEnabled),
            agreements: agreements.agreements.map(normaliseAgreement),
        },
    };
}

function normaliseAgreement(entry: AgreementEntry): AgreementEntry {
    return {
        ...entry,
        agreementId: Number(entry.agreementId),
        mode: Number(entry.mode) as AgreementEntry['mode'],
    };
}
