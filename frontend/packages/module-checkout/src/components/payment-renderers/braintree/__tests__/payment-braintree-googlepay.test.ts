// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Mock } from 'vitest';

import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import { resetFlowSelectorsForTests } from '../../../../store/flow-selectors.js';
import type { Store } from '../../../../store/index.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import type { MockContext } from '../../__tests__/mock-context.js';
import { PaymentBraintreeGooglepay } from '../payment-braintree-googlepay.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    mountBraintreeElement,
    uninstallBraintreeDouble,
    type BraintreeDouble,
} from './helpers.js';

const PAYMENT_DATA = {
    apiVersion: 2,
    apiVersionMinor: 0,
    paymentMethodData: {
        type: 'CARD',
        info: { cardNetwork: 'VISA', cardDetails: '1111' },
        tokenizationData: { type: 'PAYMENT_GATEWAY', token: '{"androidPayCards":[]}' },
    },
};

let mock: MockContext;
let currentStore: Store;
/** `context.placeOrder()` of the element: the checkout's order pipeline. */
let placeOrder: Mock;
/** `context.requestCheckoutValidation()`: the flush of the pending saves and the gate. */
let prepareCheckout: Mock;

/** The payment data the element handed to the order pipeline. */
function placedData(): Record<string, unknown> | undefined {
    return (placeOrder.mock.calls[placeOrder.mock.calls.length - 1]?.[0] as { additional_data?: Record<string, unknown> } | undefined)?.additional_data;
}

async function mount(sdk: BraintreeDouble): Promise<PaymentBraintreeGooglepay> {
    const mounted = mountBraintreeElement<PaymentBraintreeGooglepay>('hc-payment-braintree-googlepay', 'braintree_googlepay', currentStore);
    mock = mounted.mock;
    placeOrder = mock.spies.placeOrder;
    placeOrder.mockResolvedValue({ status: 'placed', orderId: 42 });
    prepareCheckout = mock.spies.requestCheckoutValidation;
    prepareCheckout.mockResolvedValue(true);
    const el = mounted.element;
    await vi.waitFor(() => expect(sdk.googlePay.isReadyToPay).toHaveBeenCalled());
    await el.updateComplete;
    return el;
}

async function mountReady(sdk: BraintreeDouble): Promise<PaymentBraintreeGooglepay> {
    const el = await mount(sdk);
    await vi.waitFor(() => expect(sdk.googlePay.createButton).toHaveBeenCalled());
    await el.updateComplete;
    return el;
}

async function pay(sdk: BraintreeDouble): Promise<void> {
    sdk.googlePayButton.element.click();
    await vi.waitFor(() => expect(placeOrder).toHaveBeenCalled());
}

