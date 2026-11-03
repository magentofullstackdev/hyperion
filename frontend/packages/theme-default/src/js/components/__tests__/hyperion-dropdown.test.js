// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-dropdown tests.
//
// Asserts: Lit components render from attributes without network requests,
// degrade gracefully without JavaScript, and surface user-facing text from
// HTML attributes.

import { describe, test, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-dropdown.js';
import { mount, spyFetch, FORBIDDEN_PALETTE_REGEX, HEX_COLOR_REGEX } from './helpers.js';

const SOURCE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-dropdown.js');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

describe('hyperion-dropdown -- Property 11 (no network on initial render)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    test('mounts with any valid attribute combination without any fetch', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    label: fc.string({ minLength: 0, maxLength: 40 }),
                    menuLabel: fc.string({ minLength: 0, maxLength: 40 }),
                }),
                async (attrs) => {
                    const fetchSpy = spyFetch();
                    const el = document.createElement('hyperion-dropdown');
                    el.setAttribute('label',      attrs.label);
                    el.setAttribute('menu-label', attrs.menuLabel);
                    el.innerHTML = '<a href="/a">A</a><a href="/b">B</a>';
                    await mount(el);
                    expect(fetchSpy).not.toHaveBeenCalled();
                    fetchSpy.mockRestore();
                }
            ),
            { numRuns: 25 }
        );
    });
});

describe('hyperion-dropdown -- Property 12 (degrades gracefully)', () => {
    test('slotted server HTML remains in the light DOM after upgrade', async () => {
        const el = document.createElement('hyperion-dropdown');
        el.setAttribute('label', 'Account');
        el.innerHTML = '<a id="a-link" href="/acct/orders">Orders</a><a href="/acct/wishlist">Wishlist</a>';
        await mount(el);
        // Light children are still present -- the shadow DOM just projects them.
        const link = el.querySelector('#a-link');
        expect(link).not.toBeNull();
        expect(link.getAttribute('href')).toBe('/acct/orders');
        // Two links are slotted.
        expect(el.querySelectorAll('a').length).toBe(2);
    });
});

describe('hyperion-dropdown -- Property 22 (text from HTML attributes)', () => {
    test('label attribute appears in the rendered shadow DOM', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Use printable ASCII that can survive HTML attribute-set round-trip.
                fc.stringMatching(/^[A-Za-z0-9 ,.'-]{1,24}$/),
                async (label) => {
                    const el = document.createElement('hyperion-dropdown');
                    el.setAttribute('label', label);
                    await mount(el);
                    const triggerText = el.shadowRoot?.querySelector('[part="trigger"] span')?.textContent ?? '';
                    expect(triggerText).toBe(label);
                }
            ),
            { numRuns: 20 }
        );
    });

    test('menu-label attribute drives the dialog name of a drawer', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.stringMatching(/^[A-Za-z0-9 '-]{1,24}$/),
                async (menuLabel) => {
                    const el = document.createElement('hyperion-dropdown');
                    el.setAttribute('label', 'X');
                    el.setAttribute('placement', 'drawer');
                    el.setAttribute('menu-label', menuLabel);
                    await mount(el);
                    const panel = el.shadowRoot?.querySelector('[part="panel"]');
                    expect(panel?.getAttribute('role')).toBe('dialog');
                    expect(panel?.getAttribute('aria-label')).toBe(menuLabel);
                }
            ),
            { numRuns: 15 }
        );
    });

    // Deep active element: the drawer panel lives in the shadow root, its
    // slotted content in the light DOM.
    const activeElement = () => document.activeElement?.shadowRoot?.activeElement ?? document.activeElement;
    const openDrawer = async (innerHtml) => {
        const el = document.createElement('hyperion-dropdown');
        el.setAttribute('label', 'Menu');
        el.setAttribute('placement', 'drawer');
        el.setAttribute('menu-label', 'Mobile navigation');
        el.innerHTML = innerHtml;
        await mount(el);
        el.shadowRoot.querySelector('[part="trigger"]').click();
        await el.updateComplete;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return el;
    };

    test('a drawer opens with the focus on its first control that is not a text field', async () => {
        const el = await openDrawer('<form role="search"><input id="q" type="search" name="q"></form><a id="first-link" href="/women">Women</a><a href="/men">Men</a>');
        expect(activeElement()?.id).toBe('first-link');
        el.remove();
    });

    test('a drawer whose only control is a text field still focuses it', async () => {
        const el = await openDrawer('<form role="search"><input id="only" type="search" name="q"></form>');
        expect(activeElement()?.id).toBe('only');
        el.remove();
    });

    test('Enter on the trigger of an inline dropdown opens it and focuses the first item', async () => {
        const el = document.createElement('hyperion-dropdown');
        el.setAttribute('label', 'Account');
        el.innerHTML = '<a id="sign-in" href="/customer/account/login">Sign In</a><a href="/customer/account/create">Create an Account</a>';
        await mount(el);
        const trigger = el.shadowRoot.querySelector('[part="trigger"]');
        trigger.focus();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await el.updateComplete;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(el.hasAttribute('open')).toBe(true);
        expect(activeElement()?.id).toBe('sign-in');
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await el.updateComplete;
        expect(el.hasAttribute('open')).toBe(false);
        expect(activeElement()).toBe(trigger);
    });

    test('a click on the trigger opens the dropdown without moving the focus', async () => {
        const el = document.createElement('hyperion-dropdown');
        el.setAttribute('label', 'Account');
        el.innerHTML = '<a id="sign-in" href="/customer/account/login">Sign In</a>';
        await mount(el);
        const trigger = el.shadowRoot.querySelector('[part="trigger"]');
        trigger.focus();
        trigger.click();
        await el.updateComplete;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(el.hasAttribute('open')).toBe(true);
        expect(activeElement()).toBe(trigger);
    });

    test('an inline dropdown is a disclosure: no menu role, no popup type, no stray label', async () => {
        const el = document.createElement('hyperion-dropdown');
        el.setAttribute('label', 'Account');
        el.setAttribute('menu-label', 'Account');
        el.innerHTML = '<a href="/a">A</a><a href="/b">B</a>';
        await mount(el);
        const panel = el.shadowRoot?.querySelector('[part="panel"]');
        const trigger = el.shadowRoot?.querySelector('[part="trigger"]');
        expect(panel?.hasAttribute('role')).toBe(false);
        expect(panel?.hasAttribute('aria-label')).toBe(false);
        expect(trigger?.hasAttribute('aria-haspopup')).toBe(false);
        expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    });
});

describe('hyperion-dropdown -- source invariants', () => {
    test('no forbidden absolute Tailwind palette classes', () => {
        expect(SOURCE).not.toMatch(FORBIDDEN_PALETTE_REGEX);
    });
    test('no hex color literals', () => {
        expect(SOURCE).not.toMatch(HEX_COLOR_REGEX);
    });
    // 100vw includes the vertical scrollbar: with the root's stable
    // scrollbar gutter a fixed panel sized that way overflows the page by
    // the scrollbar width (horizontal scroll on every page that renders it).
    test('the drawer panel is never sized with viewport units', () => {
        expect(SOURCE).not.toMatch(/\b100d?vw\b/);
    });
});
