// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Focus returns of the drawers: every focus() that lands on a control of
// the sticky header passes `preventScroll`, otherwise Chrome scrolls the
// page towards the control's in-flow position (a page scrolled 700 px down
// ends up at 250 when the mini-cart closes).

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-mini-cart.js';
import '../hyperion-dropdown.js';
import { focusFirst } from '../../lib/focus-trap.js';
import { mount } from './helpers.js';
import { resetScrollLock } from '../../lib/scroll-lock.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, rel), 'utf8');

const NO_SCROLL = { preventScroll: true };

describe('drawer focus returns never scroll the page', () => {
    beforeEach(() => {
        resetScrollLock();
        document.body.innerHTML = '';
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('closing the mini-cart returns the focus to its trigger with preventScroll', async () => {
        const el = document.createElement('hyperion-mini-cart');
        el.innerHTML = '<a slot="trigger" href="/checkout/cart/">Cart</a>';
        await mount(el);
        el._open = true;
        await el.updateComplete;
        const trigger = el.shadowRoot.querySelector('[part="trigger"]');
        const focus = vi.spyOn(trigger, 'focus');

        el.close();

        expect(focus).toHaveBeenCalledTimes(1);
        expect(focus).toHaveBeenCalledWith(NO_SCROLL);
    });

    test('closing a drawer dropdown returns the focus to its opener with preventScroll', async () => {
        const el = document.createElement('hyperion-dropdown');
        el.setAttribute('label', 'Menu');
        el.setAttribute('placement', 'drawer');
        el.innerHTML = '<a href="/women">Women</a>';
        await mount(el);
        const opener = el.shadowRoot.querySelector('[part="trigger"]');
        opener.click();
        await el.updateComplete;
        expect(el.hasAttribute('open')).toBe(true);
        const focus = vi.spyOn(opener, 'focus');

        opener.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await el.updateComplete;

        expect(el.hasAttribute('open')).toBe(false);
        expect(focus).toHaveBeenCalledWith(NO_SCROLL);
    });

    test('focusFirst moves the focus without scrolling', () => {
        document.body.innerHTML = '<div id="panel"><a id="first" href="/a">A</a></div>';
        const first = document.getElementById('first');
        const focus = vi.spyOn(first, 'focus');
        expect(focusFirst(document.getElementById('panel'))).toBe(true);
        expect(focus).toHaveBeenCalledWith(NO_SCROLL);
    });

    test('the header search toggle and panel focus in entry.js never scroll (source invariant)', () => {
        const source = read('../../entry.js');
        const calls = source.match(/\.focus\([^)]*\)/g) ?? [];
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
            expect(call).toBe('.focus({ preventScroll: true })');
        }
    });
});
