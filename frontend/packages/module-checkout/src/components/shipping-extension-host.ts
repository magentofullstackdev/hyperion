// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The shipping extensions (`hyperion.shippingExtensions`): a parcel locker
 * picker under the locker rate, a delivery note under the rates, a pickup
 * point chooser in place of the address. A chunk of its own, imported by
 * `<checkout-shipping>` only when the list is not empty.
 *
 * Two parts. The controller (`startShippingExtensions()`) runs once per page
 * and owns everything that is not drawing:
 *
 *   - Activation. An entry is active when it has no `match`, or its `match`
 *     fits the SELECTED rate. Its element is created on first activation,
 *     one instance per entry and rate (`<id>|<carrier>:<method>`), and kept,
 *     so a re-render of the rate list never creates it again. `context`,
 *     `options`, `method` and `value` are set before it is connected;
 *     `method` and `value` are set again when they change.
 *   - Values. The last value an element reported, else the value the quote
 *     holds (`value` of the entry), else the one of the restored draft. A
 *     value belongs to the rate it was reported for: it is kept while that
 *     rate is offered (a rate refresh keeps it) and dropped when the rate
 *     disappears. `store.shippingExtensionData` holds the state of the
 *     ACTIVE entries, in `sortOrder` (the draft and the summary read it).
 *   - Payload. The host's request filter (registered first) merges, for
 *     every active entry, `value.address` into
 *     `shipping_address.extension_attributes` and `value.information` into
 *     `addressInformation.extension_attributes`. An inactive entry adds
 *     nothing, so its keys leave the quote with the next save. A key two
 *     entries set is logged; the higher `sortOrder` wins.
 *   - Saves. A NEW value (`hyperion-shipping:data` with other content than
 *     the one kept) marks the shipping step as ahead of the quote at once
 *     (Place Order closes) and asks for a shipping save after 300 ms (at
 *     once while a save runs, which the new one replaces); the same value
 *     reported again (a moved or restored element) changes nothing.
 *     `hyperion-shipping:rates-refresh` asks the rates again.
 *   - Gate. The first active `required` entry that has not reported
 *     `hyperion-shipping:valid` since its last new value closes Place Order
 *     with its own message (or a generic one); one that could not be loaded
 *     with "This delivery option could not be loaded.". Such a rate holds
 *     its shipping save (the carrier would refuse it without the extension's
 *     data): the flow asks `holdsSave()` of the view synchronously for the
 *     selection of the moment, and Place Order shows the gate's message; the
 *     save is asked for when the gate opens and when the chunk arrives. Every
 *     order attempt asks `validate()` of the active elements (the order
 *     pipeline, through the view), and so does a press of Place Order while
 *     the order cannot be placed, once per press.
 *   - Address override. `hyperion-shipping:address-override` puts an
 *     address in place of the typed one (`store.shippingAddressOverride`),
 *     `null` gives it back; the rates and the save follow at once. An
 *     override goes when its entry is no longer active. While an override
 *     asks for a separate billing address the requests and the payment step
 *     treat "same as shipping" as off (`billingFollowsShipping()`); the
 *     shopper's own choice is never rewritten.
 *
 * Events are taken only from the element the host created and only their
 * `detail` is read, as untrusted data: plain objects, strings cut to 500
 * characters, at most three summary lines.
 *
 * `<shipping-extension-host placement="...">` draws the active elements of
 * one placement: `below-method` inside the row of the selected rate (the row
 * passes its carrier and method), `after-methods` under the rate list,
 * `replaces-address` in place of the address editor. It is empty (no box,
 * no margin) while it has nothing to show.
 *
 * Imported, the module starts the controller for the page's entries and
 * installs its view (`shippingExtensionView`): the address step of
 * `<checkout-shipping>` (`renderAddressStep()`), the host under the rates
 * (`renderAfterMethods()`) and the summary lines under the shipping total
 * (`renderSummaries()`).
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/signals';
import { Signal } from 'signal-polyfill';

