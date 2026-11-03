// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect } from 'vitest';
import { deriveBaseUrl } from '../base-url.js';
import type { CheckoutConfig } from '../../types/config.js';

function config(baseUrl: string | undefined, staticBaseUrl = 'https://cdn.example/static/version1/'): CheckoutConfig {
    return { hyperion: { checkoutVersion: '2.0.0', enabled: true, baseUrl }, staticBaseUrl } as unknown as CheckoutConfig;
}

describe('deriveBaseUrl', () => {
    it('uses the configured base URL including its path', () => {
        expect(deriveBaseUrl(config('https://shop.example/shop/'), 'https://shop.example')).toBe('https://shop.example/shop');
        expect(deriveBaseUrl(config('https://shop.example/'), 'https://shop.example')).toBe('https://shop.example');
    });

    it('never derives the API host from the static files host', () => {
        expect(deriveBaseUrl(config(undefined), 'https://shop.example')).toBe('https://shop.example');
    });

    it('ignores a configured URL on another origin and falls back to the page', () => {
        expect(deriveBaseUrl(config('https://evil.example/'), 'https://shop.example')).toBe('https://shop.example');
        expect(deriveBaseUrl(config('http://shop.example/'), 'https://shop.example')).toBe('https://shop.example');
        expect(deriveBaseUrl(config('not a url'), 'https://shop.example')).toBe('https://shop.example');
    });
});
