// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The gate a renderer that owns Place Order (a PayPal or Google Pay button)
 * checks before it starts the payment: the same pieces the checkout's own
 * button requires, as the first missing one, translated, or null when the
 * order can go ahead. Readiness of the billing and shipping sync is not
 * part of it: `placeOrder()` completes the billing sync itself.
 */
import { getStore } from '../../store/index.js';
import { initFlowSelectors } from '../../store/flow-selectors.js';
import { t } from '../../utils/i18n.js';

export function getCheckoutBlocker(): string | null {
    const store = getStore();
    const selectors = initFlowSelectors();
    if (!selectors.emailValid.get()) return t('Hyperion_Checkout::checkout_incomplete_email');
    if (!selectors.shippingAddressValid.get()) return t('Hyperion_Checkout::checkout_incomplete_shipping_address');
    if (!selectors.shippingMethodSelected.get()) return t('Hyperion_Checkout::checkout_incomplete_shipping_method');
    if (!selectors.billingAddressValid.get()) return t('Hyperion_Checkout::checkout_incomplete_billing_address');
    if (!selectors.agreementsAccepted.get()) return t('Hyperion_Checkout::checkout_incomplete_agreements');
    const minimumOrder = store.minimumOrderError.get();
    if (minimumOrder !== null) return minimumOrder;
    if (store.totals.get() === null) return t('Hyperion_Checkout::checkout_incomplete_totals');
    return null;
}