import type {
    AddressSnapshot,
    ShippingContext,
    ShippingExtensionConfig,
    ShippingExtensionValue,
    ShippingMethodSnapshot,
    Unsubscribe,
} from '../../extension-api.js';
import type { ShippingAddressOverride, ShippingExtensionState } from '../extension/address-override.js';
import { effectiveShippingAddress } from '../extension/address-override.js';
import { fromAddressSnapshot } from '../extension/address-snapshot.js';
import { CALL_TIMEOUTS, callExtension } from '../extension/call.js';
import { createShippingContext } from '../extension/context.js';
import { shippingExtensionsValid } from '../extension/gates.js';
import { loadExtensionElement } from '../extension/loader.js';
import { matchesShippingMethod } from '../extension/match-shipping.js';
import { plainMessage } from '../extension/public-error.js';
import { registerRequestFilter } from '../extension/request-filters.js';
import { watchValue } from '../extension/watch.js';
import { DRAFT_TTL_MS, OVERRIDE_KEY_PREFIX, readDraft, restoredShippingExtensions } from '../store/drafts.js';
import { flowActions } from '../store/flow-actions.js';
import { getStore } from '../store/index.js';
import { validationRequests } from '../store/validation-request.js';
import type { Address } from '../types/address.js';
import type { SelectedShippingMethod, ShippingMethod } from '../types/shipping.js';
import { peekCheckoutConfig } from '../bootstrap-config.js';
import { isAddressComplete } from '../utils/address-validation.js';
import { t } from '../utils/i18n.js';
import { shippingExtensionView } from './shipping-extension-view.js';
import './address-card.js';

export type ShippingPlacement = ShippingExtensionConfig['slot'];

/** How long the host waits for more values before it asks for a shipping save. */
export const SHIPPING_EXTENSION_SAVE_DELAY_MS = 300;

const MAX_SUMMARY_LINES = 3;

interface ShippingElement extends HTMLElement {
    context: ShippingContext;
    options: Readonly<Record<string, unknown>>;
    method: ShippingMethodSnapshot | null;
    value: ShippingExtensionValue | null;
    validate?(): boolean | Promise<boolean>;
}

interface Instance {
    /** `<id>|<rate key>`. */
    readonly key: string;
    readonly entry: ShippingExtensionConfig;
    /** `<carrier>:<method>` of the rate it serves; '' for an entry without `match`. */
    readonly rateKey: string;
    status: 'loading' | 'ready' | 'failed';
    element: ShippingElement | null;
    assignedMethod: string | null;
    assignedValue: ShippingExtensionValue | null | undefined;
}

interface Retained {
    readonly value: ShippingExtensionValue | null;
    /** The rate the value was reported for; null until the entry is first active (a value of the quote or of a draft). */
    readonly rateKey: string | null;
    readonly valid: boolean;
    readonly message: string | null;
}

let entries: readonly ShippingExtensionConfig[] = [];
const instances = new Map<string, Instance>();
const retained = new Map<string, Retained>();
/** Bumped whenever an instance changes state: the hosts draw again. */
const revision = new Signal.State(0);
let stops: Unsubscribe[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastData = '';

function bump(): void {
    revision.set(revision.get() + 1);
}

function rateKeyOf(method: { readonly carrier_code: string; readonly method_code: string }): string {
    return `${method.carrier_code}:${method.method_code}`;
}

function isUsable(rate: ShippingMethod): boolean {
    return rate.available !== false && Boolean(rate.method_code);
}

/** The rate key an entry serves for the selection; null when it is not active. Reads signals. */
function activeRateKey(entry: ShippingExtensionConfig, selected: SelectedShippingMethod | null): string | null {
    if (!matchesShippingMethod(entry.match, selected)) return null;
    return entry.match === null || entry.match === undefined || selected === null ? '' : rateKeyOf(selected);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value) as unknown;
    return proto === Object.prototype || proto === null;
}

function detached<T>(value: T): T | undefined {
    try {
        return structuredClone(value);
    } catch {
        return undefined;
    }
}

