// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The serialized quote write queue.
 *
 * Every request that changes the quote (shipping information, billing
 * address, payment method, coupon, gift message) goes through one queue:
 * one write in flight at any time, first in first out, a waiting write
 * replaced by a newer one of the same key. Payment details (methods and
 * totals) are applied only from the last write of a drain; when that write
 * does not answer with them, the queue reads them once itself. Place Order
 * flushes the queue and sends the order with the queue closed.
 *
 * The queue writes `store.quoteWritesPending` and `store.isSettlingTotals`
 * and nothing else writes them.
 */
import type { SectionId, SectionStatusSource } from '../types/section.js';
import type { PaymentDetails } from '../types/shipping.js';
import type { Store } from './index.js';

export type WriteKey =
    /** POST shipping-information. */
    | 'shipping'
    /** POST billing-address. */
    | 'billing'
    /** POST set-payment-information. */
    | 'payment-method'
    /** PUT or DELETE coupons. */
    | 'coupon'
    /** One gift message target (the order or an item). */
    | `gift:${string}`
    /** One quote item; reserved, nothing enqueues it yet. */
    | `item:${string}`;

export interface QuoteWrite<T> {
    key: WriteKey;
    /** Builds the payload from the store WHEN IT STARTS, then performs the call. */
    run: (signal: AbortSignal) => Promise<T>;
    /** True when the answer carries PaymentDetails (methods and totals). */
    returnsDetails: boolean;
    /** Called for a successful, non-superseded write. `isTail`: no write is queued behind it. */
    apply?: (result: T, ctx: { isTail: boolean }) => void;
    /** 'replace' (default): a QUEUED write with the same key is dropped in favor of this one. */
    coalesce?: 'replace' | 'append';
    /** Section that shows the busy and error state of the write. */
    section: SectionId;
    /**
     * Who asked for the write: `action` for something the shopper did on
     * purpose (a coupon, a retry, a payment method click), `background`
     * for a save the checkout sends on its own. Decides how loudly a
     * failure is shown.
     */
    source?: SectionStatusSource;
    /** The request the write sends, for classifying its failure. */
    errorContext?: { path: string; method: string };
}

/**
 * Thrown by a `run` that found, when it started, that there is nothing to
 * send (the form it would save is no longer complete). The write resolves
 * `superseded`: no request, no failure, no `apply`.
 */
export class WriteNotNeeded extends Error {
    public constructor() {
        super('write not needed');
        this.name = 'WriteNotNeeded';
    }
}

export type WriteOutcome<T> =
    | { status: 'applied'; value: T }
    /** Replaced while queued, or a newer write of the same key was enqueued while it ran. */
    | { status: 'superseded' }
    | { status: 'failed'; error: unknown }
    /** The queue is closed: the order is placed or being placed. */
    | { status: 'skipped' };

export interface WriteQueue {
    /** Never rejects. */
    enqueue<T>(write: QuoteWrite<T>): Promise<WriteOutcome<T>>;
    /**
     * A debounced editor registers a function that turns its pending edit
     * into an enqueue NOW. Returns the function that unregisters it.
     */
    registerFlusher(fn: () => void): () => void;
    /**
     * Runs every flusher, then resolves when nothing runs or waits
     * (including writes enqueued meanwhile). False when a write of this
     * drain failed.
     */
    flush(): Promise<boolean>;
    whenIdle(): Promise<void>;
    /**
     * Read the payment methods and totals again once nothing runs or
     * waits, and apply them. Resolves when the queue is idle; false when
     * the read failed or the queue is closed.
     */
    settle(): Promise<boolean>;
    /** True while a write runs or waits, or the settling read is in flight. */
    isBusy(): boolean;
    /** Further enqueues resolve `skipped`. */
    close(): void;
    /** Accept writes again, after a failed order attempt. */
    reopen(): void;
}

/**
 * What the queue tells its owner about a write: the parts that do not
 * depend on the type of the answer.
 */
export type QuoteWriteInfo = Pick<QuoteWrite<unknown>, 'key' | 'section' | 'returnsDetails' | 'source' | 'errorContext'>;

/**
 * What the queue needs from its owner, so it does not import the flow
 * actions: the store whose two flags it writes, the read that settles the
 * totals after a drain whose last write did not answer with them, and how
 * a payment details answer is applied.
 */
export interface WriteQueueDeps {
    store: Store;
    /** GET payment-information for the quote as it is now. */
    settle: (signal: AbortSignal) => Promise<PaymentDetails>;
    applyDetails: (details: PaymentDetails) => void;
    /** Called once per failed write; `retry` enqueues the same write again. */
    onFailure?: (write: QuoteWriteInfo, error: unknown, retry: () => void) => void;
    /** Called for each write that succeeded and was not superseded. */
    onSuccess?: (write: QuoteWriteInfo) => void;
    /** Called when the settling read failed; `retry` runs it again. */
    onSettleFailure?: (error: unknown, retry: () => void) => void;
}

interface Entry {
    write: QuoteWrite<unknown>;
    resolve: (outcome: WriteOutcome<unknown>) => void;
    /** A newer write of the same key was enqueued while this one ran. */
    superseded: boolean;
}

function infoOf(write: QuoteWrite<unknown>): QuoteWriteInfo {
    const info: QuoteWriteInfo = { key: write.key, section: write.section, returnsDetails: write.returnsDetails };
    if (write.source !== undefined) info.source = write.source;
    if (write.errorContext !== undefined) info.errorContext = write.errorContext;
    return info;
}

/** A callback of the owner must never stall the drain. */
function guarded(fn: () => void): void {
    try {
        fn();
    } catch (err) {
        console.error('[hyperion-checkout] write queue callback failed', err);
    }
}

