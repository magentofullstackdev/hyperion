// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { callExtension, callExtensionSync, type Heartbeat } from '../call.js';

const CATALOG = {
    'Hyperion_Checkout::extension_call_failed': 'Step failed.',
    'Hyperion_Checkout::extension_call_timeout': 'Step timed out.',
};

function beats(): Heartbeat & { beat(): void } {
    const listeners = new Set<() => void>();
    return {
        subscribe: (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        beat: () => listeners.forEach((fn) => fn()),
    };
}

describe('callExtension', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setActiveCatalogForTests(CATALOG);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('resolves with the value of the call', async () => {
        await expect(callExtension('probe', () => 42, 1000)).resolves.toBe(42);
    });

    it('turns a throw into a validation error with the extension message, logged once', async () => {
        const settled = vi.fn();
        const call = callExtension('probe', () => { throw new Error('Card declined'); }, 1000, { onSettled: settled });
        await expect(call).rejects.toMatchObject({ kind: 'validation', message: 'Card declined', status: null });
        expect(settled).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('uses the generic message for a rejection without a usable message', async () => {
        await expect(callExtension('probe', () => Promise.reject({ code: 5 }), 1000)).rejects.toMatchObject({
            kind: 'validation',
            message: 'Step failed.',
        });
    });

    it('caps the message of an extension to 500 characters of plain text', async () => {
        const call = callExtension('probe', () => Promise.reject(new Error(`\u0007${'x'.repeat(900)}`)), 1000);
        await expect(call).rejects.toMatchObject({ message: 'x'.repeat(500) });
    });

    it('times out, aborts the signal and releases the caller state', async () => {
        const settled = vi.fn();
        let seen: AbortSignal | null = null;
        const call = callExtension('probe', (signal) => {
            seen = signal;
            return new Promise(() => undefined);
        }, 1000, { onSettled: settled });
        const expectation = expect(call).rejects.toMatchObject({ kind: 'timeout', message: 'Step timed out.' });
        await vi.advanceTimersByTimeAsync(1000);
        await expectation;
        expect(settled).toHaveBeenCalledTimes(1);
        expect(seen!.aborted).toBe(true);
    });

    it('restarts the time limit on every heartbeat', async () => {
        const heartbeat = beats();
        let resolve: (value: string) => void = () => undefined;
        const call = callExtension('probe', () => new Promise<string>((r) => { resolve = r; }), 1000, { heartbeat });
        await vi.advanceTimersByTimeAsync(900);
        heartbeat.beat();
        await vi.advanceTimersByTimeAsync(900);
        heartbeat.beat();
        await vi.advanceTimersByTimeAsync(900);
        resolve('done');
        await expect(call).resolves.toBe('done');
    });

    it('never runs past the hard cap, heartbeats or not', async () => {
        const heartbeat = beats();
        const call = callExtension('probe', () => new Promise(() => undefined), 1000, { heartbeat, hardCapMs: 2500 });
        const expectation = expect(call).rejects.toMatchObject({ kind: 'timeout' });
        for (let i = 0; i < 5; i += 1) {
            await vi.advanceTimersByTimeAsync(800);
            heartbeat.beat();
        }
        await expectation;
    });

    it('rejects as aborted when the caller cancels, and releases the state', async () => {
        const controller = new AbortController();
        const settled = vi.fn();
        const call = callExtension('probe', () => new Promise(() => undefined), 1000, { signal: controller.signal, onSettled: settled });
        controller.abort();
        await expect(call).rejects.toMatchObject({ kind: 'aborted' });
        expect(settled).toHaveBeenCalledTimes(1);
    });

    it('releases the state when the call succeeds, too', async () => {
        const settled = vi.fn();
        await callExtension('probe', async () => 'ok', 1000, { onSettled: settled });
        expect(settled).toHaveBeenCalledTimes(1);
    });
});

describe('callExtensionSync', () => {
    beforeEach(() => {
        setActiveCatalogForTests(CATALOG);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => vi.restoreAllMocks());

    it('answers the fallback for a throw and logs it', () => {
        expect(callExtensionSync('assign', () => { throw new Error('boom'); }, false)).toBe(false);
        expect(callExtensionSync('assign', () => { throw new Error('boom'); }, (error) => error.kind)).toBe('validation');
        expect(console.error).toHaveBeenCalledTimes(2);
        expect(callExtensionSync('assign', () => 'value', 'fallback')).toBe('value');
    });
});
