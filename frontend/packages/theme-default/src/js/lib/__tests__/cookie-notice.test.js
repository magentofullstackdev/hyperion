// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// cookie-notice -- consent cookie shaped exactly like Magento_Cookie writes it.

import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import {
    initCookieNotice,
    mergeConsentValue,
    readCookie,
    writeConsentCookie,
} from '../cookie-notice.js';

const NAME = 'user_allowed_save_cookie';

function clearConsentCookie() {
    document.cookie = NAME + '=; max-age=0; path=/';
}

function renderNotice() {
    document.body.innerHTML = `
        <div data-hyperion-cookie-notice hidden
             data-cookie-name="${NAME}"
             data-cookie-value='{"1":1}'
             data-cookie-lifetime="31536000"
             data-no-cookies-url="https://shop.test/cookie/index/noCookies/">
            <button type="button" data-hyperion-cookie-allow>Allow Cookies</button>
        </div>
    `;
    return document.querySelector('[data-hyperion-cookie-notice]');
}

describe('cookie-notice', () => {
    beforeEach(clearConsentCookie);
    afterEach(() => {
        clearConsentCookie();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    test('writeConsentCookie stores the URL encoded JSON and readCookie decodes it', () => {
        writeConsentCookie(NAME, { 1: 1 }, 3600);
        expect(document.cookie).toContain(NAME + '=%7B%221%22%3A1%7D');
        expect(readCookie(NAME)).toBe('{"1":1}');
        expect(readCookie('missing')).toBeNull();
    });

    test('mergeConsentValue keeps previously accepted website ids', () => {
        expect(mergeConsentValue(null, '{"1":1}')).toEqual({ 1: 1 });
        expect(mergeConsentValue('{"2":1}', '{"1":1}')).toEqual({ 2: 1, 1: 1 });
        expect(mergeConsentValue('garbage', { 3: 1 })).toEqual({ 3: 1 });
        expect(mergeConsentValue('[1]', 'garbage')).toEqual({});
    });

    test('the notice shows when there is no consent cookie', () => {
        const notice = renderNotice();
        expect(initCookieNotice()).toBe(true);
        expect(notice.hidden).toBe(false);
    });

    test('the notice stays hidden when the cookie exists', () => {
        writeConsentCookie(NAME, { 1: 1 }, 3600);
        const notice = renderNotice();
        expect(initCookieNotice()).toBe(false);
        expect(notice.hidden).toBe(true);
    });

    test('accepting writes the cookie, hides the notice and announces it', () => {
        const notice = renderNotice();
        initCookieNotice();
        const consent = vi.fn();
        document.addEventListener('hyperion:cookie-consent', consent);
        notice.querySelector('[data-hyperion-cookie-allow]').click();
        expect(readCookie(NAME)).toBe('{"1":1}');
        expect(notice.hidden).toBe(true);
        expect(consent).toHaveBeenCalledTimes(1);
        expect(consent.mock.calls[0][0].detail).toEqual({ 1: 1 });
    });

    test('initCookieNotice is a no-op without the markup', () => {
        expect(initCookieNotice()).toBe(false);
    });
});
