// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The gate a renderer that owns Place Order (a PayPal or Google Pay button)
 * checks before it starts the payment: exactly what the checkout's own
 * button requires, as the first missing piece, translated, or null when the
 * order can go ahead. That includes what the server must have confirmed:
 * the shipping method saved for the address in the form, a separate billing
 * address synced, no totals refresh in flight. While a request for one of
 * those is in flight the answer is the "being updated" message, so the wallet sheet
 * never opens for an amount that is about to change. Only the readiness of
 * the renderer itself is left out, and an order that already exists blocks
 * for good.
 */
import { getStore } from '../../store/index.js';
import { initFlowSelectors } from '../../store/flow-selectors.js';
import { placeOrderHint } from '../../store/place-order-hint.js';
import { t } from '../../utils/i18n.js';

export function getCheckoutBlocker(): string | null {
    const store = getStore();
    if (store.orderPlaced.get()) return t('Hyperion_Checkout::placing_order');
    return placeOrderHint(store, initFlowSelectors(), { skipPaymentReady: true });
}
