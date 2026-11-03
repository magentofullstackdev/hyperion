// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Typed readers for the Braintree slices of `checkoutConfig`.
 *
 * Shapes follow the PHP providers of PayPal_Braintree 4.6:
 *   - `payment.braintree`          Model/Ui/ConfigProvider.php
 *   - `payment.braintree_paypal*`  Model/Ui/PayPal/ConfigProvider.php
 *   - `payment.braintree_googlepay` Model/GooglePay/Ui/ConfigProvider.php
 *   - `payment.three_d_secure`     Model/Ui/ThreeDeeSecure/ConfigProvider.php
 *   - `payment.braintree_cc_vault` Model/Ui/Vault/ConfigProvider.php
 *   - `vault.<code>.is_enabled`    Magento_Vault Model/Ui/VaultConfigProvider.php
 */
import { getCheckoutConfig } from '../../../bootstrap-config.js';

export const BRAINTREE_CODE = 'braintree';
export const BRAINTREE_CC_VAULT_CODE = 'braintree_cc_vault';
export const BRAINTREE_PAYPAL_CODE = 'braintree_paypal';
export const BRAINTREE_PAYPAL_VAULT_CODE = 'braintree_paypal_vault';
export const BRAINTREE_GOOGLEPAY_CODE = 'braintree_googlepay';
export const BRAINTREE_GOOGLEPAY_VAULT_CODE = 'braintree_googlepay_vault';
const THREE_D_SECURE_CODE = 'three_d_secure';

export interface BraintreeCardConfig {
    isActive: boolean;
    clientToken: string;
    ccTypesMapper: Readonly<Record<string, string>>;
    countrySpecificCardTypes: Readonly<Record<string, readonly string[]>>;
    availableCardTypes: readonly string[];
    useCvv: boolean;
    environment: string;
    ccVaultCode: string;
}

export interface ThreeDSecureConfig {
    enabled: boolean;
    challengeRequested: boolean;
    thresholdAmount: number;
    specificCountries: readonly string[];
    useCvvVault: boolean;
    ipAddress: string;
}

export interface PayPalButtonStyle {
    label?: string;
    color?: string;
    shape?: string;
}

export interface BraintreePayPalConfig {
    isActive: boolean;
    clientToken: string;
    title: string;
    isAllowShippingAddressOverride: boolean;
    merchantName: string;
    environment: string;
    merchantCountry: string | null;
    locale: string;
    vaultCode: string;
    style: PayPalButtonStyle;
    canSendLineItems: boolean;
}

export interface BraintreeGooglePayConfig {
    isActive: boolean;
    clientToken: string;
    /** Google's environment names, derived by the provider from the Braintree one. */
    environment: 'TEST' | 'PRODUCTION';
    merchantId: string;
    /** Google card network names (`VISA`, `MASTERCARD`, ...); empty = the gateway's defaults. */
    cardTypes: readonly string[];
    buttonColor: 'black' | 'white';
    vaultCode: string;
    priceIncludesTax: boolean;
}

export interface PayPalFundingConfig {
    isActive: boolean;
    style: PayPalButtonStyle;
}

type Slice = Readonly<Record<string, unknown>>;

