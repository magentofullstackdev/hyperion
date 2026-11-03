// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Boot the Lit checkout.
 *
 *   1. Parse `#checkout-config` -- the JSON island served by
 *      Hyperion\Checkout\Block\Checkout.
 *   2. Initialize the reactive store + seed it with the slices the
 *      config payload already provides (customer or guest quote, cart,
 *      shipping method, totals): `store/hydrate.ts`.
 *   3. Configure the REST client with storeCode + form-key reader +
 *      customer-token reader.
 *   4. Install the translations: Magento's `__()` dictionary from the
 *      config (`hyperion.translations`) over the static catalog of the
 *      resolved locale (`hyperion.locale`, then the store code).
 *   5. Mount `<checkout-app>` into `#checkout-root`.
 *
 * Any failure is non-recoverable -- we do NOT render stock checkout
 * as a fallback (the admin flag is the rollback mechanism).
 * On failure the mount is replaced with a minimal error message so
 * the user sees *something* and the page doesn't look frozen.
 */
import type { CheckoutConfig, HyperionConfig } from './types/config.js';
import { configureApiClient } from './api/client.js';
import { initStore } from './store/index.js';
import { hydrateStore, startInitialRequests } from './store/hydrate.js';
import { normaliseCheckoutConfig } from './utils/checkout-config.js';
import { deriveBaseUrl } from './utils/base-url.js';
import { flowActions, initFlowActions } from './store/flow-actions.js';
import { initFlowSelectors } from './store/flow-selectors.js';
import { readFormKeyCookie } from './utils/form-key.js';
import { loadLocale, t } from './utils/i18n.js';
import { setCheckoutConfig } from './bootstrap-config.js';

const CONFIG_ELEMENT_ID = 'checkout-config';
const ROOT_ELEMENT_ID = 'checkout-root';

export async function bootstrap(): Promise<void> {
    try {
        const config = readCheckoutConfig();
        assertHyperionEnabled(config.hyperion);
        setCheckoutConfig(config);

        const store = initStore();

        // Hydrate from config: identity, items, the saved
        // addresses and email (customer or guest quote), the quote's shipping
        // method, totals, payment methods, the agreements gate.
        hydrateStore(store, config);

        // Min-order gate (F-3): seed from Magento_Sales::MinimumOrderConfigProvider.
        const minOrderError = computeMinOrderError(config);
        store.minimumOrderError.set(minOrderError);

        // Wire the REST client.
        configureApiClient({
            baseUrl: deriveBaseUrl(config, window.location.origin),
            storeCode: config.storeCode,
            readFormKey: readFormKeyCookie,
            readCustomerToken: () => store.customerToken.get(),
        });

        // Translations: Magento's `__()` dictionary over the static catalog,
        // the fallback catalog from the resolved locale, then the store code.
        await loadLocale({
            locale: config.hyperion.locale ?? config.locale ?? null,
            storeCode: config.storeCode,
            translations: config.hyperion.translations ?? config.translations ?? null,
        });

        // Flow orchestrator + selectors.
        initFlowActions();
        initFlowSelectors();

        // The rates of an address already known and the sync of a billing
        // address entered on its own, right away instead of after a click.
        startInitialRequests(store, flowActions());

        // Mount.
        await mountCheckoutApp();
    } catch (err) {
        renderBootstrapError(err);
        throw err;
    }
}

function readCheckoutConfig(): CheckoutConfig {
    const node = document.getElementById(CONFIG_ELEMENT_ID);
    if (!node) {
        throw new Error(
            `#${CONFIG_ELEMENT_ID} not found -- the PHTML didn't render, ` +
            'or the bundle is loading on a non-checkout page.'
        );
    }
    const text = node.textContent ?? '';
    if (text.trim().length === 0) {
        throw new Error(`#${CONFIG_ELEMENT_ID} is empty.`);
    }
    try {
        return normaliseCheckoutConfig(JSON.parse(text) as CheckoutConfig);
    } catch (err) {
        throw new Error(`#${CONFIG_ELEMENT_ID} is not valid JSON: ${String(err)}`);
    }
}

function assertHyperionEnabled(hyperion: HyperionConfig | undefined): void {
    if (!hyperion) {
        throw new Error(
            'checkoutConfig.hyperion missing -- ConfigProvider not registered?'
        );
    }
    if (!hyperion.enabled) {
        throw new Error(
            'checkoutConfig.hyperion.enabled is false -- feature flag is off. ' +
            'The layout handle should have been stripped server-side; ' +
            'finding this at boot means the server state disagrees with the runtime.'
        );
    }
}

/**
 * Read the minimum-order gate fields from `cartData`. Returns the
 * server-rendered description when the cart fails the check; null
 * when the gate passes or the feature is disabled.
 */
export function computeMinOrderError(config: CheckoutConfig): string | null {
    const cartData = config.cartData;
    if (!cartData) return null;
    if (cartData.isMinimumAmountValid === false) {
        return cartData.minimumAmountDescription ?? t('Hyperion_Checkout::min_order_amount_invalid');
    }
    return null;
}

async function mountCheckoutApp(): Promise<void> {
    const root = document.getElementById(ROOT_ELEMENT_ID);
    if (!root) {
        throw new Error(`#${ROOT_ELEMENT_ID} not found.`);
    }
    // Lazy import so the app module is only fetched after the config
    // island has been accepted.
    await import('./components/checkout-app.js');
    const el = document.createElement('checkout-app');
    root.replaceChildren(el);
}

function renderBootstrapError(err: unknown): void {
    const root = document.getElementById(ROOT_ELEMENT_ID);
    if (!root) return;
    const message =
        err instanceof Error ? err.message : 'Unknown bootstrap error.';
    root.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'alert');
    wrap.className =
        'max-w-xl mx-auto my-8 p-4 rounded-md bg-danger/10 text-danger border border-danger/30';
    const heading = document.createElement('p');
    heading.className = 'font-semibold';
    heading.textContent = t('Hyperion_Checkout::bootstrap_error');
    wrap.appendChild(heading);
    const detail = document.createElement('p');
    detail.className = 'mt-1 text-sm opacity-80';
    detail.textContent = message;
    wrap.appendChild(detail);
    root.appendChild(wrap);
}
