// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The one address completeness predicate shared by the address form, the
 * selectors and the flow actions, driven by the merchant's attribute
 * configuration (`customer/address/*_show`) that the checkout config carries
 * as `companyConfig`, `telephoneConfig` and `faxConfig`, plus the name field
 * settings and the postcode rules. Core validates the same way
 * (`Magento\Customer\Model\Address\Validator\General`): a hidden or optional
 * telephone never blocks an order, and a postcode is required unless the
 * country is in `general/country/optional_zip_countries`
 * (`optionalZipCountries`). The patterns `zip_codes.xml` lists for the
 * country (`postCodes`) are NOT a gate: the server never checks them, and
 * core's Knockout checkout only warns ("seems to be invalid", with the
 * examples) and lets the shopper continue. `postcodeWarning()` is that
 * descriptive hint; `isAddressComplete()` never reads it, so a postcode of
 * an unexpected format is sent to Magento unchanged.
 */
import type { Address } from '../types/address.js';
import type { FieldVisibility, PostcodePattern } from '../types/config.js';
import { peekCheckoutConfig } from '../bootstrap-config.js';
import { hasRequiredNameFields } from './name-fields.js';

export type PostcodePatterns = Readonly<Record<string, readonly PostcodePattern[]>>;

export interface AddressFieldConfig {
    streetLines: number;
    showCompany: FieldVisibility;
    showTelephone: FieldVisibility;
    showFax: FieldVisibility;
    showVat: boolean;
    optionalZipCountries: readonly string[];
    /** Country id to its postcode patterns; a country without an entry accepts any postcode. */
    postCodes: PostcodePatterns;
}

const DEFAULTS: AddressFieldConfig = {
    streetLines: 2,
    showCompany: 'opt',
    showTelephone: 'req',
    showFax: 'no',
    showVat: false,
    optionalZipCountries: [],
    postCodes: {},
};

function readShow(raw: unknown, fallback: FieldVisibility): FieldVisibility {
    return raw === 'no' || raw === 'opt' || raw === 'req' ? raw : fallback;
}

/**
 * `checkoutConfig.postCodes` (`{ US: { pattern_1: { example, pattern } } }`)
 * as lists of patterns; entries without a usable pattern are dropped.
 */
function readPostCodes(raw: unknown): PostcodePatterns {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, PostcodePattern[]> = {};
    for (const [country, entries] of Object.entries(raw as Record<string, unknown>)) {
        if (!entries || typeof entries !== 'object') continue;
        const list: PostcodePattern[] = [];
        for (const entry of Object.values(entries as Record<string, unknown>)) {
            if (!entry || typeof entry !== 'object') continue;
            const pattern = (entry as { pattern?: unknown }).pattern;
            if (typeof pattern !== 'string' || pattern.trim() === '') continue;
            const example = (entry as { example?: unknown }).example;
            list.push({ pattern, example: typeof example === 'string' ? example : '' });
        }
        if (list.length > 0) out[country] = list;
    }
    return out;
}

/** Field visibility as configured; core's defaults when the config lacks a key. */
export function readAddressFieldConfig(): AddressFieldConfig {
    const cfg = (peekCheckoutConfig() ?? {}) as unknown as Record<string, unknown>;
    const streetLines = Number(cfg['streetLines'] ?? cfg['street_lines'] ?? DEFAULTS.streetLines);
    const oz = cfg['optionalZipCountries'];
    return {
        streetLines: Number.isFinite(streetLines) && streetLines > 0 ? streetLines : DEFAULTS.streetLines,
        showCompany: readShow(cfg['companyConfig'], DEFAULTS.showCompany),
        showTelephone: readShow(cfg['telephoneConfig'], DEFAULTS.showTelephone),
        showFax: readShow(cfg['faxConfig'], DEFAULTS.showFax),
        showVat: cfg['vatFrontendVisibility'] === true || cfg['vatFrontendVisibility'] === '1',
        optionalZipCountries: Array.isArray(oz) ? (oz as string[]) : [],
        postCodes: readPostCodes(cfg['postCodes']),
    };
}

function filled(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

export function hasStreet(addr: { street?: readonly string[] | null }): boolean {
    return (addr.street ?? []).some((line) => typeof line === 'string' && line.trim().length > 0);
}

/** Whether the country requires a postcode (every country outside `optionalZipCountries`). */
export function isPostcodeRequired(countryId: string | null | undefined, cfg: AddressFieldConfig): boolean {
    return !cfg.optionalZipCountries.includes(countryId ?? '');
}

/**
 * Whether the postcode is missing while the country requires one: the only
 * postcode condition that blocks a request (an empty postcode of an
 * optional-zip country is fine).
 */
export function isPostcodeMissing(
    postcode: string | null | undefined,
    countryId: string | null | undefined,
    cfg: AddressFieldConfig = readAddressFieldConfig()
): boolean {
    return (postcode ?? '').trim() === '' && isPostcodeRequired(countryId, cfg);
}

export interface PostcodeWarning {
    /** The examples of the country's patterns, in configuration order (may be empty). */
    examples: readonly string[];
}

/**
 * The format hint for a non-empty postcode that matches none of the
 * country's patterns, null when there is nothing to say: an empty value, a
 * country without patterns or a value matching one of them. Descriptive
 * only: it never makes the address incomplete and the value travels as
 * typed. A pattern that is not a valid JS regular expression is skipped;
 * when none of them compiles there is no warning either.
 */
export function postcodeWarning(
    postcode: string | null | undefined,
    countryId: string | null | undefined,
    cfg: AddressFieldConfig = readAddressFieldConfig()
): PostcodeWarning | null {
    const value = (postcode ?? '').trim();
    if (value === '') return null;
    const patterns = cfg.postCodes[countryId ?? ''];
    if (!patterns || patterns.length === 0) return null;
    const examples: string[] = [];
    let tested = 0;
    for (const { pattern, example } of patterns) {
        let re: RegExp;
        try {
            re = new RegExp(pattern);
        } catch {
            // Not a JS regular expression (PCRE only syntax): nothing to compare with.
            continue;
        }
        tested += 1;
        if (re.test(value)) return null;
        if (example) examples.push(example);
    }
    return tested === 0 ? null : { examples };
}

/**
 * Whether the address can be sent to Magento: the always-required fields,
 * the configured required fields, a postcode where the country requires one
 * (its format is a warning, see `postcodeWarning()`) and the required name
 * fields are present.
 */
export function isAddressComplete(
    addr: Partial<Address> | null | undefined,
    cfg: AddressFieldConfig = readAddressFieldConfig()
): addr is Address {
    if (!addr) return false;
    return (
        filled(addr.country_id) &&
        filled(addr.firstname) &&
        filled(addr.lastname) &&
        filled(addr.city) &&
        hasStreet(addr) &&
        !isPostcodeMissing(addr.postcode, addr.country_id, cfg) &&
        (cfg.showTelephone !== 'req' || filled(addr.telephone)) &&
        (cfg.showCompany !== 'req' || filled(addr.company)) &&
        (cfg.showFax !== 'req' || filled(addr.fax)) &&
        hasRequiredNameFields(addr)
    );
}
