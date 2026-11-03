// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect } from 'vitest';
import { regionListForCountry, isPostcodeOptional } from '../region.js';

describe('regionListForCountry', () => {
    it('returns [] when directory is undefined', () => {
        expect(regionListForCountry(undefined, 'US')).toEqual([]);
    });

    it('returns [] when country is missing', () => {
        expect(regionListForCountry({ CA: {} }, 'US')).toEqual([]);
    });

    it('reads region objects keyed by id', () => {
        const out = regionListForCountry(
            {
                US: {
                    regions: {
                        '1': { name: 'Alabama', code: 'AL' },
                        '97': { name: 'Michigan', code: 'MI' },
                    },
                },
            },
            'US'
        );
        expect(out).toEqual([
            { id: '1', code: 'AL', name: 'Alabama' },
            { id: '97', code: 'MI', name: 'Michigan' },
        ]);
    });
});

describe('isPostcodeOptional', () => {
    it('is false when list is undefined', () => {
        expect(isPostcodeOptional(undefined, 'US')).toBe(false);
    });
    it('is true when country is listed', () => {
        expect(isPostcodeOptional(['HK', 'IE'], 'IE')).toBe(true);
    });
    it('is false when country is not listed', () => {
        expect(isPostcodeOptional(['HK'], 'US')).toBe(false);
    });
});
