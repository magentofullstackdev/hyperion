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
 *
 * The fields a store declares on top of the built-in ones
 * (`hyperion.addressFields`) join the same predicate: their check lives in
 * the address field chunk (`components/address-fields.ts`), loaded before
 * the mount only when the list is not empty (`optional-sections.ts`), which
 * installs its check and its form renderer here (`installDeclaredFields()`).
 * Until then nothing is added and the forms show the built-in fields only.
 */
import { Signal } from 'signal-polyfill';

import type { Address } from '../types/address.js';
import type { FieldVisibility, PostcodePattern } from '../types/config.js';
import { peekCheckoutConfig } from '../bootstrap-config.js';
import { hasRequiredNameFields, missingRequiredNameFields } from './name-fields.js';
import { regionListForCountry } from './region.js';

/** The form an address is checked for; without one the declared field check decides from the address. */
export type AddressFormMode = 'shipping' | 'billing';

/** What `<address-form>` hands the renderer of the declared fields. */
export interface DeclaredFieldsHost {
    readonly mode: AddressFormMode;
    readonly idPrefix: string;
    readonly address: Partial<Address>;
    /** The field's error may show (it lost the focus, or a validation was requested). */
    isTouched(code: string): boolean;
    touch(code: string): void;
    change(next: Partial<Address>): void;
}

/** What the address field chunk installs. */
export interface DeclaredFields {
    /** The codes of the declared fields an address still needs, in form order. */
    missing(addr: Partial<Address>, form: AddressFormMode | undefined): readonly string[];
    /** The controls of the declared fields of an address form. */
    render(host: DeclaredFieldsHost): unknown;
}

/** The installed declared fields; null until the chunk arrived. A signal: forms and selectors follow it. */
export const declaredFields = new Signal.State<DeclaredFields | null>(null);

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
    /**
     * `checkoutConfig.directoryData`: country id to its entry (`is_region_required`,
     * `regions`). A country without an entry requires no region.
     */
    directoryData?: Readonly<Record<string, unknown>>;
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

function readDirectoryData(raw: unknown): Readonly<Record<string, unknown>> {
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
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
        directoryData: readDirectoryData(cfg['directoryData']),
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
 * The region id of an address as text, '' when it has none; 0 is "no
 * region". Only `region_id` of the address itself counts: it is the one a
 * request to Magento carries, the id inside the region object is not sent.
 */
export function regionIdOf(addr: Partial<Address>): string {
    const candidate: unknown = addr.region_id;
    if (typeof candidate !== 'string' && typeof candidate !== 'number') return '';
    const id = String(candidate).trim();
    return id !== '' && id !== '0' ? id : '';
}

/**
 * The region name of an address, trimmed, '' when it has none. The address
 * form stores a typed region as a plain string, a saved address carries a
 * region object.
 */
export function regionTextOf(addr: Partial<Address>): string {
    const region: unknown = addr.region;
    if (typeof region === 'string') return region.trim();
    if (region && typeof region === 'object') {
        const name = (region as { region?: unknown }).region;
        return typeof name === 'string' ? name.trim() : '';
    }
    return '';
}

/**
 * Whether the region is missing while the country requires one
 * (`is_region_required` of its directory entry): a country with a region
 * list needs a region id, a country without one needs the typed region.
 * A country that does not require a region never blocks, list or not.
 */
export function isRegionMissing(
    addr: Partial<Address> | null | undefined,
    cfg: AddressFieldConfig = readAddressFieldConfig()
): boolean {
    const countryId = addr?.country_id ?? '';
    const entry = cfg.directoryData?.[countryId];
    if (!addr || !entry || typeof entry !== 'object') return false;
    if ((entry as { is_region_required?: unknown }).is_region_required !== true) return false;
    return regionListForCountry(cfg.directoryData, countryId).length > 0
        ? regionIdOf(addr) === ''
        : regionTextOf(addr) === '';
}

/**
 * The fields an address still needs before it can be sent to Magento, by
 * field name, in form order (`street` and `region` stand for their
 * controls): the always-required fields, the configured required fields,
 * a postcode where the country requires one (its format is a warning, see
 * `postcodeWarning()`), a region where the country requires one and the
 * required name fields, then the declared fields of `form` (by their code).
 * Empty for an address that is complete. Reads a signal.
 */
export function missingAddressFields(
    addr: Partial<Address> | null | undefined,
    cfg: AddressFieldConfig = readAddressFieldConfig(),
    form?: AddressFormMode
): readonly string[] {
    const a: Partial<Address> = addr ?? {};
    const missing: string[] = [];
    if (!filled(a.firstname)) missing.push('firstname');
    if (!filled(a.lastname)) missing.push('lastname');
    if (!hasRequiredNameFields(a)) missing.push(...missingRequiredNameFields(a));
    if (cfg.showCompany === 'req' && !filled(a.company)) missing.push('company');
    if (!filled(a.country_id)) missing.push('country_id');
    if (!hasStreet(a)) missing.push('street');
    if (isPostcodeMissing(a.postcode, a.country_id, cfg)) missing.push('postcode');
    if (!filled(a.city)) missing.push('city');
    if (isRegionMissing(a, cfg)) missing.push('region');
    if (cfg.showTelephone === 'req' && !filled(a.telephone)) missing.push('telephone');
    if (cfg.showFax === 'req' && !filled(a.fax)) missing.push('fax');
    const declared = declaredFields.get();
    if (declared !== null) missing.push(...declared.missing(a, form));
    return missing;
}

/** Whether the address can be sent to Magento: nothing of `missingAddressFields()` is missing. */
export function isAddressComplete(
    addr: Partial<Address> | null | undefined,
    cfg: AddressFieldConfig = readAddressFieldConfig(),
    form?: AddressFormMode
): addr is Address {
    if (!addr) return false;
    return missingAddressFields(addr, cfg, form).length === 0;
}
