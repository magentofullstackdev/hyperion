// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Recovery after an order request whose outcome is not known, after a quote
 * that is no longer there and after a session that ended.
 *
 * The quote itself tells whether an order exists: a guest cart that still
 * answers with `is_active` false was ordered, a customer's cart that is
 * gone or has another id was ordered, the same active quote was not.
 * `probeOrderOutcome()` reads it; `recoverFromOrderFailure()` acts on the
 * verdict (continue to the success page, release the latch with every
 * input kept, or keep asking while the answer cannot be had). No function
 * of this module ever sends an order request.
 */
import type { CheckoutError } from '../api/error-kinds.js';
import { getCustomerCartState, getGuestCartState } from '../api/cart.js';
import { MagentoApiError } from '../api/errors.js';
import { t } from '../utils/i18n.js';
import { copyDraftToHandoff, discardDrafts } from './drafts.js';
import type { Store } from './index.js';
import { clearFailure, reportFailure } from './section-status.js';
import type { WriteQueue } from './write-queue.js';

/** How long to wait between two reads of a quote the server may still be working on. */
export const PROBE_REPEAT_DELAY_MS = 3000;
/** How many reads a still-active quote gets before it counts as "no order". */
export const PROBE_REPEAT_LIMIT = 5;
/** How long to wait before asking again for a quote that could not be read. */
export const RECHECK_DELAY_MS = 5000;
/** How many of those timed reads are made before only the shopper or the connection starts one. */
export const RECHECK_LIMIT = 12;

/**
 * `placed`: the order exists. `not-placed`: the quote is still active.
 * `gone`: the cart no longer exists, so nothing can be told from it.
 * `unknown`: the quote could not be read.
 */
export type OrderProbeVerdict = 'placed' | 'not-placed' | 'gone' | 'unknown';

export interface OrderProbeResult {
    verdict: OrderProbeVerdict;
    /** The order number the quote reserved, when a guest cart answers with one. */
    reservedOrderId?: string;
    /** The read was refused because the customer session ended (the verdict is `unknown`). */
    sessionExpired?: boolean;
}

function verdictOfActiveFlag(isActive: unknown): OrderProbeVerdict {
    if (isActive === true) return 'not-placed';
    if (isActive === false) return 'placed';
    return 'unknown';
}

/**
 * One read of the quote of this checkout (identity taken from `store`),
 * never retried by the client. An ordered guest quote answers 200 with
 * `is_active` false, and 404 only once the cart itself is gone; a
 * customer's `carts/mine` answers 404 after the order, or another quote
 * when a new cart was started since. Anything else (no answer, a server
 * error, a session that ended) decides nothing.
 */
export async function probeOrderOutcome(store: Store): Promise<OrderProbeResult> {
    const guest = store.isGuest.get();
    try {
        if (guest) {
            const maskedId = store.maskedQuoteId.get();
            if (!maskedId) return { verdict: 'unknown' };
            const cart = await getGuestCartState(maskedId);
            const verdict = verdictOfActiveFlag(cart?.is_active);
            const reserved = cart?.reserved_order_id;
            return verdict === 'placed' && typeof reserved === 'string' && reserved !== ''
                ? { verdict, reservedOrderId: reserved }
                : { verdict };
        }
        const quoteId = Number(store.quoteId.get());
        if (!Number.isInteger(quoteId) || quoteId <= 0) return { verdict: 'unknown' };
        const cart = await getCustomerCartState();
        if (cart === null || typeof cart !== 'object' || cart.id === undefined) return { verdict: 'unknown' };
        if (Number(cart.id) !== quoteId) return { verdict: 'placed' };
        return { verdict: verdictOfActiveFlag(cart.is_active) };
    } catch (err) {
        if (err instanceof MagentoApiError && err.httpStatus === 404) {
            return { verdict: guest ? 'gone' : 'placed' };
        }
        if (!guest && err instanceof MagentoApiError && err.httpStatus === 401) {
            return { verdict: 'unknown', sessionExpired: true };
        }
        return { verdict: 'unknown' };
    }
}

