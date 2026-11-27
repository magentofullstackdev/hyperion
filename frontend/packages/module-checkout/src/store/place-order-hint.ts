// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The one answer to "why can the order not be placed yet", shared by the
 * Place Order button, the order pipeline of the flow actions and the
 * payment renderers that complete the order with a control of their own.
 * `placeOrderBlocker()` names the first missing piece as a code,
 * `placeOrderHint()` gives its message.
 */
import { selectedRowKey } from '../components/payment-host/payment-rows.js';
import { rowState } from '../components/payment-host/row-state.js';
import { extensionGateMessage, shippingExtensionsValid } from '../extension/gates.js';
import { t } from '../utils/i18n.js';
import { antiAbuseBlocker } from './anti-abuse.js';
import type { Store } from './index.js';
import type { createSelectors } from './selectors.js';

export interface PlaceOrderHintOptions {
    /**
     * Leave out the readiness of the selected payment method's renderer:
     * a renderer that owns Place Order is the one asking, and its own step
     * (the wallet sheet) is what comes next.
     */
    skipPaymentReady?: boolean;
}

/** What keeps the order from being placed, in the order the checkout reads. */
export type PlaceOrderBlocker =
    | 'email'
    | 'shipping-address'
    | 'shipping-method'
    | 'billing-address'
    /** The quote is catching up with the form: a save is owed, running or waiting. */
    | 'updating'
    | 'payment-method'
    | 'payment-not-ready'
    | 'agreements'
    /** The image CAPTCHA of the order form has no answer yet. */
    | 'captcha'
    /** The visible reCAPTCHA checkbox of the order is not ticked. */
    | 'recaptcha'
    | 'minimum-order'
    | 'totals'
    /** An extension of the checkout holds the order back (its gate names why). */
    | 'extension';

/** The message shown while the quote is catching up with the form. */
export function checkoutUpdatingMessage(): string {
    return t('Hyperion_Checkout::checkout_updating');
}

/**
 * The first thing that keeps the order from being placed; null when
 * nothing is missing. Same order as the checkout reads: contact, shipping,
 * billing, payment, agreements, security checks, totals, and last the gates
 * of the checkout's extensions (`extension/gates.ts`). A piece the server still has to
 * confirm (the form is ahead of the quote, an estimate, a write or the
 * totals read is on its way) is `updating`; a piece the shopper has to
 * supply is named. The latch of an order being placed is not part of it.
 */
export function placeOrderBlocker(
    store: Store,
    selectors: ReturnType<typeof createSelectors>,
    options: PlaceOrderHintOptions = {}
): PlaceOrderBlocker | null {
    if (!selectors.emailValid.get()) return 'email';
    if (!selectors.shippingAddressValid.get()) return 'shipping-address';
    const busy = store.quoteWritesPending.get() > 0 || store.isSettlingTotals.get();
    if (!selectors.shippingMethodSelected.get()) {
        // The rates are on their way: there is nothing to select yet.
        return store.isLoadingShippingMethods.get() ? 'updating' : 'shipping-method';
    }
    if (!selectors.billingAddressValid.get()) return 'billing-address';
    if (!selectors.shippingReady.get()) {
        // The rate waits for its delivery option (its save is held): its gate says what is missing.
        if (shippingExtensionsValid.get() !== null) return 'extension';
        const updating = busy
            || store.shippingDirty.get()
            || store.isLoadingShippingMethods.get()
            || store.isSavingShipping.get()
            || store.isSavingBilling.get();
        return updating ? 'updating' : 'shipping-method';
    }
    if (!selectors.billingReady.get()) {
        const updating = busy || store.billingDirty.get() || store.isSavingBilling.get();
        return updating ? 'updating' : 'billing-address';
    }
    if (busy) return 'updating';
    if (!selectors.paymentMethodSelected.get()) return 'payment-method';
    if (!options.skipPaymentReady && !selectors.paymentMethodReady.get()) return 'payment-not-ready';
    if (!selectors.agreementsAccepted.get()) return 'agreements';
    const securityCheck = antiAbuseBlocker(store);
    if (securityCheck !== null) return securityCheck;
    if (store.minimumOrderError.get() !== null) return 'minimum-order';
    if (store.totals.get() === null) return 'totals';
    if (extensionGateMessage() !== null) return 'extension';
    return null;
}

/** The message of a blocker, for the shopper. */
export function placeOrderBlockerMessage(store: Store, blocker: PlaceOrderBlocker): string {
    switch (blocker) {
        case 'email':
            return t('Hyperion_Checkout::checkout_incomplete_email');
        case 'shipping-address':
            return t('Hyperion_Checkout::checkout_incomplete_shipping_address');
        case 'shipping-method':
            return t('Hyperion_Checkout::checkout_incomplete_shipping_method');
        case 'billing-address':
            return t('Hyperion_Checkout::checkout_incomplete_billing_address');
        case 'updating':
            return checkoutUpdatingMessage();
        case 'payment-method':
            return t('Hyperion_Checkout::checkout_incomplete_payment_method');
        case 'payment-not-ready': {
            const code = store.selectedPaymentMethod.get();
            const key = selectedRowKey(code);
            const reported = key === null ? null : rowState(key).message;
            return reported ?? t('Hyperion_Checkout::checkout_incomplete_payment_method');
        }
        case 'agreements':
            return t('Hyperion_Checkout::checkout_incomplete_agreements');
        case 'captcha':
            return t('Hyperion_Checkout::checkout_incomplete_captcha');
        case 'recaptcha':
            return t('Hyperion_Checkout::recaptcha_required');
        case 'minimum-order':
            return store.minimumOrderError.get() ?? t('Hyperion_Checkout::checkout_incomplete_totals');
        case 'totals':
            return t('Hyperion_Checkout::checkout_incomplete_totals');
        case 'extension':
            return extensionGateMessage() ?? t('Hyperion_Checkout::extension_blocked');
    }
}

/**
 * The first thing that keeps the order from being placed, as a message for
 * the shopper; null when nothing is missing.
 */
export function placeOrderHint(
    store: Store,
    selectors: ReturnType<typeof createSelectors>,
    options: PlaceOrderHintOptions = {}
): string | null {
    const blocker = placeOrderBlocker(store, selectors, options);
    return blocker === null ? null : placeOrderBlockerMessage(store, blocker);
}