/** A value reported by an element (or emitted by the server), with only what the contract allows; null when it is none. */
export function cleanShippingValue(raw: unknown): ShippingExtensionValue | null {
    if (!isPlainObject(raw)) return null;
    const value: { -readonly [K in keyof ShippingExtensionValue]: ShippingExtensionValue[K] } = {};
    if (isPlainObject(raw.address)) {
        const address = detached(raw.address);
        if (address !== undefined) value.address = address;
    }
    if (isPlainObject(raw.information)) {
        const information = detached(raw.information);
        if (information !== undefined) value.information = information;
    }
    if (isPlainObject(raw.summary)) {
        const label = plainMessage(raw.summary.label) ?? '';
        const lines = (Array.isArray(raw.summary.lines) ? raw.summary.lines : [])
            .map((line) => plainMessage(line))
            .filter((line): line is string => line !== null)
            .slice(0, MAX_SUMMARY_LINES);
        if (label !== '' || lines.length > 0) value.summary = { label, lines };
    }
    if (raw.state !== undefined) {
        const state = detached(raw.state);
        if (state !== undefined) value.state = state;
    }
    return value;
}

function methodSnapshot(entry: ShippingExtensionConfig, rateKey: string): ShippingMethodSnapshot | null {
    if (entry.match === null || entry.match === undefined || rateKey === '') return null;
    const rate = getStore().availableShippingMethods.get().find((m) => isUsable(m) && rateKeyOf(m) === rateKey);
    if (!rate) return null;
    const amount = Number(rate.amount ?? 0);
    const base = Number(rate.base_amount ?? amount);
    return Object.freeze({
        carrier_code: rate.carrier_code,
        method_code: rate.method_code ?? '',
        carrier_title: rate.carrier_title ?? '',
        method_title: rate.method_title ?? '',
        amount,
        base_amount: Number.isFinite(base) ? base : amount,
    });
}

/** The value an instance is to show: the entry's value for its rate. */
function valueFor(instance: Instance): Retained | null {
    const kept = retained.get(instance.entry.id);
    return kept !== undefined && kept.rateKey === instance.rateKey ? kept : null;
}

function assign(instance: Instance): void {
    const el = instance.element;
    if (el === null) return;
    const method = methodSnapshot(instance.entry, instance.rateKey);
    const methodKey = JSON.stringify(method);
    const value = valueFor(instance)?.value ?? null;
    try {
        if (methodKey !== instance.assignedMethod) {
            instance.assignedMethod = methodKey;
            el.method = method;
        }
        if (value !== instance.assignedValue) {
            instance.assignedValue = value;
            el.value = value;
        }
    } catch (err) {
        console.error(`[hyperion-checkout] the shipping extension "${instance.entry.id}" refused a property`, err);
    }
}

function setRetained(id: string, next: Retained): void {
    retained.set(id, next);
    sync();
}

function scheduleSave(): void {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    // A save that is running carries the previous value: the new one
    // replaces it in the queue now, so its answer cannot open Place Order.
    if (getStore().isSavingShipping.get()) {
        void flowActions().saveShippingAndEstimateTotals();
        return;
    }
    // After the pause only what the quote still misses is sent: a pick
    // reports its value, its validity and its address in one turn, and the
    // estimate the address starts may have carried them already.
    saveTimer = setTimeout(() => {
        saveTimer = null;
        flowActions().flushShippingForm();
    }, SHIPPING_EXTENSION_SAVE_DELAY_MS);
}

function setOverride(next: ShippingAddressOverride | null): void {
    const store = getStore();
    const previous = store.shippingAddressOverride.get();
    if (previous === null && next === null) return;
    store.shippingAddressOverride.set(next);
    recordOverride(next === null ? null : effectiveShippingAddress(store));
    // "Same as shipping" as the requests apply it changed: the billing
    // address goes with the next write, as after a click on the checkbox.
    if ((previous?.separateBilling === true) !== (next?.separateBilling === true)) flowActions().invalidateBillingSync();
    void flowActions().estimateShippingNow();
}

function isActive(instance: Instance): boolean {
    return activeRateKey(instance.entry, getStore().selectedShippingMethod.get()) === instance.rateKey;
}

