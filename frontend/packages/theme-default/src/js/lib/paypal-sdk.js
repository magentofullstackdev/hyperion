// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Script loading and shopper feedback shared by the PayPal components
 * (<hyperion-paypal-buttons>, <hyperion-paypal-message>) and the express
 * button context (lib/express-context.js).
 *
 * `loadPaypalSdk()`: one `<script>` per page. The SDK registers a single
 * `window.paypal`, and every placement of a page gets the same URL from
 * Magento (`Magento\Paypal\Model\SdkUrl`), so the first URL asked for wins
 * and later callers share its promise. `loadScript()` is the general form:
 * one script per URL, the page's CSP nonce, a failed load forgotten so a
 * later call tries again.
 *
 * The scripts are never part of the page load: callers wait for the policy
 * of lib/engagement.js first (re-exported here for the PayPal components).
 */

import { htmlToText } from '@magentofullstackdev/hyperion-shared/html';

export { whenWanted, whenEngaged, whenPageIdle } from './engagement.js';

const MESSAGES_COOKIE = 'mage-messages';
const NOTIFICATION_SELECTOR = '[data-hyperion-notification]';
const NOTIFICATION_AUTO_CLOSE_MS = '15000';
const ATTRIBUTE_PATTERN = /^(data-[a-z0-9-]+|crossorigin|integrity|referrerpolicy)$/;

let sdkPromise = null;
let sdkUrl = '';
const scripts = new Map();

/**
 * The CSP nonce of the page, read from a script the server rendered with
 * one (browsers hide the attribute value, the property keeps it).
 *
 * @returns {string|null}
 */
export function cspNonce() {
    const script = document.querySelector('script[nonce]');
    const nonce = script ? script.nonce || script.getAttribute('nonce') : '';
    return nonce ? String(nonce) : null;
}

function createScript(url, attributes) {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    const nonce = cspNonce();
    if (nonce) script.nonce = nonce;
    for (const [name, value] of Object.entries(attributes || {})) {
        if (ATTRIBUTE_PATTERN.test(name) && value !== null && value !== undefined && value !== '') {
            script.setAttribute(name, String(value));
        }
    }
    return script;
}

/**
 * Load a classic script once per URL. A failed load is forgotten (and its
 * element removed), so the next call requests it again.
 *
 * @param {string} url
 * @param {Object<string, string>} [attributes] `data-*`, `crossorigin`, `integrity`, `referrerpolicy`
 * @returns {Promise<void>}
 */
export function loadScript(url, attributes = {}) {
    if (typeof url !== 'string' || url === '') {
        return Promise.reject(new Error('The script URL is missing'));
    }
    const known = scripts.get(url);
    if (known) return known;
    const promise = new Promise((resolve, reject) => {
        const script = createScript(url, attributes);
        script.setAttribute('data-hyperion-script', '');
        script.onload = () => resolve();
        script.onerror = () => {
            if (scripts.get(url) === promise) scripts.delete(url);
            script.remove();
            reject(new Error(`The script ${url} failed to load`));
        };
        document.head.appendChild(script);
    });
    scripts.set(url, promise);
    return promise;
}

/** Forget every script loaded through loadScript() (tests only). */
export function resetScripts() {
    scripts.clear();
    document.head.querySelectorAll('script[data-hyperion-script]').forEach((script) => script.remove());
}

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
        const script = createScript(url, attributes);
        script.setAttribute('data-hyperion-paypal-sdk', '');
        script.onload = () => {
            if (window.paypal) {
                resolve(window.paypal);
            } else {
                // The file arrived and left no SDK behind: the next caller
                // gets a fresh request, not this rejection.
                sdkPromise = null;
                sdkUrl = '';
                script.remove();
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
