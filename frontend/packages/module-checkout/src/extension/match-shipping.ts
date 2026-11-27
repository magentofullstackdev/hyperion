// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Whether a shipping extension entry applies to a shipping method.
 * `match.carrier` and `match.method` are an exact code, `*`, or a regular
 * expression between slashes that must match the whole code
 * (`/locker_\w+/`); an absent part matches anything, and an entry
 * without `match` applies to every method.
 */
import type { ShippingExtensionConfig } from '../../extension-api.js';
import { matchesWhole } from '../utils/whole-pattern.js';

/** Whether one part of a shipping match (`carrier` or `method`) accepts `code`. */
export function matchesShippingPart(rule: string | null | undefined, code: string): boolean {
    if (rule === null || rule === undefined || rule === '' || rule === '*') return true;
    if (rule.length > 2 && rule.startsWith('/') && rule.endsWith('/')) {
        return matchesWhole(rule.slice(1, -1), code);
    }
    return rule === code;
}

/** Whether a shipping extension entry applies to the method (`null`: no method selected). */
export function matchesShippingMethod(
    match: ShippingExtensionConfig['match'],
    method: { readonly carrier_code: string; readonly method_code: string } | null
): boolean {
    if (match === null || match === undefined) return true;
    if (method === null) return false;
    return matchesShippingPart(match.carrier, method.carrier_code)
        && matchesShippingPart(match.method, method.method_code);
}
