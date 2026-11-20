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
 *
 * Until its module arrived such a method is `pending`: its row is drawn at
 * the height it keeps once the renderer is there (the radio cannot be used
 * yet), never as a method the checkout does not support. A module that
 * failed to load leaves the method on the "not supported" path.
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

/** The method codes whose renderer is loaded on demand. */
export const LAZY_RENDERER_CODES: readonly string[] = Object.keys(LOADERS);

/** Bumped every time a lazily loaded renderer module has registered itself, or failed to load. */
export const renderersVersion = new Signal.State(0);

const requested = new Set<string>();
const failed = new Set<string>();

/** The renderer of this method is shipped as a module of its own and has not registered yet. */
export function isRendererPending(code: string): boolean {
    return code in LOADERS && !failed.has(code);
}

export function ensureRenderersFor(codes: readonly string[]): void {
    for (const code of codes) {
        const load = LOADERS[code];
        if (!load || requested.has(code)) continue;
        requested.add(code);
        load()
            .then(() => renderersVersion.set(renderersVersion.get() + 1))
            .catch((err: unknown) => {
                // The method goes to the "not yet supported" path. It stays
                // requested: the render this change causes must not ask
                // for the module again. A reload retries.
                failed.add(code);
                renderersVersion.set(renderersVersion.get() + 1);
                console.error(`[hyperion-checkout] payment renderer for "${code}" failed to load`, err);
            });
    }
}
