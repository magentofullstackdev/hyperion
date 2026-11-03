// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Braintree JS SDK loader.
 *
 * The SDK is never bundled and never requested at checkout load: each
 * standalone UMD script is injected as a `<script>` tag the first time a
 * renderer asks for it (that is, after the shopper picked a Braintree
 * method). Every script is requested at most once; the pending promise is
 * cached so concurrent callers share it. A failed load is evicted from the
 * cache, so picking the method again retries the download.
 *
 * All scripts come from ONE pinned SDK version. It matches the version the
 * PayPal_Braintree module pins in `view/base/requirejs-config.js`, which
 * keeps the client in step with the server-side integration.
 *
 * The PayPal JS SDK is not loaded here: the Braintree `paypal-checkout`
 * component loads it itself through `loadPayPalSDK()`.
 */
import type {
    BraintreeClientModule,
    BraintreeGlobal,
    DataCollectorModule,
    HostedFieldsModule,
    PayPalCheckoutModule,
    ThreeDSecureModule,
} from './types.js';

export const BRAINTREE_SDK_VERSION = '3.112.0';

const SDK_BASE_URL = `https://js.braintreegateway.com/web/${BRAINTREE_SDK_VERSION}/js`;

export interface BraintreeModules {
    'client': BraintreeClientModule;
    'hosted-fields': HostedFieldsModule;
    'data-collector': DataCollectorModule;
    'three-d-secure': ThreeDSecureModule;
    'paypal-checkout': PayPalCheckoutModule;
}

export type BraintreeModuleName = keyof BraintreeModules;

/** Property each script adds to `window.braintree`. */
const GLOBAL_KEYS: Readonly<Record<BraintreeModuleName, keyof BraintreeGlobal>> = {
    'client': 'client',
    'hosted-fields': 'hostedFields',
    'data-collector': 'dataCollector',
    'three-d-secure': 'threeDSecure',
    'paypal-checkout': 'paypalCheckout',
};

export type ScriptLoader = (src: string) => Promise<void>;

export class BraintreeSdkLoadError extends Error {
    public constructor(public readonly src: string) {
        super(`[hyperion-checkout] failed to load ${src}`);
        this.name = 'BraintreeSdkLoadError';
    }
}

function injectScriptTag(src: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.addEventListener('load', () => resolve(), { once: true });
        script.addEventListener('error', () => {
            script.remove();
            reject(new BraintreeSdkLoadError(src));
        }, { once: true });
        document.head.appendChild(script);
    });
}

let scriptLoader: ScriptLoader = injectScriptTag;
const pending = new Map<string, Promise<void>>();

export function braintreeScriptUrl(name: BraintreeModuleName): string {
    return `${SDK_BASE_URL}/${name}.min.js`;
}

export function loadScriptOnce(src: string): Promise<void> {
    const cached = pending.get(src);
    if (cached) return cached;
    const request = scriptLoader(src).catch((err: unknown) => {
        pending.delete(src);
        throw err;
    });
    pending.set(src, request);
    return request;
}

export async function loadBraintreeModule<K extends BraintreeModuleName>(
    name: K
): Promise<BraintreeModules[K]> {
    const src = braintreeScriptUrl(name);
    await loadScriptOnce(src);
    const mod = window.braintree?.[GLOBAL_KEYS[name]];
    if (!mod) {
        pending.delete(src);
        throw new BraintreeSdkLoadError(src);
    }
    return mod as BraintreeModules[K];
}

/** Test-only: swap the script injector (pass `null` to restore it) and drop the cache. */
export function setScriptLoaderForTests(loader: ScriptLoader | null): void {
    scriptLoader = loader ?? injectScriptTag;
    pending.clear();
}
