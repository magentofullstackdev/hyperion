// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Derived (computed) signals.
 *
 * `canPlaceOrder` is the gate for the Place Order button.
 * Virtual carts skip shipping checks; non-virtual carts require a
 * chosen shipping method.
 *
 * Agreements gate (Q6): if `expectedAgreements` is set by bootstrap
 * (from `checkoutConfig.checkoutAgreements`), every non-auto agreement
 * must appear in `acceptedAgreements`. When the admin has no active
 * agreements, `expectedAgreements` stays empty and the check is a
 * no-op.
 */
import { Signal } from 'signal-polyfill';

import { getPaymentRenderer } from '../components/payment-renderers/registry.js';
import { isAddressComplete } from '../utils/address-validation.js';
import type { Store } from './index.js';

/**
 * List of agreement IDs that must be accepted before Place Order
 * unlocks. Populated by bootstrap from `checkoutConfig.checkoutAgreements`
 * (only manual-mode entries). Lives as a module-level signal
 * because it comes from config, not user action.
 *
 * This is a defensive placeholder -- the target store has no active
 * agreements today. See Appendix B: Q6 answer.
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
    canPlaceOrder: Signal.Computed<boolean>;
} {
    const emailValid = new Signal.Computed<boolean>(() => {
        const e = store.email.get();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    });

    const shippingAddressValid = new Signal.Computed<boolean>(() => {
        if (store.isVirtual.get()) return true;
        return isAddressComplete(store.shippingAddress.get());
    });

    // A billing address entered on its own (virtual quote, or "same as
    // shipping" unchecked) must be complete AND already on the quote, with
    // the payment methods and totals refreshed for it (`billingSynced`).
    const billingAddressValid = new Signal.Computed<boolean>(() => {
        if (store.billingSameAsShipping.get() && !store.isVirtual.get()) {
            return shippingAddressValid.get();
        }
        return isAddressComplete(store.billingAddress.get());
    });

    const billingReady = new Signal.Computed<boolean>(() => {
        if (store.billingSameAsShipping.get() && !store.isVirtual.get()) return true;
        return !store.isSavingBilling.get() && store.billingSynced.get();
    });

    const shippingMethodSelected = new Signal.Computed<boolean>(() => {
        if (store.isVirtual.get()) return true;
        return store.selectedShippingMethod.get() !== null;
    });

    // The selection must be one of the rates of the CURRENT address and the
    // server must have confirmed it (`appliedShippingMethod` is set by the
    // last successful shipping-information save). While an estimate or a
    // save is in flight nothing is known yet, so the gate stays closed.
    const shippingReady = new Signal.Computed<boolean>(() => {
        if (store.isVirtual.get()) return true;
        // The form was edited and no save confirmed the new address yet.
        if (store.shippingDirty.get()) return false;
        if (store.isLoadingShippingMethods.get() || store.isSavingShipping.get()) return false;
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
        return store.availablePaymentMethods.get().some((m) => m.code === code);
    });

    // A renderer may hold Place Order back until the shopper finished a step
    // inside it (PayPal authorization). `isReady` reads signals, so this
    // computed follows it.
    const paymentMethodReady = new Signal.Computed<boolean>(() => {
        const code = store.selectedPaymentMethod.get();
        if (code === null) return false;
        return getPaymentRenderer(code)?.isReady?.() ?? true;
    });

    const agreementsAccepted = new Signal.Computed<boolean>(() => {
        const expected = expectedAgreements.get();
        if (expected.length === 0) return true;
        const accepted = new Set(store.acceptedAgreements.get());
        return expected.every((id) => accepted.has(id));
    });

    const canPlaceOrder = new Signal.Computed<boolean>(() => {
        return (
            emailValid.get() &&
            shippingAddressValid.get() &&
            shippingMethodSelected.get() &&
            shippingReady.get() &&
            billingAddressValid.get() &&
            billingReady.get() &&
            paymentMethodSelected.get() &&
            paymentMethodReady.get() &&
            agreementsAccepted.get() &&
            store.minimumOrderError.get() === null &&
            !store.isRefreshingTotals.get() &&
            !store.isPlacingOrder.get() &&
            !store.orderPlaced.get() &&
            store.totals.get() !== null
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
        canPlaceOrder,
    };
}
