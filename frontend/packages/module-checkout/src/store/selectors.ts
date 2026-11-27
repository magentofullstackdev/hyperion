// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Derived (computed) signals.
 *
 * `canPlaceOrder` is the gate for the Place Order button.
 * Virtual carts skip shipping checks; non-virtual carts require a
 * chosen shipping method. `canPlaceOrderIgnoringLatch` is the same gate
 * without the "an order is being placed" latch: what the order pipeline
 * evaluates after it took the latch itself.
 *
 * The gates of the checkout's extensions (`extension/gates.ts`) come
 * last, as in `placeOrderBlocker()`.
 *
 * Agreements gate: if `expectedAgreements` is set by bootstrap
 * (from `checkoutConfig.checkoutAgreements`), every non-auto agreement
 * must appear in `acceptedAgreements`. When the admin has no active
 * agreements, `expectedAgreements` stays empty and the check is a
 * no-op.
 */
import { Signal } from 'signal-polyfill';

import { selectedRowKey } from '../components/payment-host/payment-rows.js';
import { rowState } from '../components/payment-host/row-state.js';
import { billingFollowsShipping, effectiveShippingAddress } from '../extension/address-override.js';
import { extensionGateMessage } from '../extension/gates.js';
import { isAddressComplete } from '../utils/address-validation.js';
import { offeredPaymentMethods } from '../utils/payment-offer.js';
import { EMAIL_SHAPE } from '../validation/rules.js';
import { antiAbuseBlocker } from './anti-abuse.js';
import type { Store } from './index.js';

/**
 * List of agreement IDs that must be accepted before Place Order
 * unlocks. Populated by bootstrap from `checkoutConfig.checkoutAgreements`
 * (only manual-mode entries). Lives as a module-level signal
 * because it comes from config, not user action.
 */
export const expectedAgreements = new Signal.State<readonly number[]>([]);

