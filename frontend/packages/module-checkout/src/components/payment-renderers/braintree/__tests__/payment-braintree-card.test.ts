// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Store } from '../../../../store/index.js';
import { setActiveCatalogForTests, t } from '../../../../utils/i18n.js';
import enUS from '../../../../i18n/en_US.json' with { type: 'json' };
import { getPaymentRenderer } from '../../registry.js';
import { PaymentBraintreeCard, resolveAcceptedCardType } from '../payment-braintree-card.js';
import {
    DEVICE_DATA,
    installBraintreeDouble,
    installCheckoutConfig,
    installStore,
    setBaseGrandTotal,
    uninstallBraintreeDouble,
    type BraintreeDouble,
} from './helpers.js';

const TOKENIZED = { nonce: 'tokencc_fixture', details: { bin: '411111', lastFour: '1111' } };

async function mountCard(sdk: BraintreeDouble): Promise<PaymentBraintreeCard> {
    const el = document.createElement('payment-braintree-card');
    document.body.appendChild(el);
    await vi.waitFor(() => expect(sdk.hostedFields.on).toHaveBeenCalled());
    await el.updateComplete;
    return el;
}

function beforePlaceOrder(): Promise<Record<string, unknown>> {
    const hook = getPaymentRenderer('braintree')?.beforePlaceOrder;
    if (!hook) throw new Error('braintree renderer is not registered');
    return hook();
}

