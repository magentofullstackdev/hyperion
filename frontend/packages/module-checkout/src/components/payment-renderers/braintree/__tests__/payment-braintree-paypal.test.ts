// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Store } from '../../../../store/index.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import type { MockContext } from '../../__tests__/mock-context.js';
import { getBraintreePayPalConfig } from '../config.js';
import {
    PaymentBraintreePaypal,
    approvalFingerprint,
    type PayPalApproval,
} from '../payment-braintree-paypal.js';
import {
    DEVICE_DATA,
    ITALIAN_ADDRESS,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    mountBraintreeElement,
    setBaseGrandTotal,
    uninstallBraintreeDouble,
    type BraintreeDouble,
} from './helpers.js';

const PAYPAL_PAYLOAD = {
    nonce: 'paypal_nonce_fixture',
    details: { email: 'buyer@example.com', firstName: 'Veronica', lastName: 'Costello' },
};

let mounted: { element: PaymentBraintreePaypal; events: Array<{ type: string; detail: unknown }>; mock: MockContext } | null = null;
let currentStore: Store;

function mountElement(): PaymentBraintreePaypal {
    mounted = mountBraintreeElement<PaymentBraintreePaypal>('hc-payment-braintree-paypal', 'braintree_paypal', currentStore);
    return mounted.element;
}

async function mountPayPal(sdk: BraintreeDouble): Promise<PaymentBraintreePaypal> {
    const el = mountElement();
    await vi.waitFor(() => expect(sdk.buttonRender).toHaveBeenCalled());
    await el.updateComplete;
    return el;
}

/** What the element last told the checkout about its own step, once it rendered. */
async function isValid(): Promise<boolean> {
    await mounted?.element.updateComplete;
    const reports = (mounted?.events ?? []).filter((event) => event.type === 'valid' || event.type === 'invalid');
    return reports[reports.length - 1]?.type === 'valid';
}

/** What Place Order collects: the `additional_data` of the element's payment data. */
async function paymentData(): Promise<Record<string, unknown>> {
    if (mounted === null) throw new Error('no PayPal element is mounted');
    return { ...((await mounted.element.getPaymentData()).additional_data ?? {}) };
}

function approvalOf(el: PaymentBraintreePaypal | undefined): PayPalApproval | null {
    return (el as unknown as { _approval: PayPalApproval | null } | undefined)?._approval ?? null;
}

/** A full PayPal round trip: the payment is created, then PayPal approves it. */
async function approve(sdk: BraintreeDouble, data: unknown = {}): Promise<void> {
    await sdk.buttons.get('paypal')?.createOrder();
    await sdk.buttons.get('paypal')?.onApprove(data);
}

