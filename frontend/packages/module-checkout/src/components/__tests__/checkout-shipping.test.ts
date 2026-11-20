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

import customerFixture from '../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-shipping.js';
import type { CheckoutShipping } from '../checkout-shipping.js';

async function settle(root: Element): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
        await Promise.all(
            Array.from(root.querySelectorAll('*'))
                .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve())
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function mount(): Promise<CheckoutShipping> {
    const el = document.createElement('checkout-shipping') as CheckoutShipping;
    document.body.appendChild(el);
    await el.updateComplete;
    await settle(el);
    return el;
}

describe('<checkout-shipping> address step', () => {
    let store: Store;

    beforeEach(() => {
        for (const fn of Object.values(flow)) fn.mockClear();
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(customerFixture as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('gives a guest the bare form, without a nested section landmark, with the status of the address block', async () => {
        const el = await mount();
        expect(el.querySelector('address-selector')).toBeNull();
        expect(el.querySelector('address-form')).not.toBeNull();
        expect(el.querySelector('section')).toBeNull();
        expect(el.querySelector('hc-section-status')?.getAttribute('section')).toBe('shipping-address');
    });

    it('gives a customer without saved addresses the selector, whose form starts with the account name', async () => {
        store.isGuest.set(false);
        store.customer.set({ ...(customerFixture as unknown as CheckoutConfig).customerData, firstname: 'Veronica', lastname: 'Costello' } as never);
        store.savedAddresses.set([]);
        const el = await mount();
        expect(el.querySelector('address-selector')).not.toBeNull();
        expect(el.querySelector<HTMLInputElement>('input[name="firstname"]')?.value).toBe('Veronica');
        expect(el.querySelector('hc-checkbox[name="save_in_address_book"]')).not.toBeNull();
        expect(store.shippingAddress.get()?.save_in_address_book).toBe(true);
    });

    it('saves the form of the saved address step when the focus leaves the step', async () => {
        store.isGuest.set(false);
        store.customer.set({ ...(customerFixture as unknown as CheckoutConfig).customerData, firstname: 'Veronica', lastname: 'Costello' } as never);
        store.savedAddresses.set([]);
        const el = await mount();
        const selector = el.querySelector('address-selector')!;
        const inputs = selector.querySelectorAll('input');
        inputs[0]!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: inputs[1]! }));
        expect(flow.flushShippingForm).not.toHaveBeenCalled();
        inputs[0]!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        expect(flow.flushShippingForm).toHaveBeenCalledTimes(1);
    });
});