function listen(instance: Instance, el: ShippingElement): void {
    const id = instance.entry.id;
    const on = (name: string, handle: (detail: unknown) => void): void => {
        el.addEventListener(name, (event) => {
            if (event.target !== el || !isActive(instance)) return;
            try {
                handle((event as CustomEvent<unknown>).detail);
            } catch (err) {
                console.error(`[hyperion-checkout] the ${name} event of the shipping extension "${id}" could not be handled`, err);
            }
        });
    };
    on('hyperion-shipping:data', (detail) => {
        const value = cleanShippingValue(detail);
        if (value === null) return;
        // The same value again (an element that was moved or restored
        // reports what it holds) keeps its validity and needs no save.
        const kept = valueFor(instance);
        if (kept !== null && JSON.stringify(kept.value) === JSON.stringify(value)) return;
        getStore().shippingDirty.set(true);
        setRetained(id, { value, rateKey: instance.rateKey, valid: false, message: null });
        scheduleSave();
    });
    on('hyperion-shipping:valid', () => {
        setRetained(id, { value: valueFor(instance)?.value ?? null, rateKey: instance.rateKey, valid: true, message: null });
    });
    on('hyperion-shipping:invalid', (detail) => {
        const message = isPlainObject(detail) ? plainMessage(detail.message) : null;
        setRetained(id, { value: valueFor(instance)?.value ?? null, rateKey: instance.rateKey, valid: false, message });
    });
    on('hyperion-shipping:address-override', (detail) => {
        if (!isPlainObject(detail)) return;
        if (detail.address === null) {
            if (getStore().shippingAddressOverride.get()?.extensionId === id) setOverride(null);
            return;
        }
        if (!isPlainObject(detail.address)) return;
        const address = fromAddressSnapshot(detail.address as unknown as AddressSnapshot);
        if (address.country_id === '') return;
        setOverride({
            extensionId: id,
            address,
            keepContact: detail.keepContact === true,
            separateBilling: detail.separateBilling === true,
        });
    });
    on('hyperion-shipping:rates-refresh', () => {
        void flowActions().estimateShipping();
    });
}

async function load(instance: Instance): Promise<void> {
    const { entry } = instance;
    instance.status = 'loading';
    bump();
    const result = typeof entry.tag === 'string' && entry.tag !== ''
        ? await loadExtensionElement({ id: entry.id, tag: entry.tag, moduleUrl: entry.moduleUrl, builtin: null })
        : { state: 'load-failed' as const, elementClass: null };
    if (result.state !== 'ready' || typeof entry.tag !== 'string') {
        instance.status = 'failed';
        bump();
        sync();
        return;
    }
    try {
        const el = document.createElement(entry.tag) as ShippingElement;
        el.context = createShippingContext({ id: entry.id, phrases: entry.phrases ?? {} });
        el.options = Object.freeze({ ...(entry.options ?? {}) });
        instance.element = el;
        assign(instance);
        listen(instance, el);
        instance.status = 'ready';
    } catch (err) {
        console.error(`[hyperion-checkout] the shipping extension "${entry.id}" could not be created`, err);
        instance.element = null;
        instance.status = 'failed';
    }
    bump();
    sync();
}

function instanceFor(entry: ShippingExtensionConfig, rateKey: string): Instance {
    const key = `${entry.id}|${rateKey}`;
    let instance = instances.get(key);
    if (instance === undefined) {
        instance = { key, entry, rateKey, status: 'loading', element: null, assignedMethod: null, assignedValue: undefined };
        instances.set(key, instance);
        void load(instance);
    }
    return instance;
}

