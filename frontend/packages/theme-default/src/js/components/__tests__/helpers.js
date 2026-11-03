// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Shared Vitest helpers for Hyperion Lit component tests.
//
// These helpers insulate every test from the custom-element registry + DOM
// lifecycle details so the property tests read like the specification and
// exercise only the behavior under assertion.
import { vi } from 'vitest';

/**
 * Mount an HTMLElement (typically a freshly-created custom element) into
 * document.body and wait for its updateComplete promise if present. Every
 * call to mount() yields a fresh node -- callers are expected to remove it
 * or rely on the afterEach(setup.js) hook that empties document.body.
 */
export async function mount(el) {
    document.body.appendChild(el);
    if (typeof el.updateComplete?.then === 'function') {
        await el.updateComplete;
    }
    return el;
}

/**
 * Spy on the global fetch. Returns the spy so the test can assert on calls.
 * The spy resolves to a benign 200 OK with an empty body by default -- the
 * "no network on initial render" tests assert the spy was NEVER called.
 */
export function spyFetch(responseText = '') {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(responseText, { status: 200, headers: { 'Content-Type': 'text/html' } })
    );
}

/**
 * Regex that matches every forbidden absolute Tailwind palette class. Used
 * in a trust-but-verify smoke test on the component source -- catches
 * regressions if a future edit slips a palette class into the shadow CSS.
 */
export const FORBIDDEN_PALETTE_REGEX =
    /(bg|text|border|ring|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)-[0-9]+/;

/**
 * Regex that matches hex color literals. The only approved non-semantic
 * color value in the whole component tree is `rgba(0, 0, 0, 0.15)` for the
 * mini-cart drop-shadow, which is NOT a hex literal. Any hex literal in a
 * component source is a violation of the Agnostic Theming Protocol.
 *
 * Uses a negative look-behind on `&` so HTML numeric character references
 * like `&#8249;` / `&#x2212;` do NOT match -- they decode to glyphs
 * (U+2039, U+2212), not to hex digits. Also requires the exact 3/4/6/8
 * hex-digit shapes CSS accepts for a color literal.
 */
export const HEX_COLOR_REGEX = /(?<![&\w])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?!;)/;
