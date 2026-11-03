// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Hover intent and keyboard dismissal for the desktop menu flyouts and the
// mega menu panels (Magentofullstackdev_HyperionMegaMenu).
//
// Pointer: a root item with a panel (`li[data-hyperion-mega-item]`) is not
// positioned: its panel anchors to the header and spans the full width, so
// there is a strip of header between the link and the panel where the pointer
// is over neither. Pure `:hover` closes the panel there. This keeps the item
// open with the `is-open` class (the `_topmenu.css` rule shows the panel for
// it) and removes the class only `delay` ms after the pointer has left the
// item and its panel, long enough to cross the strip, also diagonally.
// Entering another root item closes the previous one at once, so two panels
// never overlap.
//
// Keyboard: a flyout or panel opens through `:focus-within` when the focus
// enters its item. Escape inside an open submenu closes that submenu (the
// innermost one holding the focus) and moves the focus to the link of its
// item: the item gets the `is-closed` class, which the `:focus-within` rules
// exclude, until the focus leaves the item or the pointer enters it. The
// mobile drawer (a `hyperion-dropdown`) owns its own Escape and is left alone.
//
// Events are delegated so a menu swapped in later (ESI inline, htmx) needs
// no re-initialisation.

const OPEN_CLASS = 'is-open';
const CLOSED_CLASS = 'is-closed';
const ITEM_SELECTOR = '[data-hyperion-mega-item]';
const SUBMENU_SELECTOR = '[data-hyperion-submenu]';
const MENU_SELECTOR = '[data-hyperion-topmenu]';

export function installMegaHover(root = document, { delay = 250 } = {}) {
    const timers = new Map();

    const open = (item) => {
        clearTimeout(timers.get(item));
        timers.delete(item);
        for (const other of root.querySelectorAll(`${ITEM_SELECTOR}.${OPEN_CLASS}`)) {
            if (other !== item) other.classList.remove(OPEN_CLASS);
        }
        item.classList.add(OPEN_CLASS);
    };

    const scheduleClose = (item) => {
        clearTimeout(timers.get(item));
        timers.set(item, setTimeout(() => {
            timers.delete(item);
            item.classList.remove(OPEN_CLASS);
        }, delay));
    };

    const onOver = (event) => {
        // The pointer reopens an item the keyboard closed.
        event.target.closest?.(`${MENU_SELECTOR} li.${CLOSED_CLASS}`)?.classList.remove(CLOSED_CLASS);
        const item = event.target.closest?.(ITEM_SELECTOR);
        if (item) open(item);
    };

    const onOut = (event) => {
        const item = event.target.closest?.(ITEM_SELECTOR);
        if (!item) return;
        const next = event.relatedTarget;
        if (next && item.contains(next)) return;
        scheduleClose(item);
    };

    // The link of a menu item: a direct child, or inside the wrapper div of a
    // mega root item.
    const itemLink = (item) => item.querySelector(':scope > a, :scope > div:not([data-hyperion-mega-panel]) a');

    const onKeydown = (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        const focused = event.target;
        if (!(focused instanceof Element) || !focused.closest(MENU_SELECTOR) || focused.closest('hyperion-dropdown')) return;
        // The innermost open submenu holding the focus and its item.
        const submenu = focused.closest(SUBMENU_SELECTOR);
        const item = submenu?.parentElement?.closest('li');
        if (!submenu || !item) return;
        event.preventDefault();
        item.classList.add(CLOSED_CLASS);
        if (item.matches(ITEM_SELECTOR)) {
            clearTimeout(timers.get(item));
            timers.delete(item);
            item.classList.remove(OPEN_CLASS);
        }
        itemLink(item)?.focus();
    };

    const onFocusOut = (event) => {
        const item = event.target.closest?.(`${MENU_SELECTOR} li.${CLOSED_CLASS}`);
        if (!item) return;
        const next = event.relatedTarget;
        if (next && item.contains(next)) return;
        item.classList.remove(CLOSED_CLASS);
    };

    root.addEventListener('mouseover', onOver);
    root.addEventListener('mouseout', onOut);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('focusout', onFocusOut);

    return () => {
        root.removeEventListener('mouseover', onOver);
        root.removeEventListener('mouseout', onOut);
        root.removeEventListener('keydown', onKeydown);
        root.removeEventListener('focusout', onFocusOut);
        for (const timer of timers.values()) clearTimeout(timer);
        timers.clear();
    };
}
