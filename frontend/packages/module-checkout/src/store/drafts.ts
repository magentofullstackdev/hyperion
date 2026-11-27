// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Drafts: what the shopper typed, kept in the tab's session storage so a
 * reload, a sign in or an expired session does not lose it.
 *
 * One entry per store and quote, removed 60 minutes after its last write
 * and when the order is placed. A sign in changes the quote, so the entry
 * is copied to a handoff key first, with its writer: the signed-in customer
 * of the checkout that wrote it, or nobody. The next boot of the same store
 * takes it once within 10 minutes, for whatever quote it has, but puts it
 * back only for the shopper it was written for (`isForThisShopper()`); any
 * other boot just removes it.
 *
 * A draft never holds a password, payment data of any renderer (nonces,
 * tokens, device data, card or bank data, a purchase order number, vault
 * hashes), a CAPTCHA or reCAPTCHA answer, accepted agreements, the form key
 * or account data that came from the server (a saved address is kept as
 * its id only, a customer's email not at all; a handoff entry adds the id of
 * the customer who wrote it). A new kind of value needs a
 * new schema version. The values of the shipping extensions (a pickup
 * point, a delivery date: the shopper's own delivery choice, never payment
 * data) are one optional field of the same version; a draft without it
 * restores as before.
 *
 * The lower half of the module is the plain storage (`readDraft()`,
 * `writeDraft()`, ...); the upper half binds it to the store of the running
 * checkout: `restoreDraft()` at boot, `startDraftPersistence()` for the
 * writes, `copyDraftToHandoff()` before a sign in, `discardDrafts()` once
 * the order exists or the cart is left.
 */
import { Signal } from 'signal-polyfill';

import type { ShippingExtensionValue } from '../../extension-api.js';
import type { Address, Region } from '../types/address.js';
import type { AddressId } from '../types/common.js';
import type { CheckoutConfig } from '../types/config.js';
import type { SelectedShippingMethod } from '../types/shipping.js';
import { debounce, type Debounced } from '../utils/debounce.js';
import { offeredPaymentMethods } from '../utils/payment-offer.js';
import { watchValue } from '../extension/watch.js';
import { isVaultMethod } from '../components/payment-host/payment-rows.js';
import type { Store } from './index.js';

/**
 * The start of every key the checkout writes to the tab's session storage
 * (drafts, the handoff entry, the override fingerprints). The theme removes
 * them at a sign-out with the same value (`CHECKOUT_STORAGE_PREFIX` of
 * `src/js/lib/checkout-drafts.js` in the theme package, which never imports
 * this one); a test on each side compares the two.
 */
export const CHECKOUT_STORAGE_PREFIX = 'hyperion.checkout.';
export const DRAFT_KEY_PREFIX = `${CHECKOUT_STORAGE_PREFIX}draft.v1`;
export const DRAFT_TTL_MS = 60 * 60 * 1000;
/** The address a shipping extension put in place of the typed one, recorded by the shipping extension host; it goes with the draft. */
export const OVERRIDE_KEY_PREFIX = `${CHECKOUT_STORAGE_PREFIX}override.v1`;
export const HANDOFF_TTL_MS = 10 * 60 * 1000;
/** How long the checkout state must stay unchanged before the draft is written. */
export const DRAFT_WRITE_DELAY_MS = 300;

/** The address fields a form edits, plus the "save in address book" choice. No ids, no email. */
export type DraftAddress = Partial<Pick<
    Address,
    | 'country_id'
    | 'region'
    | 'region_id'
    | 'street'
    | 'postcode'
    | 'city'
    | 'firstname'
    | 'lastname'
    | 'prefix'
    | 'middlename'
    | 'suffix'
    | 'company'
    | 'telephone'
    | 'fax'
    | 'vat_id'
    | 'save_in_address_book'
>>;

export interface DraftAddressSlice {
    /** The typed address; null when a saved address is selected (its id says which). */
    address: DraftAddress | null;
    /** The saved address selected, null for a typed one. */
    addressId: AddressId | null;
    /** Typed after the last successful save: on restore it wins over the server's address. */
    dirty: boolean;
}

export interface DraftGiftMessage {
    sender: string;
    recipient: string;
    message: string;
}

