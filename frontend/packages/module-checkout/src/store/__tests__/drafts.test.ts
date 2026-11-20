// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import {
    buildDraft,
    clearDraft,
    consumeHandoff,
    copyDraftToHandoff,
    copyToHandoff,
    couponDraft,
    discardDrafts,
    DRAFT_KEY_PREFIX,
    DRAFT_TTL_MS,
    DRAFT_WRITE_DELAY_MS,
    draftKey,
    giftDrafts,
    HANDOFF_TTL_MS,
    handoffKey,
    readDraft,
    restoreDraft,
    saveDraftNow,
    startDraftPersistence,
    writeDraft,
    type CheckoutDraft,
} from '../drafts.js';
import { createStore, type Store } from '../index.js';

const STORE_CODE = 'en_us';
const QUOTE = 'masked-1';

const typed: Address = {
    country_id: 'US',
    region_id: '33',
    region: { region: 'Michigan', region_code: 'MI', region_id: 33 },
    street: ['6146 Honey Bluff Parkway', 'Apt 2'],
    postcode: '49628-7978',
    city: 'Calder',
    firstname: 'Veronica',
    lastname: 'Costello',
    telephone: '(555) 229-3326',
    company: 'Luma',
    save_in_address_book: false,
};

const saved: Address = { ...typed, id: '12', customer_id: '4', city: 'Saved City', default_shipping: true, inline: 'SAVED-INLINE' };

const config = (hyperion: Record<string, unknown> = {}): CheckoutConfig => ({
    storeCode: STORE_CODE,
    hyperion: { checkoutVersion: '2.0.0', enabled: true, ...hyperion },
} as unknown as CheckoutConfig);

function guestStore(): Store {
    const store = createStore();
    store.isGuest.set(true);
    store.maskedQuoteId.set(QUOTE);
    return store;
}

function stored(key: string): CheckoutDraft | null {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw) as CheckoutDraft;
}

function draftOf(store: Store, overrides: Partial<CheckoutDraft> = {}): CheckoutDraft {
    return { ...buildDraft(store, QUOTE), ...overrides };
}

