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

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/** PHP serialises an empty array as `[]`, a filled one as an object. */
function stringMap(value: unknown): Readonly<Record<string, string>> {
    const map: Record<string, string> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return map;
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string' && entry !== '') map[key] = entry;
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

export function getPaypalExpressConfig(): PaypalExpressConfig | null {
    const raw: unknown = getCheckoutConfig().hyperion?.paypalExpress;
    if (!raw || typeof raw !== 'object') return null;
    const slice = raw as Record<string, unknown>;
    return {
        inContext: slice['inContext'] === true,
        sdkUrl: str(slice['sdkUrl']),
        dataAttributes: stringMap(slice['dataAttributes']),
        styles: stringMap(slice['styles']),
        getTokenUrl: str(slice['getTokenUrl']),
        onAuthorizeUrl: str(slice['onAuthorizeUrl']),
        onCancelUrl: str(slice['onCancelUrl']),
        startUrls: stringMap(slice['startUrls']),
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
