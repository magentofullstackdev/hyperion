// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../api/cart.js', () => ({
    getGuestCartState: vi.fn(),
    getCustomerCartState: vi.fn(),
}));
vi.mock('../drafts.js', () => ({
    discardDrafts: vi.fn(),
    copyDraftToHandoff: vi.fn(),
}));

import * as cartApi from '../../api/cart.js';
import { MagentoApiError, NetworkError } from '../../api/errors.js';
import type { CheckoutError } from '../../api/error-kinds.js';
import { copyDraftToHandoff, discardDrafts } from '../drafts.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import {
    handleQuoteGone,
    handleSessionExpired,
    probeOrderOutcome,
    PROBE_REPEAT_DELAY_MS,
    RECHECK_DELAY_MS,
    RECHECK_LIMIT,
    recoverFromOrderFailure,
    stopOrderRecovery,
    watchConnection,
} from '../recovery.js';

const cart = vi.mocked(cartApi);

const NOT_PLACED = 'We could not reach the store. Your order was not placed. Please try again.';
const UNKNOWN = 'We could not confirm whether your order was placed. Please do not pay again yet.';

const lost = (underlyingKind: CheckoutError['underlyingKind'] = 'network'): CheckoutError => (
    { kind: 'order-unknown', message: UNKNOWN, underlyingKind }
);
const locked: CheckoutError = { kind: 'cart-locked', message: 'The cart is locked for processing. Please try again later.' };
const unreachable = (): NetworkError => new NetworkError(new TypeError('Failed to fetch'));

