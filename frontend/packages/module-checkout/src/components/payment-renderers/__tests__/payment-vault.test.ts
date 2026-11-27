// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultTokenInfo } from '../../../../extension-api.js';
import type { Store } from '../../../store/index.js';
import type { PaymentMethodConfig } from '../../../types/payment.js';
import { setActiveCatalogForTests, t } from '../../../utils/i18n.js';
import enUS from '../../../i18n/en_US.json' with { type: 'json' };
import '../../payment-method-list.js';
import { resetHostedForTests } from '../../payment-host/element-registry.js';
import { loadPaymentHost, resetPaymentHostForTests } from '../../payment-host/host.js';
import { resetMountForTests } from '../../payment-host/mount.js';
import {
    buildPaymentRows,
    getSelectedVaultToken,
    getVaultTokens,
    isVaultMethod,
    selectVaultToken,
} from '../../payment-host/payment-rows.js';
import { tokenTitle } from '../../payment-host/row-view.js';
import { patchEntry, resetPaymentRowsForTests, selectedTokens } from '../../payment-host/row-state.js';
import type { PaymentBraintreeVault } from '../braintree/payment-braintree-vault.js';
import { fetchVaultNonce } from '../braintree/vault-nonce.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    mountBraintreeElement,
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

/** The modules of the Braintree entries are there, as after the page loaded them. */
function entriesLoaded(): void {
    for (const id of ['braintree_card', 'braintree_paypal', 'braintree_googlepay', 'braintree_vault']) {
        patchEntry(id, { load: 'ready' });
    }
}

