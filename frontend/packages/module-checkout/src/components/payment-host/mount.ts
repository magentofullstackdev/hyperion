// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The payment host, the part loaded on demand (`host.ts` decides when):
 * loads the module of a renderer entry, creates one element per row,
 * hands it its properties, listens to its events and runs the order
 * pipeline (`pipeline.ts`) for it.
 *
 * Creating an element: `context` (one `PaymentContext` per element, its
 * order and payment calls bound to the row), `options` (the entry's
 * options), `method`, `config` (`checkoutConfig.payment[code]`, frozen) and
 * `token` (stored token rows) are assigned inside a try block BEFORE the
 * element is connected; a throw leaves the row with an inline error and a
 * Retry. The bundle's own renderers (`builtin` entries and the generic
 * types) also get `context.firstParty` (`payment-renderers/first-party.ts`).
 *
 * Events, accepted only when `event.target` is the element the host
 * created, details treated as untrusted:
 *   - `hyperion-payment:ready`: the element may be shown (an entry that
 *     awaits it shows a placeholder until then, 15 s at most);
 *   - `hyperion-payment:valid` / `:invalid`: the element's own step is
 *     complete or not (Place Order follows it);
 *   - `hyperion-payment:busy`: the element works; every `busy: true`
 *     restarts the time limit of the call it is in;
 *   - `hyperion-payment:error`: a message in the payment section; `fatal`
 *     retires the row for the page lifetime;
 *   - `hyperion-payment:request-place-order`: an element that owns Place
 *     Order asks for the order.
 * `ownsPlaceOrder` of the element is read after connection and after each
 * of its events; until it says, the entry's flag counts.
 */
import type {
    CheckoutSnapshot,
    PaymentElement,
    PaymentElementClass,
    PaymentMethodInfo,
    VaultTokenInfo,
} from '../../../extension-api.js';
import { getCheckoutConfig } from '../../bootstrap-config.js';
import { CALL_TIMEOUTS, callExtension, callExtensionSync } from '../../extension/call.js';
import { checkoutSnapshots, createPaymentContext } from '../../extension/context.js';
import { loadExtensionElement, registerBuiltinModule, type ExtensionElementDescriptor } from '../../extension/loader.js';
import { plainMessage } from '../../extension/public-error.js';
import { discardDrafts } from '../../store/drafts.js';
import { billingFollowsShipping, effectiveShippingAddress } from '../../extension/address-override.js';
import { flowActions } from '../../store/flow-actions.js';
import { getStore } from '../../store/index.js';
import { failureMessage } from '../../store/section-status.js';
import type { RecaptchaAction } from '../../types/captcha.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { FirstPartyPaymentContext, FirstPartyServices } from '../payment-renderers/first-party.js';
import { forgetHosted, hostedElement, registerHosted } from './element-registry.js';
import { matchEntry, type PaymentEntry } from './entries.js';
import { builtinId, elementTagOf } from './tags.js';
import { selectedRowKey } from './payment-rows.js';
import { paymentPipelineFor, placeOrderForRow } from './pipeline.js';
import { EMPTY_ROW, entryState, patchEntry, patchRow, rowState } from './row-state.js';
import '../payment-renderers/payment-offline.js';

export { notifyOrderNotPlaced, placeOrderForRow, placeOrderFromButton } from './pipeline.js';
export {
    invalidFieldsOf,
    renderErrorSummary,
    renderOrderPlaced,
    renderRowBody,
    renderUnsupportedRow,
    reportHidden,
    showsUnsupportedPayments,
    tokenTitle,
    unsupportedRows,
} from './row-view.js';

/** How long an entry that awaits `ready` may take before the row offers a Retry. */
export const READY_TIMEOUT_MS = 15000;

const EVENTS = [
    'hyperion-payment:ready',
    'hyperion-payment:valid',
    'hyperion-payment:invalid',
    'hyperion-payment:busy',
    'hyperion-payment:error',
    'hyperion-payment:request-place-order',
] as const;

/** The bundle's own element classes: what `canMakePayment()` and the internal hooks look like. */
interface HostedElementClass extends Partial<PaymentElementClass> {
    /** First-party classes only: the reCAPTCHA form of an order paid with the method. */
    hyperionRecaptchaAction?(config: CheckoutConfig): RecaptchaAction | null;
}

/* ------------------------------------------------------------------ first-party modules */