export interface OrderRecoveryDeps {
    store: Store;
    /** Reopened only on the `not-placed` verdict. */
    queue: Pick<WriteQueue, 'close' | 'reopen'>;
    /**
     * Leaves for the success page. Called only for a verdict that arrives
     * after `recoverFromOrderFailure()` resolved (a later read): the
     * caller acts on the verdict the function resolves with.
     */
    navigateToSuccess: () => void;
    /** A later read found the quote still active, after the latch was released. */
    onNotPlaced?: () => void;
    /** A read was refused because the customer session ended. */
    onSessionExpired?: () => void;
}

/** Ends the later reads of the recovery that is waiting, if one is. */
let stopWaitingRecovery: (() => void) | null = null;

/**
 * Stop the timed reads and the connection watch of a recovery that could
 * not read the quote. The order stays latched as it is.
 */
export function stopOrderRecovery(): void {
    stopWaitingRecovery?.();
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** The order exists (or its cart is gone): terminal, the page is about to be left. */
function markPlaced(store: Store, result: OrderProbeResult): void {
    store.orderNumber.set(result.reservedOrderId ?? null);
    store.orderOutcome.set('placed');
    store.orderPlaced.set(true);
    store.isPlacingOrder.set(true);
    store.orderStep.set('idle');
    clearFailure('order');
    discardDrafts();
}

/**
 * Resolve an order request that failed without a usable answer (no answer
 * at all, or core's "the cart is locked", which means an earlier request
 * for this quote is still running).
 *
 * Reads the quote; after a timeout, a gateway error or a locked cart the
 * server may still be at work, so a quote that is still active is read again, up to five
 * times three seconds apart, before it counts as "no order". Resolves with
 * the verdict it reached:
 *   - `placed`, `gone`: the store is in its terminal state, the caller
 *     leaves for the success page (the server sends a session without an
 *     order on to the cart).
 *   - `not-placed`: the latch is released, the queue reopened, the `order`
 *     section says so; nothing the shopper entered was touched.
 *   - `unknown`: Place Order stays latched and the queue closed; the
 *     `order` section offers "Check again", and the quote is read again
 *     every five seconds (twelve times) and when the connection comes
 *     back. Those later reads end in the same three ways, with
 *     `navigateToSuccess` / `onNotPlaced` called from here.
 */
export async function recoverFromOrderFailure(
    error: CheckoutError,
    deps: OrderRecoveryDeps
): Promise<OrderProbeVerdict> {
    const { store, queue } = deps;
    let later = false;
    let finished = false;
    let reading = false;
    let rechecks = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stopWaiting = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        window.removeEventListener('online', onOnline);
        if (stopWaitingRecovery === abandon) stopWaitingRecovery = null;
    };
    const abandon = (): void => {
        finished = true;
        stopWaiting();
    };

    const recheck = async (shown: boolean): Promise<void> => {
        if (finished) return;
        // The shopper asked: the page shows that the answer is being fetched.
        if (shown) store.orderStep.set('confirming');
        if (reading) return;
        reading = true;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        let result: OrderProbeResult;
        try {
            result = await probeOrderOutcome(store);
        } finally {
            reading = false;
        }
        settle(result);
    };
    const checkAgain = (): void => { void recheck(true); };
    function onOnline(): void { void recheck(false); }

    function settle(result: OrderProbeResult): OrderProbeVerdict {
        if (result.verdict === 'placed' || result.verdict === 'gone') {
            finished = true;
            stopWaiting();
            markPlaced(store, result);
            if (later) deps.navigateToSuccess();
            return result.verdict;
        }
        store.orderStep.set('idle');
        store.isPlacingOrder.set(false);
        if (result.verdict === 'not-placed') {
            finished = true;
            stopWaiting();
            queue.reopen();
            store.orderOutcome.set('none');
            reportFailure(
                'order',
                { kind: 'order-unknown', message: t('Hyperion_Checkout::order_not_placed_network') },
                { source: 'action' }
            );
            if (later) deps.onNotPlaced?.();
            return 'not-placed';
        }
        if (result.sessionExpired) {
            // Signing in again is the only way to read the quote.
            finished = true;
            stopWaiting();
            deps.onSessionExpired?.();
            return 'unknown';
        }
        stopWaitingRecovery = abandon;
        window.addEventListener('online', onOnline);
        if (rechecks < RECHECK_LIMIT) {
            timer = setTimeout(() => {
                timer = null;
                rechecks += 1;
                void recheck(false);
            }, RECHECK_DELAY_MS);
        }
        const shown = store.sectionStatus.get().order;
        if (shown === null || shown.retry !== checkAgain) {
            reportFailure(
                'order',
                { kind: 'order-unknown', message: t('Hyperion_Checkout::order_outcome_unknown') },
                { source: 'action', retry: checkAgain }
            );
        }
        return 'unknown';
    }

    stopOrderRecovery();
    store.orderOutcome.set('unknown');
    store.orderStep.set('confirming');
    queue.close();
    // No answer in time, a gateway error in front of a server that may
    // still be at work, or a cart an earlier request holds locked.
    const serverMayBeWorking = error.kind === 'cart-locked'
        || error.underlyingKind === 'timeout'
        || error.underlyingKind === 'unavailable';
    if (error.kind === 'cart-locked') await wait(PROBE_REPEAT_DELAY_MS);
    let result = await probeOrderOutcome(store);
    for (let read = 1; serverMayBeWorking && read < PROBE_REPEAT_LIMIT; read += 1) {
        if (result.verdict === 'placed' || result.verdict === 'gone' || result.sessionExpired) break;
        await wait(PROBE_REPEAT_DELAY_MS);
        result = await probeOrderOutcome(store);
    }
    const verdict = settle(result);
    later = true;
    return verdict;
}

