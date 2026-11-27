// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The order pipeline: the one way an order is placed, whether the
 * checkout's Place Order button was pressed, an element that owns Place
 * Order asked for it (`hyperion-payment:request-place-order`) or an
 * element placed it with data of its own (`context.placeOrder(data)`, a
 * wallet sheet).
 *
 *   1. `prepareOrder()` of the flow actions: the cancelable
 *      `before-place-order` event, the latch, every pending edit put on the
 *      quote, the extension modules still loading awaited, the gate
 *      evaluated on what the server confirmed. Closed: the caller reveals
 *      what is missing.
 *   2. `validate()` of the payment element, then of the active shipping
 *      extension elements of the selected rate (through the view of their
 *      host, when it is loaded), then of every slot element that has one
 *      (5 s each; the elements of one kind are asked together so each
 *      shows its own errors). `false`, a throw or no answer in time stops
 *      the order before any request, like a closed extension gate.
 *   3. `getPaymentData(signal)` unless the data was handed in (120 s, every
 *      `busy` report of the element restarts the limit). It runs on the
 *      settled quote, so a tokenization or a 3-D Secure challenge sees the
 *      final totals. A method that leaves the offer meanwhile aborts it.
 *   4. The element's own `placeOrder()` when it has one (the order is
 *      created elsewhere, or a gateway page comes first), else the order
 *      request of the flow actions with the data.
 *   5. No order: `orderFailed()` of the element (once per attempt, also
 *      when the quote says so later), the latch is given back.
 *   6. The order exists: the latch stays closed, `afterPlaceOrder()` of the
 *      element (10 s) says where to continue, `navigateAfterOrder()` goes
 *      there; a failure or a timeout of that call continues on the success
 *      page, because the order exists.
 *
 * `paymentPipelineFor()` is what the context of one element gets
 * (`PaymentPipeline` of `extension/context.ts`).
 */
import type {
    AfterOrderOutcome,
    CheckoutError,
    CheckoutSlotElement,
    PaymentData,
    PaymentElement,
    PlaceOrderOutcome,
} from '../../../extension-api.js';
import { getCheckoutConfig } from '../../bootstrap-config.js';
import { CALL_TIMEOUTS, callExtension, callExtensionSync } from '../../extension/call.js';
import type { PaymentPipeline } from '../../extension/context.js';
import { plainMessage, publicError } from '../../extension/public-error.js';
import { activeSlotElements } from '../../extension/slot-render.js';
import { watchValue } from '../../extension/watch.js';
import { flowActions, type PrepareOrderBlockReason } from '../../store/flow-actions.js';
import { getStore } from '../../store/index.js';
import { placeOrderBlockerMessage } from '../../store/place-order-hint.js';
import { failureMessage } from '../../store/section-status.js';
import { requestValidation } from '../../store/validation-request.js';
import { navigateAfterOrder, resolveAllowedUrl } from '../../utils/after-order.js';
import { t } from '../../utils/i18n.js';
import { navigateTo } from '../../utils/navigate.js';
import { shippingExtensionView } from '../shipping-extension-view.js';
import { heartbeatOf, hostedElement, type HostedElement } from './element-registry.js';
import { matchEntry, type PaymentEntry } from './entries.js';
import { loadEntry } from './mount.js';
import { selectedRowKey } from './payment-rows.js';
import { entryState, rowState } from './row-state.js';

export type PipelineResult =
    | { readonly status: 'blocked'; readonly reason: PrepareOrderBlockReason }
    | { readonly status: 'done'; readonly outcome: PlaceOrderOutcome };

/** The attempt whose element hears `orderFailed()`; each attempt tells it once. */
let attempt: { id: number; element: PaymentElement | null; told: boolean } = { id: 0, element: null, told: true };

function tellOrderFailed(error: CheckoutError): void {
    if (attempt.told) return;
    attempt.told = true;
    const element = attempt.element;
    if (element?.orderFailed === undefined) return;
    callExtensionSync('orderFailed', () => element.orderFailed?.(error), undefined);
}

