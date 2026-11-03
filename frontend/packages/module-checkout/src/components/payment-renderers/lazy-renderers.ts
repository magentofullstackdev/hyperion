// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Gateway renderers are loaded on demand, by method code.
 *
 * The offline renderer ships in the main checkout bundle. A gateway
 * renderer (hosted fields, PayPal button, vault adapter, 3D Secure glue)
 * is several kilobytes that only a store using that gateway needs, so its
 * module is imported the first time the method shows up in the available
 * payment methods. The modules register themselves in the renderer
 * registry / vault adapters on import; `renderersVersion` then changes so
 * signal-watching components render the new rows.
 */
import { Signal } from 'signal-polyfill';

const LOADERS: Readonly<Record<string, () => Promise<unknown>>> = {
    braintree: () => import('./braintree/payment-braintree-card.js'),
    braintree_paypal: () => import('./braintree/payment-braintree-paypal.js'),
    braintree_cc_vault: () => import('./braintree/payment-braintree-vault.js'),
    braintree_paypal_vault: () => import('./braintree/payment-braintree-vault.js'),
    braintree_googlepay: () => import('./braintree/payment-braintree-googlepay.js'),
    braintree_googlepay_vault: () => import('./braintree/payment-braintree-vault.js'),
    paypal_express: () => import('./paypal/payment-paypal-express.js'),
    payflow_express: () => import('./paypal/payment-paypal-express.js'),
};

/** Bumped every time a lazily loaded renderer module has registered itself. */
export const renderersVersion = new Signal.State(0);

const requested = new Set<string>();

export function ensureRenderersFor(codes: readonly string[]): void {
    for (const code of codes) {
        const load = LOADERS[code];
        if (!load || requested.has(code)) continue;
        requested.add(code);
        load()
            .then(() => renderersVersion.set(renderersVersion.get() + 1))
            .catch((err: unknown) => {
                // The method stays on the "not yet supported" path; a reload retries.
                requested.delete(code);
                // eslint-disable-next-line no-console
                console.error(`[hyperion-checkout] payment renderer for "${code}" failed to load`, err);
            });
    }
}
