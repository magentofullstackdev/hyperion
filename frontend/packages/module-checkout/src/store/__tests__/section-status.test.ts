// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutError } from '../../api/error-kinds.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { clearFailure, failureMessage, reportFailure } from '../section-status.js';

const NETWORK: CheckoutError = { kind: 'network', message: 'We could not reach the store. Please try again.' };
const STOCK: CheckoutError = { kind: 'stock', message: 'Not enough items for sale', httpStatus: 400, rawMessage: 'Not enough items for sale' };

describe('section status', () => {
    let store: Store;

    beforeEach(() => {
        store = createStore();
        setStoreForTests(store);
    });

    it('starts with no status in any section', () => {
        expect(Object.values(store.sectionStatus.get()).every((status) => status === null)).toBe(true);
    });

    it('reportFailure writes kind, message, source and retry for the section, and nothing else of the error', () => {
        const retry = vi.fn();

        reportFailure('shipping-methods', STOCK, { retry, source: 'background' });

        expect(store.sectionStatus.get()['shipping-methods']).toEqual({
            kind: 'stock',
            message: 'Not enough items for sale',
            source: 'background',
            retry,
        });
        store.sectionStatus.get()['shipping-methods']?.retry?.();
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it('a failure without a retry has no retry member', () => {
        reportFailure('coupon', NETWORK, { source: 'action' });

        const status = store.sectionStatus.get().coupon;
        expect(status).toEqual({ kind: 'network', message: NETWORK.message, source: 'action' });
        expect(status && 'retry' in status).toBe(false);
    });

    it('leaves the other sections as they were and replaces the map object', () => {
        const before = store.sectionStatus.get();
        reportFailure('billing', NETWORK, { source: 'background' });
        reportFailure('payment', STOCK, { source: 'action' });

        const after = store.sectionStatus.get();
        expect(after).not.toBe(before);
        expect(after.billing?.kind).toBe('network');
        expect(after.payment?.kind).toBe('stock');
        expect(after.order).toBeNull();
        expect(before.billing).toBeNull();
    });

    it('a newer failure of the same section replaces the older one', () => {
        reportFailure('order', NETWORK, { retry: vi.fn(), source: 'action' });
        reportFailure('order', STOCK, { source: 'action' });

        expect(store.sectionStatus.get().order).toEqual({ kind: 'stock', message: STOCK.message, source: 'action' });
    });

    it('clearFailure removes the status of its section only', () => {
        reportFailure('shipping-address', NETWORK, { source: 'background' });
        reportFailure('gift', NETWORK, { source: 'action' });

        clearFailure('shipping-address');

        expect(store.sectionStatus.get()['shipping-address']).toBeNull();
        expect(store.sectionStatus.get().gift?.kind).toBe('network');
    });

    it('clearFailure on a section without a status does not write the signal', () => {
        const before = store.sectionStatus.get();

        clearFailure('contact');

        expect(store.sectionStatus.get()).toBe(before);
    });

    it('acts on the store installed at call time', () => {
        const other = createStore();
        setStoreForTests(other);

        reportFailure('contact', NETWORK, { source: 'action' });

        expect(other.sectionStatus.get().contact?.kind).toBe('network');
        expect(store.sectionStatus.get().contact).toBeNull();
    });

    it('failureMessage gives the message of the first named section that shows a failure', () => {
        expect(failureMessage('billing', 'shipping-methods')).toBeNull();

        reportFailure('shipping-methods', { kind: 'validation', message: 'Invalid VAT' }, { source: 'background' });
        reportFailure('coupon', { kind: 'network', message: 'Coupon failed' }, { source: 'action' });

        expect(failureMessage('billing', 'shipping-methods')).toBe('Invalid VAT');
        expect(failureMessage('billing')).toBeNull();
    });

    it('failureMessage without a section looks at all of them', () => {
        expect(failureMessage()).toBeNull();

        reportFailure('gift', { kind: 'network', message: 'Gift failed' }, { source: 'action' });

        expect(failureMessage()).toBe('Gift failed');
    });
});