/** The flow actions learned that no order exists for the attempt (also after a lost answer). */
export function notifyOrderNotPlaced(): void {
    const message = getStore().globalError.get() ?? t('Hyperion_Checkout::unexpected_error');
    tellOrderFailed(publicError('server', message));
}

/**
 * Plain `PaymentData` from what an element answered: the four documented
 * members with their types, nothing else. Throws for anything that is not
 * an object.
 */
export function cleanPaymentData(value: unknown): PaymentData {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw publicError('validation', t('Hyperion_Checkout::unexpected_error'));
    }
    const raw = value as Record<string, unknown>;
    const plain = (member: unknown): Record<string, unknown> | undefined =>
        member && typeof member === 'object' && !Array.isArray(member) ? { ...(member as Record<string, unknown>) } : undefined;
    const additional = plain(raw['additional_data']);
    const extension = plain(raw['extension_attributes']);
    return {
        ...(typeof raw['method'] === 'string' && raw['method'] !== '' ? { method: raw['method'] } : {}),
        ...(raw['po_number'] !== undefined && raw['po_number'] !== null ? { po_number: String(raw['po_number']) } : {}),
        ...(additional ? { additional_data: additional } : {}),
        ...(extension ? { extension_attributes: extension } : {}),
    };
}

/** The message of what keeps the order back, for a caller that is not the Place Order button. */
function blockedMessage(reason: PrepareOrderBlockReason): string {
    const store = getStore();
    if (reason === 'busy') return t('Hyperion_Checkout::placing_order');
    if (reason === 'outcome-unknown') return failureMessage('order') ?? t('Hyperion_Checkout::order_outcome_unknown');
    if (reason === 'write-failed') {
        return failureMessage() ?? store.globalError.get() ?? t('Hyperion_Checkout::unexpected_error');
    }
    return placeOrderBlockerMessage(store, reason);
}

/**
 * Show what keeps the order back the way a wallet button did: the forms
 * reveal their errors, and the message goes to the banner unless a failed
 * save already shows it in its own section.
 */
function revealBlocked(reason: PrepareOrderBlockReason): string {
    const message = blockedMessage(reason);
    if (reason !== 'busy' && reason !== 'write-failed' && reason !== 'outcome-unknown') requestValidation();
    getStore().globalError.set(failureMessage() === message ? null : message);
    return message;
}

/** `validate()` of every slot element that has one; false, a throw or a timeout is invalid. */
async function slotsValid(): Promise<boolean> {
    const answers = await Promise.all(activeSlotElements().map(async (el) => {
        const validate = (el as Partial<CheckoutSlotElement>).validate;
        if (typeof validate !== 'function') return true;
        try {
            return (await callExtension('validate', () => validate.call(el), CALL_TIMEOUTS.validate)) !== false;
        } catch {
            return false;
        }
    }));
    return answers.every(Boolean);
}

/**
 * `validate()` of the active shipping extension elements, then of the slot
 * elements: what an order attempt asks after the payment element, and what
 * `requestCheckoutValidation()` asks so that its answer is the one the
 * attempt will find. The shipping host not loaded yet: no element to ask (a
 * required entry holds the gate until then).
 */
async function extensionElementsValid(): Promise<boolean> {
    const shipping = shippingExtensionView.get();
    if (shipping !== null && !(await shipping.validate().catch(() => false))) return false;
    return slotsValid();
}

/** The payment element shows what it misses (`validate()`): the step the gate found incomplete is its own. */
async function revealElement(rowKey: string | null): Promise<void> {
    const key = rowKey ?? selectedRowKey(getStore().selectedPaymentMethod.get());
    const element = key === null ? null : hostedElement(key)?.element ?? null;
    if (!element?.validate) return;
    try {
        await callExtension('validate', () => element.validate?.(), CALL_TIMEOUTS.validate);
    } catch {
        // The element's own errors are on screen or it failed: the hint names what is missing.
    }
}

/**
 * The element of the row. When the module of its entry is still on its
 * way (a selection made a moment ago), it is awaited and the row gets one
 * frame to create the element.
 */
