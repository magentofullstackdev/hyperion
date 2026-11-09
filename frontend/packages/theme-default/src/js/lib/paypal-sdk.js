// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Lazy loader of the PayPal JavaScript SDK, shared by
 * <hyperion-paypal-buttons> and <hyperion-paypal-message>.
 *
 * One `<script>` per page: the SDK registers a single `window.paypal`, and
 * every placement of a page gets the same URL from Magento
 * (`Magento\Paypal\Model\SdkUrl`), so the first URL asked for wins and
 * later callers share its promise.
 *
 * The script is never part of the page load. `whenWanted()` resolves once
 * the placement is near the viewport (or the shopper touches it),
 * `whenEngaged()` once somebody is actually using the page (a pointer
 * move, a scroll, a touch, a key), and `whenPageIdle()` then waits for the
 * window `load` event plus an idle slot, so a message at the top of the
 * page cannot compete with the page's own resources. The engagement step
 * is what keeps the SDK (about 450 KB of script in three frames, a long
 * task on a slow CPU) out of a page nobody interacts with: a product page
 * opened and closed, a prerender, a lab measurement.
 */

import { htmlToText } from '@magentofullstackdev/hyperion-shared/html';

const IDLE_TIMEOUT_MS = 2000;
const PROXIMITY_MARGIN = '200px';
const INTERACTION_EVENTS = ['pointerenter', 'pointerdown', 'focusin'];
const ENGAGEMENT_EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
const MESSAGES_COOKIE = 'mage-messages';
const NOTIFICATION_SELECTOR = '[data-hyperion-notification]';
const NOTIFICATION_AUTO_CLOSE_MS = '15000';

let sdkPromise = null;
let sdkUrl = '';

/**
 * Load the SDK (once) and resolve with `window.paypal`.
 *
 * @param {string} url
 * @param {Object<string, string>} [attributes] `data-*` attributes of the script tag
 * @returns {Promise<object>}
 */
export function loadPaypalSdk(url, attributes = {}) {
    if (!url) {
        return Promise.reject(new Error('PayPal SDK URL is missing'));
    }
    if (sdkPromise) {
        if (url !== sdkUrl) {
            console.warn('[hyperion] PayPal SDK already requested with another URL, reusing it.');
        }
        return sdkPromise;
    }
    sdkUrl = url;
    sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.setAttribute('data-hyperion-paypal-sdk', '');
        for (const [name, value] of Object.entries(attributes || {})) {
            if (/^data-[a-z0-9-]+$/.test(name) && value !== null && value !== undefined && value !== '') {
                script.setAttribute(name, String(value));
            }
        }
        script.onload = () => {
            if (window.paypal) {
                resolve(window.paypal);
            } else {
                reject(new Error('PayPal SDK did not initialize'));
            }
        };
        script.onerror = () => {
            sdkPromise = null;
            sdkUrl = '';
            script.remove();
            reject(new Error('PayPal SDK failed to load'));
        };
        document.head.appendChild(script);
    });
    return sdkPromise;
}

/** Forget the loaded SDK (tests only). */
export function resetPaypalSdk() {
    sdkPromise = null;
    sdkUrl = '';
    document.head.querySelectorAll('script[data-hyperion-paypal-sdk]').forEach((script) => script.remove());
}

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
 * touch or key on the document, or at once when the page is already
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

/** Value of a cookie, empty string when it is not set. */
export function readCookie(name) {
    for (const piece of document.cookie.split(';')) {
        const trimmed = piece.trim();
        if (trimmed.indexOf(name + '=') === 0) return trimmed.substring(name.length + 1);
    }
    return '';
}

/**
 * Show a message in the page's `#hyperion-notification` toast.
 *
 * @param {string} message plain text
 * @param {'success'|'error'|'warning'|'info'} [tone]
 */
export function notify(message, tone = 'error') {
    const target = document.querySelector(NOTIFICATION_SELECTOR);
    if (!target || !message) return;
    const body = document.createElement('p');
    body.className = 'font-medium';
    body.textContent = String(message);
    target.replaceChildren(body);
    target.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    target.setAttribute('data-tone', tone);
    target.setAttribute('auto-close', NOTIFICATION_AUTO_CLOSE_MS);
    target.hidden = true;
    target.hidden = false;
}

/**
 * Take the messages Magento left in the `mage-messages` cookie (a request
 * made with fetch() fills it like a page load does) and delete the
 * cookie, so they are shown now and not again on the next page.
 *
 * @returns {Array<{ type: string, text: string }>}
 */
export function drainMessages() {
    const raw = readCookie(MESSAGES_COOKIE);
    if (!raw) return [];
    document.cookie = `${MESSAGES_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    try {
        const parsed = JSON.parse(decodeURIComponent(raw.replace(/\+/g, ' ')));
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((message) => message && typeof message.text === 'string' && message.text !== '')
            .map((message) => ({ type: String(message.type || 'notice'), text: htmlToText(message.text) }));
    } catch (_e) {
        return [];
    }
}
