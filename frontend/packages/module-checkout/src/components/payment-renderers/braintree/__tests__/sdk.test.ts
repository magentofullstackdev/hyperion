// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    BRAINTREE_SDK_VERSION,
    BraintreeSdkLoadError,
    GOOGLE_PAY_LIBRARY_URL,
    braintreeScriptUrl,
    loadBraintreeModule,
    loadGooglePayLibrary,
} from '../sdk.js';

const CLIENT_URL = `https://js.braintreegateway.com/web/${BRAINTREE_SDK_VERSION}/js/client.min.js`;

describe('Braintree SDK loader', () => {
    afterEach(() => {
        delete window.braintree;
        delete window.google;
    });

    it('pins the SDK version of PayPal_Braintree 4.8', () => {
        expect(BRAINTREE_SDK_VERSION).toBe('3.123.1');
        expect(braintreeScriptUrl('paypal-checkout')).toBe(
            'https://js.braintreegateway.com/web/3.123.1/js/paypal-checkout.min.js'
        );
    });

    it('builds every script URL from the single pinned version', () => {
        expect(braintreeScriptUrl('client')).toBe(CLIENT_URL);
        for (const name of ['hosted-fields', 'data-collector', 'three-d-secure', 'paypal-checkout', 'google-payment'] as const) {
            expect(braintreeScriptUrl(name)).toBe(
                `https://js.braintreegateway.com/web/${BRAINTREE_SDK_VERSION}/js/${name}.min.js`
            );
        }
    });

    it('loads the script through the context loader and answers the module it registered', async () => {
        const create = vi.fn();
        const loadScript = vi.fn(async () => { window.braintree = { client: { create } }; });

        const client = await loadBraintreeModule({ loadScript }, 'client');

        expect(loadScript).toHaveBeenCalledWith(CLIENT_URL);
        expect(client.create).toBe(create);
    });

    it('rejects when the script fails, and a later call asks the loader again', async () => {
        const loadScript = vi.fn()
            .mockRejectedValueOnce(new Error('network'))
            .mockImplementationOnce(async () => { window.braintree = { client: { create: vi.fn() } }; });

        await expect(loadBraintreeModule({ loadScript }, 'client')).rejects.toBeInstanceOf(BraintreeSdkLoadError);
        await expect(loadBraintreeModule({ loadScript }, 'client')).resolves.toBeDefined();
        expect(loadScript).toHaveBeenCalledTimes(2);
    });

    it('rejects when the script loaded but did not register its module', async () => {
        await expect(loadBraintreeModule({ loadScript: vi.fn().mockResolvedValue(undefined) }, 'hosted-fields'))
            .rejects.toBeInstanceOf(BraintreeSdkLoadError);
    });

    it('loads the Google Pay API through the same loader', async () => {
        const PaymentsClient = class {};
        const loadScript = vi.fn(async () => { window.google = { payments: { api: { PaymentsClient } } } as never; });
        const google = await loadGooglePayLibrary({ loadScript });
        expect(loadScript).toHaveBeenCalledWith(GOOGLE_PAY_LIBRARY_URL);
        expect(google.payments.api.PaymentsClient).toBe(PaymentsClient);
        await expect(loadGooglePayLibrary({ loadScript: vi.fn().mockRejectedValue(new Error('blocked')) }))
            .rejects.toBeInstanceOf(BraintreeSdkLoadError);
    });
});
