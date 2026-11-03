// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Cookie restriction mode notice (`web/cookie/cookie_restriction`).
//
// Port of `Magento_Cookie/js/notices.js` + `mage/cookies`: the banner is
// rendered for everyone (pages are edge cached), hidden by default, and
// shown on load unless the consent cookie already exists. Accepting writes
// the same cookie core writes: `user_allowed_save_cookie` holding a JSON
// object keyed by website id (`{"1":1}`), URL encoded, `path=/`,
// `samesite=lax`, `secure` on https, expiring after
// `web/cookie/cookie_restriction_lifetime` seconds. The server side
// (`Magento\Cookie\Helper\Cookie::isUserNotAllowSaveCookie()`) reads it back
// unchanged, so the value shape must not drift.

export const COOKIE_NOTICE_SELECTOR = '[data-hyperion-cookie-notice]';
const ACCEPT_SELECTOR = '[data-hyperion-cookie-allow]';

export function readCookie(name) {
    const prefix = name + '=';
    const parts = document.cookie.split(';');
    for (let i = 0; i < parts.length; i++) {
        const piece = parts[i].trim();
        if (piece.indexOf(prefix) === 0) {
            try {
                return decodeURIComponent(piece.substring(prefix.length));
            } catch {
                return piece.substring(prefix.length);
            }
        }
    }
    return null;
}

// Merge the website ids already accepted (a returning shopper on another
// website of the same domain) with the ids the page carries.
export function mergeConsentValue(existing, incoming) {
    let merged = {};
    if (typeof existing === 'string' && existing !== '') {
        try {
            const parsed = JSON.parse(existing);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) merged = { ...parsed };
        } catch {
            merged = {};
        }
    }
    let ids = incoming;
    if (typeof ids === 'string') {
        try {
            ids = JSON.parse(ids);
        } catch {
            ids = null;
        }
    }
    if (ids && typeof ids === 'object' && !Array.isArray(ids)) {
        Object.keys(ids).forEach((id) => {
            merged[id] = 1;
        });
    }
    return merged;
}

export function writeConsentCookie(name, value, lifetimeSeconds) {
    const cfg = window.cookiesConfig || {};
    const lifetime = Number(lifetimeSeconds);
    const expires = Number.isFinite(lifetime) && lifetime > 0
        ? '; expires=' + new Date(Date.now() + lifetime * 1000).toUTCString()
        : '';
    const secure = cfg.secure || location.protocol === 'https:' ? '; secure' : '';
    const sameSite = '; samesite=' + (cfg.samesite || 'lax');
    document.cookie = name + '=' + encodeURIComponent(JSON.stringify(value)) +
        expires + '; path=/' + secure + sameSite;
}

function hide(notice) {
    notice.hidden = true;
}

function show(notice) {
    notice.hidden = false;
}

// Decide the banner's visibility and wire its accept button. Returns
// true when the banner is shown.
export function initCookieNotice(root) {
    const scope = root && typeof root.querySelector === 'function' ? root : document;
    const notice = scope.querySelector(COOKIE_NOTICE_SELECTOR);
    if (!notice) return false;

    const name = notice.getAttribute('data-cookie-name') || 'user_allowed_save_cookie';
    if (readCookie(name)) {
        hide(notice);
        return false;
    }

    const button = notice.querySelector(ACCEPT_SELECTOR);
    if (button && !button.hasAttribute('data-hyperion-cookie-bound')) {
        button.setAttribute('data-hyperion-cookie-bound', '');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            const value = mergeConsentValue(readCookie(name), notice.getAttribute('data-cookie-value'));
            writeConsentCookie(name, value, notice.getAttribute('data-cookie-lifetime'));
            if (readCookie(name)) {
                hide(notice);
                document.dispatchEvent(new CustomEvent('hyperion:cookie-consent', { detail: value }));
                return;
            }
            // Cookies are blocked in this browser: core sends the shopper
            // to the "cookies required" page.
            const noCookiesUrl = notice.getAttribute('data-no-cookies-url');
            if (noCookiesUrl) window.location.href = noCookiesUrl;
        });
    }
    show(notice);
    return true;
}
