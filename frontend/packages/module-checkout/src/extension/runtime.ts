// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The runtime of the generic extension pool (`hyperion.extensions`), a
 * chunk of its own that a checkout without such entries never loads.
 *
 * After the mount, on idle, every entry's module is imported in parallel;
 * its named export `hyperionApi` must have the checkout's major, then its
 * default export is called with the `CheckoutExtensionApi` through the call
 * wrapper (8 s). The declarative `slots` of the entries are registered
 * first, before any module loads: the outlets wait for each tag to be
 * defined.
 *
 * `startExtensions()` resolves once every entry loaded or failed: the order
 * waits for it (`extensionsSettled()` of `gates.ts`). A required entry whose
 * module failed closes the Place Order gate with a message asking for a
 * reload; an optional one is left out.
 */
import type {
    CheckoutExtensionApi,
    CheckoutExtensionConfig,
    CheckoutSlotName,
    CheckoutSnapshot,
    GateHandle,
    RequestFilters,
    Unsubscribe,
} from '../../extension-api.js';
import { t } from '../utils/i18n.js';
import { CALL_TIMEOUTS, callExtension } from './call.js';
import { checkoutSnapshots, createCheckoutContext } from './context.js';
import { registerRequestFilter } from './request-filters.js';
import { refreshGates, registerCheckoutGate } from './gates.js';
import { extensionApiVersion, importExtensionModule } from './loader.js';
import { registerDeclaredSlots, registerSlotElement } from './slots.js';
import { isSupportedApi } from './api-version.js';
// The builtin ids of the first-party extensions, registered with the runtime chunk.
import '../components/extensions/builtins.js';

function onIdle(): Promise<void> {
    return new Promise((resolve) => {
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
            .requestIdleCallback;
        if (typeof idle === 'function') {
            idle.call(window, () => resolve(), { timeout: 2000 });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

let gatesFollowSnapshot: Unsubscribe | null = null;

/** Gates with a function are evaluated again on every change of the snapshot. */
function followSnapshot(): void {
    if (gatesFollowSnapshot !== null) return;
    gatesFollowSnapshot = checkoutSnapshots().subscribe(() => refreshGates());
}

function createApi(entry: CheckoutExtensionConfig): CheckoutExtensionApi {
    const context = createCheckoutContext({ phrases: entry.phrases ?? {} });
    const internal = Boolean(entry.builtin) && entry.moduleUrl === null;
    return Object.freeze({
        apiVersion: extensionApiVersion(),
        name: entry.name,
        options: Object.freeze({ ...(entry.options ?? {}) }),
        context,
        registerSlot: (slot: CheckoutSlotName, tag: string, config?: { sortOrder?: number }): Unsubscribe =>
            registerSlotElement({
                slot,
                tag,
                sortOrder: Number.isFinite(config?.sortOrder) ? Number(config?.sortOrder) : 0,
                owner: entry.name,
                options: entry.options ?? {},
                phrases: entry.phrases ?? {},
                internal,
            }),
        filter: <K extends keyof RequestFilters>(
            name: K,
            fn: (payload: RequestFilters[K], snapshot: CheckoutSnapshot) => RequestFilters[K]
        ): Unsubscribe => registerRequestFilter(name, fn, { owner: entry.name }),
        registerGate: (fn: (snapshot: CheckoutSnapshot) => string | null): GateHandle => {
            const gate = registerCheckoutGate(entry.name, () => fn(checkoutSnapshots().snapshot()));
            followSnapshot();
            return { refresh: gate.refresh, remove: gate.remove };
        },
    });
}

async function runEntry(entry: CheckoutExtensionConfig): Promise<boolean> {
    if (!entry.moduleUrl && !entry.builtin) return true;
    let module: unknown;
    try {
        module = await importExtensionModule({ id: entry.name, moduleUrl: entry.moduleUrl, builtin: entry.builtin });
    } catch (err) {
        console.error(`[hyperion-checkout] the checkout extension "${entry.name}" could not be loaded (${entry.moduleUrl ?? entry.builtin ?? ''})`, err);
        return false;
    }
    const exports = (module ?? {}) as { default?: unknown; hyperionApi?: unknown };
    if (!isSupportedApi(exports.hyperionApi, extensionApiVersion())) {
        console.error(`[hyperion-checkout] the checkout extension "${entry.name}" was written for API "${String(exports.hyperionApi ?? '')}", the checkout runs "${extensionApiVersion()}"`);
        return false;
    }
    const start = exports.default;
    if (typeof start !== 'function') {
        console.error(`[hyperion-checkout] the checkout extension "${entry.name}" has no default export to call`);
        return false;
    }
    try {
        await callExtension(`the checkout extension "${entry.name}"`, () => start(createApi(entry)) as unknown, CALL_TIMEOUTS.moduleDefault);
    } catch {
        return false;
    }
    return true;
}

/** Load and start every entry; resolves once each one loaded or failed. */
export async function startExtensions(entries: readonly CheckoutExtensionConfig[]): Promise<void> {
    if (entries.length === 0) return;
    registerDeclaredSlots(entries);
    await onIdle();
    const results = await Promise.all(entries.map((entry) => runEntry(entry).catch(() => false)));
    const failedRequired = entries.filter((entry, i) => entry.required === true && results[i] === false);
    if (failedRequired.length > 0) {
        console.error(`[hyperion-checkout] a required checkout extension failed: ${failedRequired.map((entry) => entry.name).join(', ')}`);
        registerCheckoutGate('required-extensions').set(t('Hyperion_Checkout::extension_required_failed'));
    }
}

export function resetRuntimeForTests(): void {
    gatesFollowSnapshot?.();
    gatesFollowSnapshot = null;
}