describe('recovery', () => {
    let store: Store;
    let deps: {
        store: Store;
        queue: { close: Mock<() => void>; reopen: Mock<() => void> };
        navigateToSuccess: Mock<() => void>;
        onNotPlaced: Mock<() => void>;
        onSessionExpired: Mock<() => void>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        store = createStore();
        setStoreForTests(store);
        store.isGuest.set(true);
        store.maskedQuoteId.set('masked-1');
        // The state an order request leaves behind when it fails.
        store.isPlacingOrder.set(true);
        store.orderOutcome.set('placing');
        store.orderStep.set('submitting');
        deps = {
            store,
            queue: { close: vi.fn<() => void>(), reopen: vi.fn<() => void>() },
            navigateToSuccess: vi.fn<() => void>(),
            onNotPlaced: vi.fn<() => void>(),
            onSessionExpired: vi.fn<() => void>(),
        };
    });

    afterEach(() => {
        stopOrderRecovery();
        vi.useRealTimers();
        setStoreForTests(null);
    });

    describe('probeOrderOutcome', () => {
        it('guest: an inactive cart is placed and carries the order number', async () => {
            cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: false, reserved_order_id: '000000205' });
            expect(await probeOrderOutcome(store)).toEqual({ verdict: 'placed', reservedOrderId: '000000205' });
            expect(cart.getGuestCartState).toHaveBeenCalledWith('masked-1');
        });

        it('guest: an active cart is not placed, and its reserved number is not an order', async () => {
            cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: true, reserved_order_id: '000000204' });
            expect(await probeOrderOutcome(store)).toEqual({ verdict: 'not-placed' });
        });

        it('guest: a cart that no longer exists (404) is gone', async () => {
            cart.getGuestCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));
            expect(await probeOrderOutcome(store)).toEqual({ verdict: 'gone' });
        });

        it('guest: no answer, a server error or an answer without the flag decide nothing', async () => {
            cart.getGuestCartState.mockRejectedValueOnce(unreachable());
            expect(await probeOrderOutcome(store)).toEqual({ verdict: 'unknown' });
            cart.getGuestCartState.mockRejectedValueOnce(new MagentoApiError(503, '503', 'unavailable'));
            expect(await probeOrderOutcome(store)).toEqual({ verdict: 'unknown' });
            cart.getGuestCartState.mockResolvedValueOnce({ id: 5 });
            expect(await probeOrderOutcome(store)).toEqual({ verdict: 'unknown' });
        });

        describe('customer', () => {
            beforeEach(() => {
                store.isGuest.set(false);
                store.quoteId.set('465');
            });

            it('no active cart (404) is placed', async () => {
                cart.getCustomerCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));
                expect(await probeOrderOutcome(store)).toEqual({ verdict: 'placed' });
                expect(cart.getGuestCartState).not.toHaveBeenCalled();
            });

            it('a cart with another id is placed', async () => {
                cart.getCustomerCartState.mockResolvedValue({ id: 470, is_active: true });
                expect(await probeOrderOutcome(store)).toEqual({ verdict: 'placed' });
            });

            it('the same cart, still active, is not placed (the id is compared as a number)', async () => {
                cart.getCustomerCartState.mockResolvedValue({ id: 465, is_active: true });
                expect(await probeOrderOutcome(store)).toEqual({ verdict: 'not-placed' });
            });

            it('a session that ended (401) decides nothing and says why', async () => {
                cart.getCustomerCartState.mockRejectedValue(new MagentoApiError(401, '401', 'Not authorized'));
                expect(await probeOrderOutcome(store)).toEqual({ verdict: 'unknown', sessionExpired: true });
            });
        });
    });

    describe('recoverFromOrderFailure', () => {
        it('shows that the order is being confirmed while the quote is read, with the queue closed', async () => {
            let answer!: (value: cartApi.CartStateProbe) => void;
            cart.getGuestCartState.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

            const recovering = recoverFromOrderFailure(lost(), deps);
            expect(store.orderOutcome.get()).toBe('unknown');
            expect(store.orderStep.get()).toBe('confirming');
            expect(deps.queue.close).toHaveBeenCalledTimes(1);

            answer({ id: 5, is_active: false });
            expect(await recovering).toBe('placed');
        });

        it('placed: terminal state, the order number kept for the overlay, drafts removed, the caller navigates', async () => {
            cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: false, reserved_order_id: '000000205' });

            expect(await recoverFromOrderFailure(lost(), deps)).toBe('placed');

            expect(store.orderOutcome.get()).toBe('placed');
            expect(store.orderPlaced.get()).toBe(true);
            expect(store.isPlacingOrder.get()).toBe(true);
            expect(store.orderNumber.get()).toBe('000000205');
            expect(discardDrafts).toHaveBeenCalledTimes(1);
            expect(deps.navigateToSuccess).not.toHaveBeenCalled();
            expect(deps.queue.reopen).not.toHaveBeenCalled();
            expect(store.sectionStatus.get().order).toBeNull();
        });

        it('not placed: one read is enough after a failure that never reached the server; the latch is released with the message', async () => {
            cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: true });

            expect(await recoverFromOrderFailure(lost('network'), deps)).toBe('not-placed');

            expect(cart.getGuestCartState).toHaveBeenCalledTimes(1);
            expect(deps.queue.reopen).toHaveBeenCalledTimes(1);
            expect(store.orderOutcome.get()).toBe('none');
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.orderStep.get()).toBe('idle');
            const status = store.sectionStatus.get().order;
            expect(status?.message).toBe(NOT_PLACED);
            expect(status?.source).toBe('action');
            expect(status?.retry).toBeUndefined();
            expect(discardDrafts).not.toHaveBeenCalled();
            // The caller got the verdict and tells the payment method itself.
            expect(deps.onNotPlaced).not.toHaveBeenCalled();
        });

        it('gone: treated as the end of this checkout, the server decides where the shopper lands', async () => {
            cart.getGuestCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));

            expect(await recoverFromOrderFailure(lost(), deps)).toBe('gone');
            expect(store.orderOutcome.get()).toBe('placed');
            expect(discardDrafts).toHaveBeenCalledTimes(1);
            expect(deps.queue.reopen).not.toHaveBeenCalled();
        });

        it('after a timeout a quote that is still active is read five times, three seconds apart, before it counts as not placed', async () => {
            cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: true });

            let verdict: string | null = null;
            void recoverFromOrderFailure(lost('timeout'), deps).then((v) => { verdict = v; });
            await vi.advanceTimersByTimeAsync(0);
            expect(cart.getGuestCartState).toHaveBeenCalledTimes(1);
            for (let read = 2; read <= 5; read += 1) {
                await vi.advanceTimersByTimeAsync(PROBE_REPEAT_DELAY_MS - 1);
                expect(cart.getGuestCartState).toHaveBeenCalledTimes(read - 1);
                expect(verdict).toBeNull();
                await vi.advanceTimersByTimeAsync(1);
                expect(cart.getGuestCartState).toHaveBeenCalledTimes(read);
            }
            expect(verdict).toBe('not-placed');
            expect(store.sectionStatus.get().order?.message).toBe(NOT_PLACED);
        });

        it('a gateway error may hide a server still at work: the quote is read again as after a timeout', async () => {
            cart.getGuestCartState
                .mockResolvedValueOnce({ id: 5, is_active: true })
                .mockResolvedValueOnce({ id: 5, is_active: false });

            const recovering = recoverFromOrderFailure(lost('unavailable'), deps);
            await vi.advanceTimersByTimeAsync(PROBE_REPEAT_DELAY_MS);
            expect(await recovering).toBe('placed');
            expect(cart.getGuestCartState).toHaveBeenCalledTimes(2);
        });

        it('after a timeout the reads stop as soon as the order shows up', async () => {
            cart.getGuestCartState
                .mockResolvedValueOnce({ id: 5, is_active: true })
                .mockResolvedValueOnce({ id: 5, is_active: true })
                .mockResolvedValueOnce({ id: 5, is_active: false });

            const recovering = recoverFromOrderFailure(lost('timeout'), deps);
            await vi.advanceTimersByTimeAsync(2 * PROBE_REPEAT_DELAY_MS);
            expect(await recovering).toBe('placed');
            expect(cart.getGuestCartState).toHaveBeenCalledTimes(3);
        });

        it('a locked cart means an earlier request is still running: wait, then read, and show no error', async () => {
            cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: false });

            const recovering = recoverFromOrderFailure(locked, deps);
            await vi.advanceTimersByTimeAsync(PROBE_REPEAT_DELAY_MS - 1);
            expect(cart.getGuestCartState).not.toHaveBeenCalled();
            expect(store.sectionStatus.get().order).toBeNull();
            await vi.advanceTimersByTimeAsync(1);
            expect(await recovering).toBe('placed');
        });

        describe('when the quote cannot be read', () => {
            beforeEach(() => {
                cart.getGuestCartState.mockRejectedValue(unreachable());
            });

            it('stays unknown and latched, with "Check again" in the order section', async () => {
                expect(await recoverFromOrderFailure(lost(), deps)).toBe('unknown');

                expect(store.orderOutcome.get()).toBe('unknown');
                expect(store.isPlacingOrder.get()).toBe(false);
                expect(store.orderStep.get()).toBe('idle');
                expect(deps.queue.reopen).not.toHaveBeenCalled();
                const status = store.sectionStatus.get().order;
                expect(status?.kind).toBe('order-unknown');
                expect(status?.message).toBe(UNKNOWN);
                expect(typeof status?.retry).toBe('function');
            });

            it('reads again every five seconds, twelve times, without replacing the message each time', async () => {
                await recoverFromOrderFailure(lost(), deps);
                const shown = store.sectionStatus.get().order;
                expect(cart.getGuestCartState).toHaveBeenCalledTimes(1);

                for (let attempt = 1; attempt <= RECHECK_LIMIT; attempt += 1) {
                    await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS);
                    expect(cart.getGuestCartState).toHaveBeenCalledTimes(1 + attempt);
                }
                await vi.advanceTimersByTimeAsync(10 * RECHECK_DELAY_MS);
                expect(cart.getGuestCartState).toHaveBeenCalledTimes(1 + RECHECK_LIMIT);
                expect(store.sectionStatus.get().order).toBe(shown);
                expect(store.orderOutcome.get()).toBe('unknown');
            });

            it('a timed read that finds the order leaves for the success page by itself', async () => {
                await recoverFromOrderFailure(lost(), deps);
                cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: false, reserved_order_id: '000000206' });

                await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS);

                expect(store.orderOutcome.get()).toBe('placed');
                expect(store.orderNumber.get()).toBe('000000206');
                expect(discardDrafts).toHaveBeenCalledTimes(1);
                expect(deps.navigateToSuccess).toHaveBeenCalledTimes(1);
                // Terminal: no further read.
                await vi.advanceTimersByTimeAsync(10 * RECHECK_DELAY_MS);
                expect(cart.getGuestCartState).toHaveBeenCalledTimes(2);
            });

            it('a timed read that finds the quote still active releases the latch and tells the caller', async () => {
                await recoverFromOrderFailure(lost(), deps);
                cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: true });

                await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS);

                expect(store.orderOutcome.get()).toBe('none');
                expect(deps.queue.reopen).toHaveBeenCalledTimes(1);
                expect(deps.onNotPlaced).toHaveBeenCalledTimes(1);
                expect(store.sectionStatus.get().order?.message).toBe(NOT_PLACED);
                await vi.advanceTimersByTimeAsync(10 * RECHECK_DELAY_MS);
                expect(cart.getGuestCartState).toHaveBeenCalledTimes(2);
            });

            it('the connection coming back reads at once', async () => {
                await recoverFromOrderFailure(lost(), deps);
                cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: false });

                window.dispatchEvent(new Event('online'));
                await vi.advanceTimersByTimeAsync(0);

                expect(cart.getGuestCartState).toHaveBeenCalledTimes(2);
                expect(deps.navigateToSuccess).toHaveBeenCalledTimes(1);
                // The listener is gone with the recovery.
                window.dispatchEvent(new Event('online'));
                await vi.advanceTimersByTimeAsync(0);
                expect(cart.getGuestCartState).toHaveBeenCalledTimes(2);
            });

            it('"Check again" shows the confirming state and never overlaps a read already under way', async () => {
                await recoverFromOrderFailure(lost(), deps);
                let answer!: (value: cartApi.CartStateProbe) => void;
                cart.getGuestCartState.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

                const checkAgain = store.sectionStatus.get().order?.retry;
                checkAgain?.();
                checkAgain?.();
                window.dispatchEvent(new Event('online'));
                await vi.advanceTimersByTimeAsync(RECHECK_DELAY_MS);

                expect(cart.getGuestCartState).toHaveBeenCalledTimes(2);
                expect(store.orderStep.get()).toBe('confirming');

                answer({ id: 5, is_active: false });
                await vi.advanceTimersByTimeAsync(0);
                expect(deps.navigateToSuccess).toHaveBeenCalledTimes(1);
            });

            it('"Check again" that still cannot read keeps the state and takes the confirming state down', async () => {
                await recoverFromOrderFailure(lost(), deps);

                store.sectionStatus.get().order?.retry?.();
                await vi.advanceTimersByTimeAsync(0);

                expect(store.orderStep.get()).toBe('idle');
                expect(store.orderOutcome.get()).toBe('unknown');
                expect(store.sectionStatus.get().order?.message).toBe(UNKNOWN);
            });
        });

        it('a customer whose session ended is handed to the sign in prompt and no more reads are made', async () => {
            store.isGuest.set(false);
            store.quoteId.set('465');
            cart.getCustomerCartState.mockRejectedValue(new MagentoApiError(401, '401', 'Not authorized'));

            expect(await recoverFromOrderFailure(lost('timeout'), deps)).toBe('unknown');

            expect(cart.getCustomerCartState).toHaveBeenCalledTimes(1);
            expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
            expect(store.orderOutcome.get()).toBe('unknown');
            await vi.advanceTimersByTimeAsync(20 * RECHECK_DELAY_MS);
            window.dispatchEvent(new Event('online'));
            await vi.advanceTimersByTimeAsync(0);
            expect(cart.getCustomerCartState).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleQuoteGone', () => {
        it('reads the quote once; ordered elsewhere in this session leaves for the success page', async () => {
            store.isPlacingOrder.set(false);
            store.orderOutcome.set('none');
            cart.getGuestCartState.mockResolvedValue({ id: 5, is_active: false });

            expect(await handleQuoteGone(deps)).toBe('placed');

            expect(deps.queue.close).toHaveBeenCalledTimes(1);
            expect(cart.getGuestCartState).toHaveBeenCalledTimes(1);
            expect(store.orderPlaced.get()).toBe(true);
            expect(discardDrafts).toHaveBeenCalledTimes(1);
            expect(deps.navigateToSuccess).toHaveBeenCalledTimes(1);
        });

        it('otherwise shows the blocking notice in the order section and reloads nothing', async () => {
            cart.getGuestCartState.mockRejectedValue(new MagentoApiError(404, '404', 'No such entity'));

            expect(await handleQuoteGone(deps)).toBe('gone');

            const status = store.sectionStatus.get().order;
            expect(status?.kind).toBe('quote-gone');
            expect(status?.message).toBe('Your cart has changed or expired.');
            expect(status?.retry).toBeUndefined();
            expect(store.quoteGone.get()).toBe(true);
            expect(deps.navigateToSuccess).not.toHaveBeenCalled();
            expect(deps.queue.close).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(60000);
            expect(cart.getGuestCartState).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleSessionExpired', () => {
        it('marks the session, closes the queue and writes the handoff draft at once, one time', () => {
            handleSessionExpired(deps);
            handleSessionExpired(deps);

            expect(store.sessionExpired.get()).toBe(true);
            expect(deps.queue.close).toHaveBeenCalledTimes(1);
            expect(copyDraftToHandoff).toHaveBeenCalledTimes(1);
        });
    });

    describe('watchConnection', () => {
        it('says the browser is offline as a status, takes the note away when it is back and runs the hook', () => {
            const onOnline = vi.fn();
            const stop = watchConnection(store, onOnline);

            window.dispatchEvent(new Event('offline'));
            const status = store.sectionStatus.get().order;
            expect(status?.kind).toBe('offline');
            expect(status?.source).toBe('background');
            expect(status?.message).toBe('You appear to be offline. Check your connection and try again.');

            window.dispatchEvent(new Event('online'));
            expect(store.sectionStatus.get().order).toBeNull();
            expect(onOnline).toHaveBeenCalledTimes(1);

            stop();
            window.dispatchEvent(new Event('offline'));
            expect(store.sectionStatus.get().order).toBeNull();
        });

        it('never replaces or removes what the order section already shows', async () => {
            cart.getGuestCartState.mockRejectedValue(unreachable());
            await recoverFromOrderFailure(lost(), deps);
            const shown = store.sectionStatus.get().order;
            const stop = watchConnection(store, vi.fn());

            window.dispatchEvent(new Event('offline'));
            expect(store.sectionStatus.get().order).toBe(shown);
            cart.getGuestCartState.mockRejectedValue(unreachable());
            window.dispatchEvent(new Event('online'));
            await vi.advanceTimersByTimeAsync(0);
            expect(store.sectionStatus.get().order?.kind).toBe('order-unknown');
            stop();
        });
    });
});
