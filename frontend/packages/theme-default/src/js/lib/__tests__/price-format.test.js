// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// formatPrice -- Magento's symbol based price format in the browser: the
// pattern, the decimal and group symbols and the precision of the store view.

import { describe, test, expect } from 'vitest';
import { formatPrice } from '../price-format.js';

const DE = {
    pattern: '%s €', precision: 2, requiredPrecision: 2,
    decimalSymbol: ',', groupSymbol: '.', groupLength: 3, integerRequired: false,
};
const US = {
    pattern: '$%s', precision: 2, requiredPrecision: 2,
    decimalSymbol: '.', groupSymbol: ',', groupLength: 3, integerRequired: false,
};
const JPY = {
    pattern: '¥%s', precision: 0, requiredPrecision: 0,
    decimalSymbol: '.', groupSymbol: ',', groupLength: 3, integerRequired: false,
};

describe('formatPrice', () => {
    test('a German store view groups with a dot and uses a decimal comma', () => {
        expect(formatPrice(1234.5, DE)).toBe('1.234,50 €');
        expect(formatPrice(36.805, DE)).toBe('36,81 €');
    });

    test('a US store view groups with a comma and uses a decimal dot', () => {
        expect(formatPrice(1234.5, US)).toBe('$1,234.50');
        expect(formatPrice(1234567.891, US)).toBe('$1,234,567.89');
        expect(formatPrice(999, US)).toBe('$999.00');
    });

    test('a zero precision currency prints no decimals and rounds', () => {
        expect(formatPrice(1234.5, JPY)).toBe('¥1,235');
        expect(formatPrice(0.4, JPY)).toBe('¥0');
    });

    test('a negative amount carries the sign before the pattern or in its {sign} slot', () => {
        expect(formatPrice(-1234.5, US)).toBe('-$1,234.50');
        expect(formatPrice(-5, { ...DE, pattern: '{sign}%s €' })).toBe('-5,00 €');
    });

    test('half cents round away from zero where toFixed() would round down', () => {
        expect(formatPrice(1.005, US)).toBe('$1.01');
        expect(formatPrice(0.995, US)).toBe('$1.00');
    });

    test('amounts below one keep a leading zero and numeric strings are accepted', () => {
        expect(formatPrice(0.5, DE)).toBe('0,50 €');
        expect(formatPrice('19.9', DE)).toBe('19,90 €');
    });

    test('a group length other than three is honored', () => {
        expect(formatPrice(1234567, { ...US, groupLength: 4 })).toBe('$123,4567.00');
    });

    test('without a price format the amount falls back to two decimals in the given pattern', () => {
        expect(formatPrice(1234.5, null, '€%s')).toBe('€1234.50');
        expect(formatPrice(1234.5, undefined)).toBe('1234.50');
    });
});
