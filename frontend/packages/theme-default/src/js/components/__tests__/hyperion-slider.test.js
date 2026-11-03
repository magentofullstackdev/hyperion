// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-slider tests.

import { describe, test, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-slider.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-slider.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');
const TWO_SLIDES = '<div class="slide-a"></div><div class="slide-b"></div>';

// The slide count is known only after the first render.
async function settle(el) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
}

describe('hyperion-slider -- Property 11 (no network on initial render)', () => {
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
                    const el = document.createElement('hyperion-slider');
                    if (attrs.autoplay) el.setAttribute('autoplay', '');
                    el.setAttribute('autoplay-interval', String(attrs.autoplayInterval));
                    el.setAttribute('prev-label', attrs.prevLabel);
                    el.setAttribute('next-label', attrs.nextLabel);
                    el.innerHTML = '<div><img src="/a.jpg" alt="a"></div><div><img src="/b.jpg" alt="b"></div>';
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

describe('hyperion-slider -- Property 12 (degrades gracefully)', () => {
    test('slotted slides remain accessible in light DOM after upgrade', async () => {
        const el = document.createElement('hyperion-slider');
        el.innerHTML = '<div class="slide-a"><img src="/a.jpg" alt="A"></div><div class="slide-b"><img src="/b.jpg" alt="B"></div>';
        await mount(el);
        expect(el.children.length).toBe(2);
        expect(el.querySelector('.slide-a img')?.getAttribute('alt')).toBe('A');
    });
});

describe('hyperion-slider -- Property 22 (a11y labels from attributes)', () => {
    test('prev-label and next-label attributes appear as aria-label on buttons', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringMatching(/^[A-Za-z0-9 '-]{1,20}$/),
                fc.stringMatching(/^[A-Za-z0-9 '-]{1,20}$/),
                async (prev, next) => {
                    const el = document.createElement('hyperion-slider');
                    el.setAttribute('prev-label', prev);
                    el.setAttribute('next-label', next);
                    el.innerHTML = TWO_SLIDES;
                    await mount(el);
                    await settle(el);
                    expect(el.shadowRoot?.querySelector('[part="prev-button"]')?.getAttribute('aria-label')).toBe(prev);
                    expect(el.shadowRoot?.querySelector('[part="next-button"]')?.getAttribute('aria-label')).toBe(next);
                }
            ),
            { numRuns: 20 }
        );
    });
});

describe('hyperion-slider -- PageBuilder settings', () => {
    async function mountSlider(data) {
        const el = document.createElement('hyperion-slider');
        Object.entries(data).forEach(([name, value]) => el.setAttribute(`data-${name}`, value));
        el.innerHTML = TWO_SLIDES;
        await mount(el);
        await settle(el);
        return el;
    }

    test('data-show-arrows="false" and data-show-dots="true" are honoured', async () => {
        const el = await mountSlider({ 'show-arrows': 'false', 'show-dots': 'true' });
        expect(el.shadowRoot.querySelector('[part="prev-button"]')).toBeNull();
        expect(el.shadowRoot.querySelectorAll('[part="dot"]').length).toBe(2);
    });

    test('arrows show and dots stay off by default', async () => {
        const el = await mountSlider({});
        expect(el.shadowRoot.querySelector('[part="next-button"]')).not.toBeNull();
        expect(el.shadowRoot.querySelector('[part="dots"]').hidden).toBe(true);
        expect(el.shadowRoot.querySelector('[part="dot"]')).toBeNull();
    });

    test('data-autoplay and data-autoplay-speed drive the autoplay', async () => {
        const el = await mountSlider({ autoplay: 'true', 'autoplay-speed': '4000' });
        expect(el.autoplay).toBe(true);
        expect(el.autoplayInterval).toBe(4000);
        const off = await mountSlider({ autoplay: 'false', 'autoplay-speed': '4000' });
        expect(off.autoplay).toBe(false);
    });

    test('without infinite loop the slider stops at both ends', async () => {
        const el = await mountSlider({ 'infinite-loop': 'false' });
        el.prev();
        expect(el._currentIndex).toBe(0);
        el.next();
        el.next();
        expect(el._currentIndex).toBe(1);
        await settle(el);
        expect(el.shadowRoot.querySelector('[part="next-button"]').disabled).toBe(true);
    });

    test('with infinite loop the slider wraps around', async () => {
        const el = await mountSlider({ 'infinite-loop': 'true' });
        el.prev();
        expect(el._currentIndex).toBe(1);
    });

    test('data-fade reflects to the fade attribute and only the active slide is interactive', async () => {
        const el = await mountSlider({ fade: 'true' });
        expect(el.hasAttribute('fade')).toBe(true);
        expect(el.children[0].hasAttribute('data-hyperion-active')).toBe(true);
        expect(el.children[1].hasAttribute('inert')).toBe(true);
        el.next();
        expect(el.children[1].hasAttribute('data-hyperion-active')).toBe(true);
        expect(el.children[0].hasAttribute('inert')).toBe(true);
    });
});

describe('hyperion-slider -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('no hex color literals', () => {
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
});
