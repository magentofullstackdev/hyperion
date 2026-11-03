// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Body scroll lock for the modal drawers (mini-cart, mobile menu) without
// the layout jump. `html { scrollbar-gutter: stable }` (_theme.css) keeps
// the viewport gutter while the body is `overflow: hidden`, so in the
// browsers that support it nothing moves and nothing must be compensated.
// Where the gutter collapses (no support, classic scrollbars) the root
// element grows by the scrollbar width when the overflow is hidden: that
// growth, measured on the root itself (not `clientWidth`, which ignores
// the gutter), is added as right padding on the body so the content keeps
// its position whatever the scrollbar width of the browser is. Overlay
// scrollbars (macOS, mobile) measure 0 and add nothing. Locks are counted,
// so two open drawers release once.

let locks = 0;
let previous = null;

const rootWidth = () => document.documentElement.getBoundingClientRect().width;

export function lockBodyScroll() {
    locks++;
    if (locks > 1) return;
    const body = document.body;
    previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const before = rootWidth();
    body.style.overflow = 'hidden';
    const growth = rootWidth() - before;
    if (growth > 0) {
        const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${current + growth}px`;
    }
    body.setAttribute('data-hyperion-scroll-locked', '');
}

export function unlockBodyScroll() {
    if (locks === 0) return;
    locks--;
    if (locks > 0) return;
    const body = document.body;
    body.style.overflow = previous?.overflow ?? '';
    body.style.paddingRight = previous?.paddingRight ?? '';
    body.removeAttribute('data-hyperion-scroll-locked');
    previous = null;
}

/** Test hook: forget every lock (the DOM is reset between tests). */
export function resetScrollLock() {
    locks = 0;
    previous = null;
}
