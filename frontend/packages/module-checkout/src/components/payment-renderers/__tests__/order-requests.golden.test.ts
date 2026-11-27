// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The exact requests every shipped payment renderer makes to place an
 * order: path, method, headers and body of `payment-information` (and of
 * `set-payment-information` and the PayPal controllers where the flow uses
 * them), driven through the payment list and the Place Order button of the
 * real checkout (store, flow actions, REST client) with only the network
 * and the gateway SDKs replaced. These expectations hold whatever the
 * renderers look like inside.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));
vi.mock('../../recaptcha-client.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../recaptcha-client.js')>()),
    executeRecaptcha: vi.fn(async (action: string) => `recaptcha-${action}`),
}));

import guestFixture from '../../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import customerFixture from '../../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import braintreeFixture from '../../../fixtures/payment.braintree.json' with { type: 'json' };
import paymentRenderers from '../../../fixtures/payment-renderers.json' with { type: 'json' };
import enUS from '../../../i18n/en_US.json' with { type: 'json' };
import { configureApiClient, resetApiClientForTests } from '../../../api/client.js';
import { setCheckoutConfig } from '../../../bootstrap-config.js';
import { initFlowActions, resetFlowActionsForTests } from '../../../store/flow-actions.js';
import { initFlowSelectors, resetFlowSelectorsForTests } from '../../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../../store/index.js';
import type { CheckoutConfig } from '../../../types/config.js';
import type { Totals } from '../../../types/totals.js';
import { setActiveCatalogForTests } from '../../../utils/i18n.js';
import { navigateTo } from '../../../utils/navigate.js';
import '../../payment-method-list.js';
import '../../place-order-button.js';

type Json = Record<string, unknown>;

const ORIGIN = window.location.origin;
const REST = `${ORIGIN}/rest/default/V1/`;
const DEVICE_DATA = '{"correlation_id":"golden-device"}';
const PAYPAL_SDK_URL = 'https://www.paypal.com/sdk/js?client-id=sandbox-client&currency=EUR&components=messages%2Cbuttons';

const ADDRESS = {
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['Via Roma 1', 'Interno 4'],
    city: 'Milano',
    postcode: '20121',
    country_id: 'IT',
    telephone: '+39 02 1234567',
    region: { region: 'Milano', region_code: 'MI', region_id: 0 },
};

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

/* ------------------------------------------------------------------ network */

interface Captured {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: unknown;
}

let requests: Captured[] = [];
let fetchMock: Mock;

function headersOf(init: RequestInit | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => { out[key] = value; });
    return out;
}

function bodyOf(init: RequestInit | undefined): unknown {
    const body = init?.body;
    if (body === undefined || body === null) return undefined;
    if (typeof body === 'string') {
        try {
            return JSON.parse(body) as unknown;
        } catch {
            return body;
        }
    }
    if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
    return String(body);
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installNetwork(paymentMethods: readonly Json[], totals: Totals): void {
    requests = [];
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? 'GET').toUpperCase();
        requests.push({ method, url, headers: headersOf(init), body: bodyOf(init) });
        const path = url.startsWith(REST) ? url.slice(REST.length) : url;
        if (method === 'POST' && path.endsWith('/set-payment-information')) return json(true);
        if (method === 'POST' && path.endsWith('/payment-information')) return json(100001);
        if (method === 'GET' && path.endsWith('/payment-information')) {
            return json({ payment_methods: paymentMethods, totals });
        }
        if (url.includes('/braintree/payment/getnonce') || url.includes('/braintree/payment/getNonce')) {
            return json({ paymentMethodNonce: `vault-nonce-${new URL(url).searchParams.get('public_hash')}`, details: { bin: '411111' } });
        }
        if (url.includes('/paypal/express/getTokenData')) return json({ success: true, token: 'EC-GOLDEN' });
        if (url.includes('/paypal/express/onAuthorization')) {
            return json({ success: true, redirectUrl: `${ORIGIN}/checkout/onepage/success/` });
        }
        return json({ message: `unexpected request ${method} ${url}` }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
}

/** The requests that change the quote or place the order, in the order they were sent. */
function orderRequests(): Captured[] {
    return requests.filter((request) => request.method === 'POST'
        || request.url.includes('/braintree/payment/'));
}

function restPath(captured: Captured): string {
    return captured.url.startsWith(REST) ? captured.url.slice(REST.length) : captured.url;
}

/** What the golden expectations compare: one line per request. */
function summary(): Json[] {
    return orderRequests().map((captured) => ({
        method: captured.method,
        path: restPath(captured),
        headers: captured.headers,
        body: captured.body,
    }));
}

const REST_HEADERS = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'x-requested-with': 'XMLHttpRequest',
};

