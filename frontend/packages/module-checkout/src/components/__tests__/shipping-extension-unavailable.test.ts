// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const attempts = vi.hoisted(() => ({ count: 0 }));
vi.mock('../shipping-extension-host.js', () => {
    attempts.count += 1;
    throw new Error('blocked by the network');
});
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ scheduleShippingEstimate: vi.fn(), estimateShippingNow: vi.fn(), flushShippingForm: vi.fn() }),
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetGatesForTests, shippingExtensionsValid } from '../../extension/gates.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests, t } from '../../utils/i18n.js';
import { configHoldsSave } from '../shipping-extension-view.js';
import '../checkout-shipping.js';

function configure(shippingExtensions: unknown[]): void {
    const base = guestFixture as unknown as CheckoutConfig;
    setCheckoutConfig({ ...base, hyperion: { ...base.hyperion, shippingExtensions } } as unknown as CheckoutConfig);
}

const required = (match: unknown): Record<string, unknown> => ({ id: 'x', match, slot: 'below-method', required: true });

describe('shipping extensions without their chunk', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        resetGatesForTests();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        resetGatesForTests();
        setStoreForTests(null);
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('holds only the rates a required entry may apply to; a pattern counts as applying', () => {
        const locker = { carrier_code: 'locker', method_code: 'standard' };
        const flat = { carrier_code: 'flatrate', method_code: 'flatrate' };
        configure([required({ carrier: 'locker', method: null })]);
        expect(configHoldsSave(locker)).toBe(true);
        expect(configHoldsSave(flat)).toBe(false);
        configure([required({ carrier: '/lock.+/', method: '*' })]);
        expect(configHoldsSave(flat)).toBe(true);
        configure([required(null)]);
        expect(configHoldsSave(flat)).toBe(true);
        configure([{ ...required({ carrier: 'locker', method: null }), required: false }]);
        expect(configHoldsSave(locker)).toBe(false);
    });

    it('tries the import once more, then says on Place Order that the delivery option could not be loaded, for the held rate only', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        configure([required({ carrier: 'locker', method: null })]);
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        const before = attempts.count;
        document.body.appendChild(document.createElement('checkout-shipping'));
        await vi.advanceTimersByTimeAsync(1000);
        await vi.runAllTimersAsync();
        expect(attempts.count - before).toBeGreaterThanOrEqual(1);
        expect(console.error).toHaveBeenCalledWith('[hyperion-checkout] the shipping extensions could not be loaded', expect.anything());
        expect(shippingExtensionsValid.get()).toBe(t('Hyperion_Checkout::shipping_extension_failed'));

        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await vi.runAllTimersAsync();
        expect(shippingExtensionsValid.get()).toBeNull();
    });
});