/** Bring the store, the gate, the override and the elements in line with the selection. */
function sync(): void {
    const store = getStore();
    const selected = store.selectedShippingMethod.get();
    const state = store.estimateState.get();
    if (state === 'ready' || state === 'empty') {
        const offered = new Set(store.availableShippingMethods.get().filter(isUsable).map(rateKeyOf));
        for (const [id, kept] of [...retained]) {
            if (kept.rateKey !== null && kept.rateKey !== '' && !offered.has(kept.rateKey)) retained.delete(id);
        }
    }
    const data: Record<string, ShippingExtensionState> = {};
    let gate: string | null = null;
    for (const entry of entries) {
        const rateKey = activeRateKey(entry, selected);
        if (rateKey === null) continue;
        const kept = retained.get(entry.id);
        if (kept !== undefined && kept.rateKey === null) retained.set(entry.id, { ...kept, rateKey });
        const instance = instanceFor(entry, rateKey);
        const own = valueFor(instance);
        data[entry.id] = { value: own?.value ?? null, valid: own?.valid ?? false, message: own?.message ?? null };
        if (gate === null && entry.required === true) {
            if (instance.status === 'failed') {
                gate = t('Hyperion_Checkout::shipping_extension_failed');
            } else if (own?.valid !== true) {
                gate = own?.message ?? t('Hyperion_Checkout::shipping_extension_incomplete');
            }
        }
    }
    for (const instance of instances.values()) assign(instance);
    const serialized = JSON.stringify(data);
    if (serialized !== lastData) {
        lastData = serialized;
        store.shippingExtensionData.set(Object.freeze(data));
    }
    // The rate held its save while the gate was closed: it goes out now.
    const opened = shippingExtensionsValid.get() !== null && gate === null;
    shippingExtensionsValid.set(gate);
    // A save already scheduled (a value of this turn) is the one that goes.
    if (opened && saveTimer === null) flowActions().flushShippingForm();
    const override = store.shippingAddressOverride.get();
    if (override !== null && !(override.extensionId in data)) setOverride(null);
    // In the same turn as the override it follows: the editor the override
    // hid is drawn again on the next render, and it must find the typed
    // address already in the store, not the point it replaced.
    if (store.shippingAddressOverride.get() === null && typedBeforeReload !== null
        && !Object.values(data).some((state) => state.value !== null)) {
        restoreTypedAddress();
    }
}

/**
 * The quote holds the address an extension put in place of the typed one
 * (a pickup point): after a reload the page starts from it as if it were
 * typed. The typed address is still in the draft of the tab; it is kept
 * here and put back once no extension with a value is active any more
 * (another rate), so the editor shows what the shopper typed.
 *
 * Only when the quote's address IS the one an override sent: while an
 * override is set its address is recorded next to the draft (same storage,
 * store, quote and lifetime; nothing when drafts are off), and the draft's
 * address is put back only when the hydrated address matches that record.
 * An address written elsewhere since (the cart estimator, another tab, an
 * express return) does not match and is kept.
 */
let typedBeforeReload: Address | null = null;
let hydratedAddress: Address | null = null;

function addressFingerprint(address: Address): string {
    return JSON.stringify([
        address.country_id, String(address.postcode ?? '').trim(), String(address.city ?? '').trim(),
        (address.street ?? []).map((line) => String(line).trim()).filter((line) => line !== '').join('\n'),
        String(address.company ?? '').trim(),
    ]);
}

/** The storage key of the override record of the running quote; null when drafts are off or the quote has no key. */
function overrideKey(): string | null {
    const store = getStore();
    const config = peekCheckoutConfig();
    const key = store.isGuest.get() ? store.maskedQuoteId.get() : store.quoteId.get();
    if (config === null || config.hyperion?.persistDrafts === false || key === null || key === '') return null;
    return `${OVERRIDE_KEY_PREFIX}:${config.storeCode}:${String(key)}`;
}

function recordOverride(address: Address | null): void {
    const key = overrideKey();
    if (key === null) return;
    try {
        if (address === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, JSON.stringify({ fingerprint: addressFingerprint(address), savedAt: Date.now() }));
    } catch {
        // Storage unavailable (private mode, quota): the typed address is not put back after a reload.
    }
}

function recordedOverride(): string | null {
    const key = overrideKey();
    if (key === null) return null;
    try {
        const raw = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { fingerprint?: unknown; savedAt?: unknown } | null;
        const fresh = typeof raw?.savedAt === 'number' && Date.now() - raw.savedAt < DRAFT_TTL_MS;
        return fresh && typeof raw?.fingerprint === 'string' ? raw.fingerprint : null;
    } catch {
        return null;
    }
}

