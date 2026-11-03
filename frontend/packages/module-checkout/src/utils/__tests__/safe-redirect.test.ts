// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect } from 'vitest';
import { decideRedirectTarget } from '../safe-redirect.js';

const FALLBACK = '/checkout/onepage/success';
// Whatever origin the jsdom harness runs on -- derive at runtime so the
// tests don't need a specific harness URL.
const ORIGIN = window.location.origin;

describe('decideRedirectTarget', () => {
    it('passes through a same-origin absolute URL', () => {
        expect(decideRedirectTarget(`${ORIGIN}/checkout/onepage/success`))
            .toBe(`${ORIGIN}/checkout/onepage/success`);
    });

    it('passes through a same-origin path', () => {
        expect(decideRedirectTarget('/checkout/onepage/success'))
            .toBe(`${ORIGIN}/checkout/onepage/success`);
    });

    it('falls back when the target is cross-origin', () => {
        expect(decideRedirectTarget('https://evil.com/phish')).toBe(FALLBACK);
    });

    it('falls back on a scheme-relative URL pointing off-origin', () => {
        expect(decideRedirectTarget('//evil.com/phish')).toBe(FALLBACK);
    });

    it('falls back on a javascript: URL', () => {
        expect(decideRedirectTarget('javascript:alert(1)')).toBe(FALLBACK);
    });

    it('falls back on a data: URL', () => {
        expect(decideRedirectTarget('data:text/html,<script>alert(1)</script>'))
            .toBe(FALLBACK);
    });

    it('falls back on malformed input', () => {
        expect(decideRedirectTarget('https://[bad-host', '/elsewhere'))
            .toBe('/elsewhere');
    });

    it('honors the fallback override', () => {
        expect(decideRedirectTarget('https://evil.com/x', '/cart')).toBe('/cart');
    });
});
