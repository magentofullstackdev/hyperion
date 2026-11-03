// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Actions -- every mutation the checkout can perform.
 *
 * Discipline reminder: components NEVER call `signal.set()` directly.
 * Every state write must go through one of these functions. That's
 * how debuggability stays sane as the store grows.
 */
import type { Address } from '../types/address.js';
import type { getStore } from './index.js';

type StoreHandle = ReturnType<typeof getStore>;

export function createActions(store: StoreHandle): {
    setEmail: (email: string) => void;
    setShippingAddress: (addr: Address | null) => void;
    setBillingAddress: (addr: Address | null) => void;
    setBillingSameAsShipping: (value: boolean) => void;
    selectShippingAddressId: (id: string | null) => void;
    selectBillingAddressId: (id: string | null) => void;
    selectShippingMethod: (carrier: string, method: string) => void;
    selectPaymentMethod: (code: string | null) => void;
    setPaymentMethodData: (code: string, data: Record<string, unknown>) => void;
    applyCoupon: (code: string) => void;
    removeCoupon: () => void;
    acceptAgreement: (id: number) => void;
    revokeAgreement: (id: number) => void;
    setGlobalError: (message: string | null) => void;
    clearFieldError: (field: string) => void;
    setFieldError: (field: string, message: string) => void;
    setIsPlacingOrder: (value: boolean) => void;
} {
    return {
        setEmail(email) {
            store.email.set(email);
        },

        setShippingAddress(addr) {
            store.shippingAddress.set(addr);
        },

        setBillingAddress(addr) {
            store.billingAddress.set(addr);
        },

        setBillingSameAsShipping(value) {
            store.billingSameAsShipping.set(value);
        },

        selectShippingAddressId(id) {
            store.selectedShippingAddressId.set(id);
        },

        selectBillingAddressId(id) {
            store.selectedBillingAddressId.set(id);
        },

        selectShippingMethod(carrier, method) {
            store.selectedShippingMethod.set({
                carrier_code: carrier,
                method_code: method,
            });
        },

        selectPaymentMethod(code) {
            store.selectedPaymentMethod.set(code);
        },

        setPaymentMethodData(code, data) {
            const current = store.paymentMethodData.get();
            store.paymentMethodData.set({ ...current, [code]: data });
        },

        applyCoupon(code) {
            // TODO: call PUT /coupons/:code, update totals on 200,
            // set couponError from MagentoApiError on 4xx.
            store.appliedCoupon.set(code);
            store.couponError.set(null);
        },

        removeCoupon() {
            // TODO: call DELETE /coupons, refresh totals.
            store.appliedCoupon.set(null);
            store.couponError.set(null);
        },

        acceptAgreement(id) {
            const current = store.acceptedAgreements.get();
            if (current.includes(id)) return;
            store.acceptedAgreements.set([...current, id]);
        },

        revokeAgreement(id) {
            const current = store.acceptedAgreements.get();
            store.acceptedAgreements.set(current.filter((x) => x !== id));
        },

        setGlobalError(message) {
            store.globalError.set(message);
        },

        clearFieldError(field) {
            const current = store.fieldErrors.get();
            if (!(field in current)) return;
            const next = { ...current };
            delete next[field];
            store.fieldErrors.set(next);
        },

        setFieldError(field, message) {
            const current = store.fieldErrors.get();
            store.fieldErrors.set({ ...current, [field]: message });
        },

        setIsPlacingOrder(value) {
            store.isPlacingOrder.set(value);
        },
    };
}
