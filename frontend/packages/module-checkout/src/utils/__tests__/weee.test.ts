// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import type { CartItem } from '../../types/quote.js';
import { setActiveCatalogForTests } from '../i18n.js';
import { parseWeeeLines } from '../weee.js';

const item = (applied: unknown): CartItem => ({ weee_tax_applied: applied } as unknown as CartItem);

describe('parseWeeeLines', () => {
    afterEach(() => {
        setActiveCatalogForTests({}, 'en_US');
    });

    it('keeps the title the store gave the tax', () => {
        const lines = parseWeeeLines(item(JSON.stringify([{ title: 'Eco fee', amount: 2.5, row_amount: 5 }])));
        expect(lines).toEqual([{ title: 'Eco fee', amount: 2.5, rowAmount: 5 }]);
    });

    it('names a tax without a title with the translated fallback', () => {
        setActiveCatalogForTests({ 'Hyperion_Checkout::fpt_fallback_title': 'Tassa fissa' }, 'it_IT');
        const lines = parseWeeeLines(item([{ title: '', amount: 1, row_amount: 2 }, { amount: 1, row_amount: 3 }]));
        expect(lines.map((line) => line.title)).toEqual(['Tassa fissa', 'Tassa fissa']);
    });

    it('reads the amounts including tax when asked and skips a line without a row amount', () => {
        const applied = [
            { title: 'A', amount: 1, row_amount: 2, amount_incl_tax: 1.22, row_amount_incl_tax: 2.44 },
            { title: 'B', amount: 0, row_amount: 0 },
        ];
        expect(parseWeeeLines(item(applied), true)).toEqual([{ title: 'A', amount: 1.22, rowAmount: 2.44 }]);
    });
});
