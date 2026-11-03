// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { installCollapsibleNav } from '../collapsible-nav.js';

const markup = `
<div class="privacy-policy cms-content">
  <div class="privacy-policy-content"><h2 id="s1">Section</h2></div>
  <div class="block block-collapsible-nav">
    <div class="title block-collapsible-nav-title" data-mage-init='{"toggleAdvanced": {}}'>Privacy Menu</div>
    <div class="block-collapsible-content content" id="privacy-policy-nav-content">
      <ul class="items"><li class="item current"><a href="#s1">Section</a></li></ul>
    </div>
  </div>
</div>`;

const title = () => document.querySelector('.block-collapsible-nav > .title');
const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

function mediaStub(matches) {
    const listeners = new Set();
    const media = {
        matches,
        addEventListener: (_type, fn) => listeners.add(fn),
        removeEventListener: (_type, fn) => listeners.delete(fn),
        set(value) { media.matches = value; listeners.forEach((fn) => fn({ matches: value })); },
    };
    window.matchMedia = vi.fn(() => media);
    return media;
}

describe('collapsible-nav', () => {
    let uninstall = () => {};
    beforeEach(() => {
        document.body.innerHTML = markup;
    });
    afterEach(() => {
        uninstall();
        document.body.innerHTML = '';
        delete window.matchMedia;
    });

    test('on a narrow viewport the title becomes a closed, focusable button wired to its content', () => {
        mediaStub(true);
        uninstall = installCollapsibleNav(document);
        const t = title();
        expect(t.getAttribute('role')).toBe('button');
        expect(t.getAttribute('tabindex')).toBe('0');
        expect(t.getAttribute('aria-expanded')).toBe('false');
        expect(t.getAttribute('aria-controls')).toBe('privacy-policy-nav-content');
    });

    test('click toggles the active class and aria-expanded', () => {
        mediaStub(true);
        uninstall = installCollapsibleNav(document);
        click(title());
        expect(title().classList.contains('active')).toBe(true);
        expect(title().getAttribute('aria-expanded')).toBe('true');
        click(title());
        expect(title().classList.contains('active')).toBe(false);
        expect(title().getAttribute('aria-expanded')).toBe('false');
    });

    test('Enter and Space toggle from the keyboard, other keys do not', () => {
        mediaStub(true);
        uninstall = installCollapsibleNav(document);
        key(title(), 'Enter');
        expect(title().getAttribute('aria-expanded')).toBe('true');
        key(title(), ' ');
        expect(title().getAttribute('aria-expanded')).toBe('false');
        key(title(), 'ArrowDown');
        expect(title().getAttribute('aria-expanded')).toBe('false');
    });

    test('on a wide viewport the title keeps no button semantics and clicks are ignored', () => {
        mediaStub(false);
        uninstall = installCollapsibleNav(document);
        expect(title().hasAttribute('role')).toBe(false);
        expect(title().hasAttribute('tabindex')).toBe(false);
        click(title());
        expect(title().classList.contains('active')).toBe(false);
    });

    test('a viewport change applies and removes the semantics', () => {
        const media = mediaStub(false);
        uninstall = installCollapsibleNav(document);
        media.set(true);
        expect(title().getAttribute('role')).toBe('button');
        media.set(false);
        expect(title().hasAttribute('aria-expanded')).toBe(false);
    });

    test('a content without an id gets one for aria-controls', () => {
        mediaStub(true);
        document.getElementById('privacy-policy-nav-content').removeAttribute('id');
        uninstall = installCollapsibleNav(document);
        const id = title().getAttribute('aria-controls');
        expect(id).toMatch(/^hyperion-collapsible-nav-/);
        expect(document.getElementById(id)).toBe(document.querySelector('.block-collapsible-content'));
    });

    test('without matchMedia the viewport counts as narrow', () => {
        uninstall = installCollapsibleNav(document);
        expect(title().getAttribute('role')).toBe('button');
    });

    test('uninstall stops listening', () => {
        mediaStub(true);
        uninstall = installCollapsibleNav(document);
        uninstall();
        uninstall = () => {};
        click(title());
        expect(title().classList.contains('active')).toBe(false);
    });
});
