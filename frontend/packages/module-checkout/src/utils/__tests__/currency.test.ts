// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect } from 'vitest';
import { formatMoney } from '../currency.js';
import type { PriceFormat } from '../../types/config.js';

const USD: PriceFormat = {
    pattern: '$%s',
    precision: 2,
    requiredPrecision: 2,
    decimalSymbol: '.',
    groupSymbol: ',',
    groupLength: 3,
    integerRequired: false,
};

const EUR: PriceFormat = {
    pattern: '€%s',
    precision: 2,
    requiredPrecision: 2,
    decimalSymbol: ',',
    groupSymbol: '.',
    groupLength: 3,
    integerRequired: false,
};

describe('formatMoney', () => {
    it('formats a simple positive number', () => {
        expect(formatMoney(52, USD)).toBe('$52.00');
    });

    it('accepts the Magento decimal-string shape', () => {
        expect(formatMoney('52.0000', USD)).toBe('$52.00');
    });

    it('groups thousands', () => {
        expect(formatMoney(1234567.89, USD)).toBe('$1,234,567.89');
    });

    it('respects locale-specific separators', () => {
        expect(formatMoney(1234.5, EUR)).toBe('€1.234,50');
    });

    it('handles zero', () => {
        expect(formatMoney(0, USD)).toBe('$0.00');
    });

    it('handles negatives', () => {
        expect(formatMoney(-5.5, USD)).toBe('-$5.50');
    });

    it('renders pattern with empty value on NaN rather than crashing', () => {
        expect(formatMoney(Number.NaN, USD)).toBe('$');
        expect(formatMoney('oops', USD)).toBe('$');
    });

    it('obeys requiredPrecision when smaller than precision', () => {
        const twoDp = { ...USD, precision: 4, requiredPrecision: 2 };
        expect(formatMoney(1.5, twoDp)).toBe('$1.50');
    });
});
