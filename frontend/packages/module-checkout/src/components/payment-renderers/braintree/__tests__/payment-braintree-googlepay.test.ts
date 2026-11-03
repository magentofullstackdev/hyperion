// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const placeOrder = vi.fn<() => Promise<number | null>>();
vi.mock('../../../../store/flow-actions.js', () => ({
    flowActions: () => ({ placeOrder }),
}));
vi.mock('../../../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));

import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import { resetFlowSelectorsForTests } from '../../../../store/flow-selectors.js';
import type { Store } from '../../../../store/index.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import { navigateTo } from '../../../../utils/navigate.js';
import { getPaymentRenderer } from '../../registry.js';
import { PaymentBraintreeGooglepay, getGooglePayAuthorisation } from '../payment-braintree-googlepay.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
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

function renderer(): NonNullable<ReturnType<typeof getPaymentRenderer>> {
    const found = getPaymentRenderer('braintree_googlepay');
    if (!found) throw new Error('braintree_googlepay renderer is not registered');
    return found;
}

async function mount(sdk: BraintreeDouble): Promise<PaymentBraintreeGooglepay> {
    const el = document.createElement('payment-braintree-googlepay');
    document.body.appendChild(el);
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

describe('<payment-braintree-googlepay>', () => {
    let sdk: BraintreeDouble;
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        installCheckoutConfig();
        store = installStore();
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
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
        placeOrder.mockReset();
        placeOrder.mockResolvedValue(42);
        vi.mocked(navigateTo).mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        uninstallBraintreeDouble();
        resetFlowSelectorsForTests();
        vi.restoreAllMocks();
    });

    it('owns Place Order and refuses the checkout button until the sheet authorised a payment', async () => {
        expect(renderer().ownsPlaceOrder?.()).toBe(true);
        await expect(renderer().beforePlaceOrder?.()).rejects.toThrow(
            t('Hyperion_Checkout::braintree_googlepay_not_authorised')
        );
        expect(sdk.loader).not.toHaveBeenCalled();
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
                totalPrice: '56.29',
                totalPriceStatus: 'FINAL',
                totalPriceLabel: 'Total',
                displayItems: [
                    { type: 'LINE_ITEM', label: 'Chaz Kangeroo Hoodie-S-Black', price: '52.00' },
                    { type: 'LINE_ITEM', label: 'Tax', price: '4.29' },
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
            amount: '56.29',
        }));
        expect(store.paymentMethodData.get()['braintree_googlepay']).toEqual({
            payment_method_nonce: 'googlepay_3ds_nonce',
            device_data: DEVICE_DATA,
            is_network_tokenized: false,
        });
        expect(getGooglePayAuthorisation()).toEqual(store.paymentMethodData.get()['braintree_googlepay']);
        expect(navigateTo).toHaveBeenCalledWith('/checkout/onepage/success');
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
        expect(store.paymentMethodData.get()['braintree_googlepay']).toEqual({
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
        expect(store.paymentMethodData.get()['braintree_googlepay']).toMatchObject({
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

    it('drops the single use nonce when the order fails and shows the 3D Secure failure', async () => {
        placeOrder.mockResolvedValue(null);
        const el = await mountReady(sdk);
        await pay(sdk);
        await vi.waitFor(() => expect(getGooglePayAuthorisation()).toBeNull());
        expect(navigateTo).not.toHaveBeenCalled();

        sdk.threeDSecure.verifyCard.mockResolvedValue({ nonce: 'x', liabilityShifted: false, liabilityShiftPossible: true });
        sdk.googlePayButton.element.click();
        await vi.waitFor(() => expect(el.querySelector('[role="alert"]')?.textContent).toContain(
            t('Hyperion_Checkout::braintree_3ds_failed')
        ));
        expect(placeOrder).toHaveBeenCalledTimes(1);
        expect(getGooglePayAuthorisation()).toBeNull();
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
});
