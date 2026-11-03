// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Region / country lookup helpers against `checkoutConfig.directoryData`
 * and `checkoutConfig.postCodes`. Pure functions; no side effects.
 */

export interface DirectoryRegion {
    code: string;
    name: string;
    id: number | string;
}

export function regionListForCountry(
    directory: Readonly<Record<string, unknown>> | undefined,
    countryId: string
): readonly DirectoryRegion[] {
    if (!directory) return [];
    const entry = directory[countryId];
    if (!entry || typeof entry !== 'object') return [];
    const obj = entry as Record<string, unknown>;
    // Magento stores regions either as a `regions` object keyed by id,
    // or flat inside the country entry. Walk both shapes.
    const regions: DirectoryRegion[] = [];
    const source =
        obj['regions'] && typeof obj['regions'] === 'object'
            ? (obj['regions'] as Record<string, unknown>)
            : obj;
    for (const [id, value] of Object.entries(source)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const name = typeof v['name'] === 'string' ? v['name'] : null;
        const code = typeof v['code'] === 'string' ? v['code'] : '';
        if (!name) continue;
        regions.push({ id, code, name });
    }
    return regions;
}

export function isPostcodeOptional(
    optionalZipCountries: readonly string[] | undefined,
    countryId: string
): boolean {
    if (!optionalZipCountries) return false;
    return optionalZipCountries.includes(countryId);
}
