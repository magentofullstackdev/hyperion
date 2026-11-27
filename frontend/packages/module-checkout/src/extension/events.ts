// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The DOM events the checkout dispatches on `<checkout-app>`
 * (`CheckoutEvents` of `extension-api.d.ts`), bubbling and composed, with
 * frozen details that carry no personal data: no email, no address, no
 * order id.
 *
 * Dispatched here or from here:
 *   - `ready`: by the bootstrap, after the first render and once the first
 *     requests settled;
 *   - `shipping-method-applied`, `payment-method-selected`,
 *     `totals-updated`, `order-placed`: by `startCheckoutEvents()`, on a
 *     change of the method the server confirmed, of the selected payment
 *     method, of the confirmed totals, and when the order latch closes as
 *     placed (once per batch of changes);
 *   - `before-place-order` (cancelable): by `prepareOrder()` of the flow
 *     actions, as the first step of an order;
 *   - `error`: where a failure is shown in its section (`reportFailure()`).
 */
import type { CheckoutEvents } from '../../extension-api.js';
import type { Store } from '../store/index.js';
import { moneyTotalsOf } from './money.js';
import { watchValue } from './watch.js';

export type CheckoutEventName = keyof CheckoutEvents extends `hyperion:checkout:${infer Name}` ? Name : never;

type DetailOf<N extends CheckoutEventName> = CheckoutEvents[`hyperion:checkout:${N}`] extends CustomEvent<infer D> ? D : never;

/**
 * Dispatch `hyperion:checkout:<name>` on the mounted `<checkout-app>`.
 * Answers false when a listener canceled a cancelable event; true
 * otherwise (also when the application is not mounted).
 */
export function emitCheckoutEvent<N extends CheckoutEventName>(
    name: N,
    detail: DetailOf<N>,
    options: { cancelable?: boolean } = {}
): boolean {
    const target = typeof document === 'undefined' ? null : document.querySelector('checkout-app');
    if (target === null) return true;
    const event = new CustomEvent(`hyperion:checkout:${name}`, {
        detail: Object.freeze({ ...(detail as object) }),
        bubbles: true,
        composed: true,
        cancelable: options.cancelable === true,
    });
    try {
        return target.dispatchEvent(event);
    } catch (err) {
        console.error(`[hyperion-checkout] a listener of hyperion:checkout:${name} failed`, err);
        return !event.defaultPrevented;
    }
}

/** Dispatch the change events of the store from now on; returns the function that stops it. */
export function startCheckoutEvents(store: Store): () => void {
    const read = () => ({
        applied: store.appliedShippingMethod.get(),
        payment: store.selectedPaymentMethod.get(),
        totals: store.totals.get(),
        placed: store.orderOutcome.get() === 'placed',
    });
    let last = read();
    let money = moneyTotalsOf(last.totals);
    return watchValue(read, (now) => {
        const before = last;
        const moneyBefore = money;
        last = now;
        if (now.totals !== before.totals) money = moneyTotalsOf(now.totals);
        const applied = now.applied;
        if (applied !== null && (before.applied === null || before.applied.carrier_code !== applied.carrier_code
            || before.applied.method_code !== applied.method_code)) {
            emitCheckoutEvent('shipping-method-applied', { carrier_code: applied.carrier_code, method_code: applied.method_code });
        }
        if (now.payment !== null && now.payment !== before.payment) {
            emitCheckoutEvent('payment-method-selected', { method: now.payment });
        }
        if (money !== null && money !== moneyBefore && JSON.stringify(money) !== JSON.stringify(moneyBefore)) {
            emitCheckoutEvent('totals-updated', { display: money.display, base: money.base });
        }
        if (now.placed && !before.placed && money !== null) {
            emitCheckoutEvent('order-placed', { method: now.payment ?? '', display: money.display });
        }
    });
}
