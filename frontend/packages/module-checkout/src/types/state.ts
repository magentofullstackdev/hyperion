// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Store state shape.
 *
 * The real signal store (`store/index.ts`) decomposes this into
 * individual `Signal.State` slices.
 * This interface exists so actions, selectors, and component
 * templates can reason about "the whole state" as one typed object
 * when needed (debug logging, persistence hooks, tests).
 */
import type { Address } from './address.js';
import type {
    AddressId,
    MaskedQuoteId,
    QuoteId,
} from './common.js';
import type { CustomerDataAuthenticated } from './customer.js';
import type {
    PaymentMethodConfig,
} from './payment.js';
import type { CartItem } from './quote.js';
import type {
    SelectedShippingMethod,
    ShippingMethod,
} from './shipping.js';
import type { Totals } from './totals.js';

export interface CheckoutState {
    // Identity
    quoteId: QuoteId | null;
    maskedQuoteId: MaskedQuoteId | null;
    isGuest: boolean;
    customer: CustomerDataAuthenticated | null;

    // Cart
    items: readonly CartItem[];
    isVirtual: boolean;

    // Contact
    email: string;
    emailExists: boolean | null;
    password: string;
    loginError: string | null;

    // Addresses
    shippingAddress: Address | null;
    billingAddress: Address | null;
    billingSameAsShipping: boolean;
    savedAddresses: readonly Address[];
    selectedShippingAddressId: AddressId | null;
    selectedBillingAddressId: AddressId | null;

    // Shipping
    availableShippingMethods: readonly ShippingMethod[];
    selectedShippingMethod: SelectedShippingMethod | null;
    isLoadingShippingMethods: boolean;
    appliedShippingMethod: SelectedShippingMethod | null;
    isSavingShipping: boolean;
    isSavingBilling: boolean;
    billingSynced: boolean;

    // Payment
    availablePaymentMethods: readonly PaymentMethodConfig[];
    selectedPaymentMethod: string | null;
    paymentMethodData: Readonly<Record<string, Record<string, unknown>>>;

    // Coupon
    appliedCoupon: string | null;
    couponError: string | null;

    // Totals
    totals: Totals | null;

    // UI
    isPlacingOrder: boolean;
    globalError: string | null;
    fieldErrors: Readonly<Record<string, string>>;

    // Agreements
    acceptedAgreements: readonly number[];
}