async function elementOf(rowKey: string | null, code: string): Promise<HostedElement | null> {
    if (rowKey === null) return null;
    const hosted = hostedElement(rowKey);
    if (hosted !== null) return hosted;
    const entry = matchEntry(code);
    if (entry === null) return null;
    const load = entryState(entry.id).load;
    // Bounded: the loader gives up on a module after its time limits.
    if (load === 'idle' || load === 'loading') await loadEntry(entry);
    for (let frame = 0; frame < ELEMENT_FRAMES && hostedElement(rowKey) === null; frame += 1) {
        await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return hostedElement(rowKey);
}

/** How many frames the row gets to create the element of a module that just arrived. */
const ELEMENT_FRAMES = 10;

function successUrl(): string {
    return getCheckoutConfig().defaultSuccessPageUrl ?? '';
}

/** The order exists: where to continue. */
async function afterPlaced(hosted: HostedElement | null, orderId: number | null): Promise<PlaceOrderOutcome> {
    const element = hosted?.element ?? null;
    const entry = hosted?.entry ?? null;
    let outcome: AfterOrderOutcome | void = undefined;
    if (element?.afterPlaceOrder && orderId !== null) {
        try {
            outcome = await callExtension(
                'afterPlaceOrder',
                () => element.afterPlaceOrder?.({ orderId, successUrl: successUrl() }),
                CALL_TIMEOUTS.afterPlaceOrder,
                { heartbeat: heartbeatOf(hosted?.rowKey ?? '') }
            );
        } catch {
            outcome = undefined;
        }
    }
    navigateAfterOrder(outcome, entry, successUrl());
    return orderId === null ? { status: 'placed' } : { status: 'placed', orderId };
}

function failed(message: string | null): PlaceOrderOutcome {
    return message === null ? { status: 'failed' } : { status: 'failed', message };
}

/**
 * The element's own `placeOrder()` did not answer in time: its request may
 * still create the order, so the quote decides, as for a lost answer of the
 * checkout's own order request. Placed: the success page. Not placed: the
 * latch is given back. Not known yet: the latch holds ("Check again").
 */
async function lostElementOrder(hosted: HostedElement): Promise<PlaceOrderOutcome> {
    const store = getStore();
    const verdict = await flowActions().resolveLostOrder('unavailable');
    if (verdict !== null) {
        flowActions().confirmOrderPlaced();
        return afterPlaced(hosted, typeof verdict === 'number' ? verdict : null);
    }
    if (store.orderOutcome.get() === 'none') {
        tellOrderFailed(publicError('timeout', store.globalError.get() ?? t('Hyperion_Checkout::unexpected_error')));
    }
    return failed(store.globalError.get());
}

/** What the element's own `placeOrder()` answered, carried out. */
async function settleElementOutcome(
    hosted: HostedElement,
    answer: unknown
): Promise<PlaceOrderOutcome> {
    const store = getStore();
    const flow = flowActions();
    const status = answer && typeof answer === 'object' ? (answer as { status?: unknown }).status : undefined;
    if (status === 'redirect') {
        const target = resolveAllowedUrl((answer as { url?: unknown }).url, hosted.entry.redirectHosts ?? []);
        if (target !== null) {
            // The latch holds while the browser leaves.
            navigateTo(target);
            return { status: 'redirect', url: target };
        }
        flow.cancelOrder();
        store.globalError.set(t('Hyperion_Checkout::unexpected_error'));
        tellOrderFailed(publicError('validation', t('Hyperion_Checkout::unexpected_error')));
        return failed(t('Hyperion_Checkout::unexpected_error'));
    }
    if (status === 'placed') {
        flow.confirmOrderPlaced();
        const id = (answer as { orderId?: unknown }).orderId;
        return afterPlaced(hosted, typeof id === 'number' && Number.isInteger(id) ? id : null);
    }
    if (status === 'canceled') {
        flow.cancelOrder();
        return { status: 'canceled' };
    }
    const message = plainMessage((answer as { message?: unknown } | null)?.message);
    flow.cancelOrder();
    if (message !== null) store.globalError.set(message);
    tellOrderFailed(publicError('validation', message ?? store.globalError.get() ?? t('Hyperion_Checkout::unexpected_error')));
    return failed(message);
}

/**
 * Place the order of the selected row. `data` given: the element already
 * collected it (no `getPaymentData()`).
 */
export async function runOrder(rowKey: string | null, data: PaymentData | null): Promise<PipelineResult> {
    const store = getStore();
    const flow = flowActions();
    if (store.orderOutcome.get() !== 'none') return { status: 'blocked', reason: 'busy' };
    // What an element handed in is checked before the latch is taken.
    let handed: PaymentData | null = null;
    if (data !== null) {
        try {
            handed = cleanPaymentData(data);
        } catch (err) {
            const message = (err as Error).message || t('Hyperion_Checkout::unexpected_error');
            return { status: 'done', outcome: failed(message) };
        }
    }
    const prepared = await flow.prepareOrder();
    if (prepared.status === 'blocked') {
        if (prepared.reason === 'payment-not-ready') await revealElement(rowKey);
        return prepared;
    }

    try {
        return await runPrepared(rowKey, handed);
    } catch (err) {
        // Whatever threw between the latch and the order request: the latch
        // is given back (a no-op once the order request was sent).
        console.error('[hyperion-checkout] the order pipeline failed', err);
        flow.cancelOrder();
        const message = t('Hyperion_Checkout::unexpected_error');
        store.globalError.set(message);
        return { status: 'done', outcome: failed(message) };
    }
}

/** The steps after `prepareOrder()` answered ready: the latch is held. */
async function runPrepared(rowKey: string | null, handed: PaymentData | null): Promise<PipelineResult> {
    const store = getStore();
    const flow = flowActions();
    const code = store.selectedPaymentMethod.get();
    if (code === null) {
        flow.cancelOrder();
        return { status: 'done', outcome: { status: 'canceled' } };
    }
    const key = rowKey ?? selectedRowKey(code);
    const hosted = await elementOf(key, code);
    const element = hosted?.element ?? null;
    attempt = { id: attempt.id + 1, element, told: false };
    // A method a renderer serves is never ordered without its element:
    // no validation, no payment data, no order of its own.
    if (hosted === null && matchEntry(code) !== null) {
        console.error(`[hyperion-checkout] the payment element of "${code}" is not there; the order was not sent`);
        flow.cancelOrder();
        const message = t('Hyperion_Checkout::unexpected_error');
        store.globalError.set(message);
        return { status: 'done', outcome: failed(message) };
    }

    // A method that leaves the offer, or another selection, ends the attempt.
    const controller = new AbortController();
    const gone = (): boolean => store.selectedPaymentMethod.get() !== code
        || !store.availablePaymentMethods.get().some((method) => method.code === code);
    const stopWatch = watchValue(gone, (isGone) => {
        if (isGone) controller.abort();
    });
    if (gone()) controller.abort();
    const heartbeat = heartbeatOf(key ?? '');

    try {
        if (element?.validate) {
            let valid = false;
            try {
                valid = (await callExtension('validate', () => element.validate?.(), CALL_TIMEOUTS.validate, {
                    signal: controller.signal,
                })) !== false;
            } catch {
                valid = false;
            }
            if (!valid) {
                flow.cancelOrder();
                return { status: 'blocked', reason: 'payment-not-ready' };
            }
        }
        if (!(await extensionElementsValid())) {
            flow.cancelOrder();
            return { status: 'blocked', reason: 'extension' };
        }

        let payment: PaymentData | null = handed;
        if (payment === null && element?.getPaymentData) {
            store.globalError.set(null);
            try {
                payment = cleanPaymentData(await callExtension(
                    'getPaymentData',
                    (signal) => element.getPaymentData?.(signal),
                    CALL_TIMEOUTS.paymentData,
                    { heartbeat, signal: controller.signal }
                ));
            } catch (err) {
                flow.cancelOrder();
                const message = controller.signal.aborted
                    ? t('Hyperion_Checkout::payment_method_gone')
                    : (err as Error).message || t('Hyperion_Checkout::unexpected_error');
                store.globalError.set(message);
                return { status: 'done', outcome: failed(message) };
            }
        }
        if (controller.signal.aborted) {
            flow.cancelOrder();
            const message = t('Hyperion_Checkout::payment_method_gone');
            store.globalError.set(message);
            return { status: 'done', outcome: failed(message) };
        }

        if (hosted !== null && element?.placeOrder) {
            let answer: unknown;
            try {
                answer = await callExtension(
                    'placeOrder',
                    (signal) => element.placeOrder?.({ signal, data: payment ?? {} }),
                    CALL_TIMEOUTS.paymentData,
                    { heartbeat }
                );
            } catch (err) {
                if ((err as CheckoutError).kind === 'timeout') return { status: 'done', outcome: await lostElementOrder(hosted) };
                flow.cancelOrder();
                const message = (err as Error).message || t('Hyperion_Checkout::unexpected_error');
                store.globalError.set(message);
                tellOrderFailed(err as CheckoutError);
                return { status: 'done', outcome: failed(message) };
            }
            return { status: 'done', outcome: await settleElementOutcome(hosted, answer) };
        }

        const orderId = await flow.submitOrder(payment);
        if (orderId === null) {
            if (store.orderOutcome.get() === 'none') {
                tellOrderFailed(publicError('server', store.globalError.get() ?? t('Hyperion_Checkout::unexpected_error')));
            }
            return { status: 'done', outcome: failed(store.globalError.get()) };
        }
        return { status: 'done', outcome: await afterPlaced(hosted, typeof orderId === 'number' ? orderId : null) };
    } finally {
        stopWatch();
    }
}

/** The pipeline of the Place Order button: the selected row. */
export function placeOrderFromButton(): Promise<PipelineResult> {
    return runOrder(null, null);
}

/** The pipeline for a row's element, from its own request. */
export async function placeOrderForRow(rowKey: string, data: PaymentData | null): Promise<PlaceOrderOutcome> {
    const code = getStore().selectedPaymentMethod.get();
    if (code === null || selectedRowKey(code) !== rowKey) {
        return failed(t('Hyperion_Checkout::checkout_incomplete_payment_method'));
    }
    const result = await runOrder(rowKey, data);
    if (result.status === 'done') return result.outcome;
    if (result.reason === 'payment-not-ready') {
        const message = rowState(rowKey).message ?? t('Hyperion_Checkout::checkout_incomplete_payment_method');
        return failed(message);
    }
    return failed(revealBlocked(result.reason));
}

/**
 * Reveal what is missing exactly like the Place Order button and answer
 * whether the order could go ahead: every pending edit is put on the quote
 * first, the gate and the shipping extension and slot elements are asked
 * as the order attempt asks them (a block is revealed once: the shipping
 * host skips the validation request of that reveal), the latch is given
 * back right after, and no `before-place-order` event is dispatched (the
 * order itself dispatches it).
 */
export async function requestCheckoutValidation(): Promise<boolean> {
    const flow = flowActions();
    const result = await flow.prepareOrder({ skipPaymentReady: true, announce: false });
    if (result.status === 'ready') {
        // Asked while the latch is held, as in the order attempt.
        const valid = await extensionElementsValid().catch(() => false);
        flow.cancelOrder();
        if (valid) return true;
        revealBlocked('extension');
        return false;
    }
    revealBlocked(result.reason);
    return false;
}

/** The `PaymentPipeline` of one element's context. */
export function paymentPipelineFor(rowKey: string, _entry: PaymentEntry): PaymentPipeline {
    return {
        requestCheckoutValidation,
        placeOrder: (data: PaymentData) => placeOrderForRow(rowKey, data ?? {}),
        savePaymentInformation: async (data: PaymentData) => {
            try {
                return await flowActions().savePaymentInformation(cleanPaymentData(data));
            } catch (err) {
                console.error('[hyperion-checkout] a payment element handed data that is not an object', err);
                return false;
            }
        },
        refreshTotals: () => flowActions().refreshPaymentInformation(),
        setError: (message: string | null) => {
            getStore().globalError.set(message === null ? null : plainMessage(message));
        },
    };
}

export function resetPipelineForTests(): void {
    attempt = { id: 0, element: null, told: true };
}
