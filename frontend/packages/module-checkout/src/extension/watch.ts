// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Run a function after the signals another function reads changed: once
 * per batch of changes, in a microtask, with the new value. A throwing
 * `onChange` is logged and does not stop the watch.
 */
import { Signal } from 'signal-polyfill';

export function watchValue<T>(read: () => T, onChange: (value: T) => void): () => void {
    let stopped = false;
    let scheduled = false;
    const tracked = new Signal.Computed<T>(read);
    const watcher = new Signal.subtle.Watcher(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            if (stopped) return;
            const value = tracked.get();
            // A watcher reports once and then waits to be armed again.
            watcher.watch();
            try {
                onChange(value);
            } catch (err) {
                console.error('[hyperion-checkout] a checkout watcher failed', err);
            }
        });
    });
    watcher.watch(tracked);
    tracked.get();
    return (): void => {
        stopped = true;
        watcher.unwatch(tracked);
    };
}
