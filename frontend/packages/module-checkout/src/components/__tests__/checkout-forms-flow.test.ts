// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flow = {
    scheduleShippingEstimate: vi.fn(),
    estimateShippingNow: vi.fn().mockResolvedValue(undefined),
    flushShippingForm: vi.fn(),
    selectShippingMethod: vi.fn().mockResolvedValue(undefined),
    invalidateBillingSync: vi.fn(),
    syncBillingAddress: vi.fn().mockResolvedValue(undefined),
    scheduleBillingSync: vi.fn(),
    savePaymentMethod: vi.fn(),
};
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => flow,
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-shipping.js';
import '../checkout-payment.js';
import type { CheckoutShipping } from '../checkout-shipping.js';
import type { CheckoutPayment } from '../checkout-payment.js';

const ADDRESS: Address = {
    country_id: 'US',
    city: 'Calder',
    firstname: 'Veronica',
    lastname: 'Costello',
    telephone: '555',
    postcode: '49628',
    street: ['6146 Honey Bluff Parkway'],
    region_id: '33',
    region: { region: 'Michigan', region_code: 'MI', region_id: 33 },
    save_in_address_book: false,
};

async function settle(root: Element): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
        await Promise.all(
            Array.from(root.querySelectorAll('*'))
                .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve())
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe('checkout forms and the flow', () => {
    let store: Store;

    beforeEach(() => {
        for (const fn of Object.values(flow)) fn.mockClear();
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.shippingAddress.set(ADDRESS);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    describe('<checkout-shipping>', () => {
        async function mount(): Promise<CheckoutShipping> {
            const el = document.createElement('checkout-shipping') as CheckoutShipping;
            document.body.appendChild(el);
            await settle(el);
            for (const fn of Object.values(flow)) fn.mockClear();
            return el;
        }

        const edit = (el: Element, address: Address): void => {
            el.querySelector('address-form')!.dispatchEvent(new CustomEvent('address-change', { detail: address }));
        };

        it('an edit stores the address and lets the flow decide after the typing pause', async () => {
            const el = await mount();
            const next = { ...ADDRESS, telephone: '5551' };

            edit(el, next);

            expect(store.shippingAddress.get()).toBe(next);
            expect(flow.scheduleShippingEstimate).toHaveBeenCalledTimes(1);
            expect(flow.estimateShippingNow).not.toHaveBeenCalled();
        });

        it('another country is a pick, not typing: the flow starts at once', async () => {
            const el = await mount();

            edit(el, { ...ADDRESS, country_id: 'CA', region_id: '', region: {} });

            expect(flow.estimateShippingNow).toHaveBeenCalledTimes(1);
            expect(flow.scheduleShippingEstimate).not.toHaveBeenCalled();
        });

        it('the focus leaving the address form saves it; moving between its fields does not', async () => {
            const el = await mount();
            const form = el.querySelector('address-form')!;
            const inside = form.querySelector('input')!;
            const outside = document.createElement('button');
            document.body.appendChild(outside);

            inside.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: form.querySelectorAll('input')[1]! }));
            expect(flow.flushShippingForm).not.toHaveBeenCalled();

            inside.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
            expect(flow.flushShippingForm).toHaveBeenCalledTimes(1);

            // The focus left the document (another window): saved too.
            inside.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
            expect(flow.flushShippingForm).toHaveBeenCalledTimes(2);
        });

        it('a rate click goes to the flow, which selects, projects the totals and saves', async () => {
            store.availableShippingMethods.set([{
                carrier_code: 'flatrate', method_code: 'flatrate', carrier_title: 'Flat Rate', method_title: 'Fixed',
                amount: 5, base_amount: 5, available: true, error_message: '', price_excl_tax: 5, price_incl_tax: 5,
            }]);
            store.estimateState.set('ready');
            const el = await mount();

            el.querySelector('shipping-method-row')!.dispatchEvent(
                new CustomEvent('method-select', { detail: { carrier_code: 'flatrate', method_code: 'flatrate' } })
            );

            expect(flow.selectShippingMethod).toHaveBeenCalledWith({ carrier_code: 'flatrate', method_code: 'flatrate' });
            // The component leaves the selection to the flow.
            expect(store.selectedShippingMethod.get()).toBeNull();
        });
    });

    describe('<checkout-payment>', () => {
        async function mount(): Promise<CheckoutPayment> {
            const el = document.createElement('checkout-payment') as CheckoutPayment;
            document.body.appendChild(el);
            await settle(el);
            for (const fn of Object.values(flow)) fn.mockClear();
            return el;
        }

        const toggle = (el: Element, checked: boolean): void => {
            el.querySelector('hc-checkbox')!.dispatchEvent(new CustomEvent('value-change', { detail: { checked } }));
        };

        it('unticking and ticking "same as shipping" both invalidate what the quote carries and save at once', async () => {
            const el = await mount();

            toggle(el, false);
            expect(store.billingSameAsShipping.get()).toBe(false);
            expect(flow.invalidateBillingSync).toHaveBeenCalledTimes(1);
            expect(flow.syncBillingAddress).toHaveBeenCalledTimes(1);

            toggle(el, true);
            expect(store.billingSameAsShipping.get()).toBe(true);
            expect(flow.invalidateBillingSync).toHaveBeenCalledTimes(2);
            expect(flow.syncBillingAddress).toHaveBeenCalledTimes(2);
        });

        it('typing in the billing form marks it as ahead of the quote and saves after the pause the flow owns', async () => {
            store.billingSameAsShipping.set(false);
            const el = await mount();
            const next = { ...ADDRESS, city: 'Detroit' };

            el.querySelector('address-form')!.dispatchEvent(new CustomEvent('address-change', { detail: next }));

            expect(store.billingAddress.get()).toBe(next);
            expect(flow.invalidateBillingSync).toHaveBeenCalledTimes(1);
            expect(flow.scheduleBillingSync).toHaveBeenCalledTimes(1);
            expect(flow.syncBillingAddress).not.toHaveBeenCalled();
        });
    });
});
