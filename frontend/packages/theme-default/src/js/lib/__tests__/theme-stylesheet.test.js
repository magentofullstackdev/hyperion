// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
import { afterEach, describe, expect, it, vi } from 'vitest';
import { whenThemeStylesheetReady } from '../theme-stylesheet.js';

const link = (loaded) => {
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.setAttribute('data-hyperion-theme-css', '');
    if (loaded) {
        Object.defineProperty(el, 'sheet', { value: {} });
    } else {
        Object.defineProperty(el, 'sheet', { value: null });
    }
    document.head.appendChild(el);
    return el;
};

const settled = (promise) => Promise.race([promise.then(() => true), new Promise((r) => setTimeout(() => r(false), 20))]);

describe('whenThemeStylesheetReady', () => {
    afterEach(() => {
        document.head.innerHTML = '';
        vi.useRealTimers();
    });

    it('resolves at once without a theme stylesheet link', async () => {
        expect(await settled(whenThemeStylesheetReady(document))).toBe(true);
    });

    it('resolves at once when the link is already loaded (synchronous link)', async () => {
        link(true);
        expect(await settled(whenThemeStylesheetReady(document))).toBe(true);
    });

    it('waits for the load of a link still loading (non blocking link)', async () => {
        const el = link(false);
        const ready = whenThemeStylesheetReady(document, 10000);
        expect(await settled(ready)).toBe(false);
        el.dispatchEvent(new Event('load'));
        expect(await settled(ready)).toBe(true);
    });

    it('resolves on a failed load too', async () => {
        const el = link(false);
        const ready = whenThemeStylesheetReady(document, 10000);
        el.dispatchEvent(new Event('error'));
        expect(await settled(ready)).toBe(true);
    });

    it('resolves after the timeout when nothing happens to the link', async () => {
        vi.useFakeTimers();
        link(false);
        let resolved = false;
        whenThemeStylesheetReady(document, 4000).then(() => { resolved = true; });
        await vi.advanceTimersByTimeAsync(3999);
        expect(resolved).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(resolved).toBe(true);
    });
});
