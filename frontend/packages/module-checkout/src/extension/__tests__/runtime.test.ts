// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutExtensionApi, CheckoutExtensionConfig } from '../../../extension-api.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { resetCheckoutContextForTests } from '../context.js';
import { applyFilters } from '../filters.js';
import { extensionGateMessage, resetGatesForTests } from '../gates.js';
import { IMPORT_TIMEOUT_MS, registerBuiltinModule, resetExtensionLoaderForTests, setModuleImporterForTests } from '../loader.js';
import { resetFiltersForTests } from '../request-filters.js';
import { resetRuntimeForTests, startExtensions } from '../runtime.js';
import { registeredSlots, resetSlotsForTests } from '../slots.js';

const ORIGIN = 'https://shop.example';

function entry(overrides: Partial<CheckoutExtensionConfig>): CheckoutExtensionConfig {
    return {
        name: 'vendor_vat_check',
        moduleUrl: `${ORIGIN}/static/Vendor_Vat/js/hyperion/vat-check.js`,
        builtin: null,
        apiVersion: '1',
        required: false,
        slots: [],
        options: { mode: 'strict' },
        phrases: {},
        ...overrides,
    };
}

describe('generic extension runtime', () => {
    beforeEach(() => {
        setActiveCatalogForTests({ 'Hyperion_Checkout::extension_required_failed': 'A required part of the checkout could not be loaded. Reload the page.' });
        setCheckoutConfig({ storeCode: 'default', hyperion: { enabled: true, extensionApi: '1.0-beta' } } as unknown as CheckoutConfig);
        setStoreForTests(createStore());
        resetFlowSelectorsForTests();
        resetCheckoutContextForTests();
        resetExtensionLoaderForTests(() => ORIGIN);
        resetGatesForTests();
        resetSlotsForTests();
        resetFiltersForTests();
        resetRuntimeForTests();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        setModuleImporterForTests(null);
        resetGatesForTests();
        resetFiltersForTests();
        resetRuntimeForTests();
        vi.restoreAllMocks();
    });

    it('calls the default export with the API of the entry', async () => {
        let api: CheckoutExtensionApi | null = null;
        setModuleImporterForTests(() => Promise.resolve({ hyperionApi: '1', default: (given: CheckoutExtensionApi) => { api = given; } }));
        await startExtensions([entry({})]);
        expect(api!.name).toBe('vendor_vat_check');
        expect(api!.apiVersion).toBe('1.0-beta');
        expect(api!.options).toEqual({ mode: 'strict' });
        expect(Object.isFrozen(api)).toBe(true);
        expect(typeof api!.context.snapshot().isSettling).toBe('boolean');
    });

    it('registers the declared slots before the module loads', async () => {
        let slotsWhenLoading: number | null = null;
        setModuleImporterForTests(() => {
            slotsWhenLoading = registeredSlots('after-shipping-address').length;
            return Promise.resolve({ hyperionApi: '1', default: () => undefined });
        });
        await startExtensions([entry({ slots: [{ slot: 'after-shipping-address', tag: 'vendor-vat-notice', sortOrder: 5 }] })]);
        expect(slotsWhenLoading).toBe(1);
        expect(registeredSlots('after-shipping-address')[0]).toMatchObject({ tag: 'vendor-vat-notice', owner: 'vendor_vat_check', sortOrder: 5 });
    });

    it('blocks the order when a required module fails, and ignores an optional one', async () => {
        setModuleImporterForTests(() => Promise.reject(new Error('404')));
        await startExtensions([entry({ required: false })]);
        expect(extensionGateMessage()).toBeNull();
        await startExtensions([entry({ name: 'vendor_required', moduleUrl: `${ORIGIN}/required.js`, required: true })]);
        expect(extensionGateMessage()).toBe('A required part of the checkout could not be loaded. Reload the page.');
        expect(vi.mocked(console.error).mock.calls.some((call) => String(call[0]).includes('vendor_required'))).toBe(true);
    });

    it('a required module that never loads closes the gate after the time limit, an optional one is left out', async () => {
        vi.useFakeTimers();
        setModuleImporterForTests(() => new Promise(() => undefined));
        const optional = startExtensions([entry({ name: 'vendor_optional', required: false })]);
        await vi.advanceTimersByTimeAsync(2000 + IMPORT_TIMEOUT_MS + 1);
        await optional;
        expect(extensionGateMessage()).toBeNull();

        const required = startExtensions([entry({ name: 'vendor_required', moduleUrl: `${ORIGIN}/static/Vendor_Vat/js/other.js`, required: true })]);
        await vi.advanceTimersByTimeAsync(2000 + IMPORT_TIMEOUT_MS + 1);
        await required;
        expect(extensionGateMessage()).toBe('A required part of the checkout could not be loaded. Reload the page.');
        vi.useRealTimers();
    });

    it('refuses a module written for another major or without a default export', async () => {
        const start = vi.fn();
        setModuleImporterForTests((url) => Promise.resolve(url.endsWith('two.js')
            ? { hyperionApi: '2', default: start }
            : { hyperionApi: '1' }));
        await startExtensions([
            entry({ name: 'two', moduleUrl: `${ORIGIN}/two.js`, required: true }),
            entry({ name: 'none', moduleUrl: `${ORIGIN}/none.js` }),
        ]);
        expect(start).not.toHaveBeenCalled();
        expect(extensionGateMessage()).not.toBeNull();
    });

    it('counts a default export that throws as a failed module', async () => {
        setModuleImporterForTests(() => Promise.resolve({ hyperionApi: '1', default: () => { throw new Error('boom'); } }));
        await startExtensions([entry({ required: true })]);
        expect(extensionGateMessage()).not.toBeNull();
    });

    it('loads a first-party entry through its builtin resolver', async () => {
        const start = vi.fn();
        registerBuiltinModule('order_comment', () => Promise.resolve({ hyperionApi: '1', default: start }));
        await startExtensions([entry({ name: 'hyperion_order_comment', moduleUrl: null, builtin: 'order_comment' })]);
        expect(start).toHaveBeenCalledTimes(1);
    });

    it('gives the module filters and gates through its API', async () => {
        setModuleImporterForTests(() => Promise.resolve({
            hyperionApi: '1',
            default: (api: CheckoutExtensionApi) => {
                api.filter('paymentInformation', (body) => ({ ...body, email: 'kept@example.com', extra: 1 } as typeof body));
                api.registerGate((snapshot) => (snapshot.paymentMethod === null ? 'Choose a payment method first.' : null));
            },
        }));
        await startExtensions([entry({})]);
        expect(applyFilters('paymentInformation', { paymentMethod: { method: 'checkmo' } })).toEqual({
            paymentMethod: { method: 'checkmo' },
            extra: 1,
            email: 'kept@example.com',
        });
        expect(extensionGateMessage()).toBe('Choose a payment method first.');
    });
});
