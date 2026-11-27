// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The version handshake: an element class declares the major it was
 * written for (`static hyperionApi = '1'`), a module of the generic pool
 * exports it (`hyperionApi`), and the checkout uses it only when that major
 * equals the major of its own version (`hyperion.extensionApi`).
 */
import { EXTENSION_API } from './version.js';

/** The major of a version string (`"1.0-beta"` -> `"1"`), null when there is none. */
export function apiMajor(version: unknown): string | null {
    if (typeof version !== 'string' && typeof version !== 'number') return null;
    const match = /^\s*(\d+)/.exec(String(version));
    return match ? String(Number(match[1])) : null;
}

/** True when `declared` (an element's `hyperionApi`) has the major of `supported`. */
export function isSupportedApi(declared: unknown, supported: string = EXTENSION_API): boolean {
    const major = apiMajor(declared);
    return major !== null && major === apiMajor(supported);
}
