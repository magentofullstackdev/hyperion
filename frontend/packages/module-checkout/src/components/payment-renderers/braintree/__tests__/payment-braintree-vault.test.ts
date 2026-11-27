// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultTokenInfo } from '../../../../../extension-api.js';
import type { Store } from '../../../../store/index.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import { PaymentBraintreeCard } from '../payment-braintree-card.js';
import { PaymentBraintreeGooglepay } from '../payment-braintree-googlepay.js';
import { PaymentBraintreePaypal } from '../payment-braintree-paypal.js';
import { PaymentBraintreeVault } from '../payment-braintree-vault.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    mountBraintreeElement,
    uninstallBraintreeDouble,
    type BraintreeDouble,
} from './helpers.js';

type Json = Record<string, unknown>;

const ORIGIN = window.location.origin;
const NONCE_RESPONSE = { paymentMethodNonce: 'vault_nonce_fixture', details: { bin: '411111' } };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A token as the payment host hands it to the element. */
function cardToken(extra: Json = {}): VaultTokenInfo & Json {
    return {
        publicHash: 'hash-visa-1111',
        paymentMethodCode: 'braintree_cc_vault',
        details: { type: 'VI', maskedCC: '1111', expirationDate: '12/2030' },
        nonceUrl: `${ORIGIN}/braintree/payment/getnonce/`,
        updatePaymentUrl: null,
        ...extra,
    };
}

const GOOGLE_PAY_TOKEN: VaultTokenInfo & Json = {
    publicHash: 'hash-googlepay-4242',
    paymentMethodCode: 'braintree_googlepay_vault',
    details: { type: 'VI', maskedCC: '4242', expirationDate: '08/2031' },
    nonceUrl: `${ORIGIN}/braintree/payment/getnonce/`,
    updatePaymentUrl: null,
};

const PAYPAL_TOKEN: VaultTokenInfo & Json = {
    publicHash: 'hash-paypal',
    paymentMethodCode: 'braintree_paypal_vault',
    details: { payerEmail: 'roni_cost@example.com' },
    nonceUrl: `${ORIGIN}/braintree/payment/getNonce/`,
    updatePaymentUrl: null,
};

