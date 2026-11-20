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
 *   3. Configure the REST client with storeCode + form-key reader.
 *   4. Install the translations: Magento's `__()` dictionary from the
 *      config (`hyperion.translations`) over the static catalog of the
 *      resolved locale (`hyperion.locale`, then the store code), and the
 *      store's wording of the core phrases a failure is recognized by.
 *   5. Start the flow actions, the draft of what the shopper types and
 *      the watch on the connection.
 *   6. Mount `<checkout-app>` into `#checkout-root`.
 *
 * Any failure is non-recoverable -- we do NOT render stock checkout
 * as a fallback (the admin flag is the rollback mechanism).
 * On failure the mount is replaced with one translated line so the user
 * sees *something* and the page doesn't look frozen; the reason goes to
 * the console.
 */
import type { CheckoutConfig, HyperionConfig } from './types/config.js';
import { configureApiClient } from './api/client.js';
import { setPhraseTranslations } from './api/error-kinds.js';
import { setPaymentVisibility } from './utils/payment-offer.js';
import { initStore } from './store/index.js';
import { seedCaptchaState } from './store/captcha-state.js';
import { startDraftPersistence } from './store/drafts.js';
import { hydrateStore, startInitialRequests } from './store/hydrate.js';
import { watchConnection } from './store/recovery.js';
import { normaliseCheckoutConfig } from './utils/checkout-config.js';
import { deriveBaseUrl } from './utils/base-url.js';
import { flowActions, initFlowActions } from './store/flow-actions.js';
import { initFlowSelectors } from './store/flow-selectors.js';
import { readFormKeyCookie } from './utils/form-key.js';
import { loadLocale, t } from './utils/i18n.js';
import { minimumOrderError } from './utils/minimum-order.js';
import { setCheckoutConfig } from './bootstrap-config.js';
import { loadOptionalSections } from './components/optional-sections.js';

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

        // The minimum order gate, for the totals the page was rendered
        // with; every totals answer evaluates it again.
        store.minimumOrderError.set(minimumOrderError(store.totals.get(), config));

        // Wire the REST client.
        configureApiClient({
            baseUrl: deriveBaseUrl(config, window.location.origin),
            storeCode: config.storeCode,
            readFormKey: readFormKeyCookie,
        });

        // Translations: Magento's `__()` dictionary over the static catalog,
        // the fallback catalog from the resolved locale, then the store code.
        await loadLocale({
            locale: config.hyperion.locale ?? config.locale ?? null,
            storeCode: config.storeCode,
            translations: config.hyperion.translations ?? config.translations ?? null,
        });
        // An order refused by core arrives already translated: the phrases
        // that tell a locked cart or an item out of stock are matched in
        // the store's wording too.
        setPhraseTranslations(config.hyperion.errorPhrases ?? null);
        // A method its gateway module marks as not presentable is not offered.
        setPaymentVisibility(config.payment);

        // The image CAPTCHA forms the page was rendered with; a failed
        // attempt asks the server again whether one became required.
        seedCaptchaState(config.hyperion.captcha?.forms);

        // Flow orchestrator + selectors.
        initFlowActions();
        initFlowSelectors();

        // What the shopper types is kept for a reload or a sign in, and a
        // connection that comes back sends again what failed without it.
        startDraftPersistence(store, config);
        watchConnection(store, () => flowActions().resumeAfterReconnect());

        // The rates of an address already known and the sync of a billing
        // address entered on its own, right away instead of after a click.
        startInitialRequests(store, flowActions());
        // An address put back from a draft is ahead of the quote: save it
        // now when the rates it needs are already there.
        if (store.shippingDirty.get() || store.billingDirty.get()) flowActions().flushShippingForm();

        // A page restored from the back/forward cache after the order went
        // through would show its frozen state over a quote that is gone.
        window.addEventListener('pageshow', reloadWhenRestored);

        // Mount.
        await mountCheckoutApp(config);
    } catch (err) {
        renderBootstrapError(err);
        throw err;
    }
}

/** `pageshow` handler: a page restored from the back/forward cache starts over. */
export function reloadWhenRestored(event: PageTransitionEvent): void {
    if (event.persisted) {
        window.location.reload();
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
        throw new Error(`#${CONFIG_ELEMENT_ID} is not valid JSON: ${String(err)}`, { cause: err });
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

async function mountCheckoutApp(config: CheckoutConfig): Promise<void> {
    const root = document.getElementById(ROOT_ELEMENT_ID);
    if (!root) {
        throw new Error(`#${ROOT_ELEMENT_ID} not found.`);
    }
    // Lazy import so the app module is only fetched after the config
    // island has been accepted. The sections only some stores show are
    // chunks of their own; the ones this store uses are defined before the
    // first render, so they are part of the first frame.
    await Promise.all([
        import('./components/checkout-app.js'),
        loadOptionalSections(config),
    ]);
    const el = document.createElement('checkout-app');
    // The sign in prompt of an ended session lives inside the app element,
    // where the checkout stylesheet applies, and outside what the app
    // renders: Lit appends its own content after an existing child.
    el.appendChild(document.createElement('hc-session-expired'));
    root.replaceChildren(el);
}

function renderBootstrapError(err: unknown): void {
    // The reason is for whoever maintains the store, not for the shopper.
    console.error('[hyperion-checkout] the checkout could not start', err);
    const root = document.getElementById(ROOT_ELEMENT_ID);
    if (!root) return;
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'alert');
    wrap.className =
        'max-w-xl mx-auto my-8 p-4 rounded-md bg-danger/10 text-danger border border-danger/30';
    const line = document.createElement('p');
    line.className = 'font-semibold';
    line.textContent = t('Hyperion_Checkout::bootstrap_error');
    wrap.appendChild(line);
    root.replaceChildren(wrap);
}
