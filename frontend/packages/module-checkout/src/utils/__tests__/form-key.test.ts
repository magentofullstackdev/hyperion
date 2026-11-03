// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, afterEach } from 'vitest';
import { readFormKeyCookie } from '../form-key.js';

function setCookies(value: string): void {
    Object.defineProperty(document, 'cookie', {
        writable: true,
        configurable: true,
        value,
    });
}

describe('readFormKeyCookie', () => {
    afterEach(() => { setCookies(''); });

    it('returns empty string when no cookie present', () => {
        setCookies('');
        expect(readFormKeyCookie()).toBe('');
    });

    it('reads a single form_key cookie', () => {
        setCookies('form_key=abc123');
        expect(readFormKeyCookie()).toBe('abc123');
    });

    it('handles multiple cookies and whitespace', () => {
        setCookies('PHPSESSID=xyz; form_key=deadbeef; other=1');
        expect(readFormKeyCookie()).toBe('deadbeef');
    });

    it('URI-decodes the value', () => {
        setCookies('form_key=abc%20def');
        expect(readFormKeyCookie()).toBe('abc def');
    });
});
