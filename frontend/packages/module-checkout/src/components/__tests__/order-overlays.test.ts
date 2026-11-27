// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));

import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { navigateTo } from '../../utils/navigate.js';
import { loadOrderOverlays, setOverlayImporterForTests } from '../order-overlays.js';

async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('the order overlays', () => {
    let store: Store;
    let calls: number;

    beforeEach(() => {
        setCheckoutConfig({ hyperion: { loginUrl: 'https://shop.example/customer/account/login/referer/abc/' } } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        calls = 0;
        vi.mocked(navigateTo).mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        setOverlayImporterForTests(null);
        vi.restoreAllMocks();
    });

    const failing = (): Promise<unknown> => {
        calls += 1;
        return Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    };

    it('tries a failed load once more at once', async () => {
        setOverlayImporterForTests(() => (calls++ === 0 ? Promise.reject(new TypeError('offline')) : Promise.resolve({})));
        loadOrderOverlays();
        await flush();
        expect(calls).toBe(2);
    });

    it('tries again when an order starts while the chunk is missing', async () => {
        setOverlayImporterForTests(failing);
        loadOrderOverlays();
        await flush();
        expect(calls).toBe(2);

        store.isPlacingOrder.set(true);
        await flush();
        expect(calls).toBe(3);
        expect(navigateTo).not.toHaveBeenCalled();
    });

    it('sends the shopper of an ended session to the sign in page when the dialog still cannot load', async () => {
        setOverlayImporterForTests(failing);
        loadOrderOverlays();
        await flush();

        store.sessionExpired.set(true);
        await flush();
        expect(calls).toBe(3);
        expect(navigateTo).toHaveBeenCalledWith('https://shop.example/customer/account/login/referer/abc/');
    });

    it('defines the overlay and the dialog, and then an ended session shows the dialog in place', async () => {
        loadOrderOverlays();
        await vi.waitFor(() => expect(customElements.get('hc-session-expired')).toBeDefined());
        expect(customElements.get('loading-overlay')).toBeDefined();

        store.sessionExpired.set(true);
        await flush();
        expect(navigateTo).not.toHaveBeenCalled();
    });
});
