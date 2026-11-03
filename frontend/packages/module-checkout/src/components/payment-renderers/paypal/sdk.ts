// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * PayPal JS SDK loader for PayPal Express Checkout.
 *
 * The script is injected the first time the renderer asks for it, that is
 * after the shopper selected the method, never at checkout load. The URL
 * (client id, merchant id, currency, intent, funding, components) and the
 * data attributes (partner attribution id, CSP nonce) come from the server.
 *
 * The SDK is bound to its own global through `data-namespace`: Braintree
 * PayPal loads the same SDK with other parameters into `window.paypal`,
 * and a store may offer both methods.
 */
import type { PaypalSdk } from './types.js';

export const PAYPAL_SDK_NAMESPACE = 'hyperionPaypalExpress';

export type PaypalScriptLoader = (
    src: string,
    attributes: Readonly<Record<string, string>>
) => Promise<void>;

export class PaypalSdkLoadError extends Error {
    public constructor(public readonly src: string) {
        super(`[hyperion-checkout] failed to load ${src}`);
        this.name = 'PaypalSdkLoadError';
    }
}

function injectScriptTag(src: string, attributes: Readonly<Record<string, string>>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        for (const [name, value] of Object.entries(attributes)) {
            script.setAttribute(name, value);
        }
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => {
            script.remove();
            reject(new PaypalSdkLoadError(src));
        }, { once: true });
        document.head.appendChild(script);
    });
}

let scriptLoader: PaypalScriptLoader = injectScriptTag;
const pending = new Map<string, Promise<PaypalSdk>>();

function readGlobal(): PaypalSdk | undefined {
    return (window as unknown as Record<string, PaypalSdk | undefined>)[PAYPAL_SDK_NAMESPACE];
}

export function loadPaypalSdk(
    src: string,
    dataAttributes: Readonly<Record<string, string>>
): Promise<PaypalSdk> {
    const cached = pending.get(src);
    if (cached) return cached;
    const request = scriptLoader(src, { ...dataAttributes, 'data-namespace': PAYPAL_SDK_NAMESPACE })
        .then(() => {
            const sdk = readGlobal();
            if (!sdk) throw new PaypalSdkLoadError(src);
            return sdk;
        })
        .catch((err: unknown) => {
            pending.delete(src);
            throw err;
        });
    pending.set(src, request);
    return request;
}

/** Test-only: swap the script injector (pass `null` to restore it) and drop the cache. */
export function setPaypalScriptLoaderForTests(loader: PaypalScriptLoader | null): void {
    scriptLoader = loader ?? injectScriptTag;
    pending.clear();
}
