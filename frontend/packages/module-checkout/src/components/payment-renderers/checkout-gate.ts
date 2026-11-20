// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The gate a renderer that owns Place Order (a PayPal or Google Pay button)
 * checks before it starts the payment: exactly what the checkout's own
 * button requires, as the first missing piece, translated, or null when the
 * order can go ahead. That includes what the server must have confirmed:
 * the shipping method saved for the address in the form, a separate billing
 * address on the quote, no quote write running or waiting, the totals
 * settled. Only the readiness of the renderer itself is left out, and an
 * order that already exists blocks for good.
 *
 * `getCheckoutBlocker()` answers at once from the state as it is, for
 * rendering. `prepareCheckout()` is what a click awaits: it first puts
 * every pending edit on the quote, so the wallet sheet never opens for an
 * amount that is about to change.
 */
import { flowActions } from '../../store/flow-actions.js';
import { getStore } from '../../store/index.js';
import { initFlowSelectors } from '../../store/flow-selectors.js';
import { placeOrderBlockerMessage, placeOrderHint } from '../../store/place-order-hint.js';
import { failureMessage } from '../../store/section-status.js';
import { t } from '../../utils/i18n.js';

export function getCheckoutBlocker(): string | null {
    const store = getStore();
    if (store.orderPlaced.get()) return t('Hyperion_Checkout::placing_order');
    return placeOrderHint(store, initFlowSelectors(), { skipPaymentReady: true });
}

/**
 * Flush the pending saves and evaluate the gate on what the server
 * confirmed. Resolves with null when the payment can start, with the
 * message to show otherwise (a failed save reports itself in its section;
 * its message is the one answered here). The latch of the order is not kept: the
 * payment step of the renderer may take any time or be abandoned, and
 * `flowActions().placeOrder()` takes it again when the order is sent.
 */
export async function prepareCheckout(): Promise<string | null> {
    const store = getStore();
    const result = await flowActions().prepareOrder({ skipPaymentReady: true });
    if (result.status === 'ready') {
        flowActions().cancelOrder();
        return null;
    }
    if (result.reason === 'busy') return t('Hyperion_Checkout::placing_order');
    if (result.reason === 'outcome-unknown') {
        return failureMessage('order') ?? t('Hyperion_Checkout::order_outcome_unknown');
    }
    if (result.reason === 'write-failed') {
        return failureMessage() ?? store.globalError.get() ?? t('Hyperion_Checkout::unexpected_error');
    }
    return placeOrderBlockerMessage(store, result.reason);
}