export interface QuoteGoneDeps {
    store: Store;
    queue: Pick<WriteQueue, 'close'>;
    navigateToSuccess: () => void;
}

/**
 * A request other than the order was answered "this cart does not exist".
 * The queue is closed and the quote read once: ordered (in another tab of
 * this session) leaves for the success page, anything else puts a blocking
 * notice with the way back to the cart in the `order` section. Nothing is
 * reloaded automatically.
 */
export async function handleQuoteGone(deps: QuoteGoneDeps): Promise<OrderProbeVerdict> {
    const { store, queue } = deps;
    store.quoteGone.set(true);
    queue.close();
    const result = await probeOrderOutcome(store);
    if (result.verdict === 'placed') {
        markPlaced(store, result);
        deps.navigateToSuccess();
        return 'placed';
    }
    store.orderStep.set('idle');
    reportFailure(
        'order',
        { kind: 'quote-gone', message: t('Hyperion_Checkout::error_quote_gone') },
        { source: 'action' }
    );
    return result.verdict;
}

/**
 * The customer session ended: nothing more can reach the quote, so the
 * queue is closed, and what the shopper entered goes to the handoff draft
 * at once, where the checkout finds it after the sign in.
 */
export function handleSessionExpired(deps: { store: Store; queue: Pick<WriteQueue, 'close'> }): void {
    if (deps.store.sessionExpired.get()) return;
    deps.store.sessionExpired.set(true);
    deps.queue.close();
    copyDraftToHandoff();
}

/**
 * Follow the browser's connection: while it is offline the `order` section
 * says so (as a status, unless it already shows something of its own);
 * when it is back the note goes away and `onOnline` runs. Returns the
 * function that stops listening.
 */
export function watchConnection(store: Store, onOnline: () => void): () => void {
    const offline = (): void => {
        if (store.sectionStatus.get().order !== null) return;
        reportFailure(
            'order',
            { kind: 'offline', message: t('Hyperion_Checkout::error_offline') },
            { source: 'background' }
        );
    };
    const online = (): void => {
        if (store.sectionStatus.get().order?.kind === 'offline') clearFailure('order');
        onOnline();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return (): void => {
        window.removeEventListener('offline', offline);
        window.removeEventListener('online', online);
    };
}
