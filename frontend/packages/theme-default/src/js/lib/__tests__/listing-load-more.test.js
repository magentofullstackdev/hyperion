// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { installLoadMoreFocus } from '../listing-load-more.js';

const foot = (more) => `
<div id="hyperion-load-more" data-hyperion-load-more>
  <p data-hyperion-load-more-status tabindex="-1">${more ? 'Showing 24 of 48 products' : 'You have seen all 48 products'}</p>
  ${more ? '<a href="?p=2" data-hyperion-load-more-button>Load more</a>' : ''}
</div>`;
const markup = `<ul data-hyperion-tiles><li>1</li></ul>${foot(true)}<a id="elsewhere" href="#">x</a>`;

const htmx = (type, elt) => document.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { elt } }));
const button = () => document.querySelector('[data-hyperion-load-more-button]');
const swapFoot = (more) => { document.querySelector('[data-hyperion-load-more]').outerHTML = foot(more); };

describe('listing-load-more', () => {
    let uninstall;
    beforeEach(() => {
        document.body.innerHTML = markup;
        uninstall = installLoadMoreFocus(document);
    });
    afterEach(() => {
        uninstall();
        document.body.innerHTML = '';
    });

    test('a request started by the focused link moves the focus to the new link', () => {
        const old = button();
        old.focus();
        htmx('htmx:beforeRequest', old);
        swapFoot(true);
        htmx('htmx:afterSettle', document.querySelector('[data-hyperion-tiles]'));
        expect(document.activeElement).toBe(button());
        expect(document.activeElement).not.toBe(old);
    });

    test('on the last page the focus lands on the status line', () => {
        const old = button();
        old.focus();
        htmx('htmx:beforeRequest', old);
        swapFoot(false);
        htmx('htmx:afterSettle', document.querySelector('[data-hyperion-tiles]'));
        expect(document.activeElement).toBe(document.querySelector('[data-hyperion-load-more-status]'));
    });

    test('a request the viewport started (link not focused) leaves the focus alone', () => {
        document.getElementById('elsewhere').focus();
        htmx('htmx:beforeRequest', button());
        swapFoot(true);
        htmx('htmx:afterSettle', document.querySelector('[data-hyperion-tiles]'));
        expect(document.activeElement).toBe(document.getElementById('elsewhere'));
    });

    test('requests of other elements are ignored', () => {
        const other = document.getElementById('elsewhere');
        other.focus();
        htmx('htmx:beforeRequest', other);
        swapFoot(true);
        htmx('htmx:afterSettle', other);
        expect(document.activeElement).toBe(other);
    });

    test('uninstall stops listening', () => {
        uninstall();
        const old = button();
        old.focus();
        htmx('htmx:beforeRequest', old);
        swapFoot(true);
        htmx('htmx:afterSettle', document.querySelector('[data-hyperion-tiles]'));
        expect(document.activeElement).not.toBe(button());
        uninstall = () => {};
    });
});
