// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The part of the payment host every checkout page loads: it knows when to
 * fetch the rest (`mount.ts`, a chunk of its own with the element contexts,
 * the loader and the order pipeline) and forwards to it.
 *
 * The host chunk and the module of an entry are requested:
 *   - before the first render, when a method is already selected (the
 *     mount waits for it, see `paymentHostBeforeMount()`), so the body of
 *     that row is part of the first frame;
 *   - when an eager entry's method appears in the offered list (the
 *     first-party gateways: their rows need `canMakePayment()`);
 *   - when a row is selected;
 *   - on idle after the mount (the host always, the module of the
 *     preselected method with it).
 */
import { Signal } from 'signal-polyfill';

import type { PlaceOrderOutcome } from '../../../extension-api.js';
import { peekCheckoutConfig } from '../../bootstrap-config.js';
import { getStore } from '../../store/index.js';
import type { PrepareOrderBlockReason } from '../../store/flow-actions.js';
import type { RecaptchaAction } from '../../types/captcha.js';
import type { PaymentMethodConfig } from '../../types/payment.js';
import { matchEntry, type PaymentEntry } from './entries.js';
import { entryState } from './row-state.js';

export type HostModule = typeof import('./mount.js');

/** What a press of the checkout's Place Order button led to. */
export type ButtonPlaceOrderResult =
    | { readonly status: 'blocked'; readonly reason: PrepareOrderBlockReason }
    | { readonly status: 'done'; readonly outcome: PlaceOrderOutcome };

/** The host chunk once it arrived: a signal, so the payment components render again then. */
const loaded = new Signal.State<HostModule | null>(null);
let loading: Promise<HostModule> | null = null;

/**
 * The import of the host chunk, registered by `importer.ts`. That module
 * belongs to the application chunk: an `import()` written here, in a module
 * of the entry, would make the build split everything the host chunk shares
 * with the application chunk into chunks of their own.
 */
let importHost: (() => Promise<HostModule>) | null = null;

export function registerHostImporter(importer: () => Promise<HostModule>): void {
    importHost = importer;
}

/** The host chunk, once it arrived; null before. Reads a signal. */
export function paymentHostNow(): HostModule | null {
    return loaded.get();
}

export function loadPaymentHost(): Promise<HostModule> {
    const host = loaded.get();
    if (host !== null) return Promise.resolve(host);
    if (loading === null) {
        if (importHost === null) return Promise.reject(new Error('the payment host is not registered'));
        loading = importHost().then(
            (mod) => {
                loaded.set(mod);
                return mod;
            },
            (err: unknown) => {
                loading = null;
                throw err;
            }
        );
    }
    return loading;
}

/** Load the module of an entry (the host first); failures are logged by the loader. */
export function loadEntry(entry: PaymentEntry): Promise<void> {
    if (entryState(entry.id).load !== 'idle' && entryState(entry.id).load !== 'loading') return Promise.resolve();
    return loadPaymentHost().then(
        (host) => host.loadEntry(entry).then(() => undefined),
        (err: unknown) => {
            console.error('[hyperion-checkout] the payment host could not be loaded', err);
        }
    );
}

const asked = new Set<string>();

/** Request the modules of the eager entries of the offered methods. */
export function ensureEntriesFor(methods: readonly PaymentMethodConfig[]): void {
    for (const method of methods) {
        const entry = matchEntry(method.code);
        if (entry === null || !entry.eager || asked.has(entry.id)) continue;
        asked.add(entry.id);
        void loadEntry(entry);
    }
}

function whenIdle(run: () => void): void {
    const idle = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback;
    if (typeof idle === 'function') {
        idle(run, { timeout: 2000 });
    } else {
        setTimeout(run, 200);
    }
}

/**
 * Prefetch, on idle, the host (every order goes through its pipeline) and
 * the module of the selected method.
 */
export function prefetchSelected(): void {
    whenIdle(() => {
        const code = getStore().selectedPaymentMethod.get();
        const entry = code === null ? null : matchEntry(code);
        if (entry !== null) {
            void loadEntry(entry);
        } else {
            void loadPaymentHost().catch((err: unknown) => {
                console.error('[hyperion-checkout] the payment host could not be loaded', err);
            });
        }
    });
}

/**
 * What the mount waits for (at most `limitMs`; the rows then get their
 * bodies when the chunk arrives):
 *   - with a method already selected, the host chunk, so the selected row
 *     has its body in the first frame, and the module of the method's entry
 *     unless it is an eager gateway entry (a gateway shows its placeholder,
 *     or its fields once its module arrives, as it did before the host);
 *   - on a store that shows the diagnostic rows of unsupported methods, the
 *     host chunk, which draws them.
 * The page preloads the host chunk on the server side twin of the first
 * condition (`ViewModel\CheckoutSkeleton::getBodySections()`).
 */
export function paymentHostBeforeMount(limitMs = 2000): Promise<void> {
    let code: string | null;
    try {
        code = getStore().selectedPaymentMethod.get();
    } catch {
        // No checkout state (a page without the application): nothing to load.
        return Promise.resolve();
    }
    const entry = code === null ? null : matchEntry(code);
    const diagnostics = peekCheckoutConfig()?.hyperion?.debug?.showUnsupportedPayments === true;
    if (entry === null && !diagnostics) {
        prefetchSelected();
        return Promise.resolve();
    }
    const wanted = entry !== null && !entry.eager
        ? loadEntry(entry)
        : loadPaymentHost().then(() => undefined, (err: unknown) => {
            console.error('[hyperion-checkout] the payment host could not be loaded', err);
        });
    return Promise.race([wanted, new Promise<void>((resolve) => setTimeout(resolve, limitMs))]);
}

/** Place Order of the checkout's button: the order pipeline of the host. */
export async function placeOrderFromButton(): Promise<ButtonPlaceOrderResult> {
    const host = await loadPaymentHost();
    return host.placeOrderFromButton();
}

/**
 * The order request of the selected method was answered with "no order"
 * (also when the quote said so after a lost answer): its element drops
 * its single use state.
 */
export function notifyOrderNotPlaced(): void {
    loaded.get()?.notifyOrderNotPlaced();
}

/**
 * The reCAPTCHA form that protects the order of the selected method: the
 * place order form unless the method's renderer names another one, or
 * none (null).
 */
export function selectedRecaptchaAction(code: string | null): RecaptchaAction | null {
    const entry = code === null ? null : matchEntry(code);
    const pick = entry === null ? null : entryState(entry.id).recaptchaAction;
    return pick === null ? 'place_order' : pick();
}

export function resetPaymentHostForTests(): void {
    asked.clear();
}