/* ------------------------------------------------------------------ gateway SDKs */

interface Sdk {
    hostedFields: { on: Mock; tokenize: Mock; teardown: Mock; focus: Mock };
    threeDSecure: { verifyCard: Mock; teardown: Mock };
    paypalCheckout: { loadPayPalSDK: Mock; createPayment: Mock; tokenizePayment: Mock; teardown: Mock };
    paypalButtons: Map<string, Record<string, (...args: unknown[]) => unknown>>;
    googlePayment: { createPaymentDataRequest: Mock; parseResponse: Mock; teardown: Mock };
    googlePay: { isReadyToPay: Mock; createButton: Mock; loadPaymentData: Mock };
    googlePayButton: HTMLButtonElement;
    expressButtons: Array<Record<string, (...args: unknown[]) => unknown>>;
}

let sdk: Sdk;
let observer: MutationObserver | null = null;

/**
 * Every gateway script the checkout adds to the head "loads": the globals
 * it would define are installed and its `load` event fires.
 */
function installSdk(): Sdk {
    const paypalButtons = new Map<string, Record<string, (...args: unknown[]) => unknown>>();
    const expressButtons: Array<Record<string, (...args: unknown[]) => unknown>> = [];
    const googlePayButton = document.createElement('button');
    const created: Sdk = {
        hostedFields: {
            on: vi.fn(),
            tokenize: vi.fn().mockResolvedValue({ nonce: 'tokencc_golden', details: { bin: '411111', lastFour: '1111' } }),
            teardown: vi.fn().mockResolvedValue(undefined),
            focus: vi.fn(),
        },
        threeDSecure: {
            verifyCard: vi.fn().mockResolvedValue({ nonce: 'tokencc_golden_3ds', liabilityShifted: true, liabilityShiftPossible: true }),
            teardown: vi.fn().mockResolvedValue(undefined),
        },
        paypalCheckout: {
            loadPayPalSDK: vi.fn(async () => {
                window.paypal = {
                    Buttons: (options: Record<string, (...args: unknown[]) => unknown> & { fundingSource: string }) => {
                        paypalButtons.set(options.fundingSource, options);
                        return {
                            isEligible: () => options.fundingSource === 'paypal',
                            render: vi.fn().mockResolvedValue(undefined),
                            close: vi.fn().mockResolvedValue(undefined),
                        };
                    },
                } as never;
            }),
            createPayment: vi.fn().mockResolvedValue('PAYPAL-GOLDEN'),
            tokenizePayment: vi.fn().mockResolvedValue({ nonce: 'paypal-nonce-golden', details: { email: 'payer@example.com' } }),
            teardown: vi.fn().mockResolvedValue(undefined),
        },
        paypalButtons,
        googlePayment: {
            createPaymentDataRequest: vi.fn((overrides: Json = {}) => ({
                apiVersion: 2,
                apiVersionMinor: 0,
                ...overrides,
                allowedPaymentMethods: [{ type: 'CARD', parameters: {} }],
            })),
            parseResponse: vi.fn().mockResolvedValue({ nonce: 'googlepay-nonce-golden', details: { bin: '411111', isNetworkTokenized: false } }),
            teardown: vi.fn().mockResolvedValue(undefined),
        },
        googlePay: {
            isReadyToPay: vi.fn().mockResolvedValue({ result: true }),
            createButton: vi.fn((options: { onClick: (event: Event) => void }) => {
                googlePayButton.addEventListener('click', options.onClick);
                return googlePayButton;
            }),
            loadPaymentData: vi.fn().mockResolvedValue({ paymentMethodData: { tokenizationData: { token: '{}' } } }),
        },
        googlePayButton,
        expressButtons,
    };
    const install = (src: string): void => {
        if (src.includes('pay.google.com')) {
            window.google = {
                payments: {
                    api: {
                        PaymentsClient: class {
                            public isReadyToPay = created.googlePay.isReadyToPay;
                            public createButton = created.googlePay.createButton;
                            public loadPaymentData = created.googlePay.loadPaymentData;
                        },
                    },
                },
            } as never;
            return;
        }
        if (src.startsWith('https://www.paypal.com/sdk/js')) {
            (window as unknown as Json)['hyperionPaypalExpress'] = {
                Buttons: (options: Record<string, (...args: unknown[]) => unknown>) => {
                    expressButtons.push(options);
                    return { isEligible: () => true, render: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
                },
            };
            return;
        }
        window.braintree = {
            client: { create: vi.fn().mockResolvedValue({ getVersion: () => '3.123.1' }) },
            hostedFields: { create: vi.fn().mockResolvedValue(created.hostedFields) },
            dataCollector: { create: vi.fn().mockResolvedValue({ deviceData: DEVICE_DATA }) },
            threeDSecure: { create: vi.fn().mockResolvedValue(created.threeDSecure) },
            paypalCheckout: { create: vi.fn().mockResolvedValue(created.paypalCheckout) },
            googlePayment: { create: vi.fn().mockResolvedValue(created.googlePayment) },
        } as never;
    };
    // A script a loader cached in an earlier test is not added again: its
    // globals are there from the start, as on a page that loaded it.
    install('https://js.braintreegateway.com/web/3.123.1/js/client.min.js');
    install('https://pay.google.com/gp/p/js/pay.js');
    install(PAYPAL_SDK_URL);
    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLScriptElement) || node.src === '') continue;
                install(node.src);
                setTimeout(() => node.dispatchEvent(new Event('load')), 0);
            }
        }
    });
    observer.observe(document.head, { childList: true });
    return created;
}

