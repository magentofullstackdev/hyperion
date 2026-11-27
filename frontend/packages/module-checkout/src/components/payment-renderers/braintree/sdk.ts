// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Braintree JS SDK loader.
 *
 * The SDK is never bundled and never requested at checkout load: each
 * standalone UMD script is loaded through the context's script loader
 * (`context.loadScript()`: once per URL, with the page's CSP nonce, a
 * failed load forgotten so picking the method again retries) the first
 * time a renderer asks for it, that is after the shopper picked a Braintree
 * method.
 *
 * All scripts come from ONE pinned SDK version: the one PayPal_Braintree 4.8
 * pins in `view/base/requirejs-config.js` (3.123.1), which keeps the client
 * in step with the server-side integration.
 *
 * The PayPal JS SDK is not loaded here: the Braintree `paypal-checkout`
 * component loads it itself through `loadPayPalSDK()`. The Google Pay API
 * (`pay.js`) goes through the same loader (`loadGooglePayLibrary()`).
 */
import type { PaymentContext } from '../../../../extension-api.js';
import type {
    BraintreeClientModule,
    BraintreeGlobal,
    DataCollectorModule,
    GooglePayGlobal,
    GooglePaymentModule,
    HostedFieldsModule,
    PayPalCheckoutModule,
    ThreeDSecureModule,
} from './types.js';

export const BRAINTREE_SDK_VERSION = '3.123.1';

const SDK_BASE_URL = `https://js.braintreegateway.com/web/${BRAINTREE_SDK_VERSION}/js`;

export interface BraintreeModules {
    'client': BraintreeClientModule;
    'hosted-fields': HostedFieldsModule;
    'data-collector': DataCollectorModule;
    'three-d-secure': ThreeDSecureModule;
    'paypal-checkout': PayPalCheckoutModule;
    'google-payment': GooglePaymentModule;
}

export type BraintreeModuleName = keyof BraintreeModules;

/** Property each script adds to `window.braintree`. */
const GLOBAL_KEYS: Readonly<Record<BraintreeModuleName, keyof BraintreeGlobal>> = {
    'client': 'client',
    'hosted-fields': 'hostedFields',
    'data-collector': 'dataCollector',
    'three-d-secure': 'threeDSecure',
    'paypal-checkout': 'paypalCheckout',
    'google-payment': 'googlePayment',
};

export const GOOGLE_PAY_LIBRARY_URL = 'https://pay.google.com/gp/p/js/pay.js';

/** What loads a classic script: `context.loadScript`. */
export type ScriptLoader = Pick<PaymentContext, 'loadScript'>;

export class BraintreeSdkLoadError extends Error {
    public constructor(public readonly src: string) {
        super(`[hyperion-checkout] failed to load ${src}`);
        this.name = 'BraintreeSdkLoadError';
    }
}

export function braintreeScriptUrl(name: BraintreeModuleName): string {
    return `${SDK_BASE_URL}/${name}.min.js`;
}

export async function loadBraintreeModule<K extends BraintreeModuleName>(
    loader: ScriptLoader,
    name: K
): Promise<BraintreeModules[K]> {
    const src = braintreeScriptUrl(name);
    try {
        await loader.loadScript(src);
    } catch {
        throw new BraintreeSdkLoadError(src);
    }
    const mod = window.braintree?.[GLOBAL_KEYS[name]];
    if (!mod) throw new BraintreeSdkLoadError(src);
    return mod as BraintreeModules[K];
}

/** The Google Pay API, loaded once. */
export async function loadGooglePayLibrary(loader: ScriptLoader): Promise<GooglePayGlobal> {
    try {
        await loader.loadScript(GOOGLE_PAY_LIBRARY_URL);
    } catch {
        throw new BraintreeSdkLoadError(GOOGLE_PAY_LIBRARY_URL);
    }
    const google = window.google;
    if (!google?.payments?.api?.PaymentsClient) throw new BraintreeSdkLoadError(GOOGLE_PAY_LIBRARY_URL);
    return google;
}
