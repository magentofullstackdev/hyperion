// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({
        invalidateBillingSync: vi.fn(),
        syncBillingAddress: vi.fn().mockResolvedValue(undefined),
        scheduleBillingSync: vi.fn(),
    }),
}));
vi.mock('../payment-method-list.js', () => ({}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { createSelectors } from '../../store/selectors.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-payment.js';

const TYPED: Address = {
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['6146 Honey Bluff Parkway'],
    city: 'Calder',
    postcode: '49628',
    country_id: 'US',
    region_id: '33',
    telephone: '5552293326',
};

async function settle(root: Element): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
        await Promise.all(Array.from(root.querySelectorAll('*'))
            .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve()));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe('<checkout-payment> while a shipping extension asks for a billing address of its own', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.shippingAddress.set(TYPED);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('hides the checkbox, shows the billing editor and requires a billing address, then gives the shopper\'s choice back', async () => {
        const selectors = createSelectors(store);
        const el = document.createElement('checkout-payment');
        document.body.appendChild(el);
        await settle(el);
        expect(el.querySelector('hc-checkbox[name="billing_same_as_shipping"]')).not.toBeNull();
        expect(el.querySelector('address-form[mode="billing"]')).toBeNull();
        expect(selectors.billingAddressValid.get()).toBe(true);

        store.shippingAddressOverride.set({
            extensionId: 'vendor_locker',
            address: { ...TYPED, street: ['1 Station Road'] },
            keepContact: true,
            separateBilling: true,
        });
        await settle(el);
        expect(el.querySelector('hc-checkbox[name="billing_same_as_shipping"]')).toBeNull();
        expect(el.querySelector('address-form[mode="billing"]')).not.toBeNull();
        expect(store.billingSameAsShipping.get()).toBe(true);
        expect(selectors.billingAddressValid.get()).toBe(false);

        store.shippingAddressOverride.set(null);
        await settle(el);
        const box = el.querySelector('hc-checkbox[name="billing_same_as_shipping"]') as (HTMLElement & { checked: boolean }) | null;
        expect(box?.checked).toBe(true);
        expect(el.querySelector('address-form[mode="billing"]')).toBeNull();
        expect(selectors.billingAddressValid.get()).toBe(true);
    });
});
