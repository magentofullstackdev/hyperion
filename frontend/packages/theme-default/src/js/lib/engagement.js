// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The loading policy of third-party scripts on the storefront: the PayPal
 * SDK, the express buttons of `<hyperion-express-slot>`, any extension that
 * would otherwise compete with the page's own resources.
 *
 * A third-party script is never part of the page load. `whenWanted()`
 * resolves once an element is near the viewport (or the shopper touches
 * it), `whenEngaged()` once somebody is actually using the page (a pointer
 * move, a scroll, a touch, a key, a focus move), and `whenPageIdle()` then waits for the
 * window `load` event plus an idle slot. The engagement step is what keeps
 * a payment SDK (the PayPal one is about 450 KB of script in three frames,
 * a long task on a slow CPU) out of a page nobody interacts with: a product
 * page opened and closed, a prerender, a lab measurement.
 */

const IDLE_TIMEOUT_MS = 2000;
const PROXIMITY_MARGIN = '200px';
const INTERACTION_EVENTS = ['pointerenter', 'pointerdown', 'focusin'];
// `focusin`: a screen reader in browse mode keeps the arrow keys for itself (no keydown
// reaches the page), and VoiceOver swipes or a switch device move the focus without any
// pointer, key or scroll event; the focus moving is their only trace.
const ENGAGEMENT_EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll', 'focusin'];

/**
 * Resolve when the element comes near the viewport or the shopper
 * interacts with it. The returned promise carries `cancel()`.
 *
 * @param {Element} element
 * @returns {Promise<void> & { cancel: () => void }}
 */
export function whenWanted(element) {
    let cancel = () => {};
    const promise = new Promise((resolve) => {
        let observer = null;
        const done = () => {
            cancel();
            resolve();
        };
        cancel = () => {
            observer?.disconnect();
            observer = null;
            for (const type of INTERACTION_EVENTS) element.removeEventListener(type, done);
        };
        for (const type of INTERACTION_EVENTS) {
            element.addEventListener(type, done, { passive: true });
        }
        if (typeof IntersectionObserver !== 'function') {
            done();
            return;
        }
        observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) done();
        }, { rootMargin: PROXIMITY_MARGIN });
        observer.observe(element);
    });
    promise.cancel = cancel;
    return promise;
}

/**
 * Resolve once the shopper has shown up: the first pointer move, scroll,
 * touch, key or focus move on the document, or at once when the page is already
 * scrolled (the interaction happened before this code was loaded). A page
 * nobody touches never resolves, which is the point.
 *
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {Promise<void>}
 */
export function whenEngaged(doc = document, win = window) {
    if ((win.scrollY || 0) > 0) return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            for (const type of ENGAGEMENT_EVENTS) doc.removeEventListener(type, done, { capture: true });
            resolve();
        };
        for (const type of ENGAGEMENT_EVENTS) {
            doc.addEventListener(type, done, { capture: true, passive: true });
        }
    });
}

/**
 * Resolve in an idle slot after the window `load` event.
 *
 * @returns {Promise<void>}
 */
export function whenPageIdle() {
    return new Promise((resolve) => {
        const idle = () => {
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
            } else {
                setTimeout(resolve, 1);
            }
        };
        if (document.readyState === 'complete') {
            idle();
        } else {
            window.addEventListener('load', idle, { once: true });
        }
    });
}