function rememberTypedAddress(): void {
    const store = getStore();
    const config = peekCheckoutConfig();
    const key = store.isGuest.get() ? store.maskedQuoteId.get() : store.quoteId.get();
    const current = store.shippingAddress.get();
    if (config === null || key === null || current === null || !entries.some((entry) => cleanShippingValue(entry.value) !== null)) return;
    if (recordedOverride() !== addressFingerprint(current)) return;
    const slice = readDraft(config.storeCode, String(key))?.shipping;
    if (!slice) return;
    const typed: Address | null = slice.addressId !== null
        ? store.savedAddresses.get().find((address) => String(address.id) === slice.addressId) ?? null
        : slice.address !== null
            ? { country_id: '', street: [], telephone: '', city: '', firstname: '', lastname: '', ...slice.address }
            : null;
    if (typed === null || typed.country_id === '' || addressFingerprint(typed) === addressFingerprint(current)) return;
    typedBeforeReload = typed;
    hydratedAddress = current;
}

function restoreTypedAddress(): void {
    const store = getStore();
    const typed = typedBeforeReload;
    typedBeforeReload = null;
    // An edit of the shopper since the reload wins.
    if (typed === null || store.shippingAddress.get() !== hydratedAddress) return;
    store.shippingAddress.set(typed);
    store.selectedShippingAddressId.set(typed.id ?? null);
    void flowActions().estimateShippingNow();
}

/**
 * A required entry active for `selected` has no valid value for that rate
 * (nothing chosen yet, or its element could not be loaded): the shipping
 * save of the rate is held. Synchronous, for the selection of the moment.
 */
function holdsSave(selected: SelectedShippingMethod | null): boolean {
    return entries.some((entry) => {
        if (entry.required !== true) return false;
        const rateKey = activeRateKey(entry, selected);
        if (rateKey === null) return false;
        const kept = retained.get(entry.id);
        return !(kept?.valid === true && (kept.rateKey === rateKey || kept.rateKey === null));
    });
}

/** The values of the active entries, lowest `sortOrder` first. */
function activeValues(): { id: string; value: ShippingExtensionValue }[] {
    const selected = getStore().selectedShippingMethod.get();
    const out: { id: string; value: ShippingExtensionValue }[] = [];
    for (const entry of entries) {
        const rateKey = activeRateKey(entry, selected);
        if (rateKey === null) continue;
        const kept = retained.get(entry.id);
        if (kept?.value && (kept.rateKey === rateKey || kept.rateKey === null)) out.push({ id: entry.id, value: kept.value });
    }
    return out;
}

function mergeInto(
    target: Record<string, unknown>,
    source: Readonly<Record<string, unknown>>,
    owners: Map<string, string>,
    id: string,
    where: string
): void {
    const bag = isPlainObject(target.extension_attributes) ? target.extension_attributes : {};
    for (const [key, value] of Object.entries(source)) {
        const owner = owners.get(key);
        if (owner !== undefined && owner !== id) {
            console.error(`[hyperion-checkout] the shipping extensions "${owner}" and "${id}" both set ${where}.${key}; "${id}" wins (higher sort order)`);
        }
        owners.set(key, id);
        bag[key] = value;
    }
    target.extension_attributes = bag;
}

/** The shipping-information body with the values of the active entries. */
export function applyShippingExtensionValues<T extends { addressInformation: Record<string, unknown> }>(payload: T): T {
    const information = payload.addressInformation;
    const shipping = isPlainObject(information.shipping_address) ? information.shipping_address : null;
    const addressOwners = new Map<string, string>();
    const informationOwners = new Map<string, string>();
    for (const { id, value } of activeValues()) {
        if (value.address && shipping !== null) {
            mergeInto(shipping, value.address, addressOwners, id, 'shipping_address.extension_attributes');
        }
        if (value.information) {
            mergeInto(information, value.information, informationOwners, id, 'addressInformation.extension_attributes');
        }
    }
    return payload;
}

/**
 * Set when `validateForOrder()` asked the elements: the reveal of the
 * blocked order that follows (one more validation request) asks no second
 * time on the same press.
 */
let validatedForOrder = false;

