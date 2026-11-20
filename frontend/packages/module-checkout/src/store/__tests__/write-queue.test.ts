// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentDetails } from '../../types/shipping.js';
import type { Totals } from '../../types/totals.js';
import { createStore, type Store } from '../index.js';
import {
    createWriteQueue,
    WriteNotNeeded,
    type QuoteWrite,
    type QuoteWriteInfo,
    type WriteKey,
    type WriteQueue,
} from '../write-queue.js';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function details(grand: string): PaymentDetails {
    return {
        payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
        totals: { grand_total: grand, total_segments: [] } as unknown as Totals,
    };
}

async function tick(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** A fake API on deferred promises that records the order of started requests. */
class FakeApi {
    public readonly started: string[] = [];
    public readonly pending = new Map<string, Deferred<unknown>>();
    public inFlight = 0;
    public maxInFlight = 0;

    public call<T>(label: string): Promise<T> {
        const d = deferred<unknown>();
        this.started.push(label);
        this.pending.set(label, d);
        this.inFlight += 1;
        this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
        const done = (): void => { this.inFlight -= 1; this.pending.delete(label); };
        d.promise.then(done, done);
        return d.promise as Promise<T>;
    }

    public resolve(label: string, value: unknown): void {
        this.pending.get(label)!.resolve(value);
    }

    public reject(label: string, reason: unknown): void {
        this.pending.get(label)!.reject(reason);
    }
}

describe('write queue', () => {
    let store: Store;
    let api: FakeApi;
    let settles: Deferred<PaymentDetails>[];
    let failures: { write: QuoteWriteInfo; error: unknown; retry: () => void }[];
    let successes: QuoteWriteInfo[];
    let queue: WriteQueue;

    function shippingWrite(label: string): QuoteWrite<PaymentDetails> {
        return {
            key: 'shipping',
            section: 'shipping-methods',
            returnsDetails: true,
            run: () => api.call<PaymentDetails>(label),
        };
    }

    function plainWrite(key: WriteKey, label: string): QuoteWrite<boolean> {
        return {
            key,
            section: 'coupon',
            returnsDetails: false,
            run: () => api.call<boolean>(label),
        };
    }

    beforeEach(() => {
        store = createStore();
        api = new FakeApi();
        settles = [];
        failures = [];
        successes = [];
        queue = createWriteQueue({
            store,
            settle: () => {
                const d = deferred<PaymentDetails>();
                settles.push(d);
                api.started.push('settle');
                return d.promise;
            },
            applyDetails: (answer) => { store.totals.set(answer.totals); },
            onFailure: (write, error, retry) => { failures.push({ write, error, retry }); },
            onSuccess: (write) => { successes.push(write); },
        });
    });

    it('runs one write at a time, first in first out among keys', async () => {
        const first = queue.enqueue(shippingWrite('shipping'));
        const second = queue.enqueue(plainWrite('coupon', 'coupon'));

        expect(api.started).toEqual(['shipping']);
        expect(store.quoteWritesPending.get()).toBe(2);
        expect(store.isSettlingTotals.get()).toBe(true);

        api.resolve('shipping', details('57.00'));
        expect((await first).status).toBe('applied');
        expect(api.started).toEqual(['shipping', 'coupon']);
        expect(store.quoteWritesPending.get()).toBe(1);

        api.resolve('coupon', true);
        expect(await second).toEqual({ status: 'applied', value: true });
    });

    it('a waiting write is replaced by a newer one of the same key and never runs', async () => {
        const a = queue.enqueue(shippingWrite('A'));
        const runB = vi.fn(() => api.call<boolean>('B'));
        const b = queue.enqueue({ ...plainWrite('coupon', 'B'), run: runB });
        const c = queue.enqueue(plainWrite('coupon', 'C'));

        expect(await b).toEqual({ status: 'superseded' });
        api.resolve('A', details('57.00'));
        await a;
        await tick();

        expect(api.started).toEqual(['A', 'C']);
        expect(runB).not.toHaveBeenCalled();
        api.resolve('C', true);
        expect((await c).status).toBe('applied');
    });

    it('a running write is never aborted; a newer write of its key makes its answer superseded and unapplied', async () => {
        const applyFirst = vi.fn();
        let signalOfFirst: AbortSignal | null = null;
        const first = queue.enqueue({
            ...shippingWrite('first'),
            run: (signal) => { signalOfFirst = signal; return api.call<PaymentDetails>('first'); },
            apply: applyFirst,
        });
        const second = queue.enqueue(shippingWrite('second'));

        expect(signalOfFirst!.aborted).toBe(false);
        api.resolve('first', details('57.00'));
        expect(await first).toEqual({ status: 'superseded' });
        expect(applyFirst).not.toHaveBeenCalled();
        expect(store.totals.get()).toBeNull();
        expect(successes).toHaveLength(0);

        api.resolve('second', details('61.00'));
        expect((await second).status).toBe('applied');
        expect(store.totals.get()?.grand_total).toBe('61.00');
    });

    it('a superseded running write that fails is not reported', async () => {
        const first = queue.enqueue(shippingWrite('first'));
        const second = queue.enqueue(shippingWrite('second'));

        api.reject('first', new Error('Carrier with such method not found'));
        expect(await first).toEqual({ status: 'superseded' });
        expect(failures).toHaveLength(0);

        api.resolve('second', details('61.00'));
        await second;
        expect(await queue.flush()).toBe(true);
    });

    it('builds the payload when the write starts, not when it is enqueued', async () => {
        const form = { city: 'Calder' };
        const sent: string[] = [];
        const first = queue.enqueue(plainWrite('coupon', 'first'));
        const second = queue.enqueue({
            ...shippingWrite('second'),
            run: () => { sent.push(form.city); return api.call<PaymentDetails>('second'); },
        });

        form.city = 'Detroit';
        api.resolve('first', true);
        await first;
        await tick();

        expect(sent).toEqual(['Detroit']);
        api.resolve('second', details('57.00'));
        await second;
    });

    it('applies payment details only from the last write and reads them once when that write does not answer with them', async () => {
        const shipping = queue.enqueue(shippingWrite('shipping'));
        const coupon = queue.enqueue(plainWrite('coupon', 'coupon'));

        api.resolve('shipping', details('57.00'));
        await shipping;
        expect(store.totals.get()).toBeNull();

        api.resolve('coupon', true);
        await coupon;
        await tick();
        expect(api.started).toEqual(['shipping', 'coupon', 'settle']);
        expect(store.isSettlingTotals.get()).toBe(true);
        expect(store.quoteWritesPending.get()).toBe(0);

        settles[0]!.resolve(details('47.00'));
        await queue.whenIdle();
        expect(store.totals.get()?.grand_total).toBe('47.00');
        expect(store.isSettlingTotals.get()).toBe(false);
        expect(settles).toHaveLength(1);
    });

    it('reads nothing when the last write answers with the details', async () => {
        const coupon = queue.enqueue(plainWrite('coupon', 'coupon'));
        const shipping = queue.enqueue(shippingWrite('shipping'));

        api.resolve('coupon', true);
        await coupon;
        await tick();
        api.resolve('shipping', details('52.00'));
        await shipping;
        await queue.whenIdle();

        expect(settles).toHaveLength(0);
        expect(store.totals.get()?.grand_total).toBe('52.00');
        expect(store.isSettlingTotals.get()).toBe(false);
    });

    it('reads the details when the last write failed after an earlier one changed the quote', async () => {
        const shipping = queue.enqueue(shippingWrite('shipping'));
        const coupon = queue.enqueue(plainWrite('coupon', 'coupon'));

        api.resolve('shipping', details('57.00'));
        await shipping;
        api.reject('coupon', new Error('invalid'));
        expect((await coupon).status).toBe('failed');
        await tick();

        expect(settles).toHaveLength(1);
        settles[0]!.resolve(details('57.00'));
        await queue.whenIdle();
        expect(store.totals.get()?.grand_total).toBe('57.00');
    });

    it('a write enqueued during the settling read discards its answer', async () => {
        const coupon = queue.enqueue(plainWrite('coupon', 'coupon'));
        api.resolve('coupon', true);
        await coupon;
        await tick();
        expect(settles).toHaveLength(1);

        const shipping = queue.enqueue(shippingWrite('shipping'));
        settles[0]!.resolve(details('1.00'));
        await tick();
        expect(store.totals.get()).toBeNull();

        api.resolve('shipping', details('61.00'));
        await shipping;
        await queue.whenIdle();
        expect(store.totals.get()?.grand_total).toBe('61.00');
        expect(settles).toHaveLength(1);
    });

    it('whenIdle resolves only after the writes enqueued while it waited', async () => {
        let idle = false;
        const first = queue.enqueue(shippingWrite('first'));
        const waiting = queue.whenIdle().then(() => { idle = true; });

        const second = queue.enqueue(plainWrite('gift:order', 'second'));
        api.resolve('first', details('57.00'));
        await first;
        await tick();
        expect(idle).toBe(false);

        api.resolve('second', true);
        await second;
        await tick();
        expect(idle).toBe(false);
        settles[0]!.resolve(details('57.00'));
        await waiting;
        expect(idle).toBe(true);
    });

    it('flush runs the flushers first, reports a failed write of the drain and still runs the later writes', async () => {
        const flusher = vi.fn(() => { void queue.enqueue(shippingWrite('flushed')); });
        const unregister = queue.registerFlusher(flusher);
        const failing = queue.enqueue(plainWrite('coupon', 'failing'));

        const flushed = queue.flush();
        expect(flusher).toHaveBeenCalledTimes(1);
        api.reject('failing', new Error('refused'));
        expect((await failing).status).toBe('failed');
        await tick();
        expect(api.started).toEqual(['failing', 'flushed']);
        api.resolve('flushed', details('57.00'));

        expect(await flushed).toBe(false);
        expect(failures).toHaveLength(1);
        expect(failures[0]!.write.key).toBe('coupon');

        // The retry closure enqueues the same write again.
        failures[0]!.retry();
        expect(api.started).toEqual(['failing', 'flushed', 'failing']);
        api.resolve('failing', true);
        await tick();
        settles[0]!.resolve(details('57.00'));
        await queue.whenIdle();

        unregister();
        expect(await queue.flush()).toBe(true);
        expect(flusher).toHaveBeenCalledTimes(1);
    });

    it('close makes an enqueue resolve skipped without a request, reopen restores', async () => {
        queue.close();
        expect(await queue.enqueue(shippingWrite('closed'))).toEqual({ status: 'skipped' });
        expect(api.started).toEqual([]);
        expect(await queue.settle()).toBe(false);

        queue.reopen();
        const open = queue.enqueue(shippingWrite('open'));
        expect(api.started).toEqual(['open']);
        api.resolve('open', details('57.00'));
        expect((await open).status).toBe('applied');
    });

    it('a write that finds nothing to send when it starts resolves superseded without a failure', async () => {
        const outcome = await queue.enqueue({
            ...shippingWrite('never'),
            run: () => Promise.reject(new WriteNotNeeded()),
        });

        expect(outcome).toEqual({ status: 'superseded' });
        expect(failures).toHaveLength(0);
        expect(await queue.flush()).toBe(true);
    });

    it('a callback that throws does not stall the drain', async () => {
        const first = queue.enqueue({
            ...shippingWrite('first'),
            apply: () => { throw new Error('broken apply'); },
        });
        const second = queue.enqueue(plainWrite('coupon', 'second'));
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        api.resolve('first', details('57.00'));
        expect((await first).status).toBe('applied');
        await tick();
        expect(api.started).toEqual(['first', 'second']);
        api.resolve('second', true);
        await second;
        await tick();
        settles[0]!.resolve(details('57.00'));
        await queue.whenIdle();
        expect(logged).toHaveBeenCalled();
        logged.mockRestore();
    });

    it('settle reads and applies the details on an idle queue and reports a failed read', async () => {
        const onSettleFailure = vi.fn();
        queue = createWriteQueue({
            store,
            settle: () => {
                const d = deferred<PaymentDetails>();
                settles.push(d);
                return d.promise;
            },
            applyDetails: (answer) => { store.totals.set(answer.totals); },
            onSettleFailure,
        });

        const first = queue.settle();
        expect(store.isSettlingTotals.get()).toBe(true);
        settles[0]!.resolve(details('47.00'));
        expect(await first).toBe(true);
        expect(store.totals.get()?.grand_total).toBe('47.00');

        const second = queue.settle();
        settles[1]!.reject(new Error('boom'));
        expect(await second).toBe(false);
        expect(store.isSettlingTotals.get()).toBe(false);
        expect(onSettleFailure).toHaveBeenCalledTimes(1);
    });

    it('random interleavings keep one write in flight, the enqueue order and the totals of the last drain', async () => {
        // Deterministic generator: the same 200 scenarios on every run.
        let seed = 20240607;
        const random = (): number => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0x100000000;
        };
        const keys: WriteKey[] = ['shipping', 'billing', 'payment-method', 'coupon', 'gift:order'];

        for (let run = 0; run < 200; run += 1) {
            const runStore = createStore();
            const started: number[] = [];
            const open = new Map<number, Deferred<unknown>>();
            let inFlight = 0;
            let maxInFlight = 0;
            let settleCount = 0;
            const openSettles: Deferred<PaymentDetails>[] = [];
            let lastApplied: string | null = null;
            const q = createWriteQueue({
                store: runStore,
                settle: () => {
                    const d = deferred<PaymentDetails>();
                    openSettles.push(d);
                    settleCount += 1;
                    return d.promise;
                },
                applyDetails: (answer) => {
                    lastApplied = String(answer.totals.grand_total);
                    runStore.totals.set(answer.totals);
                },
            });
            // What the queue must start, in order: the enqueue order after coalescing.
            const expected: { id: number; key: WriteKey }[] = [];
            const startedSet = new Set<number>();
            let nextId = 0;
            let lastOk: number | null = null;
            let settlesAtLastOk = 0;

            const enqueueOne = (): void => {
                const id = nextId;
                nextId += 1;
                const key = keys[Math.floor(random() * keys.length)]!;
                for (let i = expected.length - 1; i >= 0; i -= 1) {
                    if (expected[i]!.key === key && !startedSet.has(expected[i]!.id)) expected.splice(i, 1);
                }
                expected.push({ id, key });
                void q.enqueue<unknown>({
                    key,
                    section: 'order',
                    returnsDetails: key === 'shipping',
                    run: () => {
                        const d = deferred<unknown>();
                        started.push(id);
                        startedSet.add(id);
                        open.set(id, d);
                        inFlight += 1;
                        maxInFlight = Math.max(maxInFlight, inFlight);
                        return d.promise;
                    },
                });
            };

            const settleOne = (): void => {
                const ids = Array.from(open.keys());
                if (ids.length > 0) {
                    const id = ids[Math.floor(random() * ids.length)]!;
                    const d = open.get(id)!;
                    open.delete(id);
                    inFlight -= 1;
                    if (random() < 0.2) {
                        d.reject(new Error('refused'));
                    } else {
                        lastOk = id;
                        settlesAtLastOk = settleCount;
                        d.resolve(details(`write-${id}`));
                    }
                    return;
                }
                const read = openSettles.shift();
                if (read) read.resolve(details(`settle-${settleCount}`));
            };

            const operations = 4 + Math.floor(random() * 12);
            for (let i = 0; i < operations; i += 1) {
                if (random() < 0.55) enqueueOne();
                else settleOne();
                await tick();
            }
            // Let everything that is still open answer.
            for (let guard = 0; guard < 200 && q.isBusy(); guard += 1) {
                settleOne();
                await tick();
            }
            await q.whenIdle();

            expect(maxInFlight).toBeLessThanOrEqual(1);
            expect(started).toEqual(expected.map((entry) => entry.id));
            expect(runStore.quoteWritesPending.get()).toBe(0);
            expect(runStore.isSettlingTotals.get()).toBe(false);
            // The totals shown at the end are the answer of the last drain:
            // the last write that succeeded when it answered with details
            // as the tail, a read started after it otherwise.
            const shown: string | null = runStore.totals.get()?.grand_total as string | undefined ?? null;
            expect(shown).toBe(lastApplied);
            if (lastOk === null) {
                expect(shown).toBeNull();
            } else {
                const fromWrite = shown === `write-${lastOk}`;
                const fromRead = shown === `settle-${settleCount}` && settleCount > settlesAtLastOk;
                expect(fromWrite || fromRead).toBe(true);
            }
        }
    });
});
