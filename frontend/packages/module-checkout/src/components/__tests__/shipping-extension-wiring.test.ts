// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flow = {
    scheduleShippingEstimate: vi.fn(),
    estimateShippingNow: vi.fn().mockResolvedValue(undefined),
    flushShippingForm: vi.fn(),
    selectShippingMethod: vi.fn().mockResolvedValue(undefined),
};
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => flow,
}));
import type { ShippingExtensionConfig } from '../../../extension-api.js';
import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetCheckoutContextForTests } from '../../extension/context.js';
import { resetGatesForTests } from '../../extension/gates.js';
import { resetExtensionLoaderForTests, setModuleImporterForTests } from '../../extension/loader.js';
import { resetFiltersForTests } from '../../extension/request-filters.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { ShippingMethod } from '../../types/shipping.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { installShippingExtensions, resetShippingExtensionsForTests } from '../shipping-extension-host.js';
import { shippingExtensionView } from '../shipping-extension-view.js';
import '../checkout-shipping.js';
import '../shipping-method-row.js';
import type { ShippingMethodRow } from '../shipping-method-row.js';

const LOCKER: ShippingMethod = {
    carrier_code: 'locker',
    method_code: 'standard',
    carrier_title: 'Locker',
    method_title: 'Standard',
    amount: 3,
    base_amount: 3,
    available: true,
    error_message: '',
    price_excl_tax: 3,
    price_incl_tax: 3,
};

function extension(overrides: Partial<ShippingExtensionConfig>): ShippingExtensionConfig {
    return {
        id: 'vendor_locker',
        match: { carrier: 'locker', method: null },
        slot: 'below-method',
        tag: 'vendor-locker-picker',
        moduleUrl: 'https://shop.example/static/locker.js',
        kit: null,
        apiVersion: '1',
        required: true,
        sortOrder: 10,
        options: {},
        phrases: {},
        value: null,
        ...overrides,
    };
}

function installConfig(shippingExtensions: readonly ShippingExtensionConfig[]): void {
    const base = guestFixture as unknown as CheckoutConfig;
    setCheckoutConfig({ ...base, hyperion: { ...base.hyperion, shippingExtensions, extensions: [] } } as unknown as CheckoutConfig);
}

async function settle(root: Element): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
        await Promise.all(Array.from(root.querySelectorAll('*'))
            .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve()));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function mountShipping(): Promise<HTMLElement> {
    const el = document.createElement('checkout-shipping');
    document.body.appendChild(el);
    await settle(el);
    return el;
}

async function mountRow(selected: boolean): Promise<ShippingMethodRow> {
    const row = document.createElement('shipping-method-row') as ShippingMethodRow;
    row.method = LOCKER;
    row.selected = selected;
    document.body.appendChild(row);
    await row.updateComplete;
    return row;
}

describe('shipping step wiring of the extensions', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        resetFlowSelectorsForTests();
        resetCheckoutContextForTests();
        resetExtensionLoaderForTests(() => 'https://shop.example');
        setModuleImporterForTests(() => Promise.reject(new Error('not served in this test')));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(async () => {
        document.body.innerHTML = '';
        resetShippingExtensionsForTests();
        resetFiltersForTests();
        resetGatesForTests();
        setModuleImporterForTests(null);
        await new Promise((resolve) => setTimeout(resolve, 0));
        setStoreForTests(null);
        vi.restoreAllMocks();
    });

    it('without shipping extensions installs nothing, prints no host and keeps both slot outlets hidden', async () => {
        installConfig([]);
        const el = await mountShipping();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(shippingExtensionView.get()).toBeNull();
        expect(el.querySelector('shipping-extension-host')).toBeNull();
        expect(el.querySelector('[data-shipping-address-status]')).toBeNull();
        const outlets = Array.from(el.querySelectorAll('hc-slot-outlet'));
        expect(outlets.map((outlet) => outlet.getAttribute('name'))).toEqual(['after-shipping-address', 'after-shipping-methods']);
        expect(outlets.every((outlet) => (outlet as HTMLElement).hidden)).toBe(true);

        const row = await mountRow(true);
        expect(row.querySelector('shipping-extension-host')).toBeNull();
    });

    it('draws the hosts of the placements once the chunk installed its view', async () => {
        const entries = [extension({}), extension({ id: 'vendor_note', match: null, slot: 'after-methods', tag: 'vendor-note' })];
        installConfig(entries);
        installShippingExtensions(entries);
        const el = await mountShipping();
        expect(shippingExtensionView.get()).not.toBeNull();
        expect(el.querySelector('shipping-extension-host[placement="after-methods"]')).not.toBeNull();
        expect(el.querySelector('address-form')).not.toBeNull();
        expect(el.querySelector('[data-shipping-address-status]')?.textContent).toBe('');

        const selected = await mountRow(true);
        const below = selected.querySelector('shipping-extension-host[data-shipping-method-extension]');
        expect(below).not.toBeNull();
        expect(below?.closest('label')).toBeNull();
        expect(below?.getAttribute('placement')).toBe('below-method');
        const other = await mountRow(false);
        expect(other.querySelector('shipping-extension-host')).toBeNull();
    });

    it('puts the host in place of the editor while an entry that replaces the address is active', async () => {
        installConfig([extension({ slot: 'replaces-address' })]);
        installShippingExtensions([extension({ slot: 'replaces-address' })]);
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        const el = await mountShipping();
        expect(el.querySelector('shipping-extension-host[placement="replaces-address"]')).not.toBeNull();
        expect(el.querySelector('address-form')).toBeNull();
    });

    it('shows the address an extension put in place of the typed one read only and announces it', async () => {
        installConfig([extension({})]);
        installShippingExtensions([extension({})]);
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        store.shippingAddressOverride.set({
            extensionId: 'vendor_locker',
            address: {
                firstname: 'Locker',
                lastname: 'L1',
                street: ['1 Station Road'],
                city: 'Calder',
                postcode: '49629',
                country_id: 'US',
                region_id: '33',
                telephone: '5552293326',
            },
            keepContact: false,
            separateBilling: false,
        });
        const el = await mountShipping();
        expect(el.querySelector('address-form')).toBeNull();
        expect(el.querySelector('[data-shipping-address-replaced] address-card')).not.toBeNull();
        expect(el.querySelector('[data-shipping-address-status]')?.textContent).not.toBe('');
    });
});
