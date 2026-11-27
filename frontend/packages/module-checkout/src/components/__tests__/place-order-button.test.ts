// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import paymentRenderers from '../../fixtures/payment-renderers.json' with { type: 'json' };
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { expectedAgreements } from '../../store/selectors.js';
import { resetValidationRequestsForTests } from '../../store/validation-request.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests, t } from '../../utils/i18n.js';
import { navigateTo } from '../../utils/navigate.js';
import { checkoutSnapshots } from '../../extension/context.js';
import { requestCheckoutValidation } from '../payment-host/pipeline.js';
import '../payment-renderers/payment-offline.js';
import '../address-form.js';
import type { PaymentElement } from '../../../extension-api.js';
import { registerHosted, resetHostedForTests } from '../payment-host/element-registry.js';
import { matchEntry, type PaymentEntry } from '../payment-host/entries.js';
import { loadPaymentHost } from '../payment-host/host.js';
import { patchRow, resetPaymentRowsForTests } from '../payment-host/row-state.js';
import '../place-order-button.js';
import type { AddressForm } from '../address-form.js';
import { placeOrderHint, type PlaceOrderButton } from '../place-order-button.js';
import { initFlowSelectors } from '../../store/flow-selectors.js';
import { placeOrderBlocker } from '../../store/place-order-hint.js';

/** The configuration with the bundle's payment renderer entries, as the server emits them. */
function withPaymentRenderers(config: CheckoutConfig | null): CheckoutConfig {
    const base = (config ?? {}) as unknown as { hyperion?: Record<string, unknown> };
    return { ...base, hyperion: { ...(base.hyperion ?? {}), paymentRenderers } } as unknown as CheckoutConfig;
}

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
    beforeAll(async () => {
        // The order pipeline lives in the payment host chunk; a page has it before the first press.
        await loadPaymentHost();
    });

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
        setCheckoutConfig(withPaymentRenderers(guestFixture as unknown as CheckoutConfig));
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

    beforeEach(() => {
        resetPaymentRowsForTests();
        // The element of the selected offline row, as the payment list creates it.
        registerHosted({
            rowKey: 'checkmo',
            code: 'checkmo',
            entry: matchEntry('checkmo') as PaymentEntry,
            element: document.createElement('div') as unknown as PaymentElement,
            beats: new Set(),
        });
    });

    afterEach(() => {
        resetHostedForTests();
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

    it('lists every invalid field under the hint as a link that focuses it', async () => {
        const el = await mountAll();

        el.querySelector<HTMLButtonElement>('button')!.click();
        await settle(wrapper);

        const summary = el.querySelector('[data-place-order-errors]');
        const links = Array.from(summary?.querySelectorAll('a') ?? []);
        expect(links.length).toBeGreaterThan(1);
        const firstname = wrapper.querySelector<HTMLInputElement>('input[name="firstname"]')!;
        const link = links.find((candidate) => candidate.getAttribute('href') === `#${firstname.id}`);
        expect(link?.textContent?.trim()).toBe(firstname.labels?.[0]?.textContent?.replace('*', '').trim());
        expect(link?.textContent).not.toContain('*');

        (document.activeElement as HTMLElement | null)?.blur();
        const lastname = wrapper.querySelector<HTMLInputElement>('input[name="lastname"]')!;
        links.find((candidate) => candidate.getAttribute('href') === `#${lastname.id}`)?.click();
        expect(document.activeElement).toBe(lastname);
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

    it('once the order exists the button gives way to the placed status and nothing can be pressed', async () => {
        openGate(store);
        const el = await mountAll(ADDRESS);
        store.isPlacingOrder.set(true);
        store.orderPlaced.set(true);
        store.orderOutcome.set('placed');
        await settle(wrapper);

        expect(el.querySelector('[data-hyperion-place-order]')).toBeNull();
        expect(el.querySelector('[data-order-placed]')).not.toBeNull();
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

            // What the form element of the method reported.
            patchRow('purchaseorder', { valid: false, message: 'Enter the purchase order number.' });
            expect(selectors.canPlaceOrder.get()).toBe(false);
            expect(placeOrderHint(store, selectors)).toBe('Enter the purchase order number.');

            patchRow('purchaseorder', { valid: true, message: null });
            expect(selectors.canPlaceOrder.get()).toBe(true);
            expect(placeOrderHint(store, selectors)).toBeNull();
        });
    });

    describe('the gate of a renderer that owns Place Order', () => {
        /** What the element reads before its wallet opens. */
        const getCheckoutBlocker = (): string | null => checkoutSnapshots().snapshot().blocker;

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

            expect(await requestCheckoutValidation()).toBe(true);
            // A check of the gate, not an order: no `before-place-order` event.
            expect(prepareOrder).toHaveBeenCalledWith({ skipPaymentReady: true, announce: false });
            expect(cancelOrder).toHaveBeenCalledTimes(1);
        });

        it('the gate a click awaits answers the missing piece, the failure of a save, or an order under way', async () => {
            openGate(store);
            store.selectedShippingMethod.set(null);
            expect(await requestCheckoutValidation()).toBe(false);
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
            expect(cancelOrder).not.toHaveBeenCalled();

            prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'write-failed' });
            store.globalError.set('The store is temporarily unavailable.');
            expect(await requestCheckoutValidation()).toBe(false);
            expect(store.globalError.get()).toBe('The store is temporarily unavailable.');

            prepareOrder.mockResolvedValue({ status: 'blocked', reason: 'busy' });
            expect(await requestCheckoutValidation()).toBe(false);
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::placing_order'));
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
            store.orderOutcome.set('placed');
            expect(checkoutSnapshots().snapshot().isPlacingOrder).toBe(true);
        });

        it('does not wait for the readiness of the renderer that is asking', () => {
            openGate(store);
            store.availablePaymentMethods.set([{ code: 'purchaseorder', title: 'Purchase Order' }]);
            store.selectedPaymentMethod.set('purchaseorder');
            patchRow('purchaseorder', { valid: false, message: 'Enter the purchase order number.' });

            expect(placeOrderHint(store, initFlowSelectors())).not.toBeNull();
            expect(getCheckoutBlocker()).toBeNull();
        });
    });
});
