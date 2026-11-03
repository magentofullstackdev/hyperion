// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-notification -- the auto-dismiss timer pauses while the shopper
// reads (pointer over the toast) or operates it (focus inside), WCAG 2.2.1.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import '../hyperion-notification.js';
import { mount } from './helpers.js';

async function toast(autoClose = 3000) {
    const el = document.createElement('hyperion-notification');
    el.setAttribute('auto-close', String(autoClose));
    el.innerHTML = '<p>Added to cart</p>';
    return mount(el);
}

describe('<hyperion-notification> auto-dismiss', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('closes after auto-close milliseconds when left alone', async () => {
        const el = await toast(3000);
        vi.advanceTimersByTime(2999);
        expect(el.hasAttribute('hidden')).toBe(false);
        vi.advanceTimersByTime(1);
        expect(el.hasAttribute('hidden')).toBe(true);
    });

    test('pauses while the pointer is over it and resumes with the remaining time', async () => {
        const el = await toast(3000);
        vi.advanceTimersByTime(1000);
        el.dispatchEvent(new Event('pointerenter'));
        vi.advanceTimersByTime(10000);
        expect(el.hasAttribute('hidden')).toBe(false);
        el.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(1999);
        expect(el.hasAttribute('hidden')).toBe(false);
        vi.advanceTimersByTime(1);
        expect(el.hasAttribute('hidden')).toBe(true);
    });

    test('pauses while the focus is inside and resumes when it leaves', async () => {
        const el = await toast(3000);
        el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        vi.advanceTimersByTime(10000);
        expect(el.hasAttribute('hidden')).toBe(false);
        el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        vi.advanceTimersByTime(3000);
        expect(el.hasAttribute('hidden')).toBe(true);
    });

    test('a toast hovered right before its deadline stays at least one second after the pointer leaves', async () => {
        const el = await toast(3000);
        vi.advanceTimersByTime(2990);
        el.dispatchEvent(new Event('pointerenter'));
        el.dispatchEvent(new Event('pointerleave'));
        vi.advanceTimersByTime(500);
        expect(el.hasAttribute('hidden')).toBe(false);
        vi.advanceTimersByTime(500);
        expect(el.hasAttribute('hidden')).toBe(true);
    });

    test('dismiss() hides it at once and clears the timer', async () => {
        const el = await toast(3000);
        el.dismiss();
        expect(el.hasAttribute('hidden')).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});
