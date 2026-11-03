// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Store } from '../../../../store/index.js';
import { createSelectors } from '../../../../store/selectors.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import { getPaymentRenderer } from '../../registry.js';
import {
    PaymentBraintreePaypal,
    getPayPalApproval,
    setPayPalApproval,
} from '../payment-braintree-paypal.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    setBaseGrandTotal,
    uninstallBraintreeDouble,
    type BraintreeDouble,
} from './helpers.js';

const PAYPAL_PAYLOAD = {
    nonce: 'paypal_nonce_fixture',
    details: { email: 'buyer@example.com', firstName: 'Veronica', lastName: 'Costello' },
};

async function mountPayPal(sdk: BraintreeDouble): Promise<PaymentBraintreePaypal> {
    const el = document.createElement('payment-braintree-paypal');
    document.body.appendChild(el);
    await vi.waitFor(() => expect(sdk.buttonRender).toHaveBeenCalled());
    await el.updateComplete;
    return el;
}

function renderer(): NonNullable<ReturnType<typeof getPaymentRenderer>> {
    const found = getPaymentRenderer('braintree_paypal');
    if (!found) throw new Error('braintree_paypal renderer is not registered');
    return found;
}

describe('<payment-braintree-paypal>', () => {
    let sdk: BraintreeDouble;
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        installCheckoutConfig();
        store = installStore();
        sdk = installBraintreeDouble();
        setPayPalApproval(null);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        uninstallBraintreeDouble();
        setPayPalApproval(null);
        vi.restoreAllMocks();
    });

    it('blocks the order until PayPal authorised the payment', async () => {
        expect(renderer().isReady?.()).toBe(false);
        await expect(renderer().beforePlaceOrder?.()).rejects.toThrow(
            t('Hyperion_Checkout::braintree_paypal_not_authorised')
        );
        expect(sdk.loader).not.toHaveBeenCalled();
    });

    it('loads the PayPal SDK for the quote currency and renders the configured buttons', async () => {
        const el = await mountPayPal(sdk);

        expect(sdk.dataCollectorCreate).toHaveBeenCalledWith(expect.objectContaining({ paypal: true }));
        expect(sdk.paypalCheckout.loadPayPalSDK).toHaveBeenCalledWith({
            'components': 'buttons,funding-eligibility',
            'enable-funding': 'paylater',
            'currency': 'EUR',
            'commit': false,
            'buyer-country': 'IT',
        });
        expect([...sdk.buttons.keys()]).toEqual(['paypal', 'paylater']);
        expect(sdk.buttons.get('paypal')?.style).toEqual({ label: 'paypal', color: 'gold', shape: 'rect' });
        expect(sdk.buttonRender).toHaveBeenCalledWith(el.querySelector('[data-paypal-button="paypal"]'));
    });

    it('creates the payment from the live quote: amount, currency, locale, shipping override, line items', async () => {
        await mountPayPal(sdk);
        await sdk.buttons.get('paypal')?.createOrder();

        expect(sdk.paypalCheckout.createPayment).toHaveBeenCalledWith({
            flow: 'checkout',
            amount: '56.29',
            currency: 'EUR',
            locale: 'it_IT',
            displayName: 'Hyperion Store',
            enableShippingAddress: true,
            shippingAddressEditable: false,
            shippingAddressOverride: {
                recipientName: 'Veronica Costello',
                line1: 'Via Roma 1',
                line2: 'Interno 4',
                city: 'Milano',
                countryCode: 'IT',
                postalCode: '20121',
                state: 'MI',
            },
            lineItems: [
                {
                    name: 'Chaz Kangeroo Hoodie-S-Black',
                    kind: 'debit',
                    quantity: '1.00',
                    unitAmount: '52.00',
                    productCode: expect.any(String),
                    description: '',
                },
                { name: 'Tax', kind: 'debit', quantity: '1.00', unitAmount: '4.29' },
            ],
        });
    });

    it('sends no shipping address for a virtual cart', async () => {
        store.isVirtual.set(true);
        store.billingAddress.set(store.shippingAddress.get());
        await mountPayPal(sdk);
        await sdk.buttons.get('paypal')?.createOrder();
        const options = sdk.paypalCheckout.createPayment.mock.calls[0]?.[0];
        expect(options.enableShippingAddress).toBeUndefined();
        expect(options.shippingAddressOverride).toBeUndefined();
    });

    it('stores the approval, confirms the payer and unlocks Place Order', async () => {
        const el = await mountPayPal(sdk);
        const selectors = createSelectors(store);
        store.selectedPaymentMethod.set('braintree_paypal');
        expect(selectors.paymentMethodReady.get()).toBe(false);

        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await sdk.buttons.get('paypal')?.onApprove({ orderID: 'PAYPAL-ORDER-ID' });
        await el.updateComplete;

        expect(sdk.paypalCheckout.tokenizePayment).toHaveBeenCalledWith({ orderID: 'PAYPAL-ORDER-ID' });
        expect(el.querySelector('[data-paypal-approved]')?.textContent).toContain('buyer@example.com');
        expect(selectors.paymentMethodReady.get()).toBe(true);
        expect(await renderer().beforePlaceOrder?.()).toEqual({
            payment_method_nonce: 'paypal_nonce_fixture',
            device_data: DEVICE_DATA,
            is_active_payment_token_enabler: false,
        });
    });

    it('requests a billing agreement and the vault opt-in when the account is saved', async () => {
        const el = await mountPayPal(sdk);
        el.querySelector('hc-checkbox')?.dispatchEvent(
            new CustomEvent('value-change', { detail: { checked: true } })
        );
        await sdk.buttons.get('paypal')?.createOrder();
        expect(sdk.paypalCheckout.createPayment.mock.calls[0]?.[0].requestBillingAgreement).toBe(true);

        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await sdk.buttons.get('paypal')?.onApprove({});
        expect((await renderer().beforePlaceOrder?.())?.['is_active_payment_token_enabler']).toBe(true);
    });

    it('lets the shopper switch to another PayPal account', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await sdk.buttons.get('paypal')?.onApprove({});
        await el.updateComplete;

        el.querySelector<HTMLButtonElement>('[data-paypal-approved] + button')?.click();
        await el.updateComplete;

        expect(getPayPalApproval()).toBeNull();
        expect(el.querySelector('[data-paypal-approved]')).toBeNull();
        expect(renderer().isReady?.()).toBe(false);
    });

    it('drops the approval when the order total changes', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await sdk.buttons.get('paypal')?.onApprove({});

        setBaseGrandTotal(store, '61.2900');
        await el.updateComplete;

        expect(renderer().isReady?.()).toBe(false);
        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_paypal_amount_changed'));
        await expect(renderer().beforePlaceOrder?.()).rejects.toThrow(
            t('Hyperion_Checkout::braintree_paypal_not_authorised')
        );
    });

    it('drops the single-use nonce after a failed order', async () => {
        await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await sdk.buttons.get('paypal')?.onApprove({});

        renderer().afterPlaceOrderFailed?.();
        expect(getPayPalApproval()).toBeNull();
    });

    it('keeps an approval across a method switch without reloading the SDK', async () => {
        setPayPalApproval({ nonce: 'kept', email: 'buyer@example.com', amount: '56.29', savedForLater: false });
        const el = document.createElement('payment-braintree-paypal');
        document.body.appendChild(el);
        await el.updateComplete;
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(el.querySelector('[data-paypal-approved]')).not.toBeNull();
        expect(sdk.loader).not.toHaveBeenCalled();
    });

    it('reports a PayPal error inline', async () => {
        const el = await mountPayPal(sdk);
        sdk.buttons.get('paypal')?.onError?.(new Error('popup closed'));
        await el.updateComplete;
        expect(el.querySelector('[role="alert"]')?.textContent).toContain(
            t('Hyperion_Checkout::braintree_paypal_failed')
        );
    });

    it('shows a retry when PayPal cannot be initialised', async () => {
        sdk.paypalCheckoutCreate.mockRejectedValue(new Error('PAYPAL_NOT_ENABLED'));
        const el = document.createElement('payment-braintree-paypal');
        document.body.appendChild(el);
        await vi.waitFor(() => expect(el.querySelector('[role="alert"]')).not.toBeNull());
        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_paypal_init_failed'));
        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_retry'));
    });

    it('tears PayPal down when the renderer disconnects', async () => {
        const el = await mountPayPal(sdk);
        el.remove();
        await vi.waitFor(() => expect(sdk.paypalCheckout.teardown).toHaveBeenCalledTimes(1));
    });
});