export interface CheckoutDraft {
    v: 1;
    /** Epoch milliseconds of the last write. */
    savedAt: number;
    /** The masked id (guest) or the quote id (customer) the draft was written for. */
    quoteKey: string;
    email: string;
    shipping: DraftAddressSlice;
    billing: DraftAddressSlice & { sameAsShipping: boolean };
    shippingMethod: SelectedShippingMethod | null;
    paymentMethodCode: string | null;
    /** The coupon input as typed, not an applied coupon. */
    couponDraft: string;
    /** Keyed by gift message target. */
    giftDrafts: Record<string, DraftGiftMessage>;
    /** The fingerprint of the server state the draft was written next to; diagnostics only. */
    fingerprint: string | null;
    /** The last value of each shipping extension, by extension id; absent when none has one. */
    shippingExtensions?: Record<string, ShippingExtensionValue>;
    /** Handoff entry only: who wrote it (`writerOf()`). An entry without it is never put back. */
    writer?: string;
}

/**
 * The coupon input as typed and the gift message forms as typed. They live
 * here, outside the store, because only their forms and the draft read
 * them: a form writes on input and seeds itself from the value at mount.
 */
export const couponDraft = new Signal.State<string>('');
export const giftDrafts = new Signal.State<Readonly<Record<string, DraftGiftMessage>>>({});

/**
 * The shipping extension values the restored draft held, by extension id:
 * the shipping extension host offers them to an element when the server
 * has no value for it.
 */
export const restoredShippingExtensions = new Signal.State<Readonly<Record<string, ShippingExtensionValue>>>({});

// -- Bound to the running checkout ------------------------------------------------

interface DraftSession {
    store: Store;
    storeCode: string;
    fingerprint: string | null;
    stop: () => void;
}

let session: DraftSession | null = null;

function quoteKeyOf(store: Store): string | null {
    const key = store.isGuest.get() ? store.maskedQuoteId.get() : store.quoteId.get();
    return key === null || key === '' ? null : String(key);
}

function draftsEnabled(config: CheckoutConfig): boolean {
    return config.hyperion?.persistDrafts !== false;
}

/** The writer of a handoff entry: the id of the signed-in customer, '' while nobody is signed in. */
function writerOf(store: Store): string {
    return String(store.customer.get()?.id ?? '');
}

const emailKey = (email: string | undefined): string => (email ?? '').trim().toLowerCase();

/**
 * Whether a handoff entry may fill the checkout of `store`: one the same
 * customer wrote (an expired session, signed in again), one written while
 * nobody was signed in when nobody is, and the entry a guest wrote just
 * before signing in from the checkout when the customer signed in now has
 * the account email that guest typed. Not for a remembered visitor of a
 * persistent cart, a guest after a customer, another customer, nor an entry
 * without a writer.
 */
function isForThisShopper(entry: CheckoutDraft, store: Store): boolean {
    const me = writerOf(store);
    if (entry.writer === me) return true;
    const typed = emailKey(entry.email);
    return entry.writer === '' && me !== '' && typed !== '' && typed === emailKey(store.customer.get()?.email);
}

/** What the store holds now, as a draft. Exported for the unit tests. */
export function buildDraft(store: Store, quoteKey: string, fingerprint: string | null = null): CheckoutDraft {
    const method = store.selectedShippingMethod.get();
    const extensions: Record<string, unknown> = {};
    for (const [id, state] of Object.entries(store.shippingExtensionData.get())) {
        if (state.value !== null) extensions[id] = state.value;
    }
    const shippingExtensions = cleanShippingExtensions(extensions);
    const draft: CheckoutDraft = {
        v: 1,
        savedAt: Date.now(),
        quoteKey,
        // A customer's email is account data the server sends again.
        email: store.isGuest.get() ? store.email.get() : '',
        shipping: sliceOf(store.shippingAddress.get(), store.selectedShippingAddressId.get(), store.shippingDirty.get()),
        billing: {
            ...sliceOf(store.billingAddress.get(), store.selectedBillingAddressId.get(), store.billingDirty.get()),
            sameAsShipping: store.billingSameAsShipping.get(),
        },
        shippingMethod: method === null
            ? null
            : { carrier_code: method.carrier_code, method_code: method.method_code },
        paymentMethodCode: restorablePaymentCode(store),
        couponDraft: couponDraft.get(),
        giftDrafts: cleanGiftDrafts(giftDrafts.get()),
        fingerprint,
    };
    if (shippingExtensions !== null) draft.shippingExtensions = shippingExtensions;
    return draft;
}