registerBuiltinModule('offline', () => import('../payment-renderers/payment-offline.js'));
registerBuiltinModule('generic:form', () => import('../payment-renderers/payment-form.js'));
registerBuiltinModule('generic:redirect', () => import('../payment-renderers/payment-redirect.js'));
registerBuiltinModule('generic:redirect-before-order', () => import('../payment-renderers/payment-redirect-first.js'));
registerBuiltinModule('braintree-card', () => import('../payment-renderers/braintree/payment-braintree-card.js'));
registerBuiltinModule('braintree-paypal', () => import('../payment-renderers/braintree/payment-braintree-paypal.js'));
registerBuiltinModule('braintree-googlepay', () => import('../payment-renderers/braintree/payment-braintree-googlepay.js'));
registerBuiltinModule('braintree-vault', () => import('../payment-renderers/braintree/payment-braintree-vault.js'));
registerBuiltinModule('paypal-express', () => import('../payment-renderers/paypal/payment-paypal-express.js'));

/** Whether the entry is served by the bundle itself. */
function isInternal(entry: PaymentEntry): boolean {
    return entry.type !== 'element' || (typeof entry.builtin === 'string' && entry.builtin !== '');
}

function descriptorOf(entry: PaymentEntry): ExtensionElementDescriptor | null {
    const tag = elementTagOf(entry);
    if (tag === null) return null;
    if (entry.type !== 'element') return { id: entry.id, tag, moduleUrl: null, builtin: `generic:${entry.type}`, internal: true };
    if (entry.builtin) return { id: entry.id, tag, moduleUrl: null, builtin: builtinId(entry.builtin), internal: true };
    return { id: entry.id, tag, moduleUrl: entry.moduleUrl, builtin: null, internal: false };
}

/** What the bundle's own entries find in `options` on top of the entry's. */
function builtinOptions(entry: PaymentEntry): Record<string, unknown> {
    if (entry.builtin && builtinId(entry.builtin) === 'paypal-express') {
        return { paypalExpress: getCheckoutConfig().hyperion?.paypalExpress ?? null };
    }
    if (entry.type !== 'element') {
        return { fields: entry.fields ?? [], redirect: entry.redirect ?? null, redirectHosts: entry.redirectHosts ?? [] };
    }
    return {};
}

function optionsOf(entry: PaymentEntry): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...(entry.options ?? {}), ...builtinOptions(entry) });
}

function configOf(code: string): Readonly<Record<string, unknown>> {
    const slice = getCheckoutConfig().payment?.[code];
    return Object.freeze(slice && typeof slice === 'object' && !Array.isArray(slice) ? { ...slice } : {});
}

/* ------------------------------------------------------------------ entries */

const loads = new Map<string, Promise<void>>();

function offeredCodesOf(entry: PaymentEntry): string[] {
    return getStore().availablePaymentMethods.get()
        .map((method) => method.code)
        .filter((code) => matchEntry(code)?.id === entry.id);
}

/** Load the module of an entry once; its static answers are kept in the entry state. */
export function loadEntry(entry: PaymentEntry): Promise<void> {
    const running = loads.get(entry.id);
    if (running) return running;
    const descriptor = descriptorOf(entry);
    patchEntry(entry.id, { load: 'loading' });
    const load = (async (): Promise<void> => {
        if (descriptor === null) {
            console.error(`[hyperion-checkout] the payment renderer entry "${entry.id}" names no element it may use`);
            patchEntry(entry.id, { load: 'load-failed' });
            return;
        }
        const result = await loadExtensionElement(descriptor);
        if (result.state !== 'ready' || result.elementClass === null) {
            loads.delete(entry.id);
            patchEntry(entry.id, { load: result.state });
            dropSelectionOf(entry);
            return;
        }
        const ctor = result.elementClass as unknown as HostedElementClass;
        const describe = typeof ctor.describeToken === 'function'
            ? (token: VaultTokenInfo): string | null => callExtensionSync('describeToken', () => {
                const label = ctor.describeToken?.(token)?.label;
                return typeof label === 'string' ? plainMessage(label) : null;
            }, null)
            : null;
        const recaptcha = isInternal(entry) && typeof ctor.hyperionRecaptchaAction === 'function'
            ? (): RecaptchaAction | null => {
                const action = ctor.hyperionRecaptchaAction?.(getCheckoutConfig());
                return action === undefined ? 'place_order' : action;
            }
            : null;
        patchEntry(entry.id, { load: 'ready', describeToken: describe, recaptchaAction: recaptcha });
        for (const code of offeredCodesOf(entry)) checkUsable(entry, code);
    })();
    loads.set(entry.id, load);
    return load;
}

