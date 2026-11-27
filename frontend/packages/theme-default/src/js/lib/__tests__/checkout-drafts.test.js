// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// checkout-drafts -- the sign-out page removes the checkout's typed data of the tab.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CHECKOUT_STORAGE_PREFIX, forgetCheckoutDrafts, forgetCheckoutDraftsAfterSignOut } from '../checkout-drafts.js';

const here = dirname(fileURLToPath(import.meta.url));
const CHECKOUT_DRAFTS = resolve(here, '../../../../../module-checkout/src/store/drafts.ts');
const LOGOUT_TEMPLATE = resolve(here, '../../../../../../../app/design/frontend/Magentofullstackdev/hyperion/Magento_Customer/templates/logout.phtml');

/** What the checkout leaves in a tab: a draft, the handoff entry of a sign in, an override fingerprint. */
const CHECKOUT_KEYS = [
    'hyperion.checkout.draft.v1:en_us:465',
    'hyperion.checkout.draft.v1:handoff:en_us',
    'hyperion.checkout.override.v1:en_us:465',
];

describe('checkout drafts at a sign-out', () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        for (const key of CHECKOUT_KEYS) window.sessionStorage.setItem(key, '{"street":["77 Private Lane"]}');
        window.sessionStorage.setItem('unrelated', 'kept');
        window.localStorage.setItem('hyperion.checkout.local', 'kept');
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.sessionStorage.clear();
        window.localStorage.clear();
    });

    test('the sign-out page removes every checkout entry of the tab and nothing else', () => {
        document.body.innerHTML = '<div data-hyperion-signed-out><h1>You are signed out</h1></div>';

        forgetCheckoutDraftsAfterSignOut(document);

        for (const key of CHECKOUT_KEYS) expect(window.sessionStorage.getItem(key)).toBeNull();
        expect(window.sessionStorage.getItem('unrelated')).toBe('kept');
        expect(window.localStorage.getItem('hyperion.checkout.local')).toBe('kept');
    });

    test('any other page keeps them', () => {
        document.body.innerHTML = '<main><h1>Home</h1></main>';

        forgetCheckoutDraftsAfterSignOut(document);

        for (const key of CHECKOUT_KEYS) expect(window.sessionStorage.getItem(key)).not.toBeNull();
    });

    test('a storage the browser refuses is left alone', () => {
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
            throw new DOMException('denied', 'SecurityError');
        });
        expect(() => forgetCheckoutDrafts()).not.toThrow();
    });

    test('the sign-out template prints the marker', () => {
        expect(readFileSync(LOGOUT_TEMPLATE, 'utf8')).toMatch(/<div [^>]*\bdata-hyperion-signed-out\b/);
    });

    test('the prefix is the one every key of the checkout starts with', () => {
        const source = readFileSync(CHECKOUT_DRAFTS, 'utf8');
        expect(/export const CHECKOUT_STORAGE_PREFIX = '([^']+)';/.exec(source)?.[1]).toBe(CHECKOUT_STORAGE_PREFIX);
        for (const key of CHECKOUT_KEYS) expect(key.startsWith(CHECKOUT_STORAGE_PREFIX)).toBe(true);
    });
});
