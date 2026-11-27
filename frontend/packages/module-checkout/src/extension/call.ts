// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The one wrapper every call into extension code goes through: a time
 * limit, an error boundary and a guaranteed release of the caller's state.
 *
 * `callExtension()` runs an asynchronous call (a method of an element, the
 * default export of a module). A throw, a rejection or the end of the time
 * limit becomes a public `CheckoutError`: kind `timeout` for the limit, kind
 * `validation` for anything the extension threw (its own message when it
 * gave a usable one, else a translated generic message), `aborted` when the
 * caller canceled. The original error is logged once. `onSettled` runs in
 * every case, so a latch or a busy state never stays behind.
 *
 * A long step (tokenization, a 3-D Secure challenge) keeps its call alive
 * by reporting that it is busy: every beat of `heartbeat` restarts the
 * timer, never past `hardCapMs`.
 *
 * `callExtensionSync()` is the synchronous boundary (a property
 * assignment, `orderFailed()`, a request filter, a gate).
 */
import type { CheckoutError, Unsubscribe } from '../../extension-api.js';
import { t } from '../utils/i18n.js';
import { isPublicError, plainMessage, publicError } from './public-error.js';

/** The time limits of section "the loader and the call wrapper" of the extension API. */
export const CALL_TIMEOUTS = Object.freeze({
    canMakePayment: 3000,
    validate: 5000,
    paymentData: 120000,
    afterPlaceOrder: 10000,
    moduleDefault: 8000,
});

/** The longest any call may run, heartbeats included. */
export const CALL_HARD_CAP_MS = 15 * 60 * 1000;

/** Something that beats while the extension reports it is busy. */
export interface Heartbeat {
    subscribe(beat: () => void): Unsubscribe;
}

export interface CallOptions {
    /** Every beat restarts the time limit. */
    heartbeat?: Heartbeat;
    /** The limit no heartbeat extends; `CALL_HARD_CAP_MS` by default. */
    hardCapMs?: number;
    /** The caller's own cancellation: the call rejects with kind `aborted`. */
    signal?: AbortSignal;
    /** Runs once the call is over, whatever its outcome. */
    onSettled?: () => void;
}

function messageOf(error: unknown): string | null {
    if (typeof error === 'string') return plainMessage(error);
    if (error instanceof Error) return plainMessage(error.message);
    return null;
}

/** What an extension threw, as the public error the checkout shows. */
export function extensionFailure(error: unknown): CheckoutError {
    if (isPublicError(error)) return error;
    return publicError('validation', messageOf(error) ?? t('Hyperion_Checkout::extension_call_failed'), null, error);
}

function timeoutFailure(): CheckoutError {
    return publicError('timeout', t('Hyperion_Checkout::extension_call_timeout'));
}

function abortedFailure(reason: unknown): CheckoutError {
    return publicError('aborted', t('Hyperion_Checkout::extension_call_failed'), null, reason);
}

/**
 * Run `fn` under a time limit and an error boundary. `fn` receives a signal
 * that fires when the call is given up (time limit, hard cap, the caller's
 * signal), so a well behaved extension stops its work.
 */
export function callExtension<T>(
    label: string,
    fn: (signal: AbortSignal) => T | Promise<T>,
    timeoutMs: number,
    options: CallOptions = {}
): Promise<T> {
    const controller = new AbortController();
    const hardCapMs = options.hardCapMs ?? CALL_HARD_CAP_MS;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopBeats: Unsubscribe | null = null;
    let onCallerAbort: (() => void) | null = null;

    return new Promise<T>((resolve, reject) => {
        let done = false;
        const finish = (outcome: () => void): void => {
            if (done) return;
            done = true;
            if (timer !== null) clearTimeout(timer);
            stopBeats?.();
            if (onCallerAbort !== null) options.signal?.removeEventListener('abort', onCallerAbort);
            try {
                options.onSettled?.();
            } catch (err) {
                console.error(`[hyperion-checkout] ${label}: the release after the call failed`, err);
            }
            outcome();
        };
        const fail = (error: CheckoutError, original: unknown): void => {
            if (!controller.signal.aborted) controller.abort(error);
            console.error(`[hyperion-checkout] ${label} failed`, original);
            finish(() => reject(error));
        };
        const arm = (): void => {
            if (done) return;
            if (timer !== null) clearTimeout(timer);
            const left = hardCapMs - (Date.now() - startedAt);
            if (left <= 0) {
                fail(timeoutFailure(), new Error(`${label} ran past the hard limit of ${hardCapMs} ms`));
                return;
            }
            timer = setTimeout(() => {
                fail(timeoutFailure(), new Error(`${label} did not answer within ${timeoutMs} ms`));
            }, Math.min(timeoutMs, left));
        };

        if (options.signal?.aborted) {
            const error = abortedFailure(options.signal.reason);
            finish(() => reject(error));
            return;
        }
        if (options.signal) {
            onCallerAbort = (): void => {
                const error = abortedFailure(options.signal?.reason);
                if (!controller.signal.aborted) controller.abort(error);
                finish(() => reject(error));
            };
            options.signal.addEventListener('abort', onCallerAbort, { once: true });
        }
        arm();
        if (options.heartbeat) {
            try {
                stopBeats = options.heartbeat.subscribe(arm);
            } catch (err) {
                console.error(`[hyperion-checkout] ${label}: the heartbeat could not be followed`, err);
            }
        }
        let result: T | Promise<T>;
        try {
            result = fn(controller.signal);
        } catch (err) {
            fail(extensionFailure(err), err);
            return;
        }
        Promise.resolve(result).then(
            (value) => finish(() => resolve(value)),
            (err: unknown) => fail(extensionFailure(err), err)
        );
    });
}

/**
 * Run a synchronous call of extension code. A throw is logged and answered
 * with `fallback` (a value, or a function of the public error).
 */
export function callExtensionSync<T>(
    label: string,
    fn: () => T,
    fallback: T | ((error: CheckoutError) => T)
): T {
    try {
        return fn();
    } catch (err) {
        console.error(`[hyperion-checkout] ${label} failed`, err);
        return typeof fallback === 'function'
            ? (fallback as (error: CheckoutError) => T)(extensionFailure(err))
            : fallback;
    }
}
