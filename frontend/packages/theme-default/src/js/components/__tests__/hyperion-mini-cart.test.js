// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-mini-cart tests.
//
// Network gating is relaxed for this component: fetch is permitted IN RESPONSE
// TO a user-initiated `openPanel()` call, but NOT during initial render.

import { describe, test, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-mini-cart.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-mini-cart.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('hyperion-mini-cart -- Property 11 (no network on initial render)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('mounts with any attribute combo without any fetch', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    count: fc.integer({ min: 0, max: 999 }),
                    triggerLabel: fc.string({ minLength: 0, maxLength: 24 }),
                    emptyMessage: fc.string({ minLength: 0, maxLength: 40 }),
                    closeLabel: fc.string({ minLength: 0, maxLength: 24 }),
                    fragmentUrl: fc.constant('/hyperion/checkout/minicart/fragment'),
                    triggerUrl: fc.constant('/checkout/cart'),
                }),
                async (attrs) => {
                    const fetchSpy = spyFetch();
                    const el = document.createElement('hyperion-mini-cart');
                    el.setAttribute('count',         String(attrs.count));
                    el.setAttribute('trigger-label', attrs.triggerLabel);
                    el.setAttribute('empty-message', attrs.emptyMessage);
                    el.setAttribute('close-label',   attrs.closeLabel);
                    el.setAttribute('fragment-url',  attrs.fragmentUrl);
                    el.setAttribute('trigger-url',   attrs.triggerUrl);
                    el.innerHTML = '<a slot="trigger" href="/checkout/cart">Cart</a>';
                    await mount(el);
                    expect(fetchSpy).not.toHaveBeenCalled();
                    fetchSpy.mockRestore();
                    el.remove();
                }
            ),
            { numRuns: 15 }
        );
    });
});

describe('hyperion-mini-cart -- Property 12 (degrades gracefully)', () => {
    test('slotted trigger <a> remains in light DOM after upgrade, its href parked in a data attribute', async () => {
        const el = document.createElement('hyperion-mini-cart');
        el.setAttribute('trigger-url', '/checkout/cart');
        el.innerHTML = '<a slot="trigger" href="/checkout/cart" id="cart-fallback">Cart</a>';
        await mount(el);
        const link = el.querySelector('#cart-fallback');
        expect(link).not.toBeNull();
        // The shadow button is the one control once upgraded (no nested
        // interactive); the no-JS link gets its href back when the element
        // leaves the document (hyperion-mini-cart-trigger.test.js).
        expect(link.hasAttribute('href')).toBe(false);
        expect(link.getAttribute('data-hyperion-href')).toBe('/checkout/cart');
    });
});

describe('hyperion-mini-cart -- Property 22 (labels from attributes)', () => {
    test('trigger-label propagates to trigger button aria-label', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringMatching(/^[A-Za-z0-9 '-]{1,20}$/),
                async (label) => {
                    const el = document.createElement('hyperion-mini-cart');
                    el.setAttribute('trigger-label', label);
                    await mount(el);
                    expect(el.shadowRoot?.querySelector('[part="trigger"]')?.getAttribute('aria-label')).toBe(label);
                    el.remove();
                }
            ),
            { numRuns: 20 }
        );
    });
});

describe('hyperion-mini-cart -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('only permitted non-semantic color is the neutral drop-shadow', () => {
        // rgba(0, 0, 0, 0.15) is allowed per spec; hex literals are NOT.
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
});
