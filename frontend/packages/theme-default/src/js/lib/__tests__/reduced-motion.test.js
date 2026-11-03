// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, afterEach, vi } from 'vitest';
import { prefersReducedMotion, scrollBehavior } from '../reduced-motion.js';

const REDUCE = '(prefers-reduced-motion: reduce)';

const stubMatchMedia = (reduce) => {
    const media = vi.fn((query) => ({ matches: reduce && query === REDUCE, media: query }));
    vi.stubGlobal('matchMedia', media);
    return media;
};

describe('reduced-motion', () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    test('reads the reduce preference from matchMedia on every call', () => {
        const media = stubMatchMedia(true);
        expect(prefersReducedMotion()).toBe(true);
        expect(scrollBehavior()).toBe('auto');
        expect(media).toHaveBeenCalledWith(REDUCE);
        stubMatchMedia(false);
        expect(prefersReducedMotion()).toBe(false);
        expect(scrollBehavior()).toBe('smooth');
    });

    test('without matchMedia the visitor has no preference', () => {
        vi.stubGlobal('matchMedia', undefined);
        expect(prefersReducedMotion()).toBe(false);
        expect(scrollBehavior()).toBe('smooth');
    });
});
