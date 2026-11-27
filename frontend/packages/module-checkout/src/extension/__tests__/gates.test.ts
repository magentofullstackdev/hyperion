// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStore, type Store } from '../../store/index.js';
import { placeOrderBlocker, placeOrderHint } from '../../store/place-order-hint.js';
import { createSelectors } from '../../store/selectors.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import {
    extensionGateMessage,
    extensionsSettled,
    refreshGates,
    registerCheckoutGate,
    resetGatesForTests,
    setExtensionsPending,
    shippingExtensionsValid,
} from '../gates.js';

type Selectors = ReturnType<typeof createSelectors>;

/** Selectors of a checkout where nothing built in is missing. */
function openSelectors(): Selectors {
    const names = ['emailValid', 'shippingAddressValid', 'billingAddressValid', 'billingReady', 'shippingMethodSelected',
        'shippingReady', 'paymentMethodSelected', 'paymentMethodReady', 'agreementsAccepted'];
    return Object.fromEntries(names.map((name) => [name, { get: () => true }])) as unknown as Selectors;
}

describe('extension gates', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests({
            'Hyperion_Checkout::extension_gate_failed': 'A part of the checkout could not check your order.',
            'Hyperion_Checkout::extension_blocked': 'Your order cannot be placed yet.',
        });
        resetGatesForTests();
        store = createStore();
        store.totals.set({ grand_total: 10 } as never);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        resetGatesForTests();
        vi.restoreAllMocks();
    });

    it('blocks nothing while no gate is registered', () => {
        expect(extensionGateMessage()).toBeNull();
        expect(placeOrderBlocker(store, openSelectors())).toBeNull();
    });

    it('joins the single gate last, with the message of the first gate that blocks', () => {
        const first = registerCheckoutGate('first');
        const second = registerCheckoutGate('second');
        second.set('Enter your fiscal code.');
        expect(placeOrderBlocker(store, openSelectors())).toBe('extension');
        expect(placeOrderHint(store, openSelectors())).toBe('Enter your fiscal code.');
        first.set('Choose a delivery date.');
        expect(placeOrderHint(store, openSelectors())).toBe('Choose a delivery date.');
        first.remove();
        second.set(null);
        expect(placeOrderHint(store, openSelectors())).toBeNull();
    });

    it('comes after the built-in checks', () => {
        registerCheckoutGate('vat').set('Check your VAT number.');
        store.totals.set(null);
        expect(placeOrderBlocker(store, openSelectors())).toBe('totals');
    });

    it('reads the shipping extensions first', () => {
        registerCheckoutGate('vat').set('Check your VAT number.');
        shippingExtensionsValid.set('Choose a pickup point.');
        expect(extensionGateMessage()).toBe('Choose a pickup point.');
    });

    it('evaluates gate functions again on refresh, a throw counting as blocking', () => {
        let reason: string | null = 'Not yet.';
        const gate = registerCheckoutGate('fn', () => reason);
        expect(extensionGateMessage()).toBe('Not yet.');
        reason = null;
        expect(extensionGateMessage()).toBe('Not yet.');
        refreshGates();
        expect(extensionGateMessage()).toBeNull();
        registerCheckoutGate('broken', () => { throw new Error('boom'); });
        expect(extensionGateMessage()).toBe('A part of the checkout could not check your order.');
        gate.refresh();
    });

    it('keeps canPlaceOrder closed while a gate blocks', () => {
        const selectors = createSelectors(store);
        const gate = registerCheckoutGate('vat');
        gate.set('Check your VAT number.');
        expect(selectors.canPlaceOrderIgnoringLatch.get()).toBe(false);
    });

    it('tells the order what to wait for while modules load', async () => {
        expect(extensionsSettled()).toBeNull();
        let done: () => void = () => undefined;
        setExtensionsPending(new Promise<void>((resolve) => { done = resolve; }));
        const waiting = extensionsSettled();
        expect(waiting).not.toBeNull();
        done();
        await waiting;
        expect(extensionsSettled()).toBeNull();
        setExtensionsPending(Promise.reject(new Error('chunk')));
        await expect(extensionsSettled()).resolves.toBeUndefined();
    });
});
