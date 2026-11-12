// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const placeOrder = vi.fn().mockResolvedValue(null);
const settleShipping = vi.fn().mockResolvedValue(undefined);
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ placeOrder, settleShipping }),
}));
vi.mock('../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));

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
import { navigateTo } from '../../utils/navigate.js';
import { getCheckoutBlocker } from '../payment-renderers/checkout-gate.js';
import { getPaymentRenderer } from '../payment-renderers/registry.js';
import '../payment-renderers/payment-offline.js';
import '../address-form.js';
import '../place-order-button.js';
import type { AddressForm } from '../address-form.js';
import { placeOrderHint, type PlaceOrderButton } from '../place-order-button.js';
import { initFlowSelectors } from '../../store/flow-selectors.js';

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
        placeOrder.mockReset();
        placeOrder.mockResolvedValue(null);
        settleShipping.mockReset();
        settleShipping.mockResolvedValue(undefined);
        vi.mocked(navigateTo).mockClear();
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

    it('a press while the shipping form is ahead of the quote settles the pending work first, then places against what was confirmed', async () => {
        openGate(store);
        store.shippingDirty.set(true);
        settleShipping.mockImplementation(async () => {
            expect(placeOrder).not.toHaveBeenCalled();
            store.shippingDirty.set(false);
        });
        placeOrder.mockResolvedValue(15);
        const el = await mountAll(ADDRESS);
        expect(el.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(settleShipping).toHaveBeenCalledTimes(1);
        expect(placeOrder).toHaveBeenCalledTimes(1);
        expect(navigateTo).toHaveBeenCalledTimes(1);
        expect(el.querySelector('[data-place-order-hint]')).toBeNull();
    });

    it('when settling does not confirm the address the order is not placed and the hint does not say the order is being updated when nothing is in flight', async () => {
        openGate(store);
        store.shippingDirty.set(true);
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(settleShipping).toHaveBeenCalledTimes(1);
        expect(placeOrder).not.toHaveBeenCalled();
        const hint = el.querySelector<HTMLElement>('[data-place-order-hint]')!;
        expect(hint.textContent?.trim()).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
        expect(hint.getAttribute('role')).toBe('status');
        expect(el.querySelector('button')!.hasAttribute('disabled')).toBe(false);
    });

    it('a hint about an update in flight does not take the focus and names the missing piece once the update ends without opening the gate', async () => {
        openGate(store);
        store.shippingDirty.set(true);
        // A save is still running when settling gives up waiting.
        settleShipping.mockImplementation(async () => { store.isSavingShipping.set(true); });
        const el = await mountAll(ADDRESS);
        const native = el.querySelector<HTMLButtonElement>('button')!;
        native.focus();

        native.click();
        await settle(wrapper);

        const hint = el.querySelector<HTMLElement>('[data-place-order-hint]')!;
        expect(hint.textContent?.trim()).toBe('Your order is being updated. Try again in a moment.');
        expect(document.activeElement).not.toBe(hint);

        store.isSavingShipping.set(false);
        store.shippingDirty.set(false);
        store.appliedShippingMethod.set(null);
        await settle(wrapper);
        expect(el.querySelector('[data-place-order-hint]')?.textContent?.trim())
            .toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
    });

    it('a press with nothing pending does not wait for anything', async () => {
        openGate(store);
        placeOrder.mockResolvedValue(15);
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(settleShipping).not.toHaveBeenCalled();
        expect(placeOrder).toHaveBeenCalledTimes(1);
    });

    it('an order confirmed by the quote after its answer was lost continues on the success page like any other', async () => {
        openGate(store);
        placeOrder.mockResolvedValue('placed-unconfirmed');
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(navigateTo).toHaveBeenCalledTimes(1);
    });

    it('once the order exists the button stays in its loading state and a click does nothing', async () => {
        openGate(store);
        const el = await mountAll(ADDRESS);
        store.isPlacingOrder.set(true);
        store.orderPlaced.set(true);
        await settle(wrapper);

        const native = el.querySelector<HTMLButtonElement>('button')!;
        expect(native.disabled).toBe(true);
        native.click();
        await settle(wrapper);
        expect(placeOrder).not.toHaveBeenCalled();
    });

    describe('what the hint names', () => {
        it('the billing address when a separate billing address is incomplete and a shipping method is selected', () => {
            openGate(store);
            // The save was skipped for the incomplete billing address: nothing is confirmed.
            store.appliedShippingMethod.set(null);
            store.shippingDirty.set(true);
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...ADDRESS, city: '' });

            expect(placeOrderHint(store, initFlowSelectors()))
                .toBe(t('Hyperion_Checkout::checkout_incomplete_billing_address'));
        });

        it('an update in progress while a shipping save, a billing sync or a totals refresh is in flight', () => {
            openGate(store);
            const updating = 'Your order is being updated. Try again in a moment.';
            const selectors = initFlowSelectors();
            expect(placeOrderHint(store, selectors)).toBeNull();

            store.isSavingShipping.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.isSavingShipping.set(false);

            store.isLoadingShippingMethods.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.isLoadingShippingMethods.set(false);

            // Ahead of the quote with nothing running is not an update.
            store.shippingDirty.set(true);
            expect(placeOrderHint(store, selectors)).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
            store.shippingDirty.set(false);

            store.isRefreshingTotals.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.isRefreshingTotals.set(false);

            store.billingSameAsShipping.set(false);
            store.billingAddress.set(ADDRESS);
            store.isSavingBilling.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.isSavingBilling.set(false);
            expect(placeOrderHint(store, selectors)).toBe(t('Hyperion_Checkout::checkout_incomplete_billing_address'));
        });

        it('the shipping method when none is selected, even while the form is ahead of the quote', () => {
            openGate(store);
            store.shippingDirty.set(true);
            store.selectedShippingMethod.set(null);

            expect(placeOrderHint(store, initFlowSelectors()))
                .toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
        });

        it('the purchase order number while that method is selected and the field is empty', () => {
            openGate(store);
            store.availablePaymentMethods.set([{ code: 'purchaseorder', title: 'Purchase Order' }]);
            store.selectedPaymentMethod.set('purchaseorder');
            const selectors = initFlowSelectors();

            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(placeOrderHint(store, selectors)).toBe('Enter the purchase order number.');

            store.paymentMethodData.set({ purchaseorder: { po_number: 'HYP-PO-1' } });
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(placeOrderHint(store, selectors)).toBeNull();
            expect(getPaymentRenderer('purchaseorder')?.isReady?.()).toBe(true);
        });
    });

    describe('the gate of a renderer that owns Place Order', () => {
        it('is open when the button would be', () => {
            openGate(store);
            expect(getCheckoutBlocker()).toBeNull();
        });

        it('blocks while the shipping form is ahead of the quote, as an update only while a request is in flight', () => {
            openGate(store);
            store.shippingDirty.set(true);
            expect(getCheckoutBlocker()).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));

            store.isSavingShipping.set(true);
            expect(getCheckoutBlocker()).toBe('Your order is being updated. Try again in a moment.');
        });

        it('blocks while the totals are being refreshed', () => {
            openGate(store);
            store.isRefreshingTotals.set(true);
            expect(getCheckoutBlocker()).toBe('Your order is being updated. Try again in a moment.');
        });

        it('blocks a selection the server never confirmed and a separate billing address that is not synced', () => {
            openGate(store);
            store.appliedShippingMethod.set(null);
            expect(getCheckoutBlocker()).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));

            store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
            store.billingSameAsShipping.set(false);
            store.billingAddress.set(ADDRESS);
            expect(getCheckoutBlocker()).toBe(t('Hyperion_Checkout::checkout_incomplete_billing_address'));
        });

        it('blocks for good once the order exists', () => {
            openGate(store);
            store.isPlacingOrder.set(true);
            store.orderPlaced.set(true);
            expect(getCheckoutBlocker()).not.toBeNull();
        });

        it('does not wait for the readiness of the renderer that is asking', () => {
            openGate(store);
            store.availablePaymentMethods.set([{ code: 'purchaseorder', title: 'Purchase Order' }]);
            store.selectedPaymentMethod.set('purchaseorder');

            expect(placeOrderHint(store, initFlowSelectors())).not.toBeNull();
            expect(getCheckoutBlocker()).toBeNull();
        });
    });
});