describe('drafts', () => {
    let stop: () => void = () => undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));
        window.sessionStorage.clear();
        couponDraft.set('');
        giftDrafts.set({});
    });

    afterEach(() => {
        stop();
        stop = () => undefined;
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('keys and shape', () => {
        it('uses one key per store and quote, and one handoff key per store', () => {
            expect(draftKey('en_us', 'abc')).toBe('hyperion.checkout.draft.v1:en_us:abc');
            expect(handoffKey('en_us')).toBe('hyperion.checkout.draft.v1:handoff:en_us');
        });

        it('holds exactly the documented fields', () => {
            const store = guestStore();
            store.email.set('veronica@example.com');
            store.shippingAddress.set(typed);
            store.shippingDirty.set(true);
            store.billingSameAsShipping.set(true);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.selectedPaymentMethod.set('checkmo');
            couponDraft.set('SAVE10');
            giftDrafts.set({ order: { sender: 'A', recipient: 'B', message: 'Hi' } });

            expect(buildDraft(store, QUOTE, 'fp-1')).toEqual({
                v: 1,
                savedAt: Date.now(),
                quoteKey: QUOTE,
                email: 'veronica@example.com',
                shipping: {
                    address: {
                        country_id: 'US',
                        region_id: '33',
                        region: { region: 'Michigan', region_code: 'MI', region_id: 33 },
                        street: ['6146 Honey Bluff Parkway', 'Apt 2'],
                        postcode: '49628-7978',
                        city: 'Calder',
                        firstname: 'Veronica',
                        lastname: 'Costello',
                        telephone: '(555) 229-3326',
                        company: 'Luma',
                        save_in_address_book: false,
                    },
                    addressId: null,
                    dirty: true,
                },
                billing: { address: null, addressId: null, dirty: false, sameAsShipping: true },
                shippingMethod: { carrier_code: 'flatrate', method_code: 'flatrate' },
                paymentMethodCode: 'checkmo',
                couponDraft: 'SAVE10',
                giftDrafts: { order: { sender: 'A', recipient: 'B', message: 'Hi' } },
                fingerprint: 'fp-1',
            });
        });

        it('keeps a saved address as its id only, and no email of a customer', () => {
            const store = createStore();
            store.isGuest.set(false);
            store.quoteId.set('465');
            store.email.set('customer@example.com');
            store.shippingAddress.set(saved);
            store.selectedShippingAddressId.set('12');

            const draft = buildDraft(store, '465');
            expect(draft.shipping).toEqual({ address: null, addressId: '12', dirty: false });
            expect(draft.email).toBe('');
        });
    });

    describe('what is never stored', () => {
        it('none of the excluded values appears in the stored string', () => {
            const store = createStore();
            store.isGuest.set(false);
            store.quoteId.set('465');
            store.email.set('SENTINEL-ACCOUNT-EMAIL@example.com');
            store.password.set('SENTINEL-PASSWORD');
            store.customer.set({
                id: 4,
                email: 'SENTINEL-CUSTOMER-EMAIL@example.com',
                firstname: 'SENTINEL-CUSTOMER-FIRSTNAME',
                addresses: {},
            } as never);
            store.savedAddresses.set([{ ...saved, street: ['SENTINEL-SAVED-STREET'], telephone: 'SENTINEL-SAVED-PHONE' }]);
            store.shippingAddress.set({ ...saved, street: ['SENTINEL-SAVED-STREET'], telephone: 'SENTINEL-SAVED-PHONE' });
            store.selectedShippingAddressId.set('12');
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({
                ...typed,
                email: 'SENTINEL-ADDRESS-EMAIL@example.com',
                customer_id: 'SENTINEL-CUSTOMER-ID',
                inline: 'SENTINEL-INLINE',
                custom_attributes: [{ attribute_code: 'x', value: 'SENTINEL-CUSTOM-ATTRIBUTE' }],
                extension_attributes: { token: 'SENTINEL-EXTENSION-ATTRIBUTE' } as never,
            });
            store.selectedPaymentMethod.set('braintree');
            store.paymentMethodData.set({
                braintree: {
                    payment_method_nonce: 'SENTINEL-NONCE',
                    device_data: 'SENTINEL-DEVICE-DATA',
                    cc_number: 'SENTINEL-CARD-NUMBER',
                    account_number: 'SENTINEL-BANK-ACCOUNT',
                },
                braintree_cc_vault: { public_hash: 'SENTINEL-VAULT-HASH' },
                purchaseorder: { po_number: 'SENTINEL-PO-NUMBER' },
            });
            store.acceptedAgreements.set([987654321]);
            store.captcha.set({
                user_login: { isRequired: true, isCaseSensitive: false, imageHeight: 50, imageWidth: 200, value: 'SENTINEL-CAPTCHA-ANSWER' },
            });
            store.appliedCoupon.set('SENTINEL-APPLIED-COUPON');
            store.loginError.set('SENTINEL-LOGIN-ERROR');
            document.cookie = 'form_key=SENTINELFORMKEY';

            stop = startDraftPersistence(store, config());
            saveDraftNow();
            copyDraftToHandoff();

            const raw = [
                window.sessionStorage.getItem(draftKey(STORE_CODE, '465')),
                window.sessionStorage.getItem(handoffKey(STORE_CODE)),
            ];
            for (const text of raw) {
                expect(typeof text).toBe('string');
                expect(text).not.toMatch(/SENTINEL/i);
                expect(text).not.toContain('987654321');
                expect(text).not.toMatch(/password|nonce|device_data|public_hash|po_number|agreement|captcha|form_key/i);
            }
            // What may be stored is there: the typed billing address and the method code.
            expect(raw[0]).toContain('6146 Honey Bluff Parkway');
            expect(raw[0]).toContain('"paymentMethodCode":"braintree"');
        });
    });

    describe('storage', () => {
        it('round trips a draft', () => {
            const store = guestStore();
            store.email.set('veronica@example.com');
            store.shippingAddress.set(typed);
            const draft = draftOf(store);

            writeDraft(STORE_CODE, draft);

            expect(readDraft(STORE_CODE, QUOTE)).toEqual(draft);
        });

        it('a draft expires 60 minutes after its last write, and each write renews it', () => {
            const store = guestStore();
            writeDraft(STORE_CODE, draftOf(store));

            vi.advanceTimersByTime(DRAFT_TTL_MS - 1000);
            expect(readDraft(STORE_CODE, QUOTE)).not.toBeNull();
            writeDraft(STORE_CODE, draftOf(store));

            vi.advanceTimersByTime(DRAFT_TTL_MS - 1000);
            expect(readDraft(STORE_CODE, QUOTE)).not.toBeNull();

            vi.advanceTimersByTime(2000);
            expect(readDraft(STORE_CODE, QUOTE)).toBeNull();
            expect(window.sessionStorage.getItem(draftKey(STORE_CODE, QUOTE))).toBeNull();
        });

        it('reading removes the entries of other quotes and unreadable ones, and keeps a live handoff entry', () => {
            const store = guestStore();
            writeDraft(STORE_CODE, draftOf(store));
            writeDraft(STORE_CODE, draftOf(store, { quoteKey: 'other-quote' }));
            writeDraft('it_it', draftOf(store, { quoteKey: 'third-quote' }));
            window.sessionStorage.setItem(`${DRAFT_KEY_PREFIX}:${STORE_CODE}:broken`, '{not json');
            window.sessionStorage.setItem('unrelated', 'kept');
            copyToHandoff(STORE_CODE, QUOTE);

            expect(readDraft(STORE_CODE, QUOTE)).not.toBeNull();

            expect(window.sessionStorage.getItem(draftKey(STORE_CODE, 'other-quote'))).toBeNull();
            expect(window.sessionStorage.getItem(draftKey('it_it', 'third-quote'))).toBeNull();
            expect(window.sessionStorage.getItem(`${DRAFT_KEY_PREFIX}:${STORE_CODE}:broken`)).toBeNull();
            expect(window.sessionStorage.getItem('unrelated')).toBe('kept');
            expect(window.sessionStorage.getItem(handoffKey(STORE_CODE))).not.toBeNull();
        });

        it('the handoff entry is accepted once', () => {
            const store = guestStore();
            store.email.set('veronica@example.com');
            writeDraft(STORE_CODE, draftOf(store));
            copyToHandoff(STORE_CODE, QUOTE);

            expect(consumeHandoff(STORE_CODE)?.email).toBe('veronica@example.com');
            expect(consumeHandoff(STORE_CODE)).toBeNull();
        });

        it('the handoff entry lives 10 minutes', () => {
            const store = guestStore();
            writeDraft(STORE_CODE, draftOf(store));
            copyToHandoff(STORE_CODE, QUOTE);

            vi.advanceTimersByTime(HANDOFF_TTL_MS + 1000);

            expect(consumeHandoff(STORE_CODE)).toBeNull();
            expect(window.sessionStorage.getItem(handoffKey(STORE_CODE))).toBeNull();
        });

        it('clearDraft removes the entry', () => {
            writeDraft(STORE_CODE, draftOf(guestStore()));
            clearDraft(STORE_CODE, QUOTE);
            expect(readDraft(STORE_CODE, QUOTE)).toBeNull();
        });

        it('a storage that throws is swallowed everywhere', () => {
            const store = guestStore();
            store.shippingAddress.set(typed);
            const refuse = (): never => { throw new DOMException('quota', 'QuotaExceededError'); };
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
            vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
            vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse);
            vi.spyOn(Storage.prototype, 'key').mockImplementation(refuse);

            expect(() => writeDraft(STORE_CODE, draftOf(store))).not.toThrow();
            expect(readDraft(STORE_CODE, QUOTE)).toBeNull();
            expect(() => clearDraft(STORE_CODE, QUOTE)).not.toThrow();
            expect(() => copyToHandoff(STORE_CODE, QUOTE)).not.toThrow();
            expect(consumeHandoff(STORE_CODE)).toBeNull();
            expect(() => restoreDraft(store, config())).not.toThrow();
            stop = startDraftPersistence(store, config());
            expect(() => { saveDraftNow(); copyDraftToHandoff(); discardDrafts(); }).not.toThrow();
        });

        it('a storage the browser refuses to hand out is treated as no storage', () => {
            const store = guestStore();
            vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });

            expect(() => writeDraft(STORE_CODE, draftOf(store))).not.toThrow();
            expect(readDraft(STORE_CODE, QUOTE)).toBeNull();
        });
    });

    describe('writing', () => {
        it('writes 300 ms after the last change, once for a burst of changes', async () => {
            const store = guestStore();
            const setItem = vi.spyOn(Storage.prototype, 'setItem');
            stop = startDraftPersistence(store, config());

            store.email.set('v@example.com');
            await vi.advanceTimersByTimeAsync(DRAFT_WRITE_DELAY_MS - 1);
            store.shippingAddress.set(typed);
            await vi.advanceTimersByTimeAsync(DRAFT_WRITE_DELAY_MS - 1);
            expect(setItem).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(setItem).toHaveBeenCalledTimes(1);
            expect(stored(draftKey(STORE_CODE, QUOTE))?.shipping.address?.city).toBe('Calder');

            // The watch is armed again after it reported.
            couponDraft.set('SAVE10');
            await vi.advanceTimersByTimeAsync(DRAFT_WRITE_DELAY_MS);
            expect(setItem).toHaveBeenCalledTimes(2);
            expect(stored(draftKey(STORE_CODE, QUOTE))?.couponDraft).toBe('SAVE10');
        });

        it('writes at once when the page is hidden', async () => {
            const store = guestStore();
            stop = startDraftPersistence(store, config({ initial: { fingerprint: 'fp-9' } }));
            store.email.set('v@example.com');
            await vi.advanceTimersByTimeAsync(10);

            window.dispatchEvent(new Event('pagehide'));

            const draft = stored(draftKey(STORE_CODE, QUOTE));
            expect(draft?.email).toBe('v@example.com');
            expect(draft?.fingerprint).toBe('fp-9');
        });

        it('writes nothing when the store switched drafts off, and removes what an earlier setting left', () => {
            const store = guestStore();
            writeDraft(STORE_CODE, draftOf(store));
            copyToHandoff(STORE_CODE, QUOTE);

            restoreDraft(store, config({ persistDrafts: false }));
            stop = startDraftPersistence(store, config({ persistDrafts: false }));
            store.email.set('v@example.com');
            window.dispatchEvent(new Event('pagehide'));
            copyDraftToHandoff();

            expect(window.sessionStorage.length).toBe(0);
            expect(store.email.get()).toBe('v@example.com');
        });

        it('the handoff copy holds what the store holds now, not the last debounced write', () => {
            const store = guestStore();
            stop = startDraftPersistence(store, config());
            store.email.set('fresh@example.com');

            copyDraftToHandoff();

            expect(stored(handoffKey(STORE_CODE))?.email).toBe('fresh@example.com');
        });

        it('discarding removes the draft and the handoff entry and stops the writes, also the one of the page being hidden', async () => {
            const store = guestStore();
            stop = startDraftPersistence(store, config());
            store.email.set('v@example.com');
            couponDraft.set('SAVE10');
            saveDraftNow();
            copyDraftToHandoff();

            discardDrafts();
            store.email.set('later@example.com');
            await vi.advanceTimersByTimeAsync(DRAFT_WRITE_DELAY_MS);
            window.dispatchEvent(new Event('pagehide'));

            expect(window.sessionStorage.length).toBe(0);
            expect(couponDraft.get()).toBe('');
        });
    });

    describe('restore', () => {
        const serverAddress: Address = { ...typed, city: 'Server City', street: ['1 Server Street'] };

        it('a reload gives back the email, both addresses, the billing choice, both methods, the coupon input and the gift forms', () => {
            const before = guestStore();
            before.email.set('veronica@example.com');
            before.shippingAddress.set(typed);
            before.shippingDirty.set(true);
            before.billingSameAsShipping.set(false);
            before.billingAddress.set({ ...typed, city: 'Billing City' });
            before.billingDirty.set(true);
            before.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
            before.selectedPaymentMethod.set('checkmo');
            couponDraft.set('SAVE10');
            giftDrafts.set({ order: { sender: 'A', recipient: 'B', message: 'Hi' } });
            writeDraft(STORE_CODE, buildDraft(before, QUOTE));
            couponDraft.set('');
            giftDrafts.set({});

            const store = guestStore();
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            restoreDraft(store, config());

            expect(store.email.get()).toBe('veronica@example.com');
            expect(store.shippingAddress.get()?.city).toBe('Calder');
            expect(store.shippingAddress.get()?.street).toEqual(['6146 Honey Bluff Parkway', 'Apt 2']);
            expect(store.shippingDirty.get()).toBe(true);
            expect(store.billingSameAsShipping.get()).toBe(false);
            expect(store.billingAddress.get()?.city).toBe('Billing City');
            expect(store.billingDirty.get()).toBe(true);
            expect(store.billingSynced.get()).toBe(false);
            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'tablerate', method_code: 'bestway' });
            expect(store.selectedPaymentMethod.get()).toBe('checkmo');
            expect(couponDraft.get()).toBe('SAVE10');
            expect(giftDrafts.get()).toEqual({ order: { sender: 'A', recipient: 'B', message: 'Hi' } });
        });

        it('an address typed after the last save wins over the one the quote has, and starts as ahead of the quote', () => {
            const before = guestStore();
            before.shippingAddress.set(typed);
            before.shippingDirty.set(true);
            writeDraft(STORE_CODE, buildDraft(before, QUOTE));

            const store = guestStore();
            store.shippingAddress.set(serverAddress);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            restoreDraft(store, config());

            expect(store.shippingAddress.get()?.city).toBe('Calder');
            expect(store.shippingDirty.get()).toBe(true);
        });

        it('an address the quote confirmed loses to what the server sends, like the email and the shipping method', () => {
            const before = guestStore();
            before.email.set('draft@example.com');
            before.shippingAddress.set(typed);
            before.shippingDirty.set(false);
            before.selectedShippingMethod.set({ carrier_code: 'tablerate', method_code: 'bestway' });
            writeDraft(STORE_CODE, buildDraft(before, QUOTE));

            const store = guestStore();
            store.email.set('server@example.com');
            store.shippingAddress.set(serverAddress);
            store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            restoreDraft(store, config());

            expect(store.email.get()).toBe('server@example.com');
            expect(store.shippingAddress.get()).toBe(serverAddress);
            expect(store.shippingDirty.get()).toBe(false);
            expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'flatrate', method_code: 'flatrate' });
            expect(store.billingSameAsShipping.get()).toBe(true);
        });

        it('fills what the server does not provide, even from a clean draft', () => {
            const before = guestStore();
            before.shippingAddress.set(typed);
            writeDraft(STORE_CODE, buildDraft(before, QUOTE));

            const store = guestStore();
            restoreDraft(store, config());

            expect(store.shippingAddress.get()?.city).toBe('Calder');
            expect(store.shippingDirty.get()).toBe(true);
        });

        it('a payment method the quote no longer offers is not selected', () => {
            const before = guestStore();
            before.selectedPaymentMethod.set('banktransfer');
            writeDraft(STORE_CODE, buildDraft(before, QUOTE));

            const store = guestStore();
            store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            restoreDraft(store, config());

            expect(store.selectedPaymentMethod.get()).toBeNull();
        });

        it('a restored coupon draft fills the input only', () => {
            const before = guestStore();
            couponDraft.set('SAVE10');
            writeDraft(STORE_CODE, buildDraft(before, QUOTE));
            couponDraft.set('');

            const store = guestStore();
            restoreDraft(store, config());

            expect(couponDraft.get()).toBe('SAVE10');
            expect(store.appliedCoupon.get()).toBeNull();
        });

        it('a virtual quote takes no shipping address or method from a draft', () => {
            const before = guestStore();
            before.shippingAddress.set(typed);
            before.shippingDirty.set(true);
            before.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            writeDraft(STORE_CODE, buildDraft(before, QUOTE));

            const store = guestStore();
            store.isVirtual.set(true);
            restoreDraft(store, config());

            expect(store.shippingAddress.get()).toBeNull();
            expect(store.selectedShippingMethod.get()).toBeNull();
        });

        it('a sign in changes the quote: the handoff entry is taken once, for the new quote, and its addresses win over the account defaults', () => {
            const guest = guestStore();
            stop = startDraftPersistence(guest, config());
            guest.email.set('veronica@example.com');
            guest.shippingAddress.set(typed);
            guest.shippingDirty.set(false);
            guest.selectedPaymentMethod.set('checkmo');
            copyDraftToHandoff();
            stop();

            const customer = createStore();
            customer.isGuest.set(false);
            customer.quoteId.set('465');
            customer.email.set('account@example.com');
            customer.savedAddresses.set([saved]);
            customer.shippingAddress.set(saved);
            customer.selectedShippingAddressId.set('12');
            customer.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
            restoreDraft(customer, config());

            expect(customer.email.get()).toBe('account@example.com');
            expect(customer.shippingAddress.get()?.city).toBe('Calder');
            expect(customer.selectedShippingAddressId.get()).toBeNull();
            expect(customer.shippingDirty.get()).toBe(true);
            expect(customer.selectedPaymentMethod.get()).toBe('checkmo');
            // The guest quote's own entry is foreign now, the handoff entry is used up.
            expect(window.sessionStorage.length).toBe(0);

            const again = createStore();
            again.isGuest.set(false);
            again.quoteId.set('465');
            restoreDraft(again, config());
            expect(again.shippingAddress.get()).toBeNull();
        });

        it('a form nobody typed in never replaces the default address of the account after a sign in', () => {
            const guest = guestStore();
            stop = startDraftPersistence(guest, config());
            guest.email.set('veronica@example.com');
            // What an untouched address form holds: its defaults.
            guest.shippingAddress.set({ country_id: 'US', save_in_address_book: false } as Address);
            guest.shippingDirty.set(true);
            guest.billingSameAsShipping.set(false);
            guest.billingAddress.set({ country_id: 'US', region_id: '33', street: ['', ''] } as unknown as Address);
            guest.billingDirty.set(true);
            copyDraftToHandoff();
            stop();

            const customer = createStore();
            customer.isGuest.set(false);
            customer.quoteId.set('465');
            customer.savedAddresses.set([saved]);
            customer.shippingAddress.set(saved);
            customer.selectedShippingAddressId.set('12');
            customer.billingAddress.set(saved);
            restoreDraft(customer, config());

            expect(customer.shippingAddress.get()).toBe(saved);
            expect(customer.selectedShippingAddressId.get()).toBe('12');
            expect(customer.shippingDirty.get()).toBe(false);
            expect(customer.billingAddress.get()).toBe(saved);
            expect(customer.billingSameAsShipping.get()).toBe(true);
            expect(customer.billingDirty.get()).toBe(false);
        });

        it('a stored card or account is not kept as the payment method: its token is not in the draft', () => {
            const before = guestStore();
            before.selectedPaymentMethod.set('braintree_cc_vault');
            before.paymentMethodData.set({ braintree_cc_vault: { public_hash: 'hash-of-a-stored-card' } });

            const draft = buildDraft(before, QUOTE);

            expect(draft.paymentMethodCode).toBeNull();
            expect(JSON.stringify(draft)).not.toContain('hash-of-a-stored-card');
        });

        it('a saved address comes back by its id, from the addresses the server sent', () => {
            const before = createStore();
            before.isGuest.set(false);
            before.quoteId.set('465');
            before.shippingAddress.set(saved);
            before.selectedShippingAddressId.set('12');
            before.shippingDirty.set(true);
            writeDraft(STORE_CODE, buildDraft(before, '465'));

            const other: Address = { ...typed, id: '7', city: 'Default City' };
            const store = createStore();
            store.isGuest.set(false);
            store.quoteId.set('465');
            store.savedAddresses.set([other, saved]);
            store.shippingAddress.set(other);
            store.selectedShippingAddressId.set('7');
            restoreDraft(store, config());

            expect(store.shippingAddress.get()).toBe(saved);
            expect(store.selectedShippingAddressId.get()).toBe('12');
        });

        it('a draft written with fields of the wrong type restores only what has the right one', () => {
            window.sessionStorage.setItem(draftKey(STORE_CODE, QUOTE), JSON.stringify({
                v: 1,
                savedAt: Date.now(),
                quoteKey: QUOTE,
                email: 42,
                shipping: { address: { city: 'Calder', street: 'not a list', id: '99', email: 'x@example.com' }, dirty: true },
                billing: 'nonsense',
                shippingMethod: { carrier_code: 'flatrate' },
                paymentMethodCode: { code: 'checkmo' },
            }));

            const store = guestStore();
            restoreDraft(store, config());

            expect(store.email.get()).toBe('');
            expect(store.shippingAddress.get()?.city).toBe('Calder');
            expect(store.shippingAddress.get()?.street).toEqual([]);
            expect(store.shippingAddress.get()?.id).toBeUndefined();
            expect(store.shippingAddress.get()?.email).toBeUndefined();
            expect(store.billingSameAsShipping.get()).toBe(true);
            expect(store.selectedShippingMethod.get()).toBeNull();
            expect(store.selectedPaymentMethod.get()).toBeNull();
        });
    });
});