/** `validate()` of the active elements of the selected rate; false when one answered false, threw or timed out. */
function validateActive(): Promise<boolean> {
    const selected = getStore().selectedShippingMethod.get();
    const answers: Array<Promise<boolean>> = [];
    for (const instance of instances.values()) {
        const el = instance.element;
        if (el === null || activeRateKey(instance.entry, selected) !== instance.rateKey) continue;
        if (typeof el.validate !== 'function') continue;
        const id = instance.entry.id;
        answers.push(callExtension(`the shipping extension "${id}"`, () => el.validate?.() ?? true, CALL_TIMEOUTS.validate).then(
            (ok) => {
                const kept = valueFor(instance);
                setRetained(id, {
                    value: kept?.value ?? null,
                    rateKey: instance.rateKey,
                    valid: ok === true,
                    message: ok === true ? null : kept?.message ?? null,
                });
                return ok === true;
            },
            () => {
                const kept = valueFor(instance);
                setRetained(id, { value: kept?.value ?? null, rateKey: instance.rateKey, valid: false, message: kept?.message ?? null });
                return false;
            }
        ));
    }
    return Promise.all(answers).then((all) => all.every(Boolean));
}

/** The step of the order pipeline: the active elements asked once per attempt. */
async function validateForOrder(): Promise<boolean> {
    validatedForOrder = false;
    const ok = await validateActive();
    // The reveal of a press the order step blocked (by these elements or
    // by anything after them) asks no second time.
    validatedForOrder = true;
    return ok;
}

/** A validation request of a blocked press; skipped right after the order step asked. */
function onValidationRequest(): void {
    if (validatedForOrder) {
        validatedForOrder = false;
        return;
    }
    void validateActive();
}

/** Retry the load of an entry that could not be loaded. */
function retry(instance: Instance): void {
    if (instance.status === 'failed') void load(instance);
}

/**
 * Start the controller for the entries of the page; a second call does
 * nothing. The values the quote holds count as complete (the server
 * accepted them); those of a draft wait for the element.
 */
export function startShippingExtensions(list: readonly ShippingExtensionConfig[]): void {
    if (stops.length > 0 || list.length === 0) return;
    entries = list
        .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.id === 'string' && entry.id !== '')
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => (Number(a.entry.sortOrder) || 0) - (Number(b.entry.sortOrder) || 0) || a.index - b.index)
        .map(({ entry }) => entry);
    const restored = restoredShippingExtensions.get();
    for (const entry of entries) {
        const server = cleanShippingValue(entry.value);
        const draft = server === null ? cleanShippingValue(restored[entry.id]) : null;
        if (server !== null) retained.set(entry.id, { value: server, rateKey: null, valid: true, message: null });
        else if (draft !== null) retained.set(entry.id, { value: draft, rateKey: null, valid: false, message: null });
    }
    rememberTypedAddress();
    const store = getStore();
    stops = [
        registerRequestFilter('shippingInformation', (payload) => applyShippingExtensionValues(payload), {
            owner: 'shipping-extensions',
            first: true,
        }),
        watchValue(() => [
            store.selectedShippingMethod.get(),
            store.availableShippingMethods.get(),
            store.estimateState.get(),
            store.shippingAddressOverride.get(),
        ], () => sync()),
        watchValue(() => validationRequests.get(), onValidationRequest),
    ];
    sync();
}

export function resetShippingExtensionsForTests(): void {
    for (const stop of stops) stop();
    stops = [];
    entries = [];
    instances.clear();
    retained.clear();
    lastData = '';
    validatedForOrder = false;
    typedBeforeReload = null;
    hydratedAddress = null;
    shippingExtensionView.set(null);
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    bump();
}

/**
 * The address step of `<checkout-shipping>` around its `editor`: the host of
 * an active `replaces-address` entry takes the place of the editor; an
 * address an extension put in place of the typed one is shown read only
 * once it is complete (until then the editor stays, for the name and the
 * telephone the override may keep from the typed address). The status line
 * announces the replacement. Reads signals.
 */
export function renderAddressStep(editor: unknown): unknown {
    const store = getStore();
    const selected = store.selectedShippingMethod.get();
    const override = store.shippingAddressOverride.get();
    const effective = effectiveShippingAddress(store);
    let shown = editor;
    if (entries.some((entry) => entry.slot === 'replaces-address' && activeRateKey(entry, selected) !== null)) {
        shown = html`<shipping-extension-host placement="replaces-address"></shipping-extension-host>`;
    } else if (override !== null && isAddressComplete(effective)) {
        shown = html`<div class="rounded-control border border-subtle bg-surface p-3" data-shipping-address-replaced>
            <address-card .address=${effective}></address-card>
        </div>`;
    }
    return html`
        ${shown}
        <p class="sr-only" role="status" data-shipping-address-status>${override !== null
            ? t('Hyperion_Checkout::shipping_address_replaced')
            : ''}</p>
    `;
}

