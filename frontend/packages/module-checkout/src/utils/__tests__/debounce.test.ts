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
});
