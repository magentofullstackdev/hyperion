// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * PayPal JS SDK loader for PayPal Express Checkout.
 *
 * The script is loaded through the context's script loader
 * (`context.loadScript()`: once per URL, the page's CSP nonce, a failed load
 * forgotten so a retry can succeed) the first time the renderer asks for
 * it, that is after the shopper selected the method, never at checkout
 * load. The URL (client id, merchant id, currency, intent, funding,
 * components) and the data attributes (partner attribution id, CSP nonce)
 * come from the server.
 *
 * The SDK is bound to its own global through `data-namespace`: Braintree
 * PayPal loads the same SDK with other parameters into `window.paypal`,
 * and a store may offer both methods.
 */
import type { PaymentContext } from '../../../../extension-api.js';
import type { PaypalSdk } from './types.js';

export const PAYPAL_SDK_NAMESPACE = 'hyperionPaypalExpress';

export class PaypalSdkLoadError extends Error {
    public constructor(public readonly src: string) {
        super(`[hyperion-checkout] failed to load ${src}`);
        this.name = 'PaypalSdkLoadError';
    }
}

function readGlobal(): PaypalSdk | undefined {
    return (window as unknown as Record<string, PaypalSdk | undefined>)[PAYPAL_SDK_NAMESPACE];
}

export async function loadPaypalSdk(
    loader: Pick<PaymentContext, 'loadScript'>,
    src: string,
    dataAttributes: Readonly<Record<string, string>>
): Promise<PaypalSdk> {
    try {
        await loader.loadScript(src, { ...dataAttributes, 'data-namespace': PAYPAL_SDK_NAMESPACE });
    } catch {
        throw new PaypalSdkLoadError(src);
    }
    const sdk = readGlobal();
    if (!sdk) throw new PaypalSdkLoadError(src);
    return sdk;
}