/**
 * The selected payment method, unless it is a stored card or account: that
 * selection is the method plus a token the draft must not hold, and the
 * method without its token cannot be ordered with.
 */
function restorablePaymentCode(store: Store): string | null {
    const code = store.selectedPaymentMethod.get();
    if (code === null) return null;
    return isVaultMethod(code) ? null : code;
}

/** The fields a shopper types; a country or a region alone is what an untouched form holds. */
const TYPED_FIELDS = ['postcode', 'city', 'firstname', 'lastname', 'company', 'telephone', 'fax', 'vat_id'] as const;

function hasTypedContent(address: DraftAddress): boolean {
    if ((address.street ?? []).some((line) => line.trim() !== '')) return true;
    return TYPED_FIELDS.some((field) => {
        const value = address[field];
        return typeof value === 'string' && value.trim() !== '';
    });
}

function sliceOf(address: Address | null, selectedId: AddressId | null, dirty: boolean): DraftAddressSlice {
    const savedId = address?.id ?? selectedId ?? null;
    if (savedId !== null && savedId !== '') {
        return { address: null, addressId: String(savedId), dirty };
    }
    return { address: cleanAddress(address), addressId: null, dirty };
}

/**
 * Start writing the draft: 300 ms after the last change of a value it
 * holds, and at once when the page is hidden (a reload, a navigation, a
 * closed tab). Returns the function that stops it. Does nothing when the
 * store switched drafts off or the quote has no key.
 */
export function startDraftPersistence(store: Store, config: CheckoutConfig): () => void {
    session?.stop();
    session = null;
    if (!draftsEnabled(config) || quoteKeyOf(store) === null) return () => undefined;

    const write: Debounced<[]> = debounce((): void => {
        saveDraftNow();
    }, DRAFT_WRITE_DELAY_MS);
    const unwatch = watchValue(() => {
        store.email.get();
        store.shippingAddress.get();
        store.selectedShippingAddressId.get();
        store.shippingDirty.get();
        store.billingAddress.get();
        store.selectedBillingAddressId.get();
        store.billingDirty.get();
        store.billingSameAsShipping.get();
        store.selectedShippingMethod.get();
        store.selectedPaymentMethod.get();
        couponDraft.get();
        giftDrafts.get();
        store.shippingExtensionData.get();
        return {};
    }, () => write());
    const onPageHide = (): void => {
        write.cancel();
        saveDraftNow();
    };
    window.addEventListener('pagehide', onPageHide);

    const current: DraftSession = {
        store,
        storeCode: config.storeCode,
        fingerprint: config.hyperion?.initial?.fingerprint ?? null,
        stop: (): void => {
            write.cancel();
            unwatch();
            window.removeEventListener('pagehide', onPageHide);
            if (session === current) session = null;
        },
    };
    session = current;
    return current.stop;
}

/** Write the draft of the running checkout now. */
export function saveDraftNow(): void {
    if (session === null) return;
    const quoteKey = quoteKeyOf(session.store);
    if (quoteKey === null) return;
    writeDraft(session.storeCode, buildDraft(session.store, quoteKey, session.fingerprint));
}

/**
 * Keep what the shopper typed across a sign in (from the checkout, or again
 * after the session expired): the quote changes with it, so the current
 * state goes to the handoff entry with its writer, which the next boot of
 * this store takes once for whatever quote it finds and puts back only for
 * the same shopper.
 */
export function copyDraftToHandoff(): void {
    if (session === null) return;
    const quoteKey = quoteKeyOf(session.store);
    if (quoteKey === null) return;
    writeDraft(session.storeCode, buildDraft(session.store, quoteKey, session.fingerprint));
    copyToHandoff(session.storeCode, quoteKey, writerOf(session.store));
}

/**
 * The order exists or the cart is being left: remove the draft and the
 * handoff entry and stop writing, so the page being hidden by the
 * navigation that follows cannot put the draft back.
 */
