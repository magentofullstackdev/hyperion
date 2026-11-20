// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Store } from '../../../../store/index.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import '../../payment-vault.js';
import '../payment-braintree-card.js';
import '../payment-braintree-googlepay.js';
import '../payment-braintree-vault.js';
import { getPaymentRenderer } from '../../registry.js';
import { getVaultAdapter, getVaultTokens } from '../../vault-tokens.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    uninstallBraintreeDouble,
    type BraintreeDouble,
} from './helpers.js';

type Json = Record<string, unknown>;

const ORIGIN = window.location.origin;
const NONCE_RESPONSE = { paymentMethodNonce: 'vault_nonce_fixture', details: { bin: '411111' } };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function cardToken(extra: Json = {}): Json {
    return {
        config: {
            code: 'braintree_cc_vault',
            nonceUrl: `${ORIGIN}/braintree/payment/getnonce/`,
            details: { type: 'VI', maskedCC: '1111', expirationDate: '12/2030' },
            publicHash: 'hash-visa-1111',
            ...extra,
        },
    };
}

const GOOGLE_PAY_TOKEN: Json = {
    config: {
        code: 'braintree_googlepay_vault',
        nonceUrl: `${ORIGIN}/braintree/payment/getnonce/`,
        details: { type: 'VI', maskedCC: '4242', expirationDate: '08/2031' },
        publicHash: 'hash-googlepay-4242',
    },
};

function hook(code: string): () => Promise<Record<string, unknown>> {
    const found = getPaymentRenderer(code)?.beforePlaceOrder;
    if (!found) throw new Error(`${code} renderer is not registered`);
    return found;
}

describe('Braintree vault adapters', () => {
    let sdk: BraintreeDouble;
    let store: Store;
    let fetchMock: ReturnType<typeof vi.fn>;

    function install(vault: Record<string, Json>, cvvVerify: boolean): void {
        installCheckoutConfig({
            three_d_secure: { enabled: false },
            braintree_cc_vault: { cvvVerify },
            vault,
        });
    }

    async function mountBody(code: string): Promise<HTMLElement> {
        store.selectedPaymentMethod.set(code);
        const el = document.createElement('payment-vault');
        el.setAttribute('code', code);
        document.body.appendChild(el);
        await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
        return el;
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
        async function verify(): Promise<string> {
            const el = await mountBody('braintree_cc_vault');
            await vi.waitFor(() => expect(sdk.hostedFields.on).toHaveBeenCalled());
            await vi.waitFor(() => expect(el.querySelector('[data-hosted-field="cvv"]')).not.toBeNull());
            sdk.hostedFields.tokenize.mockResolvedValue({ nonce: 'cvv_nonce', details: {} });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ success: true }))
                .mockResolvedValueOnce(jsonResponse(NONCE_RESPONSE));
            await hook('braintree_cc_vault')();
            return String(fetchMock.mock.calls[0]?.[0]);
        }

        it('reads the URL from the token config', async () => {
            install({ braintree_cc_vault_0: cardToken({ updatePaymentUrl: `${ORIGIN}/it/braintree/payment/updatepaymentmethod/` }) }, true);
            expect(getVaultTokens('braintree_cc_vault')[0]?.updatePaymentUrl).toBe(
                `${ORIGIN}/it/braintree/payment/updatepaymentmethod/`
            );

            expect(await verify()).toBe(
                `${ORIGIN}/it/braintree/payment/updatepaymentmethod/?nonce=cvv_nonce&public_hash=hash-visa-1111`
            );
        });

        it('derives the URL from the nonce URL when the token config names none', async () => {
            install({ braintree_cc_vault_0: cardToken() }, true);
            expect(getVaultTokens('braintree_cc_vault')[0]?.updatePaymentUrl).toBeNull();

            expect(await verify()).toBe(
                `${ORIGIN}/braintree/payment/updatepaymentmethod/?nonce=cvv_nonce&public_hash=hash-visa-1111`
            );
        });

        it('never sends the CVV nonce to another origin', async () => {
            install({ braintree_cc_vault_0: cardToken({ updatePaymentUrl: 'https://evil.example/updatepaymentmethod/' }) }, true);
            await mountBody('braintree_cc_vault');
            await vi.waitFor(() => expect(sdk.hostedFields.on).toHaveBeenCalled());
            sdk.hostedFields.tokenize.mockResolvedValue({ nonce: 'cvv_nonce', details: {} });

            await expect(hook('braintree_cc_vault')()).rejects.toThrow(
                t('Hyperion_Checkout::braintree_card_cvv_failed')
            );
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('a card stored through Google Pay', () => {
        beforeEach(() => {
            install({ braintree_googlepay_vault_0: GOOGLE_PAY_TOKEN }, true);
        });

        it('has no CVV field, even with CVV re-verification of stored cards on', async () => {
            expect(getVaultAdapter('braintree_googlepay_vault')?.renderBody).toBeUndefined();

            const el = await mountBody('braintree_googlepay_vault');

            expect(el.querySelector('payment-braintree-vault')).toBeNull();
            expect(el.querySelector('[data-hosted-field="cvv"]')).toBeNull();
            expect(sdk.hostedFieldsCreate).not.toHaveBeenCalled();
        });

        it('goes from the nonce to the order without verifying a CVV', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse(NONCE_RESPONSE));
            store.selectedPaymentMethod.set('braintree_googlepay_vault');

            expect(await hook('braintree_googlepay_vault')()).toEqual({
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
            install({ braintree_cc_vault_0: cardToken() }, true);
            store.selectedPaymentMethod.set('braintree_cc_vault');

            await expect(hook('braintree_cc_vault')()).rejects.toThrow(t('Hyperion_Checkout::braintree_not_ready'));
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('reCAPTCHA form of the order', () => {
        it('is none for every Braintree vault code, PayPal and Google Pay', () => {
            install({}, false);
            for (const code of [
                'braintree_cc_vault',
                'braintree_googlepay_vault',
                'braintree_paypal_vault',
                'braintree_googlepay',
            ]) {
                expect(getPaymentRenderer(code)?.recaptchaAction?.()).toBeNull();
            }
        });

        it('is the Braintree form for a new card when the store configured it, the place order form otherwise', () => {
            install({}, false);
            expect(getPaymentRenderer('braintree')?.recaptchaAction?.()).toBe('place_order');

            installCheckoutConfig({}, {
                hyperion: { recaptcha: { braintree: { type: 'v3', siteKey: 'site-key-fixture' } } },
            });
            expect(getPaymentRenderer('braintree')?.recaptchaAction?.()).toBe('braintree');
        });
    });
});
