// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../debounce.js';

describe('debounce', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('fires only after the delay', () => {
        const spy = vi.fn();
        const d = debounce(spy, 500);
        d('a');
        expect(spy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(499);
        expect(spy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith('a');
    });

    it('coalesces multiple calls within the window', () => {
        const spy = vi.fn();
        const d = debounce(spy, 500);
        d('a');
        vi.advanceTimersByTime(100);
        d('b');
        vi.advanceTimersByTime(100);
        d('c');
        vi.advanceTimersByTime(500);
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith('c');
    });

    it('flush() runs a pending call once and at once, with its last arguments', () => {
        const spy = vi.fn();
        const d = debounce(spy, 500);
        d('a');
        d('b');
        d.flush();
        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith('b');
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledOnce();
    });

    it('flush() does nothing when no call is pending', () => {
        const spy = vi.fn();
        const d = debounce(spy, 500);
        d.flush();
        d('a');
        vi.advanceTimersByTime(500);
        d.flush();
        expect(spy).toHaveBeenCalledOnce();
    });

    it('cancel() drops the pending call', () => {
        const spy = vi.fn();
        const d = debounce(spy, 500);
        d('a');
        d.cancel();
        vi.advanceTimersByTime(1000);
        expect(spy).not.toHaveBeenCalled();
        d.flush();
        expect(spy).not.toHaveBeenCalled();
    });

    it('pending() reports a waiting call until it ran, was flushed or was canceled', () => {
        const d = debounce(() => undefined, 500);
        expect(d.pending()).toBe(false);
        d();
        expect(d.pending()).toBe(true);
        vi.advanceTimersByTime(500);
        expect(d.pending()).toBe(false);
        d();
        d.flush();
        expect(d.pending()).toBe(false);
        d();
        d.cancel();
        expect(d.pending()).toBe(false);
    });
});
