// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { lockBodyScroll, unlockBodyScroll, resetScrollLock } from '../scroll-lock.js';

// The root element is `width` wide while the page scrolls and `lockedWidth`
// wide once the body overflow is hidden: equal when the gutter stays
// (scrollbar-gutter: stable, overlay scrollbars), wider by the scrollbar
// when the gutter collapses.
// happy-dom reports a stale `style.overflow` once getComputedStyle() has
// been called on the body, so the inline style attribute is the witness.
const inlineStyle = () => document.body.getAttribute('style') ?? '';

const rootGrowsTo = (width, lockedWidth) => {
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockImplementation(() => ({
        width: document.body.style.overflow === 'hidden' ? lockedWidth : width,
    }));
};

describe('scroll-lock', () => {
    beforeEach(() => {
        resetScrollLock();
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    });
    afterEach(() => vi.restoreAllMocks());

    test('pads the body by the width the root gains when the gutter collapses and restores it afterwards', () => {
        rootGrowsTo(985, 1000);
        lockBodyScroll();
        expect(inlineStyle()).toContain('overflow: hidden');
        expect(inlineStyle()).toContain('padding-right: 15px');
        expect(document.body.hasAttribute('data-hyperion-scroll-locked')).toBe(true);
        unlockBodyScroll();
        expect(inlineStyle()).not.toContain('overflow');
        expect(inlineStyle()).not.toContain('padding-right');
        expect(document.body.hasAttribute('data-hyperion-scroll-locked')).toBe(false);
    });

    test('adds no padding while the gutter stays (stable gutter or overlay scrollbars), even with a scrollbar present', () => {
        rootGrowsTo(985, 985);
        lockBodyScroll();
        expect(inlineStyle()).toContain('overflow: hidden');
        expect(inlineStyle()).not.toContain('padding-right');
        unlockBodyScroll();
    });

    test('counts nested locks and releases once', () => {
        rootGrowsTo(1000, 1000);
        lockBodyScroll();
        lockBodyScroll();
        unlockBodyScroll();
        expect(inlineStyle()).toContain('overflow: hidden');
        unlockBodyScroll();
        expect(inlineStyle()).not.toContain('overflow');
        unlockBodyScroll();
        expect(inlineStyle()).not.toContain('overflow');
    });
});
