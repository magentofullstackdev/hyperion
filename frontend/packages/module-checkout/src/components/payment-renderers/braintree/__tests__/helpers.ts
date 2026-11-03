// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Shared setup of the Braintree renderer tests: a checkout config built from
 * the customer capture plus the hand-written Braintree slice, a seeded store,
 * and a `window.braintree` double served through the injectable script loader.
 */
import { vi, type Mock } from 'vitest';

import customerFixture from '../../../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import braintreeFixture from '../../../../fixtures/payment.braintree.json' with { type: 'json' };
import { setCheckoutConfig } from '../../../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../../../store/index.js';
import type { Address } from '../../../../types/address.js';
import type { CheckoutConfig } from '../../../../types/config.js';
import type { Totals } from '../../../../types/totals.js';
import { resetBraintreeClientsForTests } from '../client.js';
import { setScriptLoaderForTests } from '../sdk.js';
import type { HostedFieldsEvent, PayPalButtonsOptions } from '../types.js';

type Json = Record<string, unknown>;

export const DEVICE_DATA = '{"correlation_id":"fixture-device"}';

export const ITALIAN_ADDRESS: Address = {
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['Via Roma 1', 'Interno 4'],
    city: 'Milano',
    postcode: '20121',
    country_id: 'IT',
    telephone: '+39 02 1234567',
    region: { region: 'Milano', region_code: 'MI', region_id: 0 as never },
};

/** Customer capture + Braintree slice; `patch` overrides entries of `payment`. */
export function installCheckoutConfig(patch: Record<string, Json> = {}, extra: Json = {}): CheckoutConfig {
    const base = customerFixture as unknown as Json;
    const braintree = braintreeFixture as unknown as { payment: Record<string, Json>; vault: Json; paymentMethods: unknown };
    const payment: Record<string, Json> = { ...(base['payment'] as Record<string, Json>), ...braintree.payment };
    for (const [code, slice] of Object.entries(patch)) {
        payment[code] = { ...(payment[code] ?? {}), ...slice };
    }
    const config = {
        ...base,
        payment,
        vault: braintree.vault,
        paymentMethods: braintree.paymentMethods,
        ...extra,
    } as unknown as CheckoutConfig;
    setCheckoutConfig(config);
    return config;
}

export function installStore(): Store {
    const store = createStore();
    setStoreForTests(store);
    const config = customerFixture as unknown as CheckoutConfig;
    store.isGuest.set(false);
    store.email.set('roni_cost@example.com');
    store.shippingAddress.set(ITALIAN_ADDRESS);
    store.billingSameAsShipping.set(true);
    store.items.set(config.quoteItemData);
    store.totals.set(config.totalsData);
    return store;
}

export function setBaseGrandTotal(store: Store, amount: string): void {
    store.totals.set({ ...(store.totals.get() as Totals), base_grand_total: amount });
}

export interface BraintreeDouble {
    loader: Mock<(url: string) => Promise<void>>;
    clientCreate: Mock;
    hostedFieldsCreate: Mock;
    hostedFields: {
        on: Mock;
        tokenize: Mock;
        teardown: Mock;
        focus: Mock;
        emit: (event: string, payload: Partial<HostedFieldsEvent>) => void;
    };
    dataCollectorCreate: Mock;
    threeDSecureCreate: Mock;
    threeDSecure: { verifyCard: Mock; teardown: Mock };
    paypalCheckoutCreate: Mock;
    paypalCheckout: { loadPayPalSDK: Mock; createPayment: Mock; tokenizePayment: Mock; teardown: Mock };
    /** Options of every `paypal.Buttons()` call, by funding source. */
    buttons: Map<string, PayPalButtonsOptions>;
    buttonRender: Mock;
}

export function installBraintreeDouble(options: { eligible?: readonly string[] } = {}): BraintreeDouble {
    const eligible = options.eligible ?? ['paypal', 'credit', 'paylater'];
    const handlers = new Map<string, (event: HostedFieldsEvent) => void>();
    const hostedFields = {
        on: vi.fn((event: string, handler: (e: HostedFieldsEvent) => void) => { handlers.set(event, handler); }),
        tokenize: vi.fn(),
        teardown: vi.fn().mockResolvedValue(undefined),
        focus: vi.fn(),
        emit: (event: string, payload: Partial<HostedFieldsEvent>): void => {
            handlers.get(event)?.({ emittedBy: 'number', cards: [], fields: {}, ...payload });
        },
    };
    const threeDSecure = {
        verifyCard: vi.fn(),
        teardown: vi.fn().mockResolvedValue(undefined),
    };
    const buttons = new Map<string, PayPalButtonsOptions>();
    const buttonRender = vi.fn().mockResolvedValue(undefined);
    const paypalCheckout = {
        loadPayPalSDK: vi.fn(async () => {
            window.paypal = {
                Buttons: (buttonOptions: PayPalButtonsOptions) => {
                    buttons.set(buttonOptions.fundingSource, buttonOptions);
                    return {
                        isEligible: () => eligible.includes(buttonOptions.fundingSource),
                        render: buttonRender,
                        close: vi.fn().mockResolvedValue(undefined),
                    };
                },
            };
        }),
        createPayment: vi.fn().mockResolvedValue('PAYPAL-ORDER-ID'),
        tokenizePayment: vi.fn(),
        teardown: vi.fn().mockResolvedValue(undefined),
    };
    const clientCreate = vi.fn().mockResolvedValue({ getVersion: () => '3.112.0' });
    const hostedFieldsCreate = vi.fn().mockResolvedValue(hostedFields);
    const dataCollectorCreate = vi.fn().mockResolvedValue({ deviceData: DEVICE_DATA });
    const threeDSecureCreate = vi.fn().mockResolvedValue(threeDSecure);
    const paypalCheckoutCreate = vi.fn().mockResolvedValue(paypalCheckout);

    const loader = vi.fn(async (_src: string): Promise<void> => {
        window.braintree = {
            client: { create: clientCreate },
            hostedFields: { create: hostedFieldsCreate },
            dataCollector: { create: dataCollectorCreate },
            threeDSecure: { create: threeDSecureCreate },
            paypalCheckout: { create: paypalCheckoutCreate },
        };
    });
    setScriptLoaderForTests(loader);
    resetBraintreeClientsForTests();

    return {
        loader,
        clientCreate,
        hostedFieldsCreate,
        hostedFields,
        dataCollectorCreate,
        threeDSecureCreate,
        threeDSecure,
        paypalCheckoutCreate,
        paypalCheckout,
        buttons,
        buttonRender,
    };
}

export function uninstallBraintreeDouble(): void {
    setScriptLoaderForTests(null);
    resetBraintreeClientsForTests();
    delete window.braintree;
    delete window.paypal;
    document.body.replaceChildren();
}
