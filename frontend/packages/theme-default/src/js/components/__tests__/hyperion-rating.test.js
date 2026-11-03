// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-rating -- style-host component. Minimal test coverage that the
// element registers, projects slotted children, and honors Agnostic Theming.

import { describe, test, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-rating.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-rating.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('hyperion-rating -- style host', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-rating')).toBeTypeOf('function');
    });

    test('mounts without any fetch', async () => {
        const fetchSpy = spyFetch();
        const el = document.createElement('hyperion-rating');
        el.innerHTML = `
            <input type="radio" id="r5" name="rating" value="5"><label for="r5">★</label>
            <input type="radio" id="r4" name="rating" value="4"><label for="r4">★</label>
        `;
        await mount(el);
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    test('slotted radio inputs remain in light DOM after upgrade', async () => {
        const el = document.createElement('hyperion-rating');
        el.innerHTML = `<input type="radio" id="r5" name="rating" value="5"><label for="r5">★</label>`;
        await mount(el);
        expect(el.querySelectorAll('input[type="radio"]').length).toBe(1);
    });
});

describe('hyperion-rating -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('no hex color literals', () => {
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
});