describe('<hc-payment-braintree-vault>', () => {
    let sdk: BraintreeDouble;
    let store: Store;
    let fetchMock: ReturnType<typeof vi.fn>;

    function install(cvvVerify: boolean): void {
        installCheckoutConfig({
            three_d_secure: { enabled: false },
            braintree_cc_vault: { cvvVerify },
        });
    }

    async function mount(token: VaultTokenInfo & Json): Promise<PaymentBraintreeVault> {
        const { element } = mountBraintreeElement<PaymentBraintreeVault>(
            'hc-payment-braintree-vault',
            token.paymentMethodCode,
            store,
            token
        );
        await element.updateComplete;
        return element;
    }

    async function paymentData(el: PaymentBraintreeVault): Promise<Record<string, unknown>> {
        return { ...((await el.getPaymentData()).additional_data ?? {}) };
    }

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        store = installStore();
        sdk = installBraintreeDouble();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        uninstallBraintreeDouble();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('CVV verification URL', () => {
        async function verify(token: VaultTokenInfo & Json): Promise<string> {
            const el = await mount(token);
            await vi.waitFor(() => expect(sdk.hostedFields.on).toHaveBeenCalled());
            await vi.waitFor(() => expect(el.querySelector('[data-hosted-field="cvv"]')).not.toBeNull());
            sdk.hostedFields.tokenize.mockResolvedValue({ nonce: 'cvv_nonce', details: {} });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ success: true }))
                .mockResolvedValueOnce(jsonResponse(NONCE_RESPONSE));
            await el.getPaymentData();
            return String(fetchMock.mock.calls[0]?.[0]);
        }

        it('reads the URL from the token config', async () => {
            install(true);
            expect(await verify(cardToken({ updatePaymentUrl: `${ORIGIN}/it/braintree/payment/updatepaymentmethod/` }))).toBe(
                `${ORIGIN}/it/braintree/payment/updatepaymentmethod/?nonce=cvv_nonce&public_hash=hash-visa-1111`
            );
        });

        it('derives the URL from the nonce URL when the token config names none', async () => {
            install(true);
            expect(await verify(cardToken())).toBe(
                `${ORIGIN}/braintree/payment/updatepaymentmethod/?nonce=cvv_nonce&public_hash=hash-visa-1111`
            );
        });

        it('never sends the CVV nonce to another origin', async () => {
            install(true);
            const el = await mount(cardToken({ updatePaymentUrl: 'https://evil.example/updatepaymentmethod/' }));
            await vi.waitFor(() => expect(sdk.hostedFields.on).toHaveBeenCalled());
            sdk.hostedFields.tokenize.mockResolvedValue({ nonce: 'cvv_nonce', details: {} });

            await expect(el.getPaymentData()).rejects.toThrow(t('Hyperion_Checkout::braintree_card_cvv_failed'));
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('a card stored through Google Pay', () => {
        beforeEach(() => {
            install(true);
        });

        it('has no CVV field, even with CVV re-verification of stored cards on', async () => {
            const el = await mount(GOOGLE_PAY_TOKEN);
            expect(el.querySelector('[data-hosted-field="cvv"]')).toBeNull();
            expect(sdk.hostedFieldsCreate).not.toHaveBeenCalled();
        });

        it('goes from the nonce to the order without verifying a CVV', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse(NONCE_RESPONSE));
            const el = await mount(GOOGLE_PAY_TOKEN);

            expect(await paymentData(el)).toEqual({
                public_hash: 'hash-googlepay-4242',
                payment_method_nonce: 'vault_nonce_fixture',
                device_data: DEVICE_DATA,
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
                `${ORIGIN}/braintree/payment/getnonce/?public_hash=hash-googlepay-4242`
            );
        });

        it('still asks a stored card of the card method for its CVV', async () => {
            const el = mountBraintreeElement<PaymentBraintreeVault>('hc-payment-braintree-vault', 'braintree_cc_vault', store, cardToken()).element;
            sdk.loader.mockRejectedValue(new Error('network'));
            await el.updateComplete;

            await expect(el.getPaymentData()).rejects.toThrow(t('Hyperion_Checkout::braintree_not_ready'));
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    it('a stored PayPal account sends its hash and a fresh nonce, with no field and no device data', async () => {
        install(true);
        fetchMock.mockResolvedValueOnce(jsonResponse(NONCE_RESPONSE));
        const el = await mount(PAYPAL_TOKEN);
        expect(el.querySelector('[data-hosted-field]')).toBeNull();
        expect(await paymentData(el)).toEqual({ public_hash: 'hash-paypal', payment_method_nonce: 'vault_nonce_fixture' });
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${ORIGIN}/braintree/payment/getNonce/?public_hash=hash-paypal`);
    });

    it('refuses to pay without a token', async () => {
        install(false);
        const el = mountBraintreeElement<PaymentBraintreeVault>('hc-payment-braintree-vault', 'braintree_cc_vault', store, null).element;
        await expect(el.getPaymentData()).rejects.toThrow(t('Hyperion_Checkout::vault_no_token_selected'));
    });

    it('reports a nonce the provider refused with its message', async () => {
        install(false);
        fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'The token is no longer valid.' }, 400));
        const el = await mount(cardToken());
        await expect(el.getPaymentData()).rejects.toThrow('The token is no longer valid.');
    });

    describe('reCAPTCHA form of the order', () => {
        it('is none for every Braintree vault code, PayPal and Google Pay', () => {
            expect(PaymentBraintreeVault.hyperionRecaptchaAction()).toBeNull();
            expect(PaymentBraintreePaypal.hyperionRecaptchaAction()).toBeNull();
            expect(PaymentBraintreeGooglepay.hyperionRecaptchaAction()).toBeNull();
        });

        it('is the Braintree form for a new card when the store configured it, the place order form otherwise', () => {
            const config = installCheckoutConfig();
            expect(PaymentBraintreeCard.hyperionRecaptchaAction(config)).toBe('place_order');
            const protectedConfig = installCheckoutConfig({}, {
                hyperion: { recaptcha: { braintree: { type: 'v3', siteKey: 'site-key-fixture' } } },
            });
            expect(PaymentBraintreeCard.hyperionRecaptchaAction(protectedConfig)).toBe('braintree');
        });
    });
});