export function createSelectors(store: Store): {
    emailValid: Signal.Computed<boolean>;
    shippingAddressValid: Signal.Computed<boolean>;
    billingAddressValid: Signal.Computed<boolean>;
    billingReady: Signal.Computed<boolean>;
    shippingMethodSelected: Signal.Computed<boolean>;
    shippingReady: Signal.Computed<boolean>;
    paymentMethodSelected: Signal.Computed<boolean>;
    paymentMethodReady: Signal.Computed<boolean>;
    agreementsAccepted: Signal.Computed<boolean>;
    canPlaceOrderIgnoringLatch: Signal.Computed<boolean>;
    canPlaceOrder: Signal.Computed<boolean>;
} {
    const emailValid = new Signal.Computed<boolean>(() => {
        return EMAIL_SHAPE.test(store.email.get());
    });

    const shippingAddressValid = new Signal.Computed<boolean>(() => {
        if (store.isVirtual.get()) return true;
        return isAddressComplete(effectiveShippingAddress(store), undefined, 'shipping');
    });

    const billingAddressValid = new Signal.Computed<boolean>(() => {
        if (billingFollowsShipping(store) && !store.isVirtual.get()) {
            return shippingAddressValid.get();
        }
        return isAddressComplete(store.billingAddress.get(), undefined, 'billing');
    });

    // A billing address entered on its own (virtual quote, or "same as
    // shipping" unchecked) must be on the quote as it stands in the form
    // (`billingSynced`, not `billingDirty`), with no quote write running or
    // waiting.
    const billingReady = new Signal.Computed<boolean>(() => {
        if (store.quoteWritesPending.get() > 0) return false;
        if (billingFollowsShipping(store) && !store.isVirtual.get()) return true;
        return !store.isSavingBilling.get() && store.billingSynced.get() && !store.billingDirty.get();
    });

    const shippingMethodSelected = new Signal.Computed<boolean>(() => {
        if (store.isVirtual.get()) return true;
        return store.selectedShippingMethod.get() !== null;
    });

    // The selection must be one of the rates of the CURRENT address and the
    // server must have confirmed it (`appliedShippingMethod` is set by the
    // last successful shipping-information save). While an estimate, a
    // save or any other quote write is in flight or waiting nothing is
    // known yet, so the gate stays closed.
    const shippingReady = new Signal.Computed<boolean>(() => {
        if (store.isVirtual.get()) return true;
        if (store.quoteWritesPending.get() > 0) return false;
        // The form was edited and no save confirmed the new address yet.
        if (store.shippingDirty.get()) return false;
        if (store.isLoadingShippingMethods.get() || store.isSavingShipping.get()) return false;
        // The rates of the address could not be read: the list on screen
        // belongs to another address.
        if (store.estimateState.get() === 'error') return false;
        const selected = store.selectedShippingMethod.get();
        if (selected === null) return false;
        const offered = store.availableShippingMethods.get().some(
            (m) => m.available !== false
                && m.carrier_code === selected.carrier_code
                && m.method_code === selected.method_code
        );
        if (!offered) return false;
        const applied = store.appliedShippingMethod.get();
        return applied !== null
            && applied.carrier_code === selected.carrier_code
            && applied.method_code === selected.method_code;
    });

    // The selection must be one of the methods the quote currently offers:
    // a shipping save or a coupon can drop it (core refuses a method that is
    // not available for the quote).
    const paymentMethodSelected = new Signal.Computed<boolean>(() => {
        const code = store.selectedPaymentMethod.get();
        if (code === null) return false;
        return offeredPaymentMethods(store.availablePaymentMethods.get(), store.totals.get())
            .some((m) => m.code === code);
    });

    // A payment element may hold Place Order back until the shopper finished
    // a step inside it (PayPal authorization, a required field): what its
    // row last reported (`hyperion-payment:valid` / `:invalid`). A row whose
    // element could not be set up or gave up is not ready either.
    const paymentMethodReady = new Signal.Computed<boolean>(() => {
        const code = store.selectedPaymentMethod.get();
        if (code === null) return false;
        const key = selectedRowKey(code);
        const row = key === null ? null : rowState(key);
        return row === null || (row.valid && !row.fatal && row.failure === null);
    });

    const agreementsAccepted = new Signal.Computed<boolean>(() => {
        const expected = expectedAgreements.get();
        if (expected.length === 0) return true;
        const accepted = new Set(store.acceptedAgreements.get());
        return expected.every((id) => accepted.has(id));
    });

    const canPlaceOrderIgnoringLatch = new Signal.Computed<boolean>(() => {
        return (
            emailValid.get() &&
            shippingAddressValid.get() &&
            shippingMethodSelected.get() &&
            shippingReady.get() &&
            billingAddressValid.get() &&
            billingReady.get() &&
            antiAbuseBlocker(store) === null &&
            paymentMethodSelected.get() &&
            paymentMethodReady.get() &&
            agreementsAccepted.get() &&
            store.minimumOrderError.get() === null &&
            !store.isSettlingTotals.get() &&
            store.totals.get() !== null &&
            extensionGateMessage() === null
        );
    });

    // The latch: an order request is being prepared or sent, the order
    // exists or may exist (the quote is being asked, and no press shortens
    // that), or nothing can reach the quote any more (the session ended,
    // the cart is gone). Each of the last three shows its own message and
    // way forward next to the button.
    const canPlaceOrder = new Signal.Computed<boolean>(() => {
        const outcome = store.orderOutcome.get();
        return (
            canPlaceOrderIgnoringLatch.get() &&
            !store.isPlacingOrder.get() &&
            !store.orderPlaced.get() &&
            !store.sessionExpired.get() &&
            !store.quoteGone.get() &&
            outcome === 'none'
        );
    });

    return {
        emailValid,
        shippingAddressValid,
        billingAddressValid,
        billingReady,
        shippingMethodSelected,
        shippingReady,
        paymentMethodSelected,
        paymentMethodReady,
        agreementsAccepted,
        canPlaceOrderIgnoringLatch,
        canPlaceOrder,
    };
}