export function createWriteQueue(deps: WriteQueueDeps): WriteQueue {
    const { store } = deps;
    const waiting: Entry[] = [];
    const flushers = new Set<() => void>();
    let running: Entry | null = null;
    let closed = false;
    /** A write of this drain succeeded and the totals shown do not include it yet. */
    let detailsOwed = false;
    /** A write or the settling read of the current drain failed. */
    let drainFailed = false;
    /** The settling read in flight; replaced or dropped when a write is enqueued. */
    let settleRead: AbortController | null = null;
    let idleWaiters: (() => void)[] = [];

    const isBusy = (): boolean => running !== null || waiting.length > 0 || settleRead !== null;

    function publish(): void {
        store.quoteWritesPending.set(waiting.length + (running === null ? 0 : 1));
        store.isSettlingTotals.set(isBusy());
    }

    function releaseWhenIdle(): void {
        if (isBusy() || idleWaiters.length === 0) return;
        const waiters = idleWaiters;
        idleWaiters = [];
        for (const resolve of waiters) resolve();
    }

    function startSettleRead(): void {
        const controller = new AbortController();
        settleRead = controller;
        publish();
        deps.settle(controller.signal).then(
            (details) => {
                // A write enqueued meanwhile dropped this read: its answer
                // describes a quote that is about to change.
                if (settleRead !== controller) return;
                settleRead = null;
                detailsOwed = false;
                guarded(() => deps.applyDetails(details));
                publish();
                releaseWhenIdle();
            },
            (error: unknown) => {
                if (settleRead !== controller) return;
                settleRead = null;
                drainFailed = true;
                publish();
                guarded(() => deps.onSettleFailure?.(error, () => { void settle(); }));
                releaseWhenIdle();
            }
        );
    }

    function pump(): void {
        if (running !== null) return;
        const entry = waiting.shift();
        if (entry === undefined) {
            if (detailsOwed && !closed && settleRead === null) {
                startSettleRead();
                return;
            }
            publish();
            releaseWhenIdle();
            return;
        }
        running = entry;
        publish();
        const { write } = entry;
        let attempt: Promise<unknown>;
        try {
            attempt = write.run(new AbortController().signal);
        } catch (error) {
            attempt = Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
        attempt.then(
            (value) => {
                running = null;
                if (entry.superseded) {
                    // The server changed the quote, a newer write of the
                    // same key follows and reports for both.
                    detailsOwed = true;
                    entry.resolve({ status: 'superseded' });
                } else {
                    const isTail = waiting.length === 0;
                    guarded(() => write.apply?.(value, { isTail }));
                    // `apply` may enqueue: the tail is decided after it.
                    if (write.returnsDetails && waiting.length === 0) {
                        detailsOwed = false;
                        guarded(() => deps.applyDetails(value as PaymentDetails));
                    } else {
                        detailsOwed = true;
                    }
                    guarded(() => deps.onSuccess?.(infoOf(write)));
                    entry.resolve({ status: 'applied', value });
                }
                pump();
            },
            (error: unknown) => {
                running = null;
                if (entry.superseded || error instanceof WriteNotNeeded) {
                    entry.resolve({ status: 'superseded' });
                } else {
                    drainFailed = true;
                    guarded(() => deps.onFailure?.(infoOf(write), error, () => { void enqueue(write); }));
                    entry.resolve({ status: 'failed', error });
                }
                pump();
            }
        );
    }

    function enqueue<T>(write: QuoteWrite<T>): Promise<WriteOutcome<T>> {
        if (closed) return Promise.resolve({ status: 'skipped' });
        if (!isBusy()) drainFailed = false;
        const erased = write as unknown as QuoteWrite<unknown>;
        return new Promise<WriteOutcome<T>>((resolve) => {
            if ((write.coalesce ?? 'replace') === 'replace') {
                for (let i = waiting.length - 1; i >= 0; i -= 1) {
                    const queued = waiting[i]!;
                    if (queued.write.key !== write.key) continue;
                    waiting.splice(i, 1);
                    queued.resolve({ status: 'superseded' });
                }
                if (running !== null && running.write.key === write.key) running.superseded = true;
            }
            if (settleRead !== null) {
                settleRead.abort();
                settleRead = null;
                detailsOwed = true;
            }
            waiting.push({
                write: erased,
                resolve: resolve as (outcome: WriteOutcome<unknown>) => void,
                superseded: false,
            });
            publish();
            pump();
        });
    }

    function whenIdle(): Promise<void> {
        if (!isBusy()) return Promise.resolve();
        return new Promise<void>((resolve) => { idleWaiters.push(resolve); });
    }

    async function flush(): Promise<boolean> {
        if (!isBusy()) drainFailed = false;
        for (const flusher of Array.from(flushers)) guarded(flusher);
        await whenIdle();
        return !drainFailed;
    }

    async function settle(): Promise<boolean> {
        if (closed) return false;
        if (!isBusy()) drainFailed = false;
        detailsOwed = true;
        pump();
        await whenIdle();
        return !drainFailed;
    }

    return {
        enqueue,
        registerFlusher(fn: () => void): () => void {
            flushers.add(fn);
            return () => { flushers.delete(fn); };
        },
        flush,
        whenIdle,
        settle,
        isBusy,
        close(): void {
            closed = true;
            for (const queued of waiting.splice(0)) queued.resolve({ status: 'skipped' });
            if (settleRead !== null) {
                settleRead.abort();
                settleRead = null;
            }
            publish();
            releaseWhenIdle();
        },
        reopen(): void {
            closed = false;
        },
    };
}