export function discardDrafts(): void {
    if (session === null) return;
    const { store, storeCode, stop } = session;
    stop();
    const quoteKey = quoteKeyOf(store);
    if (quoteKey !== null) {
        clearDraft(storeCode, quoteKey);
        removeItem(`${OVERRIDE_KEY_PREFIX}:${storeCode}:${quoteKey}`);
    }
    removeItem(handoffKey(storeCode));
    couponDraft.set('');
    giftDrafts.set({});
}

/**
 * Put back what the shopper typed, after the store was filled from the
 * server. The server wins for everything it provides, with two exceptions:
 * an address typed after the last successful save (`dirty`) replaces the
 * server's, and so does every address of a handoff entry (the quote it was
 * saved on is not the quote of this page). A handoff entry is removed by
 * this read in any case and used only for the shopper who wrote it
 * (`isForThisShopper()`). Only an address with something
 * typed in it counts: the defaults of an untouched form (a country) never
 * replace anything. An address put back this way
 * starts as ahead of the quote, so it is saved before an order can be
 * placed. A payment method is selected only when the quote offers it; a
 * coupon draft only fills its input.
 */
export function restoreDraft(store: Store, config: CheckoutConfig): void {
    const storeCode = config.storeCode;
    if (!draftsEnabled(config)) {
        removeEveryEntry();
        return;
    }
    const quoteKey = quoteKeyOf(store);
    if (quoteKey === null) return;
    const own = readDraft(storeCode, quoteKey);
    const taken = consumeHandoff(storeCode);
    const handed = taken !== null && isForThisShopper(taken, store) ? taken : null;
    const draft = handed ?? own;
    if (draft === null) return;
    const fromHandoff = handed !== null;

    if (store.isGuest.get() && draft.email !== '' && store.email.get() === '') {
        store.email.set(draft.email);
    }

    const virtual = store.isVirtual.get();
    let shippingRestored = false;
    if (!virtual && (draft.shipping.dirty || fromHandoff || store.shippingAddress.get() === null)) {
        const restored = addressOfSlice(store, draft.shipping);
        if (restored !== null) {
            store.shippingAddress.set(restored);
            store.selectedShippingAddressId.set(restored.id ?? null);
            store.shippingDirty.set(true);
            shippingRestored = true;
        }
    }

    const billing = draft.billing;
    if (billing.sameAsShipping && !virtual) {
        // The box was ticked again and the quote never heard of it.
        if (billing.dirty && !store.billingSameAsShipping.get()) {
            store.billingSameAsShipping.set(true);
            store.billingDirty.set(true);
            store.billingSynced.set(false);
        }
    } else if (billing.dirty || fromHandoff || store.billingSameAsShipping.get() || store.billingAddress.get() === null) {
        const restored = addressOfSlice(store, billing);
        if (restored !== null) {
            store.billingAddress.set(restored);
            store.selectedBillingAddressId.set(restored.id ?? null);
            if (!virtual) store.billingSameAsShipping.set(false);
            store.billingDirty.set(true);
            store.billingSynced.set(false);
        }
    }

    if (!virtual && draft.shippingMethod !== null && (shippingRestored || store.selectedShippingMethod.get() === null)) {
        store.selectedShippingMethod.set(draft.shippingMethod);
    }

    const code = draft.paymentMethodCode;
    const offer = offeredPaymentMethods(store.availablePaymentMethods.get(), store.totals.get());
    if (code !== null && offer.some((m) => m.code === code)) {
        store.selectedPaymentMethod.set(code);
    }

    couponDraft.set(draft.couponDraft);
    giftDrafts.set(draft.giftDrafts);
    restoredShippingExtensions.set(draft.shippingExtensions ?? {});
}

/** The address a draft slice stands for: the saved address of its id, or the typed one. */
function addressOfSlice(store: Store, slice: DraftAddressSlice): Address | null {
    if (slice.addressId !== null) {
        return store.savedAddresses.get().find((a) => String(a.id) === slice.addressId) ?? null;
    }
    // A form nobody typed in holds its defaults: nothing to put back.
    if (slice.address === null || !hasTypedContent(slice.address)) return null;
    return {
        country_id: '',
        street: [],
        telephone: '',
        city: '',
        firstname: '',
        lastname: '',
        ...slice.address,
    };
}

