// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-accordion tests.
//
// Single-open toggle behavior: clicking item i's header toggles item i; when
// allow-multiple is false, opening a new item closes all other currently-open
// items.

import { describe, test, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-accordion.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-accordion.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

async function createAccordion(labels, { allowMultiple = false } = {}) {
    const host = document.createElement('hyperion-accordion');
    if (allowMultiple) host.setAttribute('allow-multiple', '');
    host.innerHTML = labels
        .map((l, i) => `<hyperion-accordion-item label="${l}"><p>Body ${i}</p></hyperion-accordion-item>`)
        .join('');
    await mount(host);
    for (const child of host.children) {
        if (typeof child.updateComplete?.then === 'function') await child.updateComplete;
    }
    await host.updateComplete;
    return host;
}

function clickHeader(item) {
    // Invoke the handler bound to the header button's @click listener
    // directly. happy-dom routes synthetic MouseEvents inconsistently through
    // Lit's declarative @click bindings, so we dispatch the same
    // hyperion-accordion-item-toggle custom event the handler would emit.
    // This exercises the full parent-side reducer we care about
    // (activeIndex / _openItems semantics) while staying hermetic from
    // pointer-event simulation quirks.
    item._toggle();
}

describe('hyperion-accordion -- Property 11 (no network on initial render)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('mounts any number of items without any fetch', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.stringMatching(/^[A-Za-z0-9 ]{1,10}$/),
                    { minLength: 1, maxLength: 5 }
                ),
                async (labels) => {
                    const fetchSpy = spyFetch();
                    const host = await createAccordion(labels);
                    expect(fetchSpy).not.toHaveBeenCalled();
                    fetchSpy.mockRestore();
                    host.remove();
                }
            ),
            { numRuns: 15 }
        );
    });
});

describe('hyperion-accordion -- Property 12 (degrades gracefully)', () => {
    test('slotted items remain in the light DOM after upgrade', async () => {
        const host = await createAccordion(['A', 'B', 'C']);
        expect(host.querySelectorAll('hyperion-accordion-item').length).toBe(3);
        expect(host.querySelector('hyperion-accordion-item:nth-child(2)')?.getAttribute('label')).toBe('B');
    });
});

describe('hyperion-accordion -- Property 32 (single-open toggle behavior)', () => {
    test('with allow-multiple=false, opening item i closes others', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.stringMatching(/^[A-Za-z]{1,6}$/),
                    { minLength: 3, maxLength: 5 }
                ).chain(labels =>
                    fc.record({
                        labels: fc.constant(labels),
                        first: fc.integer({ min: 0, max: labels.length - 1 }),
                        second: fc.integer({ min: 0, max: labels.length - 1 }),
                    })
                ),
                async ({ labels, first, second }) => {
                    fc.pre(first !== second);
                    const host = await createAccordion(labels, { allowMultiple: false });
                    const items = [...host.children];

                    // Open first item.
                    clickHeader(items[first]);
                    await host.updateComplete;
                    for (const it of items) if (typeof it.updateComplete?.then === 'function') await it.updateComplete;
                    expect(items[first].open).toBe(true);
                    items.forEach((it, i) => { if (i !== first) expect(it.open).toBe(false); });

                    // Open second item -- should close the first.
                    clickHeader(items[second]);
                    await host.updateComplete;
                    for (const it of items) if (typeof it.updateComplete?.then === 'function') await it.updateComplete;
                    expect(items[second].open).toBe(true);
                    items.forEach((it, i) => { if (i !== second) expect(it.open).toBe(false); });

                    host.remove();
                }
            ),
            { numRuns: 12 }
        );
    });

    test('with allow-multiple=true, opening item i leaves others alone', async () => {
        const host = await createAccordion(['A', 'B', 'C'], { allowMultiple: true });
        const [a, b, c] = [...host.children];

        clickHeader(a);
        await host.updateComplete;
        for (const it of [a, b, c]) await it.updateComplete;
        expect(a.open).toBe(true); expect(b.open).toBe(false); expect(c.open).toBe(false);

        clickHeader(c);
        await host.updateComplete;
        for (const it of [a, b, c]) await it.updateComplete;
        expect(a.open).toBe(true); expect(b.open).toBe(false); expect(c.open).toBe(true);
    });

    test('clicking the same header twice toggles the item closed', async () => {
        const host = await createAccordion(['A', 'B'], { allowMultiple: false });
        const [a] = [...host.children];
        clickHeader(a);
        await host.updateComplete;
        await a.updateComplete;
        expect(a.open).toBe(true);
        clickHeader(a);
        await host.updateComplete;
        await a.updateComplete;
        expect(a.open).toBe(false);
    });
});

describe('hyperion-accordion -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('no hex color literals', () => {
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
});
