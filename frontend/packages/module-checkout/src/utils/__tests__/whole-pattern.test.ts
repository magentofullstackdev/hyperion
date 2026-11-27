// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, expect, it, vi } from 'vitest';

import { matchesWhole } from '../whole-pattern.js';

describe('patterns of the extension surface', () => {
    it('match the whole value, as the HTML pattern attribute does', () => {
        expect(matchesWhole('[0-9]{5}', '12345')).toBe(true);
        expect(matchesWhole('[0-9]{5}', 'x12345y')).toBe(false);
        expect(matchesWhole('[0-9]{5}', '123456')).toBe(false);
    });

    it('apply an alternation to the whole value and leave an anchored pattern as it is', () => {
        expect(matchesWhole('PO|INV', 'PO')).toBe(true);
        expect(matchesWhole('PO|INV', 'POX')).toBe(false);
        expect(matchesWhole('^[A-Z]{2}$', 'AB')).toBe(true);
        expect(matchesWhole('^[A-Z]{2}$', 'ABC')).toBe(false);
    });

    it('fail closed on a pattern the browser cannot compile, logged once', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(matchesWhole('(?<=x', 'anything')).toBe(false);
        expect(matchesWhole('(?<=x', 'else')).toBe(false);
        expect(errors).toHaveBeenCalledTimes(1);
        errors.mockRestore();
    });
});
