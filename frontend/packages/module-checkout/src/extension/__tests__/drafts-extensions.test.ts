// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    buildDraft,
    discardDrafts,
    draftKey,
    OVERRIDE_KEY_PREFIX,
    readDraft,
    restoredShippingExtensions,
    restoreDraft,
    startDraftPersistence,
    writeDraft,
} from '../../store/drafts.js';
import { createStore, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';

const STORE_CODE = 'en_us';
const QUOTE = 'masked-1';
const config = { storeCode: STORE_CODE, hyperion: { enabled: true } } as unknown as CheckoutConfig;

function guestStore(): Store {
    const store = createStore();
    store.isGuest.set(true);
    store.maskedQuoteId.set(QUOTE);
    return store;
}

describe('drafts and shipping extension values', () => {
    beforeEach(() => {
        window.sessionStorage.clear();
        restoredShippingExtensions.set({});
    });

    afterEach(() => window.sessionStorage.clear());

    it('adds no field while no extension holds a value', () => {
        const store = guestStore();
        store.shippingExtensionData.set({ lockers: { value: null, valid: false, message: null } });
        expect(buildDraft(store, QUOTE)).not.toHaveProperty('shippingExtensions');
    });

    it('keeps the value of each extension as plain data through a write and a read', () => {
        const store = guestStore();
        store.shippingExtensionData.set({
            lockers: {
                value: {
                    address: { locker_id: 'L-42' },
                    information: { pickup_date: '2030-01-02' },
                    summary: { label: 'Pickup point', lines: ['Station Square 1'] },
                    state: { search: 'Detroit', at: new Date(Date.UTC(2030, 0, 2)) },
                } as never,
                valid: true,
                message: null,
            },
        });
        writeDraft(STORE_CODE, buildDraft(store, QUOTE));
        const read = readDraft(STORE_CODE, QUOTE);
        expect(read?.v).toBe(1);
        expect(read?.shippingExtensions).toEqual({
            lockers: {
                address: { locker_id: 'L-42' },
                information: { pickup_date: '2030-01-02' },
                summary: { label: 'Pickup point', lines: ['Station Square 1'] },
                state: { search: 'Detroit', at: '2030-01-02T00:00:00.000Z' },
            },
        });

        restoreDraft(guestStore(), config);
        expect(restoredShippingExtensions.get()).toHaveProperty('lockers.address.locker_id', 'L-42');
    });

    it('restores an older draft without the field as before', () => {
        const store = guestStore();
        const draft = buildDraft(store, QUOTE);
        window.sessionStorage.setItem(draftKey(STORE_CODE, QUOTE), JSON.stringify(draft));
        restoredShippingExtensions.set({ stale: {} });
        restoreDraft(guestStore(), config);
        expect(restoredShippingExtensions.get()).toEqual({});
    });

    it('removes the record of an extension address with the draft of the quote', () => {
        const store = guestStore();
        const stop = startDraftPersistence(store, config);
        const key = `${OVERRIDE_KEY_PREFIX}:${STORE_CODE}:${QUOTE}`;
        window.sessionStorage.setItem(key, JSON.stringify({ fingerprint: 'x', savedAt: Date.now() }));
        window.sessionStorage.setItem(`${OVERRIDE_KEY_PREFIX}:${STORE_CODE}:another-quote`, '{}');
        discardDrafts();
        expect(window.sessionStorage.getItem(key)).toBeNull();
        expect(window.sessionStorage.getItem(`${OVERRIDE_KEY_PREFIX}:${STORE_CODE}:another-quote`)).not.toBeNull();
        stop();
    });
});
