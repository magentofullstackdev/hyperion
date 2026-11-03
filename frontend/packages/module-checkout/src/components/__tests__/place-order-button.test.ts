// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const placeOrder = vi.fn().mockResolvedValue(null);
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ placeOrder }),
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { expectedAgreements } from '../../store/selectors.js';
import { resetValidationRequestsForTests } from '../../store/validation-request.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests, t } from '../../utils/i18n.js';
import '../address-form.js';
import '../place-order-button.js';
import type { AddressForm } from '../address-form.js';
import type { PlaceOrderButton } from '../place-order-button.js';

const FLATRATE = {
    carrier_code: 'flatrate',
    method_code: 'flatrate',
    carrier_title: 'Flat Rate',
    method_title: 'Fixed',
    amount: 5,
    base_amount: 5,
    available: true,
    error_message: '',
    price_excl_tax: 5,
    price_incl_tax: 5,
};

async function settle(root: Element): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
        await Promise.all(
            Array.from(root.querySelectorAll('place-order-button, address-form, hc-text-input, hc-select-input, hc-button'))
                .map((child) => (child as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve())
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

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
};

function openGate(store: Store): void {
    store.email.set('ok@example.com');
    store.shippingAddress.set(ADDRESS);
    store.availableShippingMethods.set([FLATRATE]);
    store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
    store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
    store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
    store.selectedPaymentMethod.set('checkmo');
    store.totals.set({ grand_total: '57.00', total_segments: [] } as never);
}

describe('<place-order-button> while the order cannot be placed', () => {
    let store: Store;
    let wrapper: HTMLElement;

    beforeEach(() => {
        placeOrder.mockClear();
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        resetFlowSelectorsForTests();
        resetValidationRequestsForTests();
        expectedAgreements.set([]);
        store = createStore();
        setStoreForTests(store);
        wrapper = document.createElement('div');
        document.body.appendChild(wrapper);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
        resetFlowSelectorsForTests();
    });

    async function mountAll(formValue: Address | null = null): Promise<PlaceOrderButton> {
        const form = document.createElement('address-form') as AddressForm;
        if (formValue) form.value = formValue;
        wrapper.appendChild(form);
        const button = document.createElement('place-order-button') as PlaceOrderButton;
        wrapper.appendChild(button);
        await settle(wrapper);
        return button;
    }

    it('renders a real button that is aria-disabled, not disabled, so it stays reachable', async () => {
        const el = await mountAll();
        const native = el.querySelector<HTMLButtonElement>('button')!;
        expect(native.getAttribute('aria-disabled')).toBe('true');
        expect(native.hasAttribute('disabled')).toBe(false);
        expect(native.type).toBe('button');
        expect(el.querySelector('[data-place-order-hint]')).toBeNull();
    });

    it('a press reveals every pending error, names the missing piece and focuses the first invalid field, without placing', async () => {
        const el = await mountAll();
        expect(wrapper.querySelector('[aria-invalid="true"]')).toBeNull();

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(placeOrder).not.toHaveBeenCalled();
        expect(store.fieldErrors.get()['email']).toBe(t('Hyperion_Checkout::validation_required'));
        const hint = el.querySelector('[data-place-order-hint]');
        expect(hint?.textContent?.trim()).toBe(t('Hyperion_Checkout::checkout_incomplete_email'));
        const firstname = wrapper.querySelector<HTMLInputElement>('input[name="firstname"]')!;
        expect(firstname.getAttribute('aria-invalid')).toBe('true');
        expect(firstname.nextElementSibling?.textContent?.trim()).toBe(t('Hyperion_Checkout::validation_required'));
        expect(document.activeElement).toBe(firstname);
    });

    it('names the shipping method when the address is fine and the rates were never confirmed', async () => {
        openGate(store);
        store.appliedShippingMethod.set(null);
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(placeOrder).not.toHaveBeenCalled();
        expect(el.querySelector('[data-place-order-hint]')?.textContent?.trim())
            .toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
        // Nothing is invalid in the form: the hint itself takes the focus.
        expect(document.activeElement).toBe(el.querySelector('[data-place-order-hint]'));
    });

    it('names the payment method, then clears the hint and the aria state once the gate opens, and places on the next press', async () => {
        openGate(store);
        store.selectedPaymentMethod.set(null);
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);
        expect(el.querySelector('[data-place-order-hint]')?.textContent?.trim())
            .toBe(t('Hyperion_Checkout::checkout_incomplete_payment_method'));

        store.selectedPaymentMethod.set('checkmo');
        await settle(wrapper);
        expect(el.querySelector('[data-place-order-hint]')).toBeNull();
        expect(el.querySelector('button')!.hasAttribute('aria-disabled')).toBe(false);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);
        expect(placeOrder).toHaveBeenCalledTimes(1);
    });
});
