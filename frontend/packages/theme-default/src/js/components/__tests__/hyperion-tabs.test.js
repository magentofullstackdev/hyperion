// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-tabs tests.
//
// Active-index semantics: for any <hyperion-tabs> with N children, clicking
// tab i sets activeIndex=i, shows panel i, hides all others, sets
// aria-selected="true" on tab i and "false" on the rest.

import { describe, test, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-tabs.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-tabs.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

async function createTabs(tabLabels) {
    const host = document.createElement('hyperion-tabs');
    host.innerHTML = tabLabels
        .map((label, i) => `<hyperion-tab label="${label}"><p>Panel ${i} body</p></hyperion-tab>`)
        .join('');
    await mount(host);
    for (const child of host.children) {
        if (typeof child.updateComplete?.then === 'function') await child.updateComplete;
    }
    // Force slot-population path. happy-dom does not always fire an initial
    // slotchange, so we kick the same callback the real slot event would.
    host.onSlotChange?.();
    await host.updateComplete;
    return host;
}

describe('hyperion-tabs -- Property 11 (no network on initial render)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('mounts N tabs without any fetch', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.stringMatching(/^[A-Za-z0-9 ]{1,12}$/),
                    { minLength: 2, maxLength: 5 }
                ),
                async (labels) => {
                    const fetchSpy = spyFetch();
                    const host = await createTabs(labels);
                    expect(fetchSpy).not.toHaveBeenCalled();
                    fetchSpy.mockRestore();
                    host.remove();
                }
            ),
            { numRuns: 15 }
        );
    });
});

describe('hyperion-tabs -- Property 12 (degrades gracefully)', () => {
    test('slotted <hyperion-tab> children remain in light DOM', async () => {
        const host = await createTabs(['One', 'Two', 'Three']);
        expect(host.querySelectorAll('hyperion-tab').length).toBe(3);
        expect(host.querySelector('hyperion-tab:nth-child(2)')?.getAttribute('label')).toBe('Two');
    });
});

describe('hyperion-tabs -- Property 31 (active-index semantics)', () => {
    test('clicking tab i sets aria-selected correctly for all tabs', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(
                    fc.stringMatching(/^[A-Za-z0-9]{1,8}$/),
                    { minLength: 2, maxLength: 5 }
                ).chain(labels =>
                    fc.record({
                        labels: fc.constant(labels),
                        targetIndex: fc.integer({ min: 0, max: labels.length - 1 }),
                    })
                ),
                async ({ labels, targetIndex }) => {
                    const host = await createTabs(labels);
                    const buttons = host.shadowRoot.querySelectorAll('[part="tab"]');
                    expect(buttons.length).toBe(labels.length);
                    buttons[targetIndex].click();
                    await host.updateComplete;
                    for (const child of host.children) {
                        if (typeof child.updateComplete?.then === 'function') await child.updateComplete;
                    }
                    // Assert aria-selected + active attribute on children.
                    host.shadowRoot.querySelectorAll('[part="tab"]').forEach((btn, i) => {
                        expect(btn.getAttribute('aria-selected')).toBe(String(i === targetIndex));
                    });
                    [...host.children].forEach((tab, i) => {
                        expect(tab.hasAttribute('active')).toBe(i === targetIndex);
                    });
                    host.remove();
                }
            ),
            { numRuns: 15 }
        );
    });
});

describe('hyperion-tabs -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('no hex color literals', () => {
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
});
