// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Store } from '../../../store/index.js';
import type { PaymentMethodConfig } from '../../../types/payment.js';
import { setActiveCatalogForTests, t } from '../../../utils/i18n.js';
import enUS from '../../../i18n/en_US.json' with { type: 'json' };
import '../../payment-method-list.js';
// The list loads gateway modules on demand; the tests need them registered up front.
import '../braintree/payment-braintree-card.js';
import '../braintree/payment-braintree-paypal.js';
import '../braintree/payment-braintree-vault.js';
import { getPaymentRenderer } from '../registry.js';
import {
    buildPaymentRows,
    fetchVaultNonce,
    getSelectedVaultToken,
    getVaultTokens,
    isVaultMethod,
} from '../vault-tokens.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    uninstallBraintreeDouble,
    type BraintreeDouble,
} from '../braintree/__tests__/helpers.js';

const NONCE_RESPONSE = { paymentMethodNonce: 'vault_nonce_fixture', details: { bin: '411111' } };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function hook(code: string): () => Promise<Record<string, unknown>> {
    const found = getPaymentRenderer(code)?.beforePlaceOrder;
    if (!found) throw new Error(`${code} renderer is not registered`);
    return found;
}

describe('stored payment tokens', () => {
    let sdk: BraintreeDouble;
    let store: Store;
    let methods: readonly PaymentMethodConfig[];
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        methods = installCheckoutConfig({ three_d_secure: { enabled: false } }).paymentMethods;
        store = installStore();
        store.availablePaymentMethods.set(methods);
        sdk = installBraintreeDouble();
        fetchMock = vi.fn().mockResolvedValue(jsonResponse(NONCE_RESPONSE));
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        uninstallBraintreeDouble();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('reads one token per `payment.vault` entry', () => {
        expect(getVaultTokens().map((token) => token.key)).toEqual([
            'braintree_cc_vault_0',
            'braintree_cc_vault_1',
            'braintree_paypal_vault_2',
        ]);
        expect(getVaultTokens('braintree_cc_vault')[1]).toEqual({
            key: 'braintree_cc_vault_1',
            code: 'braintree_cc_vault',
            publicHash: 'hash-mc-4444',
            nonceUrl: 'http://localhost:3000/braintree/payment/getnonce/',
            details: { type: 'MC', maskedCC: '4444', expirationDate: '03/2029' },
        });
        expect(isVaultMethod('braintree_cc_vault')).toBe(true);
        expect(isVaultMethod('braintree')).toBe(false);
    });

    it('lists one row per stored token first and no row for the bare vault methods', () => {
        const rows = buildPaymentRows(methods).map((row) => row.token?.key ?? row.method.code);
        expect(rows).toEqual([
            'braintree_cc_vault_0',
            'braintree_cc_vault_1',
            'braintree_paypal_vault_2',
            'braintree',
            'braintree_paypal',
            'checkmo',
        ]);
    });

    it('hides the vault methods from a shopper without stored tokens', () => {
        const { vault: _tokens, ...paymentWithoutTokens } = installCheckoutConfig().payment;
        installCheckoutConfig({}, { payment: paymentWithoutTokens });
        const rows = buildPaymentRows(methods).map((row) => row.method.code);
        expect(rows).toEqual(['braintree', 'braintree_paypal', 'checkmo']);
    });

    it('hides a gateway method whose config carries no client token', () => {
        installCheckoutConfig({ braintree: { clientToken: '' } });
        expect(buildPaymentRows(methods).map((row) => row.method.code)).not.toContain('braintree');
    });

    it('renders the rows with brand, last four and expiry, and selects a token on click', async () => {
        const list = document.createElement('payment-method-list');
        document.body.appendChild(list);
        await list.updateComplete;
        const rows = [...list.querySelectorAll('payment-method-row')];
        await Promise.all(rows.map((row) => row.updateComplete));

        expect(rows).toHaveLength(6);
        expect(rows[0]?.textContent).toContain('Visa ending in 1111 (expires 12/2030)');
        expect(rows[1]?.textContent).toContain('Mastercard ending in 4444 (expires 03/2029)');
        expect(rows[2]?.textContent).toContain('PayPal account roni_cost@example.com');

        rows[1]?.querySelector<HTMLInputElement>('input[type="radio"]')?.dispatchEvent(new Event('change'));
        await list.updateComplete;
        await Promise.all(rows.map((row) => row.updateComplete));

        expect(store.selectedPaymentMethod.get()).toBe('braintree_cc_vault');
        expect(store.paymentMethodData.get()['braintree_cc_vault']).toEqual({ public_hash: 'hash-mc-4444' });
        expect(rows.map((row) => row.selected)).toEqual([false, true, false, false, false, false]);
        expect(rows[1]?.querySelector('payment-vault')).not.toBeNull();
        await vi.waitFor(() => expect(sdk.dataCollectorCreate).toHaveBeenCalled());
    });

    it('fetches the nonce of the selected card and returns the vault additional_data', async () => {
        store.selectedPaymentMethod.set('braintree_cc_vault');
        store.paymentMethodData.set({ braintree_cc_vault: { public_hash: 'hash-mc-4444' } });

        expect(await hook('braintree_cc_vault')()).toEqual({
            public_hash: 'hash-mc-4444',
            payment_method_nonce: 'vault_nonce_fixture',
            device_data: DEVICE_DATA,
        });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://localhost:3000/braintree/payment/getnonce/?public_hash=hash-mc-4444');
        expect(init.method).toBe('GET');
        expect(init.credentials).toBe('same-origin');
        expect(init.headers).toMatchObject({ 'X-Requested-With': 'XMLHttpRequest' });
    });

    it('charges the first token when the vault method is selected without a choice', async () => {
        store.selectedPaymentMethod.set('braintree_cc_vault');
        expect(getSelectedVaultToken('braintree_cc_vault')?.publicHash).toBe('hash-visa-1111');
        expect((await hook('braintree_cc_vault')())['public_hash']).toBe('hash-visa-1111');
    });

    it('runs 3D Secure on the stored card nonce when configured', async () => {
        installCheckoutConfig();
        sdk.threeDSecure.verifyCard.mockResolvedValue({
            nonce: 'vault_nonce_3ds', liabilityShifted: true, liabilityShiftPossible: true,
        });

        const data = await hook('braintree_cc_vault')();

        expect(sdk.threeDSecure.verifyCard.mock.calls[0]?.[0]).toMatchObject({
            nonce: 'vault_nonce_fixture',
            bin: '411111',
            amount: '56.29',
            cardAddChallengeRequested: false,
        });
        expect(data['payment_method_nonce']).toBe('vault_nonce_3ds');
    });

    it('skips 3D Secure for stored cards verified by CVV', async () => {
        installCheckoutConfig({ three_d_secure: { useCvvVault: true } });
        expect((await hook('braintree_cc_vault')())['payment_method_nonce']).toBe('vault_nonce_fixture');
        expect(sdk.threeDSecureCreate).not.toHaveBeenCalled();
    });

    it('rejects with the server message when the nonce cannot be issued', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ message: 'Sorry, but something went wrong' }, 400));
        await expect(hook('braintree_cc_vault')()).rejects.toThrow('Sorry, but something went wrong');
    });

    it('rejects with a translated message on a network failure or a malformed answer', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(hook('braintree_cc_vault')()).rejects.toThrow(t('Hyperion_Checkout::vault_nonce_failed'));

        fetchMock.mockResolvedValueOnce(new Response('<html>login</html>', { status: 200 }));
        await expect(hook('braintree_cc_vault')()).rejects.toThrow(t('Hyperion_Checkout::vault_nonce_failed'));
    });

    it('never sends the public hash to another origin', async () => {
        await expect(fetchVaultNonce({
            key: 'braintree_cc_vault_0',
            code: 'braintree_cc_vault',
            publicHash: 'hash-visa-1111',
            nonceUrl: 'https://evil.example/braintree/payment/getnonce/',
            details: {},
        })).rejects.toThrow(t('Hyperion_Checkout::vault_nonce_failed'));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('pays with a stored PayPal account through the default vault flow', async () => {
        expect(await hook('braintree_paypal_vault')()).toEqual({
            public_hash: 'hash-paypal',
            payment_method_nonce: 'vault_nonce_fixture',
        });
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            'http://localhost:3000/braintree/payment/getNonce/?public_hash=hash-paypal'
        );
    });

    describe('CVV re-verification', () => {
        beforeEach(() => {
            installCheckoutConfig({
                three_d_secure: { enabled: false },
                braintree_cc_vault: { cvvVerify: true },
            });
            store.selectedPaymentMethod.set('braintree_cc_vault');
        });

        async function mountVaultBody(): Promise<HTMLElement> {
            const el = document.createElement('payment-vault');
            el.setAttribute('code', 'braintree_cc_vault');
            document.body.appendChild(el);
            await vi.waitFor(() => expect(sdk.hostedFieldsCreate).toHaveBeenCalled());
            await vi.waitFor(() => expect(sdk.hostedFields.on).toHaveBeenCalled());
            return el;
        }

        it('mounts a hosted CVV field and verifies the card before asking for the nonce', async () => {
            const el = await mountVaultBody();
            const options = sdk.hostedFieldsCreate.mock.calls[0]?.[0];
            expect(Object.keys(options.fields)).toEqual(['cvv']);
            expect(options.fields.cvv.container).toBe(el.querySelector('[data-hosted-field="cvv"]'));

            sdk.hostedFields.tokenize.mockResolvedValue({ nonce: 'cvv_nonce', details: {} });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ success: true }))
                .mockResolvedValueOnce(jsonResponse(NONCE_RESPONSE));

            const data = await hook('braintree_cc_vault')();

            expect(fetchMock.mock.calls[0]?.[0]).toBe(
                'http://localhost:3000/braintree/payment/updatepaymentmethod/?nonce=cvv_nonce&public_hash=hash-visa-1111'
            );
            expect(data['payment_method_nonce']).toBe('vault_nonce_fixture');
        });

        it('rejects when Magento reports a failed CVV verification', async () => {
            await mountVaultBody();
            sdk.hostedFields.tokenize.mockResolvedValue({ nonce: 'cvv_nonce', details: {} });
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }));

            await expect(hook('braintree_cc_vault')()).rejects.toThrow(
                t('Hyperion_Checkout::braintree_card_cvv_failed')
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('rejects when the CVV field is not mounted', async () => {
            await expect(hook('braintree_cc_vault')()).rejects.toThrow(
                t('Hyperion_Checkout::braintree_not_ready')
            );
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});
