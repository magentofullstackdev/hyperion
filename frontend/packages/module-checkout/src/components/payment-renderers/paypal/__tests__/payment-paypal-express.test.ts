// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import customerFixture from '../../../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import { configureApiClient, resetApiClientForTests } from '../../../../api/client.js';
import { setCheckoutConfig } from '../../../../bootstrap-config.js';
import { initFlowActions, resetFlowActionsForTests } from '../../../../store/flow-actions.js';
import { resetFlowSelectorsForTests } from '../../../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../../../store/index.js';
import type { Address } from '../../../../types/address.js';
import type { CheckoutConfig, PaypalExpressConfig } from '../../../../types/config.js';
import type { Totals } from '../../../../types/totals.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import { navigateTo } from '../../../../utils/navigate.js';
import '../../../place-order-button.js';
import { getPaymentRenderer, type PaymentRenderer } from '../../registry.js';
import { getPaypalExpressConfig } from '../config.js';
import {
    PaymentPaypalExpress,
    approvePaypalOrder,
    createPaypalOrder,
} from '../payment-paypal-express.js';
import { PAYPAL_SDK_NAMESPACE, setPaypalScriptLoaderForTests } from '../sdk.js';
import type { PaypalButtonsOptions } from '../types.js';

vi.mock('../../../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));

const ORIGIN = window.location.origin;
const SDK_URL = 'https://www.paypal.com/sdk/js?client-id=sandbox-client&currency=EUR&components=messages%2Cbuttons';

const SECTION: PaypalExpressConfig = {
    inContext: true,
    sdkUrl: SDK_URL,
    dataAttributes: { 'data-partner-attribution-id': 'Magento_2_Community', 'data-csp-nonce': 'nonce-fixture' },
    styles: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
    getTokenUrl: `${ORIGIN}/en/paypal/express/getTokenData/`,
    onAuthorizeUrl: `${ORIGIN}/en/paypal/express/onAuthorization/`,
    onCancelUrl: `${ORIGIN}/en/paypal/express/cancel/`,
    startUrls: { paypal_express: `${ORIGIN}/en/paypal/express/start/` },
    markImageUrl: 'https://www.paypalobjects.com/webstatic/en_US/i/buttons/pp-acceptance-medium.png',
    whatIsPaypalUrl: 'https://www.paypal.com/us/cgi-bin/webscr?cmd=xpt/Marketing/popup/OLCWhatIsPayPal-outside',
    payLater: {
        enabled: true,
        position: 'near_pp_button',
        displayAmount: true,
        attributes: {
            'data-pp-style-layout': 'text',
            'data-pp-style-logo-type': 'primary',
            'data-pp-placement': 'payment',
        },
    },
};

const ADDRESS: Address = {
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['Via Roma 1'],
    city: 'Milano',
    postcode: '20121',
    country_id: 'IT',
    telephone: '+39 02 1234567',
};

interface SdkDouble {
    loader: Mock;
    buttons: PaypalButtonsOptions[];
    buttonRender: Mock;
    buttonClose: Mock;
    messages: Mock;
    messageRender: Mock;
}

function installConfig(section: Partial<PaypalExpressConfig> | null): void {
    const base = customerFixture as unknown as CheckoutConfig;
    setCheckoutConfig({
        ...base,
        hyperion: {
            ...base.hyperion,
            ...(section === null ? {} : { paypalExpress: { ...SECTION, ...section } }),
        },
    });
}

function installStore(code: string): Store {
    const config = customerFixture as unknown as CheckoutConfig;
    const store = createStore();
    setStoreForTests(store);
    store.isGuest.set(false);
    store.quoteId.set('42' as never);
    store.customer.set(config.customerData as never);
    store.email.set('roni_cost@example.com');
    store.shippingAddress.set(ADDRESS);
    store.billingSameAsShipping.set(true);
    // The quote carries a confirmed flat rate: the Place Order gate is open.
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
    store.availablePaymentMethods.set([{ code, title: 'PayPal' }]);
    store.selectedPaymentMethod.set(code);
    store.totals.set(config.totalsData);
    return store;
}

function installSdkDouble(): SdkDouble {
    const buttons: PaypalButtonsOptions[] = [];
    const buttonRender = vi.fn().mockResolvedValue(undefined);
    const buttonClose = vi.fn().mockResolvedValue(undefined);
    const messageRender = vi.fn().mockResolvedValue(undefined);
    const messages = vi.fn(() => ({ render: messageRender }));
    const loader = vi.fn(async (): Promise<void> => {
        (window as unknown as Record<string, unknown>)[PAYPAL_SDK_NAMESPACE] = {
            Buttons: (options: PaypalButtonsOptions) => {
                buttons.push(options);
                return { isEligible: () => true, render: buttonRender, close: buttonClose };
            },
            Messages: messages,
        };
    });
    setPaypalScriptLoaderForTests(loader);
    return { loader, buttons, buttonRender, buttonClose, messages, messageRender };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function renderer(code = 'paypal_express'): PaymentRenderer {
    const found = getPaymentRenderer(code);
    if (!found) throw new Error(`${code} renderer is not registered`);
    return found;
}

async function mount(code = 'paypal_express'): Promise<PaymentPaypalExpress> {
    const el = document.createElement('payment-paypal-express');
    el.setAttribute('code', code);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

async function mountWithButton(sdk: SdkDouble): Promise<PaymentPaypalExpress> {
    const el = await mount();
    await vi.waitFor(() => expect(sdk.buttonRender).toHaveBeenCalled());
    await el.updateComplete;
    return el;
}

function calls(fetchMock: Mock): Array<{ url: string; method: string; body: string }> {
    return fetchMock.mock.calls.map(([url, init]) => ({
        url: String(url),
        method: String((init as RequestInit | undefined)?.method ?? 'GET'),
        body: String((init as RequestInit | undefined)?.body ?? ''),
    }));
}

describe('<payment-paypal-express>', () => {
    let store: Store;
    let sdk: SdkDouble;
    let fetchMock: Mock;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        installConfig({});
        store = installStore('paypal_express');
        resetFlowSelectorsForTests();
        resetFlowActionsForTests();
        initFlowActions();
        sdk = installSdkDouble();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        configureApiClient({
            baseUrl: ORIGIN,
            storeCode: 'en',
            readFormKey: () => 'form-key-fixture',
            readCustomerToken: () => null,
            fetch: fetchMock as unknown as typeof fetch,
        });
        document.cookie = 'form_key=form-key-fixture';
        vi.mocked(navigateTo).mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        document.body.replaceChildren();
        setPaypalScriptLoaderForTests(null);
        delete (window as unknown as Record<string, unknown>)[PAYPAL_SDK_NAMESPACE];
        resetApiClientForTests();
        resetFlowActionsForTests();
        resetFlowSelectorsForTests();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('config gating', () => {
        it('is unavailable without the server section', async () => {
            installConfig(null);

            expect(getPaypalExpressConfig()).toBeNull();
            expect(renderer().isAvailable?.({ code: 'paypal_express', title: 'PayPal' })).toBe(false);
            expect(renderer().ownsPlaceOrder?.()).toBe(false);

            const el = await mount();
            expect(el.children.length).toBe(0);
            expect(sdk.loader).not.toHaveBeenCalled();
        });

        it('offers a method only when the server lists its start URL', () => {
            expect(renderer().isAvailable?.({ code: 'paypal_express', title: 'PayPal' })).toBe(true);
            expect(renderer('payflow_express').isAvailable?.({ code: 'payflow_express', title: 'PayPal' }))
                .toBe(false);
        });

        it('owns Place Order in context only, and never for the Payflow edition', () => {
            expect(renderer().ownsPlaceOrder?.()).toBe(true);

            installConfig({
                startUrls: {
                    paypal_express: `${ORIGIN}/en/paypal/express/start/`,
                    payflow_express: `${ORIGIN}/en/paypal/payflowexpress/start/`,
                },
            });
            expect(renderer('payflow_express').ownsPlaceOrder?.()).toBe(false);

            installConfig({ inContext: false });
            expect(renderer().ownsPlaceOrder?.()).toBe(false);
        });
    });

    describe('in context', () => {
        it('does not request the SDK before the element exists', () => {
            expect(renderer().ownsPlaceOrder?.()).toBe(true);
            expect(sdk.loader).not.toHaveBeenCalled();
        });

        it('loads the SDK once with the server attributes and renders the styled button', async () => {
            const el = await mountWithButton(sdk);

            expect(sdk.loader).toHaveBeenCalledTimes(1);
            expect(sdk.loader).toHaveBeenCalledWith(SDK_URL, {
                'data-partner-attribution-id': 'Magento_2_Community',
                'data-csp-nonce': 'nonce-fixture',
                'data-namespace': PAYPAL_SDK_NAMESPACE,
            });
            expect(sdk.buttons).toHaveLength(1);
            expect(sdk.buttons[0]?.style).toEqual(SECTION.styles);
            expect(sdk.buttonRender).toHaveBeenCalledWith(el.querySelector('[data-paypal-express-button]'));

            el.remove();
            await mountWithButton(sdk);
            expect(sdk.loader).toHaveBeenCalledTimes(1);
        });

        it('renders the Pay Later message for the grand total and again when it changes', async () => {
            const el = await mountWithButton(sdk);
            const message = el.querySelector<HTMLElement>('[data-pp-message]');

            await vi.waitFor(() => expect(sdk.messageRender).toHaveBeenCalledTimes(1));
            expect(message?.getAttribute('data-pp-amount')).toBe('56.29');
            expect(message?.getAttribute('data-pp-placement')).toBe('payment');
            expect(message?.getAttribute('data-pp-style-layout')).toBe('text');
            expect(sdk.messages).toHaveBeenLastCalledWith({ amount: 56.29 });
            expect(sdk.messageRender).toHaveBeenLastCalledWith(message);

            store.totals.set({ ...(store.totals.get() as Totals), base_grand_total: '80.00' as never });
            await vi.waitFor(() => expect(sdk.messageRender).toHaveBeenCalledTimes(2));
            expect(message?.getAttribute('data-pp-amount')).toBe('80.00');
            expect(sdk.messages).toHaveBeenLastCalledWith({ amount: 80 });
        });

        it('leaves the message out when Pay Later is off', async () => {
            installConfig({ payLater: null });
            const el = await mountWithButton(sdk);

            expect(el.querySelector('[data-pp-message]')).toBeNull();
            expect(sdk.messages).not.toHaveBeenCalled();
        });

        it('saves the payment information, then asks for the token', async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse(true))
                .mockResolvedValueOnce(jsonResponse({ success: true, error_message: '', token: 'EC-TOKEN' }));
            await mountWithButton(sdk);

            await expect(sdk.buttons[0]?.createOrder()).resolves.toBe('EC-TOKEN');

            const [save, token] = calls(fetchMock);
            expect(save?.method).toBe('POST');
            expect(save?.url).toBe(`${ORIGIN}/rest/en/V1/carts/mine/set-payment-information`);
            expect(JSON.parse(save?.body ?? '{}')).toMatchObject({
                paymentMethod: { method: 'paypal_express' },
                billingAddress: { city: 'Milano', country_id: 'IT' },
            });
            expect(token?.method).toBe('GET');
            const tokenUrl = new URL(token?.url ?? '');
            expect(tokenUrl.pathname).toBe('/en/paypal/express/getTokenData/');
            expect(Object.fromEntries(tokenUrl.searchParams)).toEqual({
                quote_id: '42',
                customer_id: '1',
                form_key: 'form-key-fixture',
                button: '0',
            });
            expect(store.globalError.get()).toBeNull();
        });

        it('uses the guest endpoint and the masked quote id for guests', async () => {
            store.isGuest.set(true);
            store.quoteId.set(null);
            store.maskedQuoteId.set('masked-quote-id' as never);
            store.email.set('guest@example.com');
            fetchMock
                .mockResolvedValueOnce(jsonResponse(true))
                .mockResolvedValueOnce(jsonResponse({ success: true, token: 'EC-GUEST' }));

            await expect(createPaypalOrder()).resolves.toBe('EC-GUEST');

            const [save, token] = calls(fetchMock);
            expect(save?.url).toBe(`${ORIGIN}/rest/en/V1/guest-carts/masked-quote-id/set-payment-information`);
            expect(JSON.parse(save?.body ?? '{}')).toMatchObject({ email: 'guest@example.com' });
            expect(new URL(token?.url ?? '').searchParams.get('quote_id')).toBe('masked-quote-id');
        });

        it('refuses the click while the checkout is incomplete', async () => {
            store.selectedShippingMethod.set(null);
            await mountWithButton(sdk);
            const actions = { resolve: vi.fn(), reject: vi.fn() };

            sdk.buttons[0]?.onClick({ fundingSource: 'paypal' }, actions);

            expect(actions.reject).toHaveBeenCalled();
            expect(actions.resolve).not.toHaveBeenCalled();
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::checkout_incomplete_shipping_method'));
            await expect(sdk.buttons[0]?.createOrder()).rejects.toThrow();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('stops before the token when the payment information is rejected', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Please accept the agreements.' }, 400));
            await mountWithButton(sdk);

            await expect(sdk.buttons[0]?.createOrder()).rejects.toThrow();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(store.globalError.get()).toBe('Please accept the agreements.');
        });

        it('shows the reason PayPal refused the token, and the SDK error does not replace it', async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse(true))
                .mockResolvedValueOnce(jsonResponse({ success: false, error_message: 'PayPal gateway rejected the request.' }));
            await mountWithButton(sdk);

            await expect(sdk.buttons[0]?.createOrder()).rejects.toThrow();
            sdk.buttons[0]?.onError(new Error('createOrder failed'));

            expect(store.globalError.get()).toBe('PayPal gateway rejected the request.');
        });

        it('reports an SDK error of its own with the generic message', async () => {
            await mountWithButton(sdk);

            sdk.buttons[0]?.onError(new Error('popup closed unexpectedly'));

            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::paypal_express_failed'));
        });

        it('hands the approval to the server and follows its redirect', async () => {
            fetchMock.mockResolvedValueOnce(
                jsonResponse({ success: true, redirectUrl: `${ORIGIN}/en/checkout/onepage/success/` })
            );
            await mountWithButton(sdk);
            sdk.buttons[0]?.onClick({ fundingSource: 'paylater' }, { resolve: vi.fn(), reject: vi.fn() });

            await sdk.buttons[0]?.onApprove({ orderID: 'EC-TOKEN', payerID: 'PAYER-1' });

            const [authorize] = calls(fetchMock);
            expect(authorize?.method).toBe('POST');
            expect(authorize?.url).toBe(SECTION.onAuthorizeUrl);
            expect(Object.fromEntries(new URLSearchParams(authorize?.body))).toEqual({
                paymentToken: 'EC-TOKEN',
                payerId: 'PAYER-1',
                paypalFundingSource: 'paylater',
                form_key: 'form-key-fixture',
            });
            expect(navigateTo).toHaveBeenCalledWith(`${ORIGIN}/en/checkout/onepage/success/`);
            expect(store.isPlacingOrder.get()).toBe(true);
        });

        it('keeps the checkout usable when the approval fails', async () => {
            fetchMock.mockResolvedValueOnce(
                jsonResponse({ success: false, error_message: 'We can\'t process Express Checkout approval.' })
            );

            await approvePaypalOrder({ orderID: 'EC-TOKEN', payerID: 'PAYER-1' });

            expect(navigateTo).not.toHaveBeenCalled();
            expect(store.isPlacingOrder.get()).toBe(false);
            expect(store.globalError.get()).toBe('We can\'t process Express Checkout approval.');
        });

        it('never follows a redirect that leaves the store', async () => {
            fetchMock.mockResolvedValueOnce(
                jsonResponse({ success: true, redirectUrl: 'https://evil.example/phish' })
            );

            await approvePaypalOrder({ orderID: 'EC-TOKEN', payerID: 'PAYER-1' });

            expect(navigateTo).not.toHaveBeenCalled();
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::paypal_express_failed'));
        });

        it('tells the shopper the payment was cancelled and keeps the button', async () => {
            const el = await mountWithButton(sdk);

            sdk.buttons[0]?.onCancel();
            await el.updateComplete;

            expect(el.textContent).toContain(t('Hyperion_Checkout::paypal_express_cancelled'));
            expect(el.querySelector('[data-paypal-express-button]')).not.toBeNull();
            expect(store.globalError.get()).toBeNull();
        });

        it('offers a retry when the SDK cannot be loaded', async () => {
            sdk.loader.mockRejectedValueOnce(new Error('blocked'));
            const el = await mount();

            await vi.waitFor(() =>
                expect(el.textContent).toContain(t('Hyperion_Checkout::paypal_express_init_failed'))
            );
            el.querySelector<HTMLButtonElement>('button')?.click();

            await vi.waitFor(() => expect(sdk.buttonRender).toHaveBeenCalled());
            expect(sdk.loader).toHaveBeenCalledTimes(2);
        });

        it('closes the button when the method is deselected', async () => {
            const el = await mountWithButton(sdk);

            el.remove();

            await vi.waitFor(() => expect(sdk.buttonClose).toHaveBeenCalled());
        });
    });

    describe('redirect flow', () => {
        beforeEach(() => {
            installConfig({ inContext: false, payLater: null });
        });

        it('shows the mark and the redirect note without loading the SDK', async () => {
            const el = await mount();

            expect(el.querySelector('img')?.getAttribute('src')).toBe(SECTION.markImageUrl);
            expect(el.querySelector('a')?.getAttribute('href')).toBe(SECTION.whatIsPaypalUrl);
            expect(el.querySelector('[data-paypal-express-redirect]')?.textContent)
                .toContain(t('Hyperion_Checkout::paypal_express_redirect_note'));
            expect(el.querySelector('[data-paypal-express-button]')).toBeNull();
            await Promise.resolve();
            expect(sdk.loader).not.toHaveBeenCalled();
        });

        it('saves the payment information and resolves with the start URL', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse(true));

            await expect(renderer().placeOrder?.()).resolves.toBe(SECTION.startUrls['paypal_express']);

            const requests = calls(fetchMock);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(`${ORIGIN}/rest/en/V1/carts/mine/set-payment-information`);
        });

        it('stays on the checkout when the payment information is rejected', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'The billing address is invalid.' }, 400));

            await expect(renderer().placeOrder?.()).resolves.toBeNull();

            expect(store.globalError.get()).toBe('The billing address is invalid.');
        });

        it('stays on the checkout while it is incomplete', async () => {
            store.email.set('');

            await expect(renderer().placeOrder?.()).resolves.toBeNull();

            expect(fetchMock).not.toHaveBeenCalled();
            expect(store.globalError.get()).toBe(t('Hyperion_Checkout::checkout_incomplete_email'));
        });
    });

    describe('<place-order-button>', () => {
        async function mountButton(): Promise<HTMLElement> {
            const el = document.createElement('place-order-button');
            document.body.appendChild(el);
            await el.updateComplete;
            return el;
        }

        it('is not rendered while the smart button owns the order', async () => {
            const el = await mountButton();
            expect(el.querySelector('hc-button')).toBeNull();

            store.selectedPaymentMethod.set('checkmo');
            await vi.waitFor(() => expect(el.querySelector('hc-button')).not.toBeNull());

            store.selectedPaymentMethod.set('paypal_express');
            await vi.waitFor(() => expect(el.querySelector('hc-button')).toBeNull());
        });

        it('continues on the start URL instead of placing the order in the redirect flow', async () => {
            installConfig({ inContext: false, payLater: null });
            fetchMock.mockResolvedValueOnce(jsonResponse(true));
            const el = await mountButton();

            el.querySelector('hc-button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            await vi.waitFor(() =>
                expect(navigateTo).toHaveBeenCalledWith(SECTION.startUrls['paypal_express'])
            );
            expect(calls(fetchMock).map((request) => request.url)).toEqual([
                `${ORIGIN}/rest/en/V1/carts/mine/set-payment-information`,
            ]);
        });

        it('stays put and reports the reason when the redirect flow fails', async () => {
            installConfig({ inContext: false, payLater: null });
            fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'The cart is empty.' }, 400));
            const el = await mountButton();

            el.querySelector('hc-button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            await vi.waitFor(() => expect(store.globalError.get()).toBe('The cart is empty.'));
            expect(navigateTo).not.toHaveBeenCalled();
        });
    });
});