/** The host under the rate list, when an entry draws there. */
export function renderAfterMethods(): unknown {
    return entries.some((entry) => entry.slot === 'after-methods')
        ? html`<shipping-extension-host placement="after-methods"></shipping-extension-host>`
        : nothing;
}

/**
 * What the active extensions say about the delivery (a parcel locker, a
 * pickup point), for the shipping row of `<summary-totals>`: plain text,
 * three lines at most. Nothing without one. Reads signals.
 */
export function renderSummaries(): unknown {
    return Object.values(getStore().shippingExtensionData.get()).map(({ value }) => value?.summary
        ? html`<div class="flex gap-1 text-xs text-muted" data-shipping-extension-summary>
              <dt class="sr-only">${value.summary.label}</dt>
              <dd class="min-w-0">${[value.summary.label, ...value.summary.lines].filter(Boolean).join(', ')}</dd>
          </div>`
        : nothing);
}

interface Shown {
    readonly key: string;
    readonly instance: Instance;
}

export class ShippingExtensionHost extends SignalWatcher(LitElement) {
    @property({ type: String, reflect: true }) public placement: ShippingPlacement = 'after-methods';
    /** `below-method`: the rate of the row the host is in. */
    @property({ type: String }) public carrier = '';
    @property({ type: String }) public method = '';

    public override createRenderRoot(): HTMLElement { return this; }

    private _shown(): Shown[] {
        revision.get();
        const selected = getStore().selectedShippingMethod.get();
        if (this.placement === 'below-method'
            && (selected === null || selected.carrier_code !== this.carrier || selected.method_code !== this.method)) {
            return [];
        }
        const shown: Shown[] = [];
        for (const entry of entries) {
            if (entry.slot !== this.placement) continue;
            const rateKey = activeRateKey(entry, selected);
            if (rateKey === null) continue;
            const instance = instances.get(`${entry.id}|${rateKey}`);
            if (instance === undefined || instance.status === 'loading') continue;
            shown.push({ key: instance.key, instance });
        }
        return shown;
    }

    public override render(): unknown {
        const shown = this._shown();
        if (shown.length === 0) return nothing;
        const spacing = this.placement === 'below-method' ? 'mt-2' : this.placement === 'after-methods' ? 'mt-4' : '';
        return html`
            <div class="space-y-3 ${spacing}" data-shipping-extensions=${this.placement}>
                ${repeat(shown, (item) => item.key, ({ instance }) => instance.status === 'ready' && instance.element !== null
                    ? html`${instance.element}`
                    : html`
                          <div class="flex flex-wrap items-center gap-3 text-sm text-danger" data-shipping-extension-failed=${instance.entry.id}>
                              <span>${t('Hyperion_Checkout::shipping_extension_failed')}</span>
                              ${instance.entry.required === true
                                  ? html`<button type="button"
                                                 class="inline-flex min-h-6 items-center font-medium text-accent hover:underline"
                                                 @click=${(): void => retry(instance)}>${t('Hyperion_Checkout::retry')}</button>`
                                  : nothing}
                          </div>
                      `)}
            </div>
        `;
    }
}

if (!customElements.get('shipping-extension-host')) {
    customElements.define('shipping-extension-host', ShippingExtensionHost);
}

declare global {
    interface HTMLElementTagNameMap { 'shipping-extension-host': ShippingExtensionHost; }
}

/** Start the controller for `list` and install the view; nothing for an empty list. */
export function installShippingExtensions(list: readonly ShippingExtensionConfig[]): void {
    if (list.length === 0) return;
    startShippingExtensions(list);
    shippingExtensionView.set({
        address: renderAddressStep,
        afterMethods: renderAfterMethods,
        summary: renderSummaries,
        holdsSave,
        validate: validateForOrder,
    });
    // Saves held until the chunk arrived go out now when nothing holds them.
    flowActions().flushShippingForm();
}

installShippingExtensions(peekCheckoutConfig()?.hyperion?.shippingExtensions ?? []);
