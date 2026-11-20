// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prepareOrder = vi.fn();
const submitOrder = vi.fn().mockResolvedValue(null);
const cancelOrder = vi.fn();
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ prepareOrder, submitOrder, cancelOrder }),
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
import { getCheckoutBlocker, prepareCheckout } from '../payment-renderers/checkout-gate.js';
import { getPaymentRenderer, registerPaymentRenderer } from '../payment-renderers/registry.js';
import '../payment-renderers/payment-offline.js';
import '../address-form.js';
import '../place-order-button.js';
import type { AddressForm } from '../address-form.js';
import { placeOrderHint, type PlaceOrderButton } from '../place-order-button.js';
import { initFlowSelectors } from '../../store/flow-selectors.js';
import { placeOrderBlocker } from '../../store/place-order-hint.js';

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
        submitOrder.mockReset();
        submitOrder.mockResolvedValue(null);
        cancelOrder.mockReset();
        // The first half of Place Order with nothing to flush: the gate as it stands.
        prepareOrder.mockReset();
        prepareOrder.mockImplementation(async (options?: { skipPaymentReady?: boolean }) => {
            const missing = placeOrderBlocker(store, initFlowSelectors(), options);
            return missing === null ? { status: 'ready' } : { status: 'blocked', reason: missing };
        });
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

        expect(submitOrder).not.toHaveBeenCalled();
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

        expect(submitOrder).not.toHaveBeenCalled();
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
        expect(submitOrder).toHaveBeenCalledTimes(1);
    });

    it('a press first puts the pending edits on the quote, then places against what was confirmed', async () => {
        openGate(store);
        store.shippingDirty.set(true);
        prepareOrder.mockImplementation(async () => {
            expect(submitOrder).not.toHaveBeenCalled();
            store.shippingDirty.set(false);
            return { status: 'ready' };
        });
        submitOrder.mockResolvedValue(15);
        const el = await mountAll(ADDRESS);
        expect(el.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(prepareOrder).toHaveBeenCalledTimes(1);
        expect(submitOrder).toHaveBeenCalledTimes(1);
        expect(navigateTo).toHaveBeenCalledTimes(1);
        expect(el.querySelector('[data-place-order-hint]')).toBeNull();
    });

    it.each([
        ['the outcome of an order is unknown', (s: Store): void => { s.orderOutcome.set('unknown'); }],
        ['the customer session ended', (s: Store): void => { s.sessionExpired.set(true); }],
        ['the quote is gone', (s: Store): void => { s.quoteGone.set(true); }],
    ])('drops the hint of an earlier press once %s, and looks disabled', async (_state, latch) => {
        openGate(store);
        store.selectedPaymentMethod.set(null);
        const el = await mountAll(ADDRESS);
        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);
        expect(el.querySelector('[data-place-order-hint]')).not.toBeNull();

        // The failed request that led here also took the confirmed method away.
        store.appliedShippingMethod.set(null);
        latch(store);
        await settle(wrapper);

        expect(el.querySelector('[data-place-order-hint]')).toBeNull();
        expect(el.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');
    });

    it('a press whose save failed places nothing and adds no hint: the failure is shown where it was reported', async () => {
        openGate(store);
        store.shippingDirty.set(true);
        prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'write-failed' });
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(submitOrder).not.toHaveBeenCalled();
        expect(el.querySelector('[data-place-order-hint]')).toBeNull();
        expect(el.querySelector('button')!.hasAttribute('disabled')).toBe(false);
    });

    it('a press while another attempt is at work does nothing', async () => {
        openGate(store);
        prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'busy' });
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(submitOrder).not.toHaveBeenCalled();
        expect(el.querySelector('[data-place-order-hint]')).toBeNull();
    });

    it('a hint about an update in flight is a status that does not take the focus, and names the missing piece once the update ends without opening the gate', async () => {
        openGate(store);
        store.shippingDirty.set(true);
        store.isSavingShipping.set(true);
        const el = await mountAll(ADDRESS);
        const native = el.querySelector<HTMLButtonElement>('button')!;
        native.focus();

        native.click();
        await settle(wrapper);

        const hint = el.querySelector<HTMLElement>('[data-place-order-hint]')!;
        expect(hint.textContent?.trim()).toBe('Your order is being updated. Try again in a moment.');
        expect(hint.getAttribute('role')).toBe('status');
        expect(document.activeElement).not.toBe(hint);

        store.isSavingShipping.set(false);
        store.shippingDirty.set(false);
        store.appliedShippingMethod.set(null);
        await settle(wrapper);
        expect(el.querySelector('[data-place-order-hint]')?.textContent?.trim())
            .toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
    });

    it('the latch of an order being prepared shows the loading state', async () => {
        openGate(store);
        const el = await mountAll(ADDRESS);
        store.orderOutcome.set('placing');
        await settle(wrapper);

        expect(el.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    });

    it('the step of the payment renderer runs after the pending edits were saved and before the order is sent', async () => {
        openGate(store);
        const calls: string[] = [];
        prepareOrder.mockImplementation(async () => { calls.push('prepare'); return { status: 'ready' }; });
        submitOrder.mockImplementation(async () => { calls.push('submit'); return 15; });
        registerPaymentRenderer({
            code: 'hooked',
            component: 'payment-offline',
            beforePlaceOrder: async () => { calls.push('hook'); return { nonce: 'n-1' }; },
        });
        store.availablePaymentMethods.set([{ code: 'hooked', title: 'Hooked' }]);
        store.selectedPaymentMethod.set('hooked');
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(calls).toEqual(['prepare', 'hook', 'submit']);
        expect(store.paymentMethodData.get()['hooked']).toEqual({ nonce: 'n-1' });
        expect(cancelOrder).not.toHaveBeenCalled();
        expect(navigateTo).toHaveBeenCalledTimes(1);
    });

    it('a payment step that fails gives the latch back, shows its message and sends no order', async () => {
        openGate(store);
        registerPaymentRenderer({
            code: 'hooked',
            component: 'payment-offline',
            beforePlaceOrder: () => Promise.reject(new Error('The card was declined.')),
        });
        store.availablePaymentMethods.set([{ code: 'hooked', title: 'Hooked' }]);
        store.selectedPaymentMethod.set('hooked');
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(cancelOrder).toHaveBeenCalledTimes(1);
        expect(submitOrder).not.toHaveBeenCalled();
        expect(store.globalError.get()).toBe('The card was declined.');
    });

    it('a redirect gateway places under the latch and gives it back when it could not start', async () => {
        openGate(store);
        const afterPlaceOrderFailed = vi.fn();
        const placeOrder = vi.fn().mockResolvedValue(null);
        registerPaymentRenderer({ code: 'hooked', component: 'payment-offline', placeOrder, afterPlaceOrderFailed });
        store.availablePaymentMethods.set([{ code: 'hooked', title: 'Hooked' }]);
        store.selectedPaymentMethod.set('hooked');
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(prepareOrder).toHaveBeenCalledTimes(1);
        expect(placeOrder).toHaveBeenCalledTimes(1);
        expect(submitOrder).not.toHaveBeenCalled();
        expect(cancelOrder).toHaveBeenCalledTimes(1);
        expect(afterPlaceOrderFailed).toHaveBeenCalledTimes(1);

        placeOrder.mockResolvedValue(`${window.location.origin}/paypal/express/start/`);
        cancelOrder.mockReset();
        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);
        expect(navigateTo).toHaveBeenCalledTimes(1);
        expect(cancelOrder).not.toHaveBeenCalled();
    });

    it('an order confirmed by the quote after its answer was lost continues on the success page like any other', async () => {
        openGate(store);
        submitOrder.mockResolvedValue('placed-unconfirmed');
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(navigateTo).toHaveBeenCalledTimes(1);
    });

    it('a press while the outcome of an earlier attempt is unknown sends nothing and goes nowhere', async () => {
        openGate(store);
        store.orderOutcome.set('unknown');
        const el = await mountAll(ADDRESS);

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        expect(prepareOrder).not.toHaveBeenCalled();
        expect(submitOrder).not.toHaveBeenCalled();
        expect(navigateTo).not.toHaveBeenCalled();
    });

    it('once the order exists the button stays in its loading state and a click does nothing', async () => {
        openGate(store);
        const el = await mountAll(ADDRESS);
        store.isPlacingOrder.set(true);
        store.orderPlaced.set(true);
        store.orderOutcome.set('placed');
        prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'busy' });
        await settle(wrapper);

        const native = el.querySelector<HTMLButtonElement>('button')!;
        expect(native.disabled).toBe(true);
        native.click();
        await settle(wrapper);
        expect(submitOrder).not.toHaveBeenCalled();
    });

    describe('what the hint names', () => {
        it('the billing address when a separate billing address is incomplete and a shipping method is selected', () => {
            openGate(store);
            store.appliedShippingMethod.set(null);
            store.shippingDirty.set(true);
            store.billingSameAsShipping.set(false);
            store.billingAddress.set({ ...ADDRESS, city: '' });

            expect(placeOrderHint(store, initFlowSelectors()))
                .toBe(t('Hyperion_Checkout::checkout_incomplete_billing_address'));
        });

        it('an update in progress while the form is ahead of the quote, a write runs or waits, or the totals settle', () => {
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

            // An edit the quote has not received yet is saved by the next press.
            store.shippingDirty.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.shippingDirty.set(false);

            store.isSettlingTotals.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.isSettlingTotals.set(false);

            store.quoteWritesPending.set(1);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.quoteWritesPending.set(0);

            // A selection the server never confirmed, with nothing on its way.
            store.appliedShippingMethod.set(null);
            expect(placeOrderHint(store, selectors)).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
            store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });

            store.billingSameAsShipping.set(false);
            store.billingAddress.set(ADDRESS);
            store.isSavingBilling.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.isSavingBilling.set(false);
            store.billingDirty.set(true);
            expect(placeOrderHint(store, selectors)).toBe(updating);
            store.billingDirty.set(false);
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

        it('blocks as an update while the shipping form is ahead of the quote or a save is in flight', () => {
            openGate(store);
            store.shippingDirty.set(true);
            expect(getCheckoutBlocker()).toBe('Your order is being updated. Try again in a moment.');

            store.shippingDirty.set(false);
            store.isSavingShipping.set(true);
            expect(getCheckoutBlocker()).toBe('Your order is being updated. Try again in a moment.');
        });

        it('blocks while the totals settle', () => {
            openGate(store);
            store.isSettlingTotals.set(true);
            expect(getCheckoutBlocker()).toBe('Your order is being updated. Try again in a moment.');
        });

        it('the gate a click awaits flushes the pending saves, leaves no latch behind and answers null when the payment can start', async () => {
            openGate(store);
            store.availablePaymentMethods.set([{ code: 'purchaseorder', title: 'Purchase Order' }]);
            store.selectedPaymentMethod.set('purchaseorder');

            expect(await prepareCheckout()).toBeNull();
            expect(prepareOrder).toHaveBeenCalledWith({ skipPaymentReady: true });
            expect(cancelOrder).toHaveBeenCalledTimes(1);
        });

        it('the gate a click awaits answers the missing piece, the failure of a save, or an order under way', async () => {
            openGate(store);
            store.selectedShippingMethod.set(null);
            expect(await prepareCheckout()).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
            expect(cancelOrder).not.toHaveBeenCalled();

            prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'write-failed' });
            store.globalError.set('The store is temporarily unavailable.');
            expect(await prepareCheckout()).toBe('The store is temporarily unavailable.');

            prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'busy' });
            expect(await prepareCheckout()).toBe(t('Hyperion_Checkout::placing_order'));
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