function dropSelectionOf(entry: PaymentEntry): void {
    const store = getStore();
    const selected = store.selectedPaymentMethod.get();
    if (selected !== null && matchEntry(selected)?.id === entry.id) store.selectedPaymentMethod.set(null);
}

/** Load an entry whose module failed again (the loader marks the retry in the URL). */
export function retryEntry(entry: PaymentEntry): Promise<void> {
    loads.delete(entry.id);
    patchEntry(entry.id, { load: 'idle' });
    return loadEntry(entry);
}

const usableAsked = new Set<string>();

/** Ask `canMakePayment()` of an eager entry's class for one method (3 s, a failure hides the row). */
export function checkUsable(entry: PaymentEntry, code: string): void {
    if (!entry.eager || entryState(entry.id).load !== 'ready') return;
    const key = `${entry.id}\u0000${code}`;
    if (usableAsked.has(key)) return;
    usableAsked.add(key);
    const tag = elementTagOf(entry);
    const ctor = (tag === null ? undefined : customElements.get(tag)) as unknown as HostedElementClass | undefined;
    if (typeof ctor?.canMakePayment !== 'function') return;
    const method = getStore().availablePaymentMethods.get().find((candidate) => candidate.code === code);
    const args = {
        method: Object.freeze({ code, title: method?.title ?? code }) as PaymentMethodInfo,
        config: configOf(code),
        options: optionsOf(entry),
        snapshot: checkoutSnapshots().snapshot() as CheckoutSnapshot,
    };
    void callExtension('canMakePayment', () => ctor.canMakePayment?.(args), CALL_TIMEOUTS.canMakePayment)
        .then((answer) => answer !== false, () => false)
        .then((usable) => {
            patchEntry(entry.id, { usable: { ...entryState(entry.id).usable, [code]: usable } });
        });
}

/* ------------------------------------------------------------------ first-party services */

/** What the context of a first-party renderer gets on top of the public one. */
export function firstPartyServices(): FirstPartyServices {
    return Object.freeze({
        config: (): CheckoutConfig => getCheckoutConfig(),
        // The addresses the order requests carry: a shipping address a
        // shipping extension put in place, "same as shipping" resolved.
        quote: () => {
            const store = getStore();
            const virtual = store.isVirtual.get();
            const shipping = virtual ? null : effectiveShippingAddress(store);
            return {
                items: store.items.get(),
                totals: store.totals.get(),
                shippingAddress: shipping,
                billingAddress: billingFollowsShipping(store) && !virtual ? shipping : store.billingAddress.get(),
            };
        },
        holdQuote: async <T>(run: () => Promise<T>): Promise<T> => {
            const store = getStore();
            const queue = flowActions().queue;
            await queue.whenIdle();
            store.isPlacingOrder.set(true);
            queue.close();
            try {
                return await run();
            } finally {
                queue.reopen();
                store.isPlacingOrder.set(false);
            }
        },
        sendOrderRequest: <T>(run: () => Promise<T>): Promise<T> => {
            flowActions().queue.close();
            return run();
        },
        resolveLostOrder: async (cause: 'network' | 'unavailable'): Promise<boolean> => {
            return (await flowActions().resolveLostOrder(cause)) === 'placed-unconfirmed';
        },
        failureMessage: (): string | null => failureMessage(),
        forgetTypedInput: (): void => discardDrafts(),
    });
}

/* ------------------------------------------------------------------ elements */

export interface RowDescriptor {
    readonly rowKey: string;
    readonly entry: PaymentEntry;
    readonly method: { readonly code: string; readonly title: string };
    readonly token: (VaultTokenInfo & Record<string, unknown>) | null;
}

const readyTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * The element of a row: the one created before, or a new one when the
 * entry's module is there; null while it is not (or when creating it
 * failed: the row shows why).
 */
