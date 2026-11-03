// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach } from 'vitest';
import { collectFocusable, deepActiveElement, focusFirst, trapTabKey } from '../focus-trap.js';

const tab = (shift = false) => new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });

describe('focus-trap', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('collects focusable elements through slots and skips hidden or inert ones', () => {
        const host = document.createElement('div');
        host.attachShadow({ mode: 'open' });
        host.shadowRoot.innerHTML = '<div part="panel"><button id="close">x</button><slot></slot><a hidden href="#">nope</a></div>';
        host.innerHTML = '<nav><a id="a" href="/a">A</a><button id="b" disabled>b</button><input id="c" type="text"><span inert><a href="/d">D</a></span></nav>';
        document.body.appendChild(host);
        const ids = collectFocusable(host.shadowRoot.querySelector('[part="panel"]')).map((el) => el.id);
        expect(ids).toEqual(['close', 'a', 'c']);
    });

    test('wraps Tab from the last element to the first and Shift+Tab the other way', () => {
        document.body.innerHTML = '<div id="root"><button id="one">1</button><button id="two">2</button></div><button id="outside">o</button>';
        const root = document.getElementById('root');
        document.getElementById('two').focus();
        const forward = tab();
        expect(trapTabKey(forward, root)).toBe(true);
        expect(forward.defaultPrevented).toBe(true);
        expect(deepActiveElement().id).toBe('one');
        const back = tab(true);
        trapTabKey(back, root);
        expect(back.defaultPrevented).toBe(true);
        expect(deepActiveElement().id).toBe('two');
        // From outside the root, Tab lands on the first element.
        document.getElementById('outside').focus();
        trapTabKey(tab(), root);
        expect(deepActiveElement().id).toBe('one');
        // Inside, between elements, nothing is intercepted.
        const free = tab();
        trapTabKey(free, root);
        expect(free.defaultPrevented).toBe(false);
        expect(trapTabKey(new KeyboardEvent('keydown', { key: 'Enter' }), root)).toBe(false);
    });

    test('focusFirst moves focus to the first focusable element', () => {
        document.body.innerHTML = '<div id="root"><p>text</p><a id="first" href="/">x</a></div>';
        expect(focusFirst(document.getElementById('root'))).toBe(true);
        expect(document.activeElement.id).toBe('first');
        document.body.innerHTML = '<div id="empty"><p>text</p></div>';
        expect(focusFirst(document.getElementById('empty'))).toBe(false);
    });
});