describe('<payment-braintree-card>', () => {
    let sdk: BraintreeDouble;
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS);
        installCheckoutConfig();
        store = installStore();
        sdk = installBraintreeDouble();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        uninstallBraintreeDouble();
        vi.restoreAllMocks();
    });

    it('registers the renderer without touching the SDK', () => {
        expect(getPaymentRenderer('braintree')?.component).toBe('payment-braintree-card');
        expect(sdk.loader).not.toHaveBeenCalled();
    });

    it('mounts number, expiry and CVV hosted fields into its own containers', async () => {
        const el = await mountCard(sdk);

        expect(sdk.clientCreate).toHaveBeenCalledWith({
            authorization: 'eyJ2ZXJzaW9uIjoyLCJmaXh0dXJlIjoiaHlwZXJpb24ifQ==',
        });
        const options = sdk.hostedFieldsCreate.mock.calls[0]?.[0];
        expect(Object.keys(options.fields)).toEqual(['number', 'expirationDate', 'cvv']);
        for (const name of ['number', 'expirationDate', 'cvv']) {
            expect(options.fields[name].container).toBe(el.querySelector(`[data-hosted-field="${name}"]`));
        }
        expect(options.styles.input['font-size']).toBe('16px');
        expect(options.styles['::placeholder'].color).toBeTruthy();
        expect(el.querySelector('hc-checkbox[name="braintree_save_card"]')).not.toBeNull();
    });

    it('leaves the CVV field out when the merchant disabled it', async () => {
        installCheckoutConfig({ braintree: { useCvv: false } });
        const el = await mountCard(sdk);
        const options = sdk.hostedFieldsCreate.mock.calls[0]?.[0];
        expect(Object.keys(options.fields)).toEqual(['number', 'expirationDate']);
        expect(el.querySelector('[data-hosted-field="cvv"]')).toBeNull();
    });

    it('hides the save-card choice when the vault is not enabled for the shopper', async () => {
        installCheckoutConfig({}, { vault: { braintree_cc_vault: { is_enabled: false } } });
        const el = await mountCard(sdk);
        expect(el.querySelector('hc-checkbox[name="braintree_save_card"]')).toBeNull();

        sdk.hostedFields.tokenize.mockResolvedValue(TOKENIZED);
        setBaseGrandTotal(store, '10.0000');
        expect(await beforePlaceOrder()).toEqual({
            payment_method_nonce: 'tokencc_fixture',
            device_data: DEVICE_DATA,
        });
    });

    it('shows the detected brand and flags a brand the merchant does not accept', async () => {
        installCheckoutConfig({ braintree: { availableCardTypes: ['VI', 'MC'] } });
        const el = await mountCard(sdk);

        sdk.hostedFields.emit('cardTypeChange', { cards: [{ type: 'visa', niceType: 'Visa' }] });
        await el.updateComplete;
        expect(el.querySelector('[data-card-brand]')?.textContent).toBe('Visa');
        expect(el.textContent).not.toContain('are not accepted');

        sdk.hostedFields.emit('cardTypeChange', { cards: [{ type: 'american-express', niceType: 'American Express' }] });
        await el.updateComplete;
        expect(el.textContent).toContain('American Express cards are not accepted');
        await expect(beforePlaceOrder()).rejects.toThrow('American Express cards are not accepted');
        expect(sdk.hostedFields.tokenize).not.toHaveBeenCalled();
    });

    it('shows an inline message when a field turns invalid and clears it when valid', async () => {
        const el = await mountCard(sdk);
        const field = { isValid: false, isPotentiallyValid: false, isEmpty: false, isFocused: true };

        sdk.hostedFields.emit('validityChange', { emittedBy: 'expirationDate', fields: { expirationDate: field } });
        await el.updateComplete;
        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_card_expiry_invalid'));

        sdk.hostedFields.emit('validityChange', {
            emittedBy: 'expirationDate',
            fields: { expirationDate: { ...field, isValid: true, isPotentiallyValid: true } },
        });
        await el.updateComplete;
        expect(el.textContent).not.toContain(t('Hyperion_Checkout::braintree_card_expiry_invalid'));
    });

    it('tokenizes into the additional_data the gateway expects (below the 3DS threshold)', async () => {
        await mountCard(sdk);
        sdk.hostedFields.tokenize.mockResolvedValue(TOKENIZED);
        setBaseGrandTotal(store, '29.9900');

        expect(await beforePlaceOrder()).toEqual({
            payment_method_nonce: 'tokencc_fixture',
            device_data: DEVICE_DATA,
            is_active_payment_token_enabler: false,
        });
        expect(sdk.threeDSecureCreate).not.toHaveBeenCalled();
        expect(sdk.dataCollectorCreate).toHaveBeenCalledTimes(1);
    });

    it('sends the vault opt-in when the shopper ticks "save this card"', async () => {
        const el = await mountCard(sdk);
        sdk.hostedFields.tokenize.mockResolvedValue(TOKENIZED);
        setBaseGrandTotal(store, '10.0000');
        el.querySelector('hc-checkbox')?.dispatchEvent(
            new CustomEvent('value-change', { detail: { checked: true } })
        );

        const data = await beforePlaceOrder();
        expect(data['is_active_payment_token_enabler']).toBe(true);
    });

    it('still places the order without device data when the collector fails', async () => {
        sdk.dataCollectorCreate.mockRejectedValue(new Error('blocked'));
        await mountCard(sdk);
        sdk.hostedFields.tokenize.mockResolvedValue(TOKENIZED);
        setBaseGrandTotal(store, '10.0000');

        expect(await beforePlaceOrder()).toEqual({
            payment_method_nonce: 'tokencc_fixture',
            is_active_payment_token_enabler: false,
        });
    });

    it('rejects with a translated message and marks the fields when tokenization fails', async () => {
        const el = await mountCard(sdk);
        sdk.hostedFields.tokenize.mockRejectedValue(Object.assign(new Error('invalid'), {
            code: 'HOSTED_FIELDS_FIELDS_INVALID',
            details: { invalidFieldKeys: ['number'] },
        }));

        await expect(beforePlaceOrder()).rejects.toThrow(t('Hyperion_Checkout::braintree_card_fields_invalid'));
        await el.updateComplete;
        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_card_number_invalid'));
        expect(el.textContent).not.toContain(t('Hyperion_Checkout::braintree_card_expiry_invalid'));
    });

    it('falls back to a generic translated message for unknown gateway errors', async () => {
        await mountCard(sdk);
        sdk.hostedFields.tokenize.mockRejectedValue(Object.assign(new Error('boom'), {
            code: 'HOSTED_FIELDS_FAILED_TOKENIZATION',
        }));
        await expect(beforePlaceOrder()).rejects.toThrow(t('Hyperion_Checkout::braintree_tokenize_failed'));
    });

    describe('3D Secure', () => {
        beforeEach(() => {
            sdk.hostedFields.tokenize.mockResolvedValue(TOKENIZED);
        });

        it('verifies the card with amount, bin and billing address, and sends the verified nonce', async () => {
            await mountCard(sdk);
            sdk.threeDSecure.verifyCard.mockResolvedValue({
                nonce: 'tokencc_3ds',
                liabilityShifted: true,
                liabilityShiftPossible: true,
            });

            const data = await beforePlaceOrder();

            expect(sdk.threeDSecureCreate).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
            const request = sdk.threeDSecure.verifyCard.mock.calls[0]?.[0];
            expect(request).toMatchObject({
                amount: '56.29',
                nonce: 'tokencc_fixture',
                bin: '411111',
                email: 'roni_cost@example.com',
                challengeRequested: false,
                cardAddChallengeRequested: false,
                billingAddress: {
                    givenName: 'Veronica',
                    surname: 'Costello',
                    phoneNumber: '39021234567',
                    streetAddress: 'Via Roma 1',
                    extendedAddress: 'Interno 4',
                    locality: 'Milano',
                    region: 'MI',
                    postalCode: '20121',
                    countryCodeAlpha2: 'IT',
                },
                additionalInformation: { ipAddress: '203.0.113.10', shippingGivenName: 'Veronica' },
            });
            expect(data['payment_method_nonce']).toBe('tokencc_3ds');
            expect(sdk.threeDSecure.teardown).toHaveBeenCalled();
        });

        it('asks for a card-add challenge when the card is being stored', async () => {
            installCheckoutConfig({ three_d_secure: { challengeRequested: true } });
            const el = await mountCard(sdk);
            sdk.threeDSecure.verifyCard.mockResolvedValue({
                nonce: 'tokencc_3ds', liabilityShifted: true, liabilityShiftPossible: true,
            });

            await beforePlaceOrder();
            expect(sdk.threeDSecure.verifyCard.mock.calls[0]?.[0]).toMatchObject({
                challengeRequested: true,
                cardAddChallengeRequested: false,
            });

            el.querySelector('hc-checkbox')?.dispatchEvent(
                new CustomEvent('value-change', { detail: { checked: true } })
            );
            await beforePlaceOrder();
            expect(sdk.threeDSecure.verifyCard.mock.calls[1]?.[0]).toMatchObject({
                challengeRequested: false,
                cardAddChallengeRequested: true,
            });
        });

        it('accepts a card for which no liability shift is possible', async () => {
            await mountCard(sdk);
            sdk.threeDSecure.verifyCard.mockResolvedValue({
                nonce: 'tokencc_no_shift', liabilityShifted: false, liabilityShiftPossible: false,
            });
            expect((await beforePlaceOrder())['payment_method_nonce']).toBe('tokencc_no_shift');
        });

        it('rejects when the liability could shift but did not', async () => {
            await mountCard(sdk);
            sdk.threeDSecure.verifyCard.mockResolvedValue({
                nonce: 'tokencc_failed', liabilityShifted: false, liabilityShiftPossible: true,
            });
            await expect(beforePlaceOrder()).rejects.toThrow(t('Hyperion_Checkout::braintree_3ds_failed'));
        });

        it('rejects when the verification itself fails', async () => {
            await mountCard(sdk);
            sdk.threeDSecure.verifyCard.mockRejectedValue(Object.assign(new Error('cancelled'), {
                code: 'THREEDS_VERIFY_CARD_CANCELED_BY_MERCHANT',
            }));
            await expect(beforePlaceOrder()).rejects.toThrow(t('Hyperion_Checkout::braintree_3ds_failed'));
        });

        it('explains an over-long address line on a lookup validation error', async () => {
            store.shippingAddress.set({
                ...store.shippingAddress.get()!,
                street: ['x'.repeat(51)],
            });
            await mountCard(sdk);
            sdk.threeDSecure.verifyCard.mockRejectedValue(Object.assign(new Error('lookup'), {
                code: 'THREEDS_LOOKUP_VALIDATION_ERROR',
            }));
            await expect(beforePlaceOrder()).rejects.toThrow(t('Hyperion_Checkout::braintree_3ds_address_too_long'));
        });

        it('is skipped for a billing country outside the configured list', async () => {
            store.shippingAddress.set({ ...store.shippingAddress.get()!, country_id: 'US' });
            await mountCard(sdk);
            expect((await beforePlaceOrder())['payment_method_nonce']).toBe('tokencc_fixture');
            expect(sdk.threeDSecureCreate).not.toHaveBeenCalled();
        });

        it('applies to every country when the list is empty', async () => {
            installCheckoutConfig({ three_d_secure: { specificCountries: [] } });
            store.shippingAddress.set({ ...store.shippingAddress.get()!, country_id: 'US' });
            await mountCard(sdk);
            sdk.threeDSecure.verifyCard.mockResolvedValue({
                nonce: 'tokencc_3ds', liabilityShifted: true, liabilityShiftPossible: true,
            });
            expect((await beforePlaceOrder())['payment_method_nonce']).toBe('tokencc_3ds');
        });

        it('is skipped when the merchant disabled it', async () => {
            installCheckoutConfig({ three_d_secure: { enabled: false } });
            await mountCard(sdk);
            await beforePlaceOrder();
            expect(sdk.threeDSecureCreate).not.toHaveBeenCalled();
        });
    });

    it('tears the hosted fields down when the renderer disconnects', async () => {
        const el = await mountCard(sdk);
        el.remove();
        await vi.waitFor(() => expect(sdk.hostedFields.teardown).toHaveBeenCalledTimes(1));
        await expect(beforePlaceOrder()).rejects.toThrow(t('Hyperion_Checkout::braintree_not_ready'));
    });

    it('shows a retry when the SDK cannot be loaded and blocks the order', async () => {
        sdk.loader.mockRejectedValue(new Error('network'));
        const el = document.createElement('payment-braintree-card');
        document.body.appendChild(el);
        await vi.waitFor(() => expect(el.querySelector('[role="alert"]')).not.toBeNull());

        expect(el.textContent).toContain(t('Hyperion_Checkout::braintree_init_failed'));
        await expect(beforePlaceOrder()).rejects.toThrow(t('Hyperion_Checkout::braintree_not_ready'));

        const recovered = installBraintreeDouble();
        el.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
        await vi.waitFor(() => expect(recovered.hostedFieldsCreate).toHaveBeenCalledTimes(1));
        await el.updateComplete;
        expect(el.querySelector('[role="alert"]')).toBeNull();
    });
});

describe('resolveAcceptedCardType', () => {
    const config = {
        ccTypesMapper: { 'visa': 'VI', 'american-express': 'AE' },
        availableCardTypes: ['VI', 'AE'],
        countrySpecificCardTypes: { GB: ['VI'] },
    };

    it('maps a Braintree brand to the Magento code when the merchant accepts it', () => {
        expect(resolveAcceptedCardType(config, 'visa', 'IT')).toBe('VI');
        expect(resolveAcceptedCardType(config, 'american-express', null)).toBe('AE');
    });

    it('narrows the accepted brands by billing country', () => {
        expect(resolveAcceptedCardType(config, 'american-express', 'GB')).toBeNull();
        expect(resolveAcceptedCardType(config, 'visa', 'GB')).toBe('VI');
    });

    it('rejects brands missing from the mapper', () => {
        expect(resolveAcceptedCardType(config, 'elo', 'IT')).toBeNull();
    });
});
