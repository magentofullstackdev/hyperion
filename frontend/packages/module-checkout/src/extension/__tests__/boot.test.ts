// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStore, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { EXTENSIONS_START_LIMIT_MS, startExtensions } from '../boot.js';
import { extensionGateMessage, extensionsSettled, resetGatesForTests } from '../gates.js';

const MESSAGE = 'A required part of the checkout could not be loaded. Reload the page.';

function config(required: boolean): CheckoutConfig {
    return {
        hyperion: {
            extensionApi: '1.0-beta',
            extensions: [{ name: 'vendor_vat', moduleUrl: null, builtin: 'x', apiVersion: '1', required, slots: [], options: {}, phrases: {} }],
        },
    } as unknown as CheckoutConfig;
}

describe('the start of the generic extensions', () => {
    let store: Store;

    beforeEach(() => {
        vi.useFakeTimers();
        setActiveCatalogForTests({ 'Hyperion_Checkout::extension_required_failed': MESSAGE });
        resetGatesForTests();
        store = createStore();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        resetGatesForTests();
    });

    it('never makes the order wait longer than the limit, and a late required module closes the gate until it is there', async () => {
        let arrive: (runtime: never) => void = () => undefined;
        const runtime = new Promise<never>((resolve) => { arrive = resolve; });
        startExtensions(config(true), store, () => Promise.resolve(), () => runtime);
        const waiting = extensionsSettled();
        expect(waiting).not.toBeNull();

        await vi.advanceTimersByTimeAsync(EXTENSIONS_START_LIMIT_MS + 1);
        await waiting;
        expect(extensionsSettled()).toBeNull();
        expect(extensionGateMessage()).toBe(MESSAGE);

        arrive({ startExtensions: async () => undefined } as never);
        await vi.advanceTimersByTimeAsync(0);
        expect(extensionGateMessage()).toBeNull();
    });

    it('an optional module that is late is left out without a gate', async () => {
        startExtensions(config(false), store, () => Promise.resolve(), () => new Promise<never>(() => undefined));
        await vi.advanceTimersByTimeAsync(EXTENSIONS_START_LIMIT_MS + 1);
        expect(extensionsSettled()).toBeNull();
        expect(extensionGateMessage()).toBeNull();
    });
});