function paymentSlice(code: string): Slice | null {
    const slice = getCheckoutConfig().payment?.[code];
    return slice && typeof slice === 'object' ? slice : null;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/** Magento serialises scope flags as booleans, "1"/"0" strings or integers. */
function flag(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}

function stringList(value: unknown): readonly string[] {
    const list = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
    return list.filter((entry): entry is string => typeof entry === 'string');
}

function buttonStyle(value: unknown): PayPalButtonStyle {
    const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const style: PayPalButtonStyle = {};
    if (typeof raw['label'] === 'string' && raw['label']) style.label = raw['label'];
    if (typeof raw['color'] === 'string' && raw['color']) style.color = raw['color'];
    if (typeof raw['shape'] === 'string' && raw['shape']) style.shape = raw['shape'];
    return style;
}

export function getBraintreeCardConfig(): BraintreeCardConfig | null {
    const slice = paymentSlice(BRAINTREE_CODE);
    if (!slice) return null;
    const countrySpecific: Record<string, readonly string[]> = {};
    const rawCountry = slice['countrySpecificCardTypes'];
    if (rawCountry && typeof rawCountry === 'object') {
        for (const [country, types] of Object.entries(rawCountry)) {
            countrySpecific[country] = stringList(types);
        }
    }
    const mapper: Record<string, string> = {};
    const rawMapper = slice['ccTypesMapper'];
    if (rawMapper && typeof rawMapper === 'object') {
        for (const [braintreeType, mageType] of Object.entries(rawMapper)) {
            if (typeof mageType === 'string') mapper[braintreeType] = mageType;
        }
    }
    return {
        isActive: flag(slice['isActive']),
        clientToken: str(slice['clientToken']),
        ccTypesMapper: mapper,
        countrySpecificCardTypes: countrySpecific,
        availableCardTypes: stringList(slice['availableCardTypes']),
        useCvv: flag(slice['useCvv']),
        environment: str(slice['environment']),
        ccVaultCode: str(slice['ccVaultCode']) || BRAINTREE_CC_VAULT_CODE,
    };
}

export function getThreeDSecureConfig(): ThreeDSecureConfig | null {
    const slice = paymentSlice(THREE_D_SECURE_CODE);
    if (!slice) return null;
    const threshold = parseFloat(String(slice['thresholdAmount'] ?? 0));
    return {
        enabled: flag(slice['enabled']),
        challengeRequested: flag(slice['challengeRequested']),
        thresholdAmount: Number.isFinite(threshold) ? threshold : 0,
        specificCountries: stringList(slice['specificCountries']),
        useCvvVault: flag(slice['useCvvVault']),
        ipAddress: str(slice['ipAddress']),
    };
}

export function getBraintreePayPalConfig(): BraintreePayPalConfig | null {
    const slice = paymentSlice(BRAINTREE_PAYPAL_CODE);
    if (!slice) return null;
    const merchantCountry = str(slice['merchantCountry']);
    return {
        isActive: flag(slice['isActive']),
        clientToken: str(slice['clientToken']),
        title: str(slice['title']),
        isAllowShippingAddressOverride: flag(slice['isAllowShippingAddressOverride']),
        merchantName: str(slice['merchantName']),
        environment: str(slice['environment']),
        merchantCountry: merchantCountry || null,
        locale: str(slice['locale']),
        vaultCode: str(slice['vaultCode']) || BRAINTREE_PAYPAL_VAULT_CODE,
        style: buttonStyle(slice['style']),
        canSendLineItems: flag(slice['canSendLineItems']),
    };
}

export function getBraintreeGooglePayConfig(): BraintreeGooglePayConfig | null {
    const slice = paymentSlice(BRAINTREE_GOOGLEPAY_CODE);
    if (!slice) return null;
    return {
        isActive: flag(slice['isActive']),
        clientToken: str(slice['clientToken']),
        environment: str(slice['environment']) === 'PRODUCTION' ? 'PRODUCTION' : 'TEST',
        merchantId: str(slice['merchantId']),
        cardTypes: stringList(slice['cardTypes']).map((type) => type.toUpperCase()),
        // The provider's `btn_color` option: 1 is black, anything else white.
        buttonColor: String(slice['btnColor']) === '1' ? 'black' : 'white',
        vaultCode: str(slice['vaultCode']) || BRAINTREE_GOOGLEPAY_VAULT_CODE,
        priceIncludesTax: flag(slice['priceIncludesTax']),
    };
}

/** `braintree_paypal_credit` / `braintree_paypal_paylater`: extra buttons of the PayPal method. */
export function getPayPalFundingConfig(funding: 'credit' | 'paylater'): PayPalFundingConfig | null {
    const slice = paymentSlice(`${BRAINTREE_PAYPAL_CODE}_${funding}`);
    if (!slice) return null;
    return { isActive: flag(slice['isActive']), style: buttonStyle(slice['style']) };
}

export function isCcVaultCvvVerifyEnabled(): boolean {
    return flag(paymentSlice(BRAINTREE_CC_VAULT_CODE)?.['cvvVerify']);
}

/**
 * Mirror of Magento_Vault `vault-enabler.js::isVaultEnabled()`: the "save for
 * later" choice only exists for logged-in customers of an active vault method.
 */
export function isVaultEnabledFor(vaultCode: string): boolean {
    const vault = getCheckoutConfig()['vault'];
    if (!vault || typeof vault !== 'object') return false;
    const entry = (vault as Record<string, unknown>)[vaultCode];
    if (!entry || typeof entry !== 'object') return false;
    return (entry as Record<string, unknown>)['is_enabled'] === true;
}