/* ------------------------------------------------------------------ checkout */

interface Scenario {
    guest: boolean;
    methods: Json[];
    grandTotal?: string;
    payment?: Record<string, Json>;
    hyperion?: Json;
    vault?: Json;
}

let store: Store;
let root: HTMLElement;

function totalsFor(grandTotal: string): Totals {
    const base = (customerFixture as unknown as CheckoutConfig).totalsData as Totals;
    return { ...base, grand_total: grandTotal, base_grand_total: grandTotal };
}

function setUp(scenario: Scenario): void {
    const fixture = (scenario.guest ? guestFixture : customerFixture) as unknown as Json;
    const braintree = braintreeFixture as unknown as { payment: Record<string, Json>; vault: Json };
    const totals = totalsFor(scenario.grandTotal ?? '10.0000');
    const config = {
        ...fixture,
        storeCode: 'default',
        defaultSuccessPageUrl: `${ORIGIN}/checkout/onepage/success/`,
        payment: { ...(fixture['payment'] as Json), ...braintree.payment, ...(scenario.payment ?? {}) },
        vault: scenario.vault ?? braintree.vault,
        paymentMethods: scenario.methods,
        totalsData: totals,
        hyperion: {
            ...(fixture['hyperion'] as Json),
            paymentRenderers,
            ...(scenario.hyperion ?? {}),
        },
    } as unknown as CheckoutConfig;
    setCheckoutConfig(config);
    installNetwork(scenario.methods, totals);
    configureApiClient({ baseUrl: ORIGIN, storeCode: 'default', readFormKey: () => 'golden-form-key', fetch: fetchMock as unknown as typeof fetch });
    document.cookie = 'form_key=golden-form-key; path=/';

    store = createStore();
    setStoreForTests(store);
    store.isGuest.set(scenario.guest);
    if (scenario.guest) {
        store.maskedQuoteId.set('golden-masked' as never);
    } else {
        store.quoteId.set(42 as never);
        store.customer.set((customerFixture as unknown as CheckoutConfig).customerData as never);
    }
    store.email.set('roni_cost@example.com');
    store.shippingAddress.set(ADDRESS as never);
    store.billingSameAsShipping.set(true);
    store.availableShippingMethods.set([FLATRATE]);
    store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
    store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
    store.items.set((customerFixture as unknown as CheckoutConfig).quoteItemData);
    store.totals.set(totals);
    store.availablePaymentMethods.set(scenario.methods as never);
    initFlowActions();
    initFlowSelectors();

    root = document.createElement('div');
    root.innerHTML = '<payment-method-list></payment-method-list><place-order-button></place-order-button>';
    document.body.appendChild(root);
}

