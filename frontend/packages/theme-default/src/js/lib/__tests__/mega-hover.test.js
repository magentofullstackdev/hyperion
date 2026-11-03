// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { installMegaHover } from '../mega-hover.js';

const markup = `
<ul data-hyperion-topmenu>
  <li data-hyperion-mega-item id="women"><div><a id="women-link" href="#">Women</a></div><ul data-hyperion-submenu data-hyperion-mega-panel id="women-panel"><li><a id="tops" href="#">Tops</a></li></ul></li>
  <li data-hyperion-mega-item id="men"><div><a id="men-link" href="#">Men</a></div><ul data-hyperion-submenu data-hyperion-mega-panel id="men-panel"></ul></li>
  <li id="plain"><div><a id="plain-link" href="#">Sale</a></div></li>
  <li id="gear"><a id="gear-link" href="#">Gear</a><ul data-hyperion-submenu id="gear-sub"><li id="bags"><a id="bags-link" href="#">Bags</a><ul data-hyperion-submenu id="bags-sub"><li><a id="totes" href="#">Totes</a></li></ul></li></ul></li>
</ul>
<hyperion-dropdown><ul data-hyperion-topmenu><li id="drawer-item"><a id="drawer-link" href="#">Women</a><ul data-hyperion-submenu><li><a id="drawer-tops" href="#">Tops</a></li></ul></li></ul></hyperion-dropdown>
<main id="page"></main>`;
const key = (name, target) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
};
const focusOut = (target, relatedTarget = null) => target.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
const isClosed = (id) => el(id).classList.contains('is-closed');

const fire = (type, target, relatedTarget = null) => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget });
    target.dispatchEvent(event);
};
const el = (id) => document.getElementById(id);
const isOpen = (id) => el(id).classList.contains('is-open');

describe('mega-hover', () => {
    let uninstall;
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = markup;
        uninstall = installMegaHover(document, { delay: 250 });
    });
    afterEach(() => {
        uninstall();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    test('hovering the link opens the item and leaving it closes only after the delay', () => {
        fire('mouseover', el('women-link'));
        expect(isOpen('women')).toBe(true);
        fire('mouseout', el('women-link'), el('page'));
        expect(isOpen('women')).toBe(true);
        vi.advanceTimersByTime(249);
        expect(isOpen('women')).toBe(true);
        vi.advanceTimersByTime(1);
        expect(isOpen('women')).toBe(false);
    });

    test('crossing the strip between the link and the panel keeps the item open', () => {
        fire('mouseover', el('women-link'));
        fire('mouseout', el('women-link'), el('page'));
        vi.advanceTimersByTime(100);
        fire('mouseover', el('tops'));
        vi.advanceTimersByTime(1000);
        expect(isOpen('women')).toBe(true);
    });

    test('moving inside the item never schedules a close', () => {
        fire('mouseover', el('women-link'));
        fire('mouseout', el('women-link'), el('tops'));
        vi.advanceTimersByTime(1000);
        expect(isOpen('women')).toBe(true);
    });

    test('entering another root item closes the previous one at once', () => {
        fire('mouseover', el('women-link'));
        fire('mouseout', el('women-link'), el('men-link'));
        fire('mouseover', el('men-link'));
        expect(isOpen('women')).toBe(false);
        expect(isOpen('men')).toBe(true);
    });

    test('items without a panel and the rest of the page are ignored', () => {
        fire('mouseover', el('plain-link'));
        fire('mouseover', el('page'));
        expect(document.querySelectorAll('.is-open').length).toBe(0);
    });

    test('Escape inside a keyboard opened mega panel closes it and focuses the root link', () => {
        el('tops').focus();
        const event = key('Escape', el('tops'));
        expect(event.defaultPrevented).toBe(true);
        expect(isClosed('women')).toBe(true);
        expect(isOpen('women')).toBe(false);
        expect(document.activeElement).toBe(el('women-link'));
    });

    test('the item reopens for the keyboard once the focus has left it', () => {
        el('tops').focus();
        key('Escape', el('tops'));
        focusOut(el('women-link'), el('men-link'));
        expect(isClosed('women')).toBe(false);
    });

    test('the pointer reopens a keyboard closed item', () => {
        el('tops').focus();
        key('Escape', el('tops'));
        fire('mouseover', el('women-link'));
        expect(isClosed('women')).toBe(false);
        expect(isOpen('women')).toBe(true);
    });

    test('Escape closes only the innermost flyout of the category tree', () => {
        el('totes').focus();
        key('Escape', el('totes'));
        expect(isClosed('bags')).toBe(true);
        expect(isClosed('gear')).toBe(false);
        expect(document.activeElement).toBe(el('bags-link'));
        key('Escape', el('bags-link'));
        expect(isClosed('gear')).toBe(true);
        expect(document.activeElement).toBe(el('gear-link'));
    });

    test('Escape on a root link or outside the menu does nothing', () => {
        el('plain-link').focus();
        expect(key('Escape', el('plain-link')).defaultPrevented).toBe(false);
        expect(key('Escape', el('page')).defaultPrevented).toBe(false);
        expect(document.querySelectorAll('.is-closed').length).toBe(0);
    });

    test('the menu inside the mobile drawer is left to the drawer', () => {
        el('drawer-tops').focus();
        expect(key('Escape', el('drawer-tops')).defaultPrevented).toBe(false);
        expect(isClosed('drawer-item')).toBe(false);
        expect(document.activeElement).toBe(el('drawer-tops'));
    });

    test('uninstall stops listening and clears the pending timers', () => {
        fire('mouseover', el('women-link'));
        fire('mouseout', el('women-link'), el('page'));
        uninstall();
        vi.advanceTimersByTime(1000);
        expect(isOpen('women')).toBe(true);
        fire('mouseover', el('men-link'));
        expect(isOpen('men')).toBe(false);
        uninstall = () => {};
    });
});