describe('stored payment tokens', () => {
    let sdk: BraintreeDouble;
    let store: Store;
    let methods: readonly PaymentMethodConfig[];
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        resetPaymentRowsForTests();
        methods = installCheckoutConfig({ three_d_secure: { enabled: false } }).paymentMethods;
        store = installStore();
        store.availablePaymentMethods.set(methods);
        sdk = installBraintreeDouble();
        fetchMock = vi.fn().mockResolvedValue(jsonResponse(NONCE_RESPONSE));
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        resetPaymentRowsForTests();
        resetHostedForTests();
        resetMountForTests();
        resetPaymentHostForTests();
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
            paymentMethodCode: 'braintree_cc_vault',
            nonceUrl: 'http://localhost:3000/braintree/payment/getnonce/',
            updatePaymentUrl: null,
            details: { type: 'MC', maskedCC: '4444', expirationDate: '03/2029' },
        });
        expect(isVaultMethod('braintree_cc_vault')).toBe(true);
        expect(isVaultMethod('braintree')).toBe(false);
    });

    it('lists one row per stored token first and no row for the bare vault methods', () => {
        entriesLoaded();
        const rows = buildPaymentRows(methods).map((row) => row.token?.key ?? row.method.code);
        expect(rows).toEqual([
            'braintree_cc_vault_0',
            'braintree_cc_vault_1',
            'braintree_paypal_vault_2',
            'braintree',
            'braintree_paypal',
            'checkmo',
            'braintree_googlepay',
        ]);
    });

    it('gives the token rows their place, not selectable yet, while the module of their provider is on its way', () => {
        const rows = buildPaymentRows(methods).filter((row) => row.token !== null);
        expect(rows).toHaveLength(3);
        expect(rows.every((row) => row.pending)).toBe(true);
        expect(getSelectedVaultToken('braintree_cc_vault')).toBeNull();
    });

    it('hides the vault methods from a shopper without stored tokens', () => {
        entriesLoaded();
        const { vault: _tokens, ...paymentWithoutTokens } = installCheckoutConfig().payment;
        installCheckoutConfig({}, { payment: paymentWithoutTokens });
        const rows = buildPaymentRows(methods).map((row) => row.method.code);
        expect(rows).toEqual(['braintree', 'braintree_paypal', 'checkmo', 'braintree_googlepay']);
    });

    it('hides a gateway method its element class declines (no client token)', () => {
        entriesLoaded();
        patchEntry('braintree_card', { usable: { braintree: false } });
        expect(buildPaymentRows(methods).map((row) => row.method.code)).not.toContain('braintree');
    });

    it('titles a stored card with brand, last four and expiry, and a stored PayPal account with its email', () => {
        entriesLoaded();
        const rows = buildPaymentRows(methods);
        expect(tokenTitle(rows[0]!)).toBe('Visa ending in 1111 (expires 12/2030)');
        expect(tokenTitle(rows[1]!)).toBe('Mastercard ending in 4444 (expires 03/2029)');
        expect(tokenTitle(rows[2]!)).toBe('PayPal account roni_cost@example.com');
        patchEntry('braintree_vault', { describeToken: (token: VaultTokenInfo) => `Card ${token.publicHash}` });
        expect(tokenTitle(buildPaymentRows(methods)[0]!)).toBe('Card hash-visa-1111');
    });

    it('charges the first token when the vault method is selected without a choice, and the chosen one otherwise', () => {
        entriesLoaded();
        expect(getSelectedVaultToken('braintree_cc_vault')?.publicHash).toBe('hash-visa-1111');
        selectVaultToken('braintree_cc_vault', 'hash-mc-4444');
        expect(getSelectedVaultToken('braintree_cc_vault')?.publicHash).toBe('hash-mc-4444');
        expect(selectedTokens.get()).toEqual({ braintree_cc_vault: 'hash-mc-4444' });
    });

    it('renders the rows with their titles and selects a token on click, without saving it on the quote', async () => {
        await loadPaymentHost();
        const list = document.createElement('payment-method-list');
        document.body.appendChild(list);
        await vi.waitFor(() => expect(list.querySelector('#hc-pay-braintree_cc_vault_1')?.hasAttribute('disabled')).toBe(false));
        const rows = [...list.querySelectorAll('payment-method-row')];
        await Promise.all(rows.map((row) => row.updateComplete));

        expect(rows[0]?.textContent).toContain('Visa ending in 1111 (expires 12/2030)');
        expect(rows[1]?.textContent).toContain('Mastercard ending in 4444 (expires 03/2029)');
        expect(rows[2]?.textContent).toContain('PayPal account roni_cost@example.com');

        rows[1]?.querySelector<HTMLInputElement>('input[type="radio"]')?.dispatchEvent(new Event('change'));
        await list.updateComplete;
        await Promise.all(rows.map((row) => row.updateComplete));

        expect(store.selectedPaymentMethod.get()).toBe('braintree_cc_vault');
        expect(getSelectedVaultToken('braintree_cc_vault')?.publicHash).toBe('hash-mc-4444');
        expect(rows.map((row) => row.selected).slice(0, 3)).toEqual([false, true, false]);
        await vi.waitFor(() => expect(rows[1]?.querySelector('hc-payment-braintree-vault')).not.toBeNull());
    });

    describe('the element of a stored card', () => {
        function mount(key = 'braintree_cc_vault_0'): PaymentBraintreeVault {
            const token = getVaultTokens().find((candidate) => candidate.key === key)!;
            return mountBraintreeElement<PaymentBraintreeVault>('hc-payment-braintree-vault', token.code, store, token).element;
        }

        async function data(el: PaymentBraintreeVault): Promise<Record<string, unknown>> {
            return { ...((await el.getPaymentData()).additional_data ?? {}) };
        }

        it('fetches the nonce of its card and returns the vault additional_data', async () => {
            expect(await data(mount('braintree_cc_vault_1'))).toEqual({
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

        it('runs 3D Secure on the stored card nonce when configured', async () => {
            installCheckoutConfig();
            sdk.threeDSecure.verifyCard.mockResolvedValue({
                nonce: 'vault_nonce_3ds', liabilityShifted: true, liabilityShiftPossible: true,
            });

            const result = await data(mount());

            expect(sdk.threeDSecure.verifyCard.mock.calls[0]?.[0]).toMatchObject({
                nonce: 'vault_nonce_fixture',
                bin: '411111',
                amount: '36.81',
                cardAddChallengeRequested: false,
            });
            expect(result['payment_method_nonce']).toBe('vault_nonce_3ds');
        });

        it('skips 3D Secure for stored cards verified by CVV', async () => {
            installCheckoutConfig({ three_d_secure: { useCvvVault: true } });
            expect((await data(mount()))['payment_method_nonce']).toBe('vault_nonce_fixture');
            expect(sdk.threeDSecureCreate).not.toHaveBeenCalled();
        });

        it('rejects with the server message when the nonce cannot be issued', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ message: 'Sorry, but something went wrong' }, 400));
            await expect(mount().getPaymentData()).rejects.toThrow('Sorry, but something went wrong');
        });

        it('rejects with a translated message on a network failure or a malformed answer', async () => {
            const el = mount();
            fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
            await expect(el.getPaymentData()).rejects.toThrow(t('Hyperion_Checkout::vault_nonce_failed'));

            fetchMock.mockResolvedValueOnce(new Response('<html>login</html>', { status: 200 }));
            await expect(el.getPaymentData()).rejects.toThrow(t('Hyperion_Checkout::vault_nonce_failed'));
        });

        it('never sends the public hash to another origin', async () => {
            await expect(fetchVaultNonce({ t: (source: string) => source }, {
                publicHash: 'hash-visa-1111',
                paymentMethodCode: 'braintree_cc_vault',
                nonceUrl: 'https://evil.example/braintree/payment/getnonce/',
                details: {},
            })).rejects.toThrow('Your stored payment method could not be used. Please choose another payment method.');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('pays with a stored PayPal account through the default vault flow', async () => {
            expect(await data(mount('braintree_paypal_vault_2'))).toEqual({
                public_hash: 'hash-paypal',
                payment_method_nonce: 'vault_nonce_fixture',
            });
            expect(fetchMock.mock.calls[0]?.[0]).toBe(
                'http://localhost:3000/braintree/payment/getNonce/?public_hash=hash-paypal'
            );
        });
    });

    describe('CVV re-verification', () => {
        beforeEach(() => {
            installCheckoutConfig({
                three_d_secure: { enabled: false },
                braintree_cc_vault: { cvvVerify: true },
            });
        });

        async function mountVaultBody(): Promise<PaymentBraintreeVault> {
            const token = getVaultTokens('braintree_cc_vault')[0]!;
            const el = mountBraintreeElement<PaymentBraintreeVault>('hc-payment-braintree-vault', token.code, store, token).element;
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

            const result = await el.getPaymentData();

            expect(fetchMock.mock.calls[0]?.[0]).toBe(
                'http://localhost:3000/braintree/payment/updatepaymentmethod/?nonce=cvv_nonce&public_hash=hash-visa-1111'
            );
            expect(result.additional_data?.['payment_method_nonce']).toBe('vault_nonce_fixture');
        });

        it('rejects when Magento reports a failed CVV verification', async () => {
            const el = await mountVaultBody();
            sdk.hostedFields.tokenize.mockResolvedValue({ nonce: 'cvv_nonce', details: {} });
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }));

            await expect(el.getPaymentData()).rejects.toThrow(
                t('Hyperion_Checkout::braintree_card_cvv_failed')
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('rejects when the CVV field is not mounted', async () => {
            sdk.loader.mockReturnValue(new Promise(() => undefined));
            const token = getVaultTokens('braintree_cc_vault')[0]!;
            const el = mountBraintreeElement<PaymentBraintreeVault>('hc-payment-braintree-vault', token.code, store, token).element;
            await expect(el.getPaymentData()).rejects.toThrow(
                t('Hyperion_Checkout::braintree_not_ready')
            );
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});
