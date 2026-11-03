// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Minimal debounce -- used by `setShippingAddress` to avoid firing a
 * rate estimate on every keystroke. No dependency on lodash or dayjs: the
 * bundle adds no runtime dependencies.
 */

export function debounce<A extends readonly unknown[]>(
    fn: (...args: A) => void,
    waitMs: number
): (...args: A) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: A): void => {
        if (timer !== null) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, waitMs);
    };
}