describe('<hc-payment-braintree-googlepay>', () => {
    let sdk: BraintreeDouble;
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        installCheckoutConfig();
        store = installStore();
        currentStore = store;
        // The quote carries a confirmed flat rate and offers Google Pay: the gate is open.
        store.availableShippingMethods.set([{
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
        }]);
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.availablePaymentMethods.set([{ code: 'braintree_googlepay', title: 'Google Pay' }]);
        store.selectedPaymentMethod.set('braintree_googlepay');
        resetFlowSelectorsForTests();
        sdk = installBraintreeDouble();
        sdk.googlePayment.parseResponse.mockResolvedValue({
            nonce: 'googlepay_nonce_fixture',
            type: 'AndroidPayCard',
            details: { bin: '411111', cardType: 'Visa', lastFour: '1111', isNetworkTokenized: false },
        });
        sdk.googlePay.loadPaymentData.mockResolvedValue(PAYMENT_DATA);
        sdk.threeDSecure.verifyCard.mockResolvedValue({
            nonce: 'googlepay_3ds_nonce',
            liabilityShifted: true,
            liabilityShiftPossible: true,
        });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        uninstallBraintreeDouble();
        resetFlowSelectorsForTests();
        vi.restoreAllMocks();
    });

    it('owns Place Order and has no data for the checkout button: only its own button places the order', async () => {
        sdk.loader.mockReturnValue(new Promise(() => undefined));
        const { element } = mountBraintreeElement<PaymentBraintreeGooglepay>('hc-payment-braintree-googlepay', 'braintree_googlepay', currentStore);
        expect(element.ownsPlaceOrder).toBe(true);
        expect((element as unknown as Record<string, unknown>)['getPaymentData']).toBeUndefined();
        expect(PaymentBraintreeGooglepay.canMakePayment({ config: { isActive: true, clientToken: 'token' } })).toBe(true);
        expect(PaymentBraintreeGooglepay.canMakePayment({ config: { isActive: true } })).toBe(false);
    });

    it('loads the Braintree component and pay.js, asks Google whether it can pay and renders the button', async () => {
        const el = await mountReady(sdk);

        expect(sdk.loader.mock.calls.map(([src]) => src)).toEqual(expect.arrayContaining([
            expect.stringContaining('/google-payment.min.js'),
            'https://pay.google.com/gp/p/js/pay.js',
        ]));
        expect(sdk.googlePaymentCreate).toHaveBeenCalledWith(expect.objectContaining({ googlePayVersion: 2 }));
        expect(sdk.googlePaymentCreate.mock.calls[0]?.[0]).not.toHaveProperty('googleMerchantId');
        expect(sdk.googlePay.environment).toBe('TEST');
        expect(sdk.googlePay.isReadyToPay).toHaveBeenCalledWith({
            apiVersion: 2,
            apiVersionMinor: 0,
            allowedPaymentMethods: [expect.objectContaining({
                type: 'CARD',
                parameters: expect.objectContaining({ allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX'] }),
                tokenizationSpecification: expect.any(Object),
            })],
        });
        expect(sdk.googlePayButton.options).toMatchObject({ buttonColor: 'white', buttonType: 'buy', buttonSizeMode: 'fill' });
        expect(el.querySelector('[data-googlepay-button]')?.firstElementChild).toBe(sdk.googlePayButton.element);
        expect(el.querySelector('[role="alert"]')).toBeNull();
    });

    it('explains when Google cannot pay in this browser instead of rendering a button', async () => {
        sdk.googlePay.isReadyToPay.mockResolvedValue({ result: false });
        const el = await mount(sdk);
        await vi.waitFor(() => expect(el.querySelector('[role="alert"]')?.textContent).toContain(
            t('Hyperion_Checkout::braintree_googlepay_unavailable')
        ));

        expect(sdk.googlePay.createButton).not.toHaveBeenCalled();
    });

    it('names the missing piece and keeps the sheet closed while the checkout is incomplete', async () => {
        await mountReady(sdk);
        store.selectedShippingMethod.set(null);

        sdk.googlePayButton.element.click();
        await vi.waitFor(() => expect(store.globalError.get()).toBe(
            t('Hyperion_Checkout::checkout_incomplete_shipping_method')
        ));

        expect(sdk.googlePay.loadPaymentData).not.toHaveBeenCalled();
        expect(placeOrder).not.toHaveBeenCalled();
    });

    it('opens the sheet with the quote total and lines, verifies the card and places the order', async () => {
        await mountReady(sdk);
        await pay(sdk);

        const request = sdk.googlePay.loadPaymentData.mock.calls[0]?.[0];
        expect(request).toMatchObject({
            transactionInfo: {
                currencyCode: 'EUR',
                totalPrice: '36.81',
                totalPriceStatus: 'FINAL',
                totalPriceLabel: 'Total',
                displayItems: [
                    { type: 'LINE_ITEM', label: 'Joust Duffle Bag', price: '34.00' },
                    { type: 'LINE_ITEM', label: 'Tax', price: '2.81' },
                ],
            },
            emailRequired: false,
            shippingAddressRequired: false,
        });
        expect(request).not.toHaveProperty('merchantInfo');
        expect(request.allowedPaymentMethods[0]?.parameters).toMatchObject({
            billingAddressRequired: true,
            billingAddressParameters: { format: 'FULL', phoneNumberRequired: true },
        });
        expect(sdk.googlePayment.parseResponse).toHaveBeenCalledWith(PAYMENT_DATA);
        expect(sdk.threeDSecure.verifyCard).toHaveBeenCalledWith(expect.objectContaining({
            nonce: 'googlepay_nonce_fixture',
            bin: '411111',
            amount: '36.81',
        }));
        expect(placedData()).toEqual({
            payment_method_nonce: 'googlepay_3ds_nonce',
            device_data: DEVICE_DATA,
            is_network_tokenized: false,
        });
        expect(placeOrder).toHaveBeenCalledTimes(1);
    });

    it('skips 3D Secure for a network tokenized card and never offers to store it', async () => {
        installCheckoutConfig({}, { vault: { braintree_googlepay_vault: { is_enabled: true } } });
        sdk.googlePayment.parseResponse.mockResolvedValue({
            nonce: 'googlepay_token_nonce',
            details: { bin: '411111', isNetworkTokenized: true },
        });
        const el = await mountReady(sdk);
        el.querySelector('hc-checkbox')?.dispatchEvent(new CustomEvent('value-change', { detail: { checked: true } }));
        await pay(sdk);

        expect(sdk.threeDSecure.verifyCard).not.toHaveBeenCalled();
        expect(placedData()).toEqual({
            payment_method_nonce: 'googlepay_token_nonce',
            device_data: DEVICE_DATA,
            is_network_tokenized: true,
        });
    });

    it('sends the vault choice for a card the shopper asked to store', async () => {
        installCheckoutConfig({}, { vault: { braintree_googlepay_vault: { is_enabled: true } } });
        const el = await mountReady(sdk);
        el.querySelector('hc-checkbox')?.dispatchEvent(new CustomEvent('value-change', { detail: { checked: true } }));
        await pay(sdk);

        expect(sdk.threeDSecure.verifyCard).toHaveBeenCalledWith(expect.objectContaining({
            cardAddChallengeRequested: true,
            challengeRequested: false,
        }));
        expect(placedData()).toMatchObject({
            is_network_tokenized: false,
            is_active_payment_token_enabler: true,
        });
    });

    it('treats a closed sheet as no payment and reports any other sheet failure', async () => {
        const el = await mountReady(sdk);
        sdk.googlePay.loadPaymentData.mockRejectedValueOnce({ statusCode: 'CANCELED' });
        sdk.googlePayButton.element.click();
        await vi.waitFor(() => expect(sdk.googlePay.loadPaymentData).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 0));
        await el.updateComplete;

        expect(placeOrder).not.toHaveBeenCalled();
        expect(el.querySelector('[role="alert"]')).toBeNull();

        sdk.googlePay.loadPaymentData.mockRejectedValueOnce({ statusCode: 'DEVELOPER_ERROR' });
        sdk.googlePayButton.element.click();
        await vi.waitFor(() => expect(el.querySelector('[role="alert"]')?.textContent).toContain(
            t('Hyperion_Checkout::braintree_googlepay_failed')
        ));
        expect(placeOrder).not.toHaveBeenCalled();
    });

    it('pays again with a new nonce after a failed order, and shows the 3D Secure failure', async () => {
        const el = await mountReady(sdk);
        placeOrder.mockResolvedValue({ status: 'failed', message: 'The card was declined.' });
        await pay(sdk);
        await vi.waitFor(() => expect(el.querySelector('[data-googlepay-button]')?.getAttribute('aria-busy')).toBe('false'));

        sdk.threeDSecure.verifyCard.mockResolvedValue({ nonce: 'x', liabilityShifted: false, liabilityShiftPossible: true });
        sdk.googlePayButton.element.click();
        await vi.waitFor(() => expect(el.querySelector('[role="alert"]')?.textContent).toContain(
            t('Hyperion_Checkout::braintree_3ds_failed')
        ));
        expect(placeOrder).toHaveBeenCalledTimes(1);
    });

    it('passes the merchant id to Google and Braintree in production only', async () => {
        installCheckoutConfig({ braintree_googlepay: { environment: 'PRODUCTION', merchantId: 'BCR2DN4T', btnColor: '1' } });
        await mountReady(sdk);
        await pay(sdk);

        expect(sdk.googlePaymentCreate).toHaveBeenCalledWith(expect.objectContaining({ googleMerchantId: 'BCR2DN4T' }));
        expect(sdk.googlePay.environment).toBe('PRODUCTION');
        expect(sdk.googlePayButton.options?.buttonColor).toBe('black');
        expect(sdk.googlePay.loadPaymentData.mock.calls[0]?.[0]).toMatchObject({ merchantInfo: { merchantId: 'BCR2DN4T' } });
    });

    it('keeps the button busy once the order exists, and releases it when the order failed', async () => {
        const el = await mountReady(sdk);
        placeOrder.mockImplementationOnce(async () => ({ status: 'failed' }));
        await pay(sdk);
        await vi.waitFor(() => expect(el.querySelector('[data-googlepay-button]')?.getAttribute('aria-busy')).toBe('false'));

        placeOrder.mockImplementationOnce(async () => {
            store.isPlacingOrder.set(true);
            store.orderPlaced.set(true);
            return { status: 'placed', orderId: 42 };
        });
        sdk.googlePayButton.element.click();
        await vi.waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(2));
        await new Promise((resolve) => setTimeout(resolve, 0));
        await el.updateComplete;

        expect(el.querySelector('[data-googlepay-button]')?.getAttribute('aria-busy')).toBe('true');
    });

    it('stays busy for an order the quote confirmed after its answer was lost', async () => {
        const el = await mountReady(sdk);
        placeOrder.mockResolvedValue({ status: 'placed' });
        await pay(sdk);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await el.updateComplete;

        expect(el.querySelector('[data-googlepay-button]')?.getAttribute('aria-busy')).toBe('true');
    });

    it('does not open the sheet while the order is being updated and says so', async () => {
        await mountReady(sdk);
        store.isSettlingTotals.set(true);

        sdk.googlePayButton.element.click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(sdk.googlePay.loadPaymentData).not.toHaveBeenCalled();
        expect(store.globalError.get()).toBe('Your order is being updated. Try again in a moment.');

        store.isSettlingTotals.set(false);
        store.isSavingShipping.set(true);
        sdk.googlePayButton.element.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(sdk.googlePay.loadPaymentData).not.toHaveBeenCalled();
        expect(placeOrder).not.toHaveBeenCalled();
    });

    it('opens the sheet inside the click when the gate is open, without waiting for anything', async () => {
        await mountReady(sdk);

        sdk.googlePayButton.element.click();

        // Still in the task of the click: the browser accepts the window of the sheet.
        expect(sdk.googlePay.loadPaymentData).toHaveBeenCalledTimes(1);
        expect(prepareCheckout).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(placeOrder).toHaveBeenCalled());
    });

    it('saves the pending edits on a blocked click, so the next click opens the sheet', async () => {
        await mountReady(sdk);
        store.shippingDirty.set(true);
        // Like the flow: the banner is cleared when the flush starts.
        prepareCheckout.mockImplementation(async () => {
            store.globalError.set(null);
            store.shippingDirty.set(false);
            return true;
        });

        sdk.googlePayButton.element.click();
        await vi.waitFor(() => expect(prepareCheckout).toHaveBeenCalledTimes(1));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(sdk.googlePay.loadPaymentData).not.toHaveBeenCalled();
        expect(store.globalError.get()).toBe('Your order is being updated. Try again in a moment.');

        sdk.googlePayButton.element.click();
        expect(sdk.googlePay.loadPaymentData).toHaveBeenCalledTimes(1);
        expect(prepareCheckout).toHaveBeenCalledTimes(1);
    });

    it('shows what is still missing after the pending edits were saved', async () => {
        await mountReady(sdk);
        store.shippingDirty.set(true);
        // Like the checkout: what is still missing goes to the banner.
        prepareCheckout.mockImplementation(async () => {
            store.globalError.set('The store is temporarily unavailable.');
            return false;
        });

        sdk.googlePayButton.element.click();

        await vi.waitFor(() => expect(store.globalError.get()).toBe('The store is temporarily unavailable.'));
        expect(sdk.googlePay.loadPaymentData).not.toHaveBeenCalled();
        expect(placeOrder).not.toHaveBeenCalled();
    });
});