async function radio(key: string): Promise<HTMLInputElement> {
    let input: HTMLInputElement | null = null;
    await vi.waitFor(() => {
        input = root.querySelector<HTMLInputElement>(`#hc-pay-${key}`);
        expect(input).not.toBeNull();
        expect(input?.disabled).toBe(false);
    });
    return input as unknown as HTMLInputElement;
}

async function select(key: string): Promise<void> {
    (await radio(key)).click();
    await vi.waitFor(() => expect(store.selectedPaymentMethod.get()).not.toBeNull());
}

async function pressPlaceOrder(): Promise<void> {
    let button: HTMLElement | null = null;
    await vi.waitFor(() => {
        button = root.querySelector<HTMLElement>('[data-hyperion-place-order]');
        expect(button).not.toBeNull();
    });
    (button as unknown as HTMLElement).click();
}

async function navigated(): Promise<string> {
    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalled(), { timeout: 4000 });
    return vi.mocked(navigateTo).mock.calls[0]?.[0] ?? '';
}

function billingCopy(guest = false): Json {
    return {
        city: 'Milano',
        country_id: 'IT',
        ...(guest ? { email: 'roni_cost@example.com' } : {}),
        firstname: 'Veronica',
        lastname: 'Costello',
        postcode: '20121',
        region: 'Milano',
        region_code: '',
        region_id: 0,
        street: ['Via Roma 1', 'Interno 4'],
        telephone: '+39 02 1234567',
    };
}

function selectionSave(guest: boolean, method: string): Json {
    return {
        method: 'POST',
        path: guest ? 'guest-carts/golden-masked/set-payment-information' : 'carts/mine/set-payment-information',
        headers: REST_HEADERS,
        body: {
            paymentMethod: { method },
            billingAddress: billingCopy(guest),
            ...(guest ? { email: 'roni_cost@example.com' } : {}),
        },
    };
}

function order(guest: boolean, paymentMethod: Json, recaptcha: string | null): Json {
    return {
        method: 'POST',
        path: guest ? 'guest-carts/golden-masked/payment-information' : 'carts/mine/payment-information',
        headers: recaptcha === null ? REST_HEADERS : { ...REST_HEADERS, 'x-recaptcha': recaptcha },
        body: {
            paymentMethod,
            billingAddress: billingCopy(guest),
            ...(guest ? { email: 'roni_cost@example.com' } : {}),
        },
    };
}

const SUCCESS = `${ORIGIN}/checkout/onepage/success/`;

