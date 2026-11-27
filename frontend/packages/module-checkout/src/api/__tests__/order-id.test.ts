// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, expect, it } from 'vitest';

import { orderIdOf } from '../payment.js';

describe('orderIdOf', () => {
    it('keeps a numeric order id', () => {
        expect(orderIdOf(167)).toBe(167);
    });

    it('reads an order id answered as a JSON string', () => {
        expect(orderIdOf('167')).toBe(167);
        expect(orderIdOf(' 42 ')).toBe(42);
    });

    it('hands on an answer that is not an id unchanged', () => {
        expect(orderIdOf('abc')).toBe('abc');
        expect(orderIdOf('0')).toBe('0');
        expect(orderIdOf(null)).toBeNull();
    });
});
