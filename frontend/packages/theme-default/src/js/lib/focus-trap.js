// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Keyboard focus helpers for the modal drawers (mobile menu, mini-cart).
//
// A drawer that is open must keep Tab / Shift+Tab inside itself and a
// drawer that is closed must not be reachable at all (`inert` on the
// panel). The panels live in shadow roots and show light-DOM content
// through slots, so the focusable elements are collected through the
// flattened tree: shadow children, assigned slot content and nested
// shadow roots alike.

export const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isSkipped(el) {
    return el.hidden || el.hasAttribute('inert') || el.getAttribute('aria-hidden') === 'true';
}

/** Every focusable element under `root` in document order, slots and shadow roots included. */
export function collectFocusable(root) {
    const out = [];
    const walk = (node) => {
        for (const child of node.children ?? []) {
            if (child.localName === 'slot') {
                // The default slot never holds elements that name another
                // slot (happy-dom assigns them anyway).
                const assigned = child.assignedElements({ flatten: true })
                    .filter((el) => child.name || !el.getAttribute('slot'));
                for (const assignedEl of assigned) {
                    if (isSkipped(assignedEl)) continue;
                    if (assignedEl.matches(FOCUSABLE_SELECTOR)) out.push(assignedEl);
                    walk(assignedEl);
                }
                continue;
            }
            if (isSkipped(child)) continue;
            if (child.matches(FOCUSABLE_SELECTOR)) out.push(child);
            walk(child.shadowRoot ?? child);
        }
    };
    walk(root);
    return out;
}

/** The focused element, descending into shadow roots. */
export function deepActiveElement(root = document) {
    let active = root.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

/**
 * Keep a Tab / Shift+Tab keydown inside `root`. Returns true when the
 * event was a Tab and has been handled (wrapped or swallowed).
 */
export function trapTabKey(event, root) {
    if (event.key !== 'Tab') return false;
    const items = collectFocusable(root);
    if (items.length === 0) {
        event.preventDefault();
        return true;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = deepActiveElement();
    const inside = items.includes(active);
    if (event.shiftKey) {
        if (!inside || active === first) {
            event.preventDefault();
            last.focus();
        }
    } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
    }
    return true;
}

/** Move focus to the first focusable element of `root`; returns whether one was found. */
/** A control that pops the software keyboard up on a phone when focused. */
export function isTextEntry(el) {
    if (el.localName === 'textarea' || el.isContentEditable) return true;
    if (el.localName !== 'input') return false;
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type);
}

/**
 * Moves the focus to the first focusable element under `root`. With
 * `avoidTextEntry` a text field is skipped in favour of the next control
 * (a drawer that opened on its search box raised the phone keyboard over
 * the menu); the text field still gets the focus when it is all there is.
 * The focus never scrolls: the drawers are fixed to the viewport and their
 * host is the sticky header, where a scrolling focus() jumps the page.
 */
export function focusFirst(root, { avoidTextEntry = false } = {}) {
    const items = collectFocusable(root);
    const first = (avoidTextEntry ? items.find((el) => !isTextEntry(el)) : undefined) ?? items[0];
    if (!first) return false;
    first.focus({ preventScroll: true });
    return true;
}