export function elementFor(row: RowDescriptor): HTMLElement | null {
    const existing = hostedElement(row.rowKey);
    if (existing !== null) return existing.element;
    if (rowState(row.rowKey).failure === 'create-failed') return null;
    const tag = elementTagOf(row.entry);
    if (tag === null || entryState(row.entry.id).load !== 'ready' || !customElements.get(tag)) return null;
    let element: PaymentElement;
    try {
        element = document.createElement(tag) as PaymentElement;
        const context = createPaymentContext({ phrases: row.entry.phrases }, paymentPipelineFor(row.rowKey, row.entry));
        element.context = isInternal(row.entry)
            ? Object.freeze(Object.defineProperties(Object.create(null) as FirstPartyPaymentContext, {
                ...Object.getOwnPropertyDescriptors(context),
                firstParty: { value: firstPartyServices(), enumerable: true },
            }))
            : context;
        element.options = optionsOf(row.entry);
        element.method = Object.freeze({ code: row.method.code, title: row.method.title });
        element.config = configOf(row.method.code);
        element.token = row.token === null ? null : Object.freeze({ ...row.token });
    } catch (err) {
        console.error(`[hyperion-checkout] the payment element of "${row.entry.id}" could not be set up`, err);
        patchRow(row.rowKey, { failure: 'create-failed' });
        return null;
    }
    registerHosted({ rowKey: row.rowKey, code: row.method.code, entry: row.entry, element, beats: new Set() });
    if (row.entry.awaitsReady && !rowState(row.rowKey).ready) {
        readyTimers.set(row.rowKey, setTimeout(() => {
            readyTimers.delete(row.rowKey);
            if (!rowState(row.rowKey).ready) {
                console.error(`[hyperion-checkout] the payment element of "${row.entry.id}" did not report ready in time`);
                patchRow(row.rowKey, { failure: 'not-ready' });
            }
        }, READY_TIMEOUT_MS));
    }
    return element;
}

function readOwnership(rowKey: string, element: PaymentElement): void {
    const owns = callExtensionSync('ownsPlaceOrder', () => element.ownsPlaceOrder, undefined);
    if (typeof owns === 'boolean' && rowState(rowKey).ownsPlaceOrder !== owns) patchRow(rowKey, { ownsPlaceOrder: owns });
}

function onEvent(rowKey: string, event: Event): void {
    const hosted = hostedElement(rowKey);
    if (hosted === null || event.target !== hosted.element) return;
    event.stopPropagation();
    const raw = (event as CustomEvent<unknown>).detail;
    const detail = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    switch (event.type) {
        case 'hyperion-payment:ready':
            patchRow(rowKey, { ready: true, failure: null });
            break;
        case 'hyperion-payment:valid':
            patchRow(rowKey, { valid: true, message: null });
            break;
        case 'hyperion-payment:invalid':
            patchRow(rowKey, { valid: false, message: plainMessage(detail['message']) });
            break;
        case 'hyperion-payment:busy': {
            const busy = detail['busy'] === true;
            patchRow(rowKey, { busy, busyLabel: busy ? plainMessage(detail['label']) : null });
            if (busy) {
                for (const beat of [...hosted.beats]) beat();
            }
            break;
        }
        case 'hyperion-payment:error': {
            const message = plainMessage(detail['message']);
            if (detail['fatal'] === true) {
                console.error(`[hyperion-checkout] the payment element of "${hosted.entry.id}" gave up: ${message ?? ''}`);
                patchRow(rowKey, { fatal: true });
                const store = getStore();
                const selected = store.selectedPaymentMethod.get();
                if (selected !== null && selectedRowKey(selected) === rowKey) store.selectedPaymentMethod.set(null);
            } else if (message !== null) {
                getStore().globalError.set(message);
            }
            break;
        }
        case 'hyperion-payment:request-place-order':
            void placeOrderForRow(rowKey, null);
            break;
        default:
            break;
    }
    readOwnership(rowKey, hosted.element);
}

const attached = new WeakMap<HTMLElement, string>();

/**
 * Put the row's element into the row's body (once), listening for its
 * events there.
 */
export function attach(body: HTMLElement, rowKey: string, element: HTMLElement): void {
    if (attached.get(body) !== rowKey) {
        attached.set(body, rowKey);
        for (const name of EVENTS) body.addEventListener(name, (event) => onEvent(attached.get(body) ?? '', event));
    }
    if (element.parentNode !== body) body.appendChild(element);
    const hosted = hostedElement(rowKey);
    if (hosted !== null) readOwnership(rowKey, hosted.element);
}

/** Start the row over: a new element is created on the next render. */
export function retryRow(rowKey: string): void {
    const hosted = hostedElement(rowKey);
    hosted?.element.remove();
    forgetHosted(rowKey);
    const timer = readyTimers.get(rowKey);
    if (timer !== undefined) clearTimeout(timer);
    readyTimers.delete(rowKey);
    patchRow(rowKey, EMPTY_ROW);
}

export function resetMountForTests(): void {
    loads.clear();
    usableAsked.clear();
    for (const timer of readyTimers.values()) clearTimeout(timer);
    readyTimers.clear();
}
