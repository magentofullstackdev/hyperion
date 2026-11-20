// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Typed reader for `checkoutConfig.hyperion.paypalExpress`, the slice
 * `HyperionCheckout\Model\Checkout\PaypalExpressConfigProvider` adds when a
 * PayPal Express method is available.
 */
import { getCheckoutConfig } from '../../../bootstrap-config.js';
import type { PaypalExpressConfig, PaypalPayLaterConfig } from '../../../types/config.js';

export const PAYPAL_EXPRESS_CODE = 'paypal_express';
export const PAYFLOW_EXPRESS_CODE = 'payflow_express';
export const PAYPAL_EXPRESS_CODES: readonly string[] = [PAYPAL_EXPRESS_CODE, PAYFLOW_EXPRESS_CODE];

export type PaypalScalar = string | number | boolean;

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function isScalar(value: unknown): value is PaypalScalar {
    return (typeof value === 'string' && value !== '')
        || (typeof value === 'number' && Number.isFinite(value))
        || typeof value === 'boolean';
}

/** PHP serializes an empty array as `[]`, a filled one as an object. */
function scalarMap(value: unknown): Readonly<Record<string, PaypalScalar>> {
    const map: Record<string, PaypalScalar> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return map;
    for (const [key, entry] of Object.entries(value)) {
        if (isScalar(entry)) map[key] = entry;
    }
    return map;
}

function stringMap(value: unknown): Readonly<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const [key, entry] of Object.entries(scalarMap(value))) {
        map[key] = String(entry);
    }
    return map;
}

function payLater(value: unknown): PaypalPayLaterConfig | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (raw['enabled'] !== true) return null;
    return {
        enabled: true,
        position: str(raw['position']),
        displayAmount: raw['displayAmount'] === true,
        attributes: stringMap(raw['attributes']),
    };
}

/**
 * The section as the renderer uses it. `styles` goes to the PayPal SDK as it
 * is, with the types the server gave (the SDK wants numbers as numbers);
 * the other maps end up in URLs and attributes and are strings.
 */
export function getPaypalExpressConfig(): PaypalExpressConfig | null {
    const raw: unknown = getCheckoutConfig().hyperion?.paypalExpress;
    if (!raw || typeof raw !== 'object') return null;
    const slice = raw as Record<string, unknown>;
    return {
        inContext: slice['inContext'] === true,
        sdkUrl: str(slice['sdkUrl']),
        dataAttributes: stringMap(slice['dataAttributes']),
        styles: scalarMap(slice['styles']),
        getTokenUrl: str(slice['getTokenUrl']),
        onAuthorizeUrl: str(slice['onAuthorizeUrl']),
        startUrls: stringMap(slice['startUrls']),
        billingAgreementCode: stringMap(slice['billingAgreementCode']),
        markImageUrl: str(slice['markImageUrl']),
        whatIsPaypalUrl: str(slice['whatIsPaypalUrl']),
        payLater: payLater(slice['payLater']),
    };
}

/**
 * The smart button flow exists for `paypal_express` only; the Payflow
 * edition always goes through the redirect, like in the core checkout.
 */
export function isInContext(code: string): boolean {
    const config = getPaypalExpressConfig();
    return code === PAYPAL_EXPRESS_CODE
        && config !== null
        && config.inContext
        && config.sdkUrl !== ''
        && config.getTokenUrl !== ''
        && config.onAuthorizeUrl !== '';
}

export function getStartUrl(code: string): string | null {
    return getPaypalExpressConfig()?.startUrls[code] ?? null;
}

/** The `additional_data` key of the billing agreement choice, null when the shopper is not asked. */
export function getBillingAgreementCode(code: string): string | null {
    return getPaypalExpressConfig()?.billingAgreementCode[code] ?? null;
}