describe('<hc-payment-braintree-paypal>', () => {
    let sdk: BraintreeDouble;
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        installCheckoutConfig();
        store = installStore();
        currentStore = store;
        mounted = null;
        sdk = installBraintreeDouble();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        uninstallBraintreeDouble();
        vi.restoreAllMocks();
    });

    it('blocks the order until PayPal authorized the payment', async () => {
        sdk.loader.mockReturnValue(new Promise(() => undefined));
        mountElement();
        expect(await isValid()).toBe(false);
        await expect(paymentData()).rejects.toThrow(
            t('Hyperion_Checkout::braintree_paypal_not_authorised')
        );
        expect(PaymentBraintreePaypal.canMakePayment({ config: { isActive: true, clientToken: 'token' } })).toBe(true);
        expect(PaymentBraintreePaypal.canMakePayment({ config: { isActive: true, clientToken: '' } })).toBe(false);
    });

    it('loads the PayPal SDK for the quote currency and renders the configured buttons', async () => {
        const el = await mountPayPal(sdk);

        expect(sdk.dataCollectorCreate).toHaveBeenCalledWith(expect.objectContaining({ paypal: true }));
        expect(sdk.paypalCheckout.loadPayPalSDK).toHaveBeenCalledWith({
            'components': 'buttons,messages,funding-eligibility',
            'enable-funding': 'paylater',
            'currency': 'EUR',
            'commit': false,
            'dataAttributes': { 'page-type': 'checkout', 'csp-nonce': 'fixture-csp-nonce' },
            'locale': 'it_IT',
            'buyer-country': 'IT',
        });
        expect([...sdk.buttons.keys()]).toEqual(['paypal', 'paylater']);
        expect(sdk.buttons.get('paypal')?.style).toEqual({ label: 'paypal', color: 'gold', shape: 'rect' });
        expect(sdk.buttonRender).toHaveBeenCalledWith(el.querySelector('[data-paypal-button="paypal"]'));
    });

    it('passes the nonce of the Content Security Policy to the PayPal SDK', async () => {
        installCheckoutConfig({ braintree_paypal: { cspNonce: 'nonce-fixture', locale: 'en_GB' } });
        await mountPayPal(sdk);

        expect(sdk.paypalCheckout.loadPayPalSDK.mock.calls[0]?.[0]).toMatchObject({
            dataAttributes: { 'page-type': 'checkout', 'csp-nonce': 'nonce-fixture' },
            locale: 'en_GB',
        });
    });

    it('leaves the locale to PayPal when the store names none, and the buyer country outside the sandbox', async () => {
        installCheckoutConfig({ braintree_paypal: { locale: '', environment: 'production' } });
        await mountPayPal(sdk);

        const options = sdk.paypalCheckout.loadPayPalSDK.mock.calls[0]?.[0];
        expect(options).not.toHaveProperty('locale');
        expect(options).not.toHaveProperty('buyer-country');
    });

    it('reads the line items setting under the name the module emits, the older name as a fallback', async () => {
        const withoutSetting = { canSendLineItems: undefined, canSendCartLineItems: undefined };
        let installed;

        installed = installCheckoutConfig({ braintree_paypal: { ...withoutSetting, canSendCartLineItems: true } });
        expect(getBraintreePayPalConfig(installed)?.canSendLineItems).toBe(true);

        installed = installCheckoutConfig({ braintree_paypal: { ...withoutSetting, canSendLineItems: true } });
        expect(getBraintreePayPalConfig(installed)?.canSendLineItems).toBe(true);

        installed = installCheckoutConfig({ braintree_paypal: { canSendLineItems: true, canSendCartLineItems: false } });
        expect(getBraintreePayPalConfig(installed)?.canSendLineItems).toBe(false);

        installed = installCheckoutConfig({ braintree_paypal: withoutSetting });
        expect(getBraintreePayPalConfig(installed)?.canSendLineItems).toBe(false);
    });

    it('sends the line items when only the current setting name is on', async () => {
        installCheckoutConfig({ braintree_paypal: { canSendLineItems: undefined, canSendCartLineItems: true } });
        await mountPayPal(sdk);
        await sdk.buttons.get('paypal')?.createOrder();
        expect(sdk.paypalCheckout.createPayment.mock.calls[0]?.[0].lineItems).toHaveLength(2);
    });

    it('sends no line items when the setting is off', async () => {
        installCheckoutConfig({ braintree_paypal: { canSendLineItems: undefined, canSendCartLineItems: false } });
        await mountPayPal(sdk);
        await sdk.buttons.get('paypal')?.createOrder();
        expect(sdk.paypalCheckout.createPayment.mock.calls[0]?.[0]).not.toHaveProperty('lineItems');
    });

    describe('click validation', () => {
        async function click(): Promise<{ resolve: ReturnType<typeof vi.fn>; reject: ReturnType<typeof vi.fn> }> {
            const actions = { resolve: vi.fn(), reject: vi.fn() };
            await sdk.buttons.get('paypal')?.onClick?.({ fundingSource: 'paypal' }, actions);
            return actions;
        }

        it('lets the click through when the checkout is complete', async () => {
            await mountPayPal(sdk);
            const actions = await click();
            expect(actions.resolve).toHaveBeenCalledTimes(1);
            expect(actions.reject).not.toHaveBeenCalled();
        });

        it('answers the click only once the pending saves are through', async () => {
            await mountPayPal(sdk);
            let saved: (complete: boolean) => void = () => undefined;
            mounted?.mock.spies.requestCheckoutValidation.mockReturnValue(new Promise((resolve) => { saved = resolve; }));
            const actions = { resolve: vi.fn(), reject: vi.fn() };

            const answered = sdk.buttons.get('paypal')?.onClick?.({ fundingSource: 'paypal' }, actions);
            await Promise.resolve();
            expect(actions.resolve).not.toHaveBeenCalled();
            expect(actions.reject).not.toHaveBeenCalled();

            saved(true);
            await answered;
            expect(actions.resolve).toHaveBeenCalledTimes(1);
        });

        it('rejects the click while the checkout is not complete; the checkout names what is missing', async () => {
            const el = await mountPayPal(sdk);
            mounted?.mock.spies.requestCheckoutValidation.mockResolvedValue(false);

            const actions = await click();
            await el.updateComplete;

            expect(mounted?.mock.spies.requestCheckoutValidation).toHaveBeenCalledTimes(1);
            expect(actions.reject).toHaveBeenCalledTimes(1);
            expect(actions.resolve).not.toHaveBeenCalled();
            expect(sdk.paypalCheckout.createPayment).not.toHaveBeenCalled();
        });

        it('clears its own error on the next click', async () => {
            const el = await mountPayPal(sdk);
            sdk.buttons.get('paypal')?.onError?.(new Error('popup closed'));
            await el.updateComplete;
            expect(el.querySelector('[role="alert"]')).not.toBeNull();
            await click();
            await el.updateComplete;
            expect(el.querySelector('[role="alert"]')).toBeNull();
        });

        it('validates every funding button', async () => {
            await mountPayPal(sdk);
            expect(typeof sdk.buttons.get('paylater')?.onClick).toBe('function');
        });
    });

    it('creates the payment from the live quote: amount, currency, locale, shipping override, line items', async () => {
        await mountPayPal(sdk);
        await sdk.buttons.get('paypal')?.createOrder();

        expect(sdk.paypalCheckout.createPayment).toHaveBeenCalledWith({
            flow: 'checkout',
            amount: '36.81',
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
                    name: 'Joust Duffle Bag',
                    kind: 'debit',
                    quantity: '1.00',
                    unitAmount: '34.00',
                    productCode: expect.any(String),
                    description: '',
                },
                { name: 'Tax', kind: 'debit', quantity: '1.00', unitAmount: '2.81' },
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
        expect(await isValid()).toBe(false);

        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk, { orderID: 'PAYPAL-ORDER-ID' });
        await el.updateComplete;

        expect(sdk.paypalCheckout.tokenizePayment).toHaveBeenCalledWith({ orderID: 'PAYPAL-ORDER-ID' });
        expect(el.querySelector('[data-paypal-approved]')?.textContent).toContain('buyer@example.com');
        expect(await isValid()).toBe(true);
        expect(await paymentData()).toEqual({
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
        expect((await paymentData())['is_active_payment_token_enabler']).toBe(true);
    });

    it('lets the shopper switch to another PayPal account', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk);
        await el.updateComplete;

        el.querySelector<HTMLButtonElement>('[data-paypal-approved] + button')?.click();
        await el.updateComplete;

        expect(approvalOf(el)).toBeNull();
        expect(el.querySelector('[data-paypal-approved]')).toBeNull();
        expect(await isValid()).toBe(false);
    });

    it('drops the approval when the order total changes', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk);

        setBaseGrandTotal(store, '61.2900');
        await el.updateComplete;

        expect(await isValid()).toBe(false);
        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_paypal_amount_changed'));
        await expect(paymentData()).rejects.toThrow(
            t('Hyperion_Checkout::braintree_paypal_not_authorised')
        );
    });

    it('binds the approval to the shipping address PayPal was shown', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk);
        expect(await isValid()).toBe(true);

        store.shippingAddress.set({ ...ITALIAN_ADDRESS, city: 'Torino', postcode: '10121' });
        await el.updateComplete;

        expect(await isValid()).toBe(false);
        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_paypal_address_changed'));
        expect(el.textContent).not.toContain(t('Hyperion_Checkout::braintree_paypal_amount_changed'));
        await expect(paymentData()).rejects.toThrow(
            t('Hyperion_Checkout::braintree_paypal_not_authorised')
        );
    });

    it('keeps the approval when a field PayPal never saw changes', async () => {
        await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk);

        store.shippingAddress.set({ ...ITALIAN_ADDRESS, telephone: '+39 011 7654321' });

        expect(await isValid()).toBe(true);
    });

    it('binds the approval to what was sent, not to the quote at approval time', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);

        await sdk.buttons.get('paypal')?.createOrder();
        const sent = sdk.paypalCheckout.createPayment.mock.calls[0]?.[0];
        // The quote changes while the PayPal popup is open.
        store.shippingAddress.set({ ...ITALIAN_ADDRESS, street: ['Corso Francia 9'] });
        setBaseGrandTotal(store, '61.2900');
        await sdk.buttons.get('paypal')?.onApprove({});

        expect(approvalOf(el)).toMatchObject({
            amount: '36.81',
            fingerprint: approvalFingerprint(sent.amount, sent.shippingAddressOverride),
        });
        expect(await isValid()).toBe(false);
    });

    it('binds the approval of a virtual cart to the amount alone', async () => {
        store.isVirtual.set(true);
        store.billingAddress.set(store.shippingAddress.get());
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk);

        expect(approvalOf(el)?.fingerprint).toBe(JSON.stringify(['36.81', null]));
        store.shippingAddress.set({ ...ITALIAN_ADDRESS, city: 'Torino' });
        expect(await isValid()).toBe(true);
    });

    it('refuses an approval for a payment it did not create', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);

        await expect(sdk.buttons.get('paypal')?.onApprove({})).rejects.toThrow();
        expect(approvalOf(el)).toBeNull();
        expect(sdk.paypalCheckout.tokenizePayment).not.toHaveBeenCalled();
    });

    it('asks for no reCAPTCHA form on the order', () => {
        expect(PaymentBraintreePaypal.hyperionRecaptchaAction()).toBeNull();
    });

    it('drops the single-use nonce after a failed order', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk);

        el.orderFailed();
        expect(approvalOf(el)).toBeNull();
        expect(await isValid()).toBe(false);
    });

    it('keeps an approval across a method switch without reloading the SDK', async () => {
        const el = await mountPayPal(sdk);
        sdk.paypalCheckout.tokenizePayment.mockResolvedValue(PAYPAL_PAYLOAD);
        await approve(sdk);
        const loads = sdk.loader.mock.calls.length;

        // Another method is selected: the host takes the element off the page, then puts it back.
        el.remove();
        document.body.appendChild(el);
        await el.updateComplete;
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(el.querySelector('[data-paypal-approved]')).not.toBeNull();
        expect(sdk.loader.mock.calls.length).toBe(loads);
        expect(await isValid()).toBe(true);
    });

    it('reports a PayPal error inline', async () => {
        const el = await mountPayPal(sdk);
        sdk.buttons.get('paypal')?.onError?.(new Error('popup closed'));
        await el.updateComplete;
        expect(el.querySelector('[role="alert"]')?.textContent).toContain(
            t('Hyperion_Checkout::braintree_paypal_failed')
        );
    });

    it('shows a retry when PayPal cannot be initialized', async () => {
        sdk.paypalCheckoutCreate.mockRejectedValue(new Error('PAYPAL_NOT_ENABLED'));
        const el = mountElement();
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
