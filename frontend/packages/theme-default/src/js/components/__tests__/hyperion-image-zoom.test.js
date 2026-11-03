// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-image-zoom tests.

import { describe, test, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-image-zoom.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-image-zoom.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('hyperion-image-zoom -- Property 11 (no network on initial render)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('mounts with any zoom-scale without any fetch', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.double({ min: 1.5, max: 5, noNaN: true }),
                async (scale) => {
                    const fetchSpy = spyFetch();
                    const el = document.createElement('hyperion-image-zoom');
                    el.setAttribute('zoom-scale', String(scale));
                    el.innerHTML = '<img src="/p.jpg" alt="p">';
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

describe('hyperion-image-zoom -- Property 12 (degrades gracefully)', () => {
    test('slotted <img> remains addressable in light DOM after upgrade', async () => {
        const el = document.createElement('hyperion-image-zoom');
        el.innerHTML = '<img id="product-img" src="/p.jpg" alt="Product">';
        await mount(el);
        const img = el.querySelector('#product-img');
        expect(img).not.toBeNull();
        expect(img.getAttribute('alt')).toBe('Product');
        expect(img.getAttribute('src')).toBe('/p.jpg');
    });
});

describe('hyperion-image-zoom -- Property 22 (no hard-coded user text)', () => {
    test('render template contains no user-facing English literals', () => {
        const renderBlock = SOURCE.match(/render\s*\(\)\s*\{[\s\S]*?return\s+html[\s\S]*?`[\s\S]*?`[\s\S]*?^\s*\}/m)?.[0] ?? '';
        expect(renderBlock).not.toMatch(/['"`]\s*(Zoom|Close|Open|Loading|Search|Cart)\s*['"`]/i);
    });
});

describe('hyperion-image-zoom -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('no hex color literals', () => {
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
});
