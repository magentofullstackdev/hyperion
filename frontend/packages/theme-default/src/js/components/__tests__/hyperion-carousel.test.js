// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-carousel tests.

import { describe, test, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { HyperionCarousel } from '../hyperion-carousel.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-carousel.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('hyperion-carousel -- Property 11 (no network on initial render)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('mounts with any attribute combo without any fetch', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    autoplay: fc.boolean(),
                    autoplayInterval: fc.integer({ min: 1000, max: 10000 }),
                    prevLabel: fc.string({ minLength: 0, maxLength: 24 }),
                    nextLabel: fc.string({ minLength: 0, maxLength: 24 }),
                }),
                async (attrs) => {
                    const fetchSpy = spyFetch();
                    const el = document.createElement('hyperion-carousel');
                    if (attrs.autoplay) el.setAttribute('autoplay', '');
                    el.setAttribute('autoplay-interval', String(attrs.autoplayInterval));
                    el.setAttribute('prev-label', attrs.prevLabel);
                    el.setAttribute('next-label', attrs.nextLabel);
                    el.innerHTML = '<div>A</div><div>B</div><div>C</div>';
                    await mount(el);
                    expect(fetchSpy).not.toHaveBeenCalled();
                    fetchSpy.mockRestore();
                    el.remove();
                }
            ),
            { numRuns: 20 }
        );
    });
});

describe('hyperion-carousel -- Property 12 (degrades gracefully)', () => {
    test('slotted items remain in light DOM after upgrade', async () => {
        const el = document.createElement('hyperion-carousel');
        el.innerHTML = '<div class="it-0">Item 0</div><div class="it-1">Item 1</div>';
        await mount(el);
        expect(el.querySelector('.it-0')?.textContent).toBe('Item 0');
        expect(el.children.length).toBe(2);
    });
});

describe('hyperion-carousel -- Property 22 (a11y labels from attributes)', () => {
    test('prev-label and next-label propagate to button aria-labels', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringMatching(/^[A-Za-z0-9 '-]{1,20}$/),
                fc.stringMatching(/^[A-Za-z0-9 '-]{1,20}$/),
                async (prev, next) => {
                    const el = document.createElement('hyperion-carousel');
                    el.setAttribute('prev-label', prev);
                    el.setAttribute('next-label', next);
                    await mount(el);
                    expect(el.shadowRoot?.querySelector('[part="prev-button"]')?.getAttribute('aria-label')).toBe(prev);
                    expect(el.shadowRoot?.querySelector('[part="next-button"]')?.getAttribute('aria-label')).toBe(next);
                }
            ),
            { numRuns: 20 }
        );
    });
});

describe('hyperion-carousel -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('no hex color literals', () => {
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
});

// Reduced motion. The document's `_motion.css` never reaches
// the shadow root and the `behavior` option of a scroll call overrides the
// CSS property, so the component reads the preference itself.
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
const stubMatchMedia = (reduce) => vi.stubGlobal('matchMedia', vi.fn((query) => ({
    matches: reduce && query === REDUCE_QUERY,
    media: query,
})));

// happy-dom lays nothing out: the track geometry is faked so the arrows take
// their scrollBy branch and the edges their scrollTo branch.
async function carouselWithTrack({ scrollLeft = 200, clientWidth = 200, scrollWidth = 600, attrs = {} } = {}) {
    const el = document.createElement('hyperion-carousel');
    Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));
    el.innerHTML = '<div>A</div><div>B</div><div>C</div>';
    await mount(el);
    const track = el.shadowRoot.querySelector('[part="track"]');
    Object.defineProperty(track, 'scrollLeft', { value: scrollLeft, configurable: true, writable: true });
    Object.defineProperty(track, 'clientWidth', { value: clientWidth, configurable: true });
    Object.defineProperty(track, 'scrollWidth', { value: scrollWidth, configurable: true });
    track.scrollTo = vi.fn();
    track.scrollBy = vi.fn();
    return { el, track };
}

describe('hyperion-carousel -- reduced motion', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

    test.each([
        [true, 'auto'],
        [false, 'smooth'],
    ])('reduce=%s: arrows, dots and the loop edges scroll with behavior %s', async (reduce, behavior) => {
        stubMatchMedia(reduce);
        const { el, track } = await carouselWithTrack();

        el.shadowRoot.querySelector('[part="prev-button"]').click();
        expect(track.scrollBy).toHaveBeenLastCalledWith({ left: -200, behavior });
        el.shadowRoot.querySelector('[part="next-button"]').click();
        expect(track.scrollBy).toHaveBeenLastCalledWith({ left: 200, behavior });

        el.showDots = true;
        el._pageCount = 3;
        el.requestUpdate();
        await el.updateComplete;
        el.shadowRoot.querySelectorAll('[part="dot"]')[2].click();
        expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior });

        // At the first item the previous arrow wraps to the end (loop on).
        track.scrollLeft = 0;
        el.shadowRoot.querySelector('[part="prev-button"]').click();
        expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior });
        // At the last page the next arrow wraps to the start.
        track.scrollLeft = 400;
        el.shadowRoot.querySelector('[part="next-button"]').click();
        expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior });

        expect(track.scrollBy).toHaveBeenCalledTimes(2);
        expect(track.scrollTo).toHaveBeenCalledTimes(3);
    });

    test('autoplay never starts under reduce and scrolls smoothly otherwise', async () => {
        vi.useFakeTimers();
        stubMatchMedia(true);
        const reduced = await carouselWithTrack({ attrs: { autoplay: '', 'autoplay-interval': '1000' } });
        expect(reduced.el._autoplayTimer).toBeNull();
        vi.advanceTimersByTime(3000);
        expect(reduced.track.scrollBy).not.toHaveBeenCalled();
        expect(reduced.track.scrollTo).not.toHaveBeenCalled();
        reduced.el.remove();

        stubMatchMedia(false);
        const moving = await carouselWithTrack({ attrs: { autoplay: '', 'autoplay-interval': '1000' } });
        expect(moving.el._autoplayTimer).not.toBeNull();
        vi.advanceTimersByTime(1000);
        expect(moving.track.scrollBy).toHaveBeenCalledTimes(1);
        expect(moving.track.scrollBy.mock.calls[0][0].behavior).toBe('smooth');
        moving.el.remove();
        expect(moving.el._autoplayTimer).toBeNull();
    });

    test('the shadow stylesheet turns smooth scrolling off under reduce', () => {
        const cssText = [].concat(HyperionCarousel.styles).map((style) => style.cssText).join('\n');
        expect(cssText).toMatch(/\[part="track"\]\s*\{[^}]*scroll-behavior:\s*smooth/);
        const reduce = cssText.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\s{8}\}/);
        expect(reduce).not.toBeNull();
        expect(reduce[1]).toMatch(/\[part="track"\]\s*\{[^}]*scroll-behavior:\s*auto/);
        expect(cssText).not.toMatch(/transform:\s*none/);
    });
});
