// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The checkout keeps what a shopper typed (addresses, the handoff entry of
 * a sign in, the override fingerprints) in the tab's `sessionStorage`, under
 * keys that start with `CHECKOUT_STORAGE_PREFIX`. The value is the one of
 * the checkout package (`CHECKOUT_STORAGE_PREFIX` of its
 * `src/store/drafts.ts`): the theme never imports that package, so a test on
 * each side compares the two.
 *
 * The sign-out page (`Magento_Customer::logout.phtml`) prints
 * `data-hyperion-signed-out`; on that page every such entry is removed, so
 * the next person who uses the tab does not find the signed-out customer's
 * typed address there.
 */

export const CHECKOUT_STORAGE_PREFIX = 'hyperion.checkout.';

const SIGNED_OUT_SELECTOR = '[data-hyperion-signed-out]';

/** Remove every checkout entry of the tab's session storage; a storage the browser refuses is left alone. */
export function forgetCheckoutDrafts() {
    try {
        const storage = window.sessionStorage;
        const keys = [];
        for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            if (key !== null && key.startsWith(CHECKOUT_STORAGE_PREFIX)) keys.push(key);
        }
        keys.forEach((key) => storage.removeItem(key));
    } catch {
        // No storage, no draft to remove.
    }
}

/** On the sign-out page, remove the checkout entries of the tab. */
export function forgetCheckoutDraftsAfterSignOut(root = document) {
    if (root.querySelector(SIGNED_OUT_SELECTOR)) forgetCheckoutDrafts();
}
