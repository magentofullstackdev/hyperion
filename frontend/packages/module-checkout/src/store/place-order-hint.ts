// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The one answer to "why can the order not be placed yet", shared by the
 * Place Order button and by the payment renderers that complete the order
 * with a control of their own.
 */
import { getPaymentRenderer } from '../components/payment-renderers/registry.js';
import { t } from '../utils/i18n.js';
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

/** The message shown while the quote is catching up with the form. */
export function checkoutUpdatingMessage(): string {
    return t('Hyperion_Checkout::checkout_updating');
}

/**
 * The first thing that keeps the order from being placed, as a message for
 * the shopper; null when nothing is missing. Same order as the checkout
 * reads: contact, shipping, billing, payment, agreements, totals. A piece
 * whose confirmation by the server is on its way (an estimate, a save or a
 * totals refresh in flight) is reported as "being updated"; when nothing
 * is running, the piece is named.
 */
export function placeOrderHint(
    store: Store,
    selectors: ReturnType<typeof createSelectors>,
    options: PlaceOrderHintOptions = {}
): string | null {
    if (!selectors.emailValid.get()) return t('Hyperion_Checkout::checkout_incomplete_email');
    if (!selectors.shippingAddressValid.get()) return t('Hyperion_Checkout::checkout_incomplete_shipping_address');
    if (!selectors.shippingMethodSelected.get()) return t('Hyperion_Checkout::checkout_incomplete_shipping_method');
    if (!selectors.billingAddressValid.get()) return t('Hyperion_Checkout::checkout_incomplete_billing_address');
    if (!selectors.shippingReady.get()) {
        // "Being updated" only while a request is really running: a form
        // left ahead of the quote by a failed attempt is not an update.
        const updating = store.isLoadingShippingMethods.get()
            || store.isSavingShipping.get()
            || store.isSavingBilling.get();
        return updating ? checkoutUpdatingMessage() : t('Hyperion_Checkout::checkout_incomplete_shipping_method');
    }
    if (!selectors.billingReady.get()) {
        return store.isSavingBilling.get()
            ? checkoutUpdatingMessage()
            : t('Hyperion_Checkout::checkout_incomplete_billing_address');
    }
    if (store.isRefreshingTotals.get()) return checkoutUpdatingMessage();
    if (!selectors.paymentMethodSelected.get()) return t('Hyperion_Checkout::checkout_incomplete_payment_method');
    if (!options.skipPaymentReady && !selectors.paymentMethodReady.get()) {
        const code = store.selectedPaymentMethod.get();
        const renderer = code === null ? null : getPaymentRenderer(code);
        return renderer?.notReadyMessage?.() ?? t('Hyperion_Checkout::checkout_incomplete_payment_method');
    }
    if (!selectors.agreementsAccepted.get()) return t('Hyperion_Checkout::checkout_incomplete_agreements');
    const minOrder = store.minimumOrderError.get();
    if (minOrder !== null) return minOrder;
    if (store.totals.get() === null) return t('Hyperion_Checkout::checkout_incomplete_totals');
    return null;
}
