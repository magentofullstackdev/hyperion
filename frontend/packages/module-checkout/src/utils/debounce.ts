// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Minimal debounce: keeps a rate estimate or a billing sync from firing on
 * every keystroke. No dependency on lodash or dayjs: the bundle adds no
 * runtime dependencies.
 *
 * The returned function also exposes the pending call: `flush()` runs it
 * now (once), `cancel()` drops it, `pending()` tells whether one is waiting.
 */

export interface Debounced<A extends readonly unknown[]> {
    (...args: A): void;
    /** Run the pending call now; a no-op when nothing is pending. */
    flush(): void;
    /** Drop the pending call. */
    cancel(): void;
    /** True while a call is waiting for its delay. */
    pending(): boolean;
}

export function debounce<A extends readonly unknown[]>(
    fn: (...args: A) => void,
    waitMs: number
): Debounced<A> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: A | null = null;

    const run = (): void => {
        const args = lastArgs;
        timer = null;
        lastArgs = null;
        if (args !== null) fn(...args);
    };

    const debounced = ((...args: A): void => {
        if (timer !== null) {
            clearTimeout(timer);
        }
        lastArgs = args;
        timer = setTimeout(run, waitMs);
    }) as Debounced<A>;

    debounced.flush = (): void => {
        if (timer === null) return;
        clearTimeout(timer);
        run();
    };
    debounced.cancel = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        lastArgs = null;
    };
    debounced.pending = (): boolean => timer !== null;

    return debounced;
}