// -- Storage ----------------------------------------------------------------------

export function draftKey(storeCode: string, quoteKey: string): string {
    return `${DRAFT_KEY_PREFIX}:${storeCode}:${quoteKey}`;
}

export function handoffKey(storeCode: string): string {
    return `${DRAFT_KEY_PREFIX}:handoff:${storeCode}`;
}

const HANDOFF_KEY_PREFIX = `${DRAFT_KEY_PREFIX}:handoff:`;

/** The tab's session storage, null where the browser refuses access to it. */
function storage(): Storage | null {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function setItem(key: string, draft: CheckoutDraft): void {
    try {
        storage()?.setItem(key, JSON.stringify(draft));
    } catch {
        // Quota or a disabled storage: the checkout works without drafts.
    }
}

function removeItem(key: string): void {
    try {
        storage()?.removeItem(key);
    } catch {
        // Nothing to remove from a storage that cannot be reached.
    }
}

function getItem(key: string): CheckoutDraft | null {
    try {
        const raw = storage()?.getItem(key);
        return typeof raw === 'string' ? parseDraft(raw) : null;
    } catch {
        return null;
    }
}

function draftKeys(): string[] {
    const keys: string[] = [];
    try {
        const store = storage();
        if (store === null) return keys;
        for (let i = 0; i < store.length; i += 1) {
            const key = store.key(i);
            if (key !== null && key.startsWith(`${DRAFT_KEY_PREFIX}:`)) keys.push(key);
        }
    } catch {
        return [];
    }
    return keys;
}

function removeEveryEntry(): void {
    for (const key of draftKeys()) removeItem(key);
}

function isExpired(draft: CheckoutDraft, ttlMs: number): boolean {
    const age = Date.now() - draft.savedAt;
    return age < 0 || age > ttlMs;
}

/**
 * The draft of this quote, null when there is none or it expired. Removes
 * on the way every entry that expired, cannot be read or belongs to another
 * quote; a handoff entry is only removed when it expired.
 */
export function readDraft(storeCode: string, quoteKey: string): CheckoutDraft | null {
    const ownKey = draftKey(storeCode, quoteKey);
    let own: CheckoutDraft | null = null;
    for (const key of draftKeys()) {
        const draft = getItem(key);
        if (key.startsWith(HANDOFF_KEY_PREFIX)) {
            if (draft === null || isExpired(draft, HANDOFF_TTL_MS)) removeItem(key);
            continue;
        }
        if (draft === null || isExpired(draft, DRAFT_TTL_MS) || draft.quoteKey !== quoteKey) {
            removeItem(key);
            continue;
        }
        if (key === ownKey) own = draft;
    }
    return own;
}

/** Store `draft` under its own `quoteKey`; a storage failure is swallowed. */
export function writeDraft(storeCode: string, draft: CheckoutDraft): void {
    setItem(draftKey(storeCode, draft.quoteKey), draft);
}

export function clearDraft(storeCode: string, quoteKey: string): void {
    removeItem(draftKey(storeCode, quoteKey));
}

/** Copy the stored draft of this quote to the handoff key, with a fresh lifetime and its `writer` (`writerOf()`). */
export function copyToHandoff(storeCode: string, quoteKey: string, writer: string): void {
    const draft = getItem(draftKey(storeCode, quoteKey));
    if (draft === null) return;
    setItem(handoffKey(storeCode), { ...draft, savedAt: Date.now(), writer });
}

/** The handoff entry of the store, removed by this read; null when there is none or it expired. */
export function consumeHandoff(storeCode: string): CheckoutDraft | null {
    const key = handoffKey(storeCode);
    const draft = getItem(key);
    removeItem(key);
    return draft === null || isExpired(draft, HANDOFF_TTL_MS) ? null : draft;
}

// -- Shape ------------------------------------------------------------------------

const TEXT_FIELDS = [
    'country_id',
    'region_id',
    'postcode',
    'city',
    'firstname',
    'lastname',
    'prefix',
    'middlename',
    'suffix',
    'company',
    'telephone',
    'fax',
    'vat_id',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The fields of `value` a draft may hold, each checked for its type: the
 * same function shapes what is written and what is read back, so nothing
 * else of an address object reaches the storage or the store.
 */
function cleanAddress(value: unknown): DraftAddress | null {
    if (!isRecord(value)) return null;
    const out: DraftAddress = {};
    for (const field of TEXT_FIELDS) {
        const text = value[field];
        if (typeof text === 'string') out[field] = text;
    }
    if (Array.isArray(value.street)) {
        out.street = value.street.filter((line): line is string => typeof line === 'string');
    }
    const region = value.region;
    if (isRecord(region)) {
        const named: Partial<Region> = {};
        if (typeof region.region === 'string') named.region = region.region;
        if (typeof region.region_code === 'string') named.region_code = region.region_code;
        if (typeof region.region_id === 'number' || typeof region.region_id === 'string') {
            named.region_id = region.region_id as Region['region_id'];
        }
        out.region = named;
    } else if (typeof region === 'string') {
        // The free-text region of a country without a region list.
        out.region = region as unknown as Partial<Region>;
    }
    if (typeof value.save_in_address_book === 'boolean') out.save_in_address_book = value.save_in_address_book;
    return out;
}

function cleanSlice(value: unknown): DraftAddressSlice {
    if (!isRecord(value)) return { address: null, addressId: null, dirty: false };
    return {
        address: cleanAddress(value.address),
        addressId: typeof value.addressId === 'string' && value.addressId !== '' ? value.addressId : null,
        dirty: value.dirty === true,
    };
}

function cleanGiftDrafts(value: unknown): Record<string, DraftGiftMessage> {
    const out: Record<string, DraftGiftMessage> = {};
    if (!isRecord(value)) return out;
    for (const [target, entry] of Object.entries(value)) {
        if (!isRecord(entry)) continue;
        out[target] = {
            sender: typeof entry.sender === 'string' ? entry.sender : '',
            recipient: typeof entry.recipient === 'string' ? entry.recipient : '',
            message: typeof entry.message === 'string' ? entry.message : '',
        };
    }
    return out;
}

/** The shipping extension values a draft may hold: plain JSON objects, by extension id; null when none. */
function cleanShippingExtensions(value: unknown): Record<string, ShippingExtensionValue> | null {
    if (!isRecord(value)) return null;
    const out: Record<string, ShippingExtensionValue> = {};
    for (const [id, entry] of Object.entries(value)) {
        if (isRecord(entry)) out[id] = entry as ShippingExtensionValue;
    }
    try {
        return Object.keys(out).length > 0 ? JSON.parse(JSON.stringify(out)) as Record<string, ShippingExtensionValue> : null;
    } catch {
        return null;
    }
}

function parseDraft(raw: string): CheckoutDraft | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(value) || value.v !== 1) return null;
    if (typeof value.savedAt !== 'number' || typeof value.quoteKey !== 'string' || value.quoteKey === '') return null;
    const method = value.shippingMethod;
    const billing = isRecord(value.billing) ? value.billing : {};
    const shippingExtensions = cleanShippingExtensions(value.shippingExtensions);
    const draft: CheckoutDraft = {
        v: 1,
        savedAt: value.savedAt,
        quoteKey: value.quoteKey,
        email: typeof value.email === 'string' ? value.email : '',
        shipping: cleanSlice(value.shipping),
        billing: { ...cleanSlice(billing), sameAsShipping: billing.sameAsShipping !== false },
        shippingMethod: isRecord(method) && typeof method.carrier_code === 'string' && typeof method.method_code === 'string'
            ? { carrier_code: method.carrier_code, method_code: method.method_code }
            : null,
        paymentMethodCode: typeof value.paymentMethodCode === 'string' ? value.paymentMethodCode : null,
        couponDraft: typeof value.couponDraft === 'string' ? value.couponDraft : '',
        giftDrafts: cleanGiftDrafts(value.giftDrafts),
        fingerprint: typeof value.fingerprint === 'string' ? value.fingerprint : null,
    };
    if (shippingExtensions !== null) draft.shippingExtensions = shippingExtensions;
    if (typeof value.writer === 'string') draft.writer = value.writer;
    return draft;
}