describe('order requests of the shipped payment renderers', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        sdk = installSdk();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.mocked(navigateTo).mockClear();
    });

    afterEach(() => {
        observer?.disconnect();
        observer = null;
        document.body.replaceChildren();
        for (const script of document.head.querySelectorAll('script')) script.remove();
        delete window.braintree;
        delete window.paypal;
        delete window.google;
        delete (window as unknown as Json)['hyperionPaypalExpress'];
        resetFlowActionsForTests();
        resetFlowSelectorsForTests();
        resetApiClientForTests();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe.each(['checkmo', 'banktransfer', 'cashondelivery'])('offline method %s', (code) => {
        it('sends the method code alone, with the place order reCAPTCHA token', async () => {
            setUp({ guest: true, methods: [{ code, title: code }, { code: 'braintree', title: 'Card' }] });
            await select(code);
            await pressPlaceOrder();
            expect(await navigated()).toBe(SUCCESS);
            expect(summary()).toEqual([
                selectionSave(true, code),
                order(true, { method: code }, 'recaptcha-place_order'),
            ]);
        });
    });

    it('free at a zero total sends the method code alone', async () => {
        setUp({ guest: false, methods: [{ code: 'free', title: 'No Payment Information Required' }], grandTotal: '0.0000' });
        store.selectedPaymentMethod.set('free');
        await pressPlaceOrder();
        expect(await navigated()).toBe(SUCCESS);
        expect(summary()).toEqual([
            order(false, { method: 'free' }, 'recaptcha-place_order'),
        ]);
    });

    it('purchase order sends the trimmed number at the top level of the payment', async () => {
        setUp({ guest: true, methods: [{ code: 'purchaseorder', title: 'Purchase Order' }, { code: 'checkmo', title: 'Check' }] });
        await select('purchaseorder');
        let input: HTMLInputElement | null = null;
        await vi.waitFor(() => {
            input = root.querySelector<HTMLInputElement>('input[name="po_number"]');
            expect(input).not.toBeNull();
        });
        const field = input as unknown as HTMLInputElement;
        field.value = '  HYP-PO-7  ';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await pressPlaceOrder();
        expect(await navigated()).toBe(SUCCESS);
        expect(summary()).toEqual([
            selectionSave(true, 'purchaseorder'),
            order(true, { method: 'purchaseorder', po_number: 'HYP-PO-7' }, 'recaptcha-place_order'),
        ]);
    });

    describe('Braintree card', () => {
        const methods = [{ code: 'braintree', title: 'Credit Card' }, { code: 'checkmo', title: 'Check' }];

        async function fillCard(): Promise<void> {
            await select('braintree');
            await vi.waitFor(() => expect(sdk.hostedFields.on).toHaveBeenCalled());
        }

        it('sends the nonce and the device data below the 3D Secure threshold', async () => {
            setUp({ guest: true, methods, vault: { braintree_cc_vault: { is_enabled: false } } });
            await fillCard();
            await pressPlaceOrder();
            expect(await navigated()).toBe(SUCCESS);
            expect(sdk.threeDSecure.verifyCard).not.toHaveBeenCalled();
            expect(summary()).toEqual([
                selectionSave(true, 'braintree'),
                order(true, {
                    method: 'braintree',
                    additional_data: { payment_method_nonce: 'tokencc_golden', device_data: DEVICE_DATA },
                }, 'recaptcha-place_order'),
            ]);
        });

        it('sends the 3D Secure nonce above the threshold', async () => {
            setUp({ guest: true, methods, grandTotal: '100.0000', vault: { braintree_cc_vault: { is_enabled: false } } });
            await fillCard();
            await pressPlaceOrder();
            expect(await navigated()).toBe(SUCCESS);
            expect(sdk.threeDSecure.verifyCard).toHaveBeenCalledTimes(1);
            expect(sdk.threeDSecure.verifyCard.mock.calls[0]?.[0]).toMatchObject({
                amount: '100.00',
                nonce: 'tokencc_golden',
                bin: '411111',
                email: 'roni_cost@example.com',
                billingAddress: { countryCodeAlpha2: 'IT', region: 'MI', streetAddress: 'Via Roma 1', extendedAddress: 'Interno 4' },
            });
            expect(summary()).toEqual([
                selectionSave(true, 'braintree'),
                order(true, {
                    method: 'braintree',
                    additional_data: { payment_method_nonce: 'tokencc_golden_3ds', device_data: DEVICE_DATA },
                }, 'recaptcha-place_order'),
            ]);
        });

        it('sends the vault enabler a customer ticked', async () => {
            setUp({ guest: false, methods });
            await fillCard();
            let box: HTMLInputElement | null = null;
            await vi.waitFor(() => {
                box = root.querySelector<HTMLInputElement>('hc-checkbox[name="braintree_save_card"] input');
                expect(box).not.toBeNull();
            });
            (box as unknown as HTMLInputElement).click();
            await pressPlaceOrder();
            expect(await navigated()).toBe(SUCCESS);
            expect(summary()).toEqual([
                selectionSave(false, 'braintree'),
                order(false, {
                    method: 'braintree',
                    additional_data: {
                        payment_method_nonce: 'tokencc_golden',
                        device_data: DEVICE_DATA,
                        is_active_payment_token_enabler: true,
                    },
                }, 'recaptcha-place_order'),
            ]);
        });
    });

    describe('stored Braintree tokens', () => {
        const vaultPayment = {
            vault: {
                ...((braintreeFixture as unknown as { payment: { vault: Json } }).payment.vault),
                braintree_googlepay_vault_3: {
                    config: {
                        code: 'braintree_googlepay_vault',
                        nonceUrl: `${ORIGIN}/braintree/payment/getnonce/`,
                        details: { type: 'VI', maskedCC: '0004', expirationDate: '01/2031' },
                        publicHash: 'hash-googlepay-0004',
                    },
                },
            },
        };
        const methods = [
            { code: 'braintree_cc_vault', title: 'Stored Cards' },
            { code: 'braintree_paypal_vault', title: 'Stored Accounts (PayPal)' },
            { code: 'braintree_googlepay_vault', title: 'Stored Google Pay cards' },
            { code: 'braintree', title: 'Credit Card' },
        ];
        const vault = {
            braintree_cc_vault: { is_enabled: true },
            braintree_paypal_vault: { is_enabled: true },
            braintree_googlepay_vault: { is_enabled: true },
        };

        it('a stored card is not saved on selection and sends its hash, a fresh nonce through 3D Secure and the device data, without reCAPTCHA', async () => {
            setUp({ guest: false, methods, grandTotal: '100.0000', payment: vaultPayment, vault });
            await select('braintree_cc_vault_1');
            await pressPlaceOrder();
            expect(await navigated()).toBe(SUCCESS);
            expect(summary()).toEqual([
                {
                    method: 'GET',
                    path: `${ORIGIN}/braintree/payment/getnonce/?public_hash=hash-mc-4444`,
                    headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
                    body: undefined,
                },
                order(false, {
                    method: 'braintree_cc_vault',
                    additional_data: {
                        public_hash: 'hash-mc-4444',
                        payment_method_nonce: 'tokencc_golden_3ds',
                        device_data: DEVICE_DATA,
                    },
                }, null),
            ]);
            expect(sdk.threeDSecure.verifyCard.mock.calls[0]?.[0]).toMatchObject({ nonce: 'vault-nonce-hash-mc-4444' });
        });

        it('a stored PayPal account sends its hash and a fresh nonce', async () => {
            setUp({ guest: false, methods, payment: vaultPayment, vault });
            await select('braintree_paypal_vault_2');
            await pressPlaceOrder();
            expect(await navigated()).toBe(SUCCESS);
            expect(summary()).toEqual([
                {
                    method: 'GET',
                    path: `${ORIGIN}/braintree/payment/getNonce/?public_hash=hash-paypal`,
                    headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
                    body: undefined,
                },
                order(false, {
                    method: 'braintree_paypal_vault',
                    additional_data: { public_hash: 'hash-paypal', payment_method_nonce: 'vault-nonce-hash-paypal' },
                }, null),
            ]);
        });

        it('a card stored through Google Pay sends its hash, a fresh nonce and the device data', async () => {
            setUp({ guest: false, methods, payment: vaultPayment, vault });
            await select('braintree_googlepay_vault_3');
            await pressPlaceOrder();
            expect(await navigated()).toBe(SUCCESS);
            expect(summary()).toEqual([
                {
                    method: 'GET',
                    path: `${ORIGIN}/braintree/payment/getnonce/?public_hash=hash-googlepay-0004`,
                    headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
                    body: undefined,
                },
                order(false, {
                    method: 'braintree_googlepay_vault',
                    additional_data: {
                        public_hash: 'hash-googlepay-0004',
                        payment_method_nonce: 'vault-nonce-hash-googlepay-0004',
                        device_data: DEVICE_DATA,
                    },
                }, null),
            ]);
        });
    });

    it('Braintree PayPal sends the approved nonce, the device data and the vault choice', async () => {
        setUp({ guest: false, methods: [{ code: 'braintree_paypal', title: 'PayPal' }, { code: 'checkmo', title: 'Check' }] });
        await select('braintree_paypal');
        await vi.waitFor(() => expect(sdk.paypalButtons.get('paypal')).toBeDefined());
        const button = sdk.paypalButtons.get('paypal') as Record<string, (...args: unknown[]) => unknown>;
        const actions = { resolve: vi.fn(), reject: vi.fn() };
        await button['onClick']?.({}, actions);
        expect(actions.resolve).toHaveBeenCalled();
        await button['createOrder']?.();
        await button['onApprove']?.({ orderID: 'PAYPAL-GOLDEN', payerID: 'PAYER' });
        await vi.waitFor(() => expect(root.querySelector('[data-paypal-approved]')).not.toBeNull());
        await pressPlaceOrder();
        expect(await navigated()).toBe(SUCCESS);
        const sent = summary();
        expect(sent[sent.length - 1]).toEqual(order(false, {
            method: 'braintree_paypal',
            additional_data: {
                payment_method_nonce: 'paypal-nonce-golden',
                device_data: DEVICE_DATA,
                is_active_payment_token_enabler: false,
            },
        }, null));
        expect(sent.slice(0, -1)).toEqual([selectionSave(false, 'braintree_paypal')]);
    });

    it('Google Pay places the order from its own button with the parsed nonce', async () => {
        setUp({ guest: true, methods: [{ code: 'braintree_googlepay', title: 'Google Pay' }, { code: 'checkmo', title: 'Check' }], vault: { braintree_googlepay_vault: { is_enabled: false } } });
        await select('braintree_googlepay');
        await vi.waitFor(() => expect(sdk.googlePay.createButton).toHaveBeenCalled());
        expect(root.querySelector('[data-hyperion-place-order]')).toBeNull();
        sdk.googlePayButton.click();
        expect(await navigated()).toBe(SUCCESS);
        expect(summary()).toEqual([
            selectionSave(true, 'braintree_googlepay'),
            order(true, {
                method: 'braintree_googlepay',
                additional_data: {
                    payment_method_nonce: 'googlepay-nonce-golden',
                    device_data: DEVICE_DATA,
                    is_network_tokenized: false,
                },
            }, null),
        ]);
    });

    describe('PayPal Express', () => {
        const section = {
            inContext: true,
            sdkUrl: PAYPAL_SDK_URL,
            dataAttributes: { 'data-partner-attribution-id': 'Magento_2_Community' },
            styles: { layout: 'vertical', color: 'gold' },
            getTokenUrl: `${ORIGIN}/paypal/express/getTokenData/`,
            onAuthorizeUrl: `${ORIGIN}/paypal/express/onAuthorization/`,
            startUrls: {
                paypal_express: `${ORIGIN}/paypal/express/start/`,
                payflow_express: `${ORIGIN}/paypal/payflowexpress/start/`,
            },
            billingAgreementCode: {},
            markImageUrl: '',
            whatIsPaypalUrl: '',
            payLater: null,
        };

        it('the redirect flow saves the payment information and continues on the start URL', async () => {
            setUp({ guest: false, methods: [{ code: 'payflow_express', title: 'PayPal' }, { code: 'checkmo', title: 'Check' }], hyperion: { paypalExpress: section } });
            await select('payflow_express');
            await pressPlaceOrder();
            expect(await navigated()).toBe(`${ORIGIN}/paypal/payflowexpress/start/`);
            const save = {
                method: 'POST',
                path: 'carts/mine/set-payment-information',
                headers: REST_HEADERS,
                body: { paymentMethod: { method: 'payflow_express' }, billingAddress: billingCopy() },
            };
            expect(summary()).toEqual([save, save]);
        });

        it('in context, the smart button saves the payment information, asks the token and authorizes', async () => {
            setUp({ guest: false, methods: [{ code: 'paypal_express', title: 'PayPal' }, { code: 'checkmo', title: 'Check' }], hyperion: { paypalExpress: section } });
            await select('paypal_express');
            await vi.waitFor(() => expect(sdk.expressButtons.length).toBeGreaterThan(0));
            expect(root.querySelector('[data-hyperion-place-order]')).toBeNull();
            const button = sdk.expressButtons[sdk.expressButtons.length - 1] as Record<string, (...args: unknown[]) => unknown>;
            const actions = { resolve: vi.fn(), reject: vi.fn() };
            await button['onClick']?.({ fundingSource: 'paylater' }, actions);
            expect(actions.resolve).toHaveBeenCalled();
            expect(await button['createOrder']?.()).toBe('EC-GOLDEN');
            await button['onApprove']?.({ orderID: 'EC-GOLDEN', payerID: 'PAYER-1' });
            expect(await navigated()).toBe(SUCCESS);
            const formHeaders = { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' };
            expect(summary()).toEqual([
                selectionSave(false, 'paypal_express'),
                {
                    method: 'POST',
                    path: 'carts/mine/set-payment-information',
                    headers: REST_HEADERS,
                    body: { paymentMethod: { method: 'paypal_express' }, billingAddress: billingCopy() },
                },
                {
                    method: 'POST',
                    path: `${ORIGIN}/paypal/express/getTokenData/`,
                    headers: formHeaders,
                    body: { quote_id: '42', customer_id: '1', form_key: 'golden-form-key', button: '0' },
                },
                {
                    method: 'POST',
                    path: `${ORIGIN}/paypal/express/onAuthorization/`,
                    headers: formHeaders,
                    body: { paymentToken: 'EC-GOLDEN', payerId: 'PAYER-1', paypalFundingSource: 'paylater', form_key: 'golden-form-key' },
                },
            ]);
        });
    });
});
