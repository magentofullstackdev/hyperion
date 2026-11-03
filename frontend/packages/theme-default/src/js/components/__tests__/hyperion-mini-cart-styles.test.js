// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The drawer body is styled by the theme stylesheet adopted into the shadow
// root. Parsing 100 KB of CSS is main thread work, so it happens at the
// first open and never at upgrade; the parsed sheet is cached module wide.
// Own file: the cache lives in the module and the other mini-cart tests open
// the drawer without a theme stylesheet on the page.

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import '../hyperion-mini-cart.js';
import { mount, spyFetch } from './helpers.js';
import { resetScrollLock } from '../../lib/scroll-lock.js';

const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'hyperion-mini-cart.js'), 'utf8');

describe('<hyperion-mini-cart> panel sizing', () => {
    // 100vw includes the vertical scrollbar: with the root's stable
    // scrollbar gutter a fixed panel sized that way overflows the page by
    // the scrollbar width (horizontal scroll on every page that renders it).
    test('the drawer panel is never sized with viewport units', () => {
        expect(SOURCE).not.toMatch(/\b100d?vw\b/);
        expect(SOURCE).toMatch(/\[part="panel"\]\s*\{[^}]*width:\s*100%;/);
    });
});

describe('<hyperion-mini-cart> theme stylesheet adoption', () => {
    let link;
    let fetchSpy;

    beforeEach(() => {
        resetScrollLock();
        document.body.innerHTML = '';
        // happy-dom would load the stylesheet itself on insertion.
        if (window.happyDOM?.settings) window.happyDOM.settings.disableCSSFileLoading = true;
        fetchSpy = spyFetch('.text-muted{color:red}');
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/static/frontend/assets/entry.test.css';
        link.setAttribute('data-hyperion-theme-css', '');
        document.head.appendChild(link);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
        link.remove();
    });

    test('adopts the theme stylesheet once at upgrade and never fetches it again', async () => {
        const el = document.createElement('hyperion-mini-cart');
        el.innerHTML = '<a slot="trigger" href="/checkout/cart/">Cart</a>';
        await mount(el);
        await el.updateComplete;
        await new Promise((r) => setTimeout(r, 0));
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        await el.openPanel();
        await el.updateComplete;
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(String(fetchSpy.mock.calls[0][0])).toContain('/static/frontend/assets/entry.test.css');
        expect(el.shadowRoot.adoptedStyleSheets.length).toBeGreaterThan(0);

        el.close();
        await el.updateComplete;
        await el.openPanel();
        await el.updateComplete;
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        el.close();
    });
});
