// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * 3D Secure 2 verification, a port of PayPal_Braintree
 * `view/frontend/web/js/view/payment/3d-secure.js`.
 *
 * Same gates as core:
 *   - skipped when `payment.three_d_secure.enabled` is off;
 *   - skipped for stored cards when the merchant verifies them by CVV
 *     (`useCvvVault`);
 *   - skipped below `thresholdAmount` (base grand total) and outside
 *     `specificCountries` (billing country; an empty list means all);
 *   - the liability result is accepted when the liability shifted, or when
 *     no shift was possible for the card.
 *
 * The challenge window is rendered by the SDK itself (3DS version 2).
 * Resolves with the nonce to send to Magento, rejects with a translated
 * message.
 */
import type { Address } from '../../../types/address.js';
import { getStore } from '../../../store/index.js';
import { t } from '../../../utils/i18n.js';
import { getBraintreeClient } from './client.js';
import { getThreeDSecureConfig, type ThreeDSecureConfig } from './config.js';
import {
    digitsOnly,
    getBaseGrandTotal,
    getBillingAddress,
    getShippingAddress,
    regionCodeOf,
} from './quote.js';
import { loadBraintreeModule } from './sdk.js';
import type {
    BraintreeError,
    ThreeDSecureAddress,
    ThreeDSecureVerifyOptions,
} from './types.js';

const MAX_ADDRESS_LINE_LENGTH = 50;

export interface ThreeDSecureRequest {
    authorization: string;
    nonce: string;
    bin: string;
    /** The nonce comes from a stored card (`braintree_cc_vault`). */
    storedCard: boolean;
    /** The shopper asked to store the card and the vault is enabled. */
    savingCard: boolean;
}

export function isThreeDSecureRequired(
    config: ThreeDSecureConfig | null,
    amount: string,
    billingCountry: string,
    storedCard: boolean
): boolean {
    if (!config?.enabled) return false;
    if (storedCard && config.useCvvVault) return false;
    if (parseFloat(amount) < config.thresholdAmount) return false;
    return config.specificCountries.length === 0 || config.specificCountries.includes(billingCountry);
}

/** Braintree only accepts ISO 3166-2 style region codes of up to two characters. */
function shortRegion(address: Address): string | undefined {
    const code = regionCodeOf(address);
    return code !== undefined && code.length <= 2 ? code : undefined;
}

function toThreeDSecureAddress(address: Address): ThreeDSecureAddress {
    const out: ThreeDSecureAddress = {
        givenName: address.firstname,
        surname: address.lastname,
        phoneNumber: digitsOnly(address.telephone),
        locality: address.city,
        countryCodeAlpha2: address.country_id,
    };
    if (address.street[0]) out.streetAddress = address.street[0];
    if (address.street[1]) out.extendedAddress = address.street[1];
    if (address.postcode) out.postalCode = address.postcode;
    const region = shortRegion(address);
    if (region) out.region = region;
    return out;
}

function hasOverlongLine(address: Address | null): boolean {
    return (address?.street ?? []).slice(0, 2).some((line) => line.length > MAX_ADDRESS_LINE_LENGTH);
}

export async function verifyThreeDSecure(request: ThreeDSecureRequest): Promise<string> {
    const config = getThreeDSecureConfig();
    const billing = getBillingAddress();
    const amount = getBaseGrandTotal();
    if (!billing || !isThreeDSecureRequired(config, amount, billing.country_id, request.storedCard)) {
        return request.nonce;
    }

    const failure = new Error(t('Hyperion_Checkout::braintree_3ds_failed'));
    const shipping = getShippingAddress();
    let instance;
    try {
        const [client, threeDSecure] = await Promise.all([
            getBraintreeClient(request.authorization),
            loadBraintreeModule('three-d-secure'),
        ]);
        instance = await threeDSecure.create({ client, version: 2 });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[hyperion-checkout] 3D Secure could not be initialised', err);
        throw failure;
    }

    const additionalInformation: Record<string, unknown> = { ipAddress: config?.ipAddress ?? '' };
    if (shipping) {
        const shippingAddress = toThreeDSecureAddress(shipping);
        additionalInformation['shippingGivenName'] = shipping.firstname;
        additionalInformation['shippingSurname'] = shipping.lastname;
        additionalInformation['shippingPhone'] = digitsOnly(shipping.telephone);
        additionalInformation['shippingAddress'] = {
            streetAddress: shippingAddress.streetAddress,
            extendedAddress: shippingAddress.extendedAddress,
            locality: shippingAddress.locality,
            region: shippingAddress.region,
            postalCode: shippingAddress.postalCode,
            countryCodeAlpha2: shippingAddress.countryCodeAlpha2,
        };
    }

    const email = getStore().email.get();
    const options: ThreeDSecureVerifyOptions = {
        amount,
        nonce: request.nonce,
        bin: request.bin,
        collectDeviceData: true,
        // Storing a card is a "card add" challenge; otherwise the merchant's
        // "always request a challenge" setting applies.
        challengeRequested: request.savingCard ? false : Boolean(config?.challengeRequested),
        cardAddChallengeRequested: request.savingCard,
        billingAddress: toThreeDSecureAddress(billing),
        additionalInformation,
        onLookupComplete: (_data, next) => next(),
        ...(email ? { email } : {}),
    };

    try {
        const response = await instance.verifyCard(options);
        if (response.liabilityShifted || !response.liabilityShiftPossible) {
            return response.nonce;
        }
        throw failure;
    } catch (err) {
        if (err === failure) throw err;
        // eslint-disable-next-line no-console
        console.error('[hyperion-checkout] 3D Secure verification failed', err);
        if ((err as BraintreeError)?.code === 'THREEDS_LOOKUP_VALIDATION_ERROR'
            && (hasOverlongLine(billing) || hasOverlongLine(shipping))) {
            throw new Error(t('Hyperion_Checkout::braintree_3ds_address_too_long'));
        }
        throw failure;
    } finally {
        void instance.teardown().catch(() => undefined);
    }
}
