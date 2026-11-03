// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Reactive store -- one signal per `CheckoutState` slice.
 *
 * Every top-level slice is a `Signal.State`; derivations
 * (`canPlaceOrder`, etc.) are `Signal.Computed` and live in
 * `selectors.ts`. Components NEVER call `.set()` directly; every
 * mutation goes through an action in `actions.ts` so the log is
 * greppable and side effects are centralised.
 */
import { Signal } from 'signal-polyfill';

import type { Address } from '../types/address.js';
import type {
    AddressId,
    MaskedQuoteId,
    QuoteId,
} from '../types/common.js';
import type { CustomerDataAuthenticated } from '../types/customer.js';
import type { PaymentMethodConfig } from '../types/payment.js';
import type { CartItem } from '../types/quote.js';
import type {
    SelectedShippingMethod,
    ShippingMethod,
} from '../types/shipping.js';
import type { Totals } from '../types/totals.js';

export interface Store {
    // Identity
    quoteId: Signal.State<QuoteId | null>;
    maskedQuoteId: Signal.State<MaskedQuoteId | null>;
    isGuest: Signal.State<boolean>;
    customer: Signal.State<CustomerDataAuthenticated | null>;
    customerToken: Signal.State<string | null>;

    // Cart
    items: Signal.State<readonly CartItem[]>;
    isVirtual: Signal.State<boolean>;

    // Contact
    email: Signal.State<string>;
    emailExists: Signal.State<boolean | null>;
    password: Signal.State<string>;
    loginError: Signal.State<string | null>;

    // Addresses
    shippingAddress: Signal.State<Address | null>;
    billingAddress: Signal.State<Address | null>;
    billingSameAsShipping: Signal.State<boolean>;
    savedAddresses: Signal.State<readonly Address[]>;
    selectedShippingAddressId: Signal.State<AddressId | null>;
    selectedBillingAddressId: Signal.State<AddressId | null>;

    // Shipping
    availableShippingMethods: Signal.State<readonly ShippingMethod[]>;
    selectedShippingMethod: Signal.State<SelectedShippingMethod | null>;
    isLoadingShippingMethods: Signal.State<boolean>;
    /**
     * The method the quote actually carries: set by the last successful
     * `shipping-information` save, cleared when an address change starts a
     * new estimate or a save fails. `canPlaceOrder` requires it to equal
     * `selectedShippingMethod`, so a selection the server never confirmed
     * cannot be ordered.
     */
    appliedShippingMethod: Signal.State<SelectedShippingMethod | null>;
    isSavingShipping: Signal.State<boolean>;

    // Billing (only meaningful when the billing address is entered on its
    // own: virtual quote, or "same as shipping" unchecked). `billingSynced`
    // is true once the quote carries the current billing address and the
    // payment methods / totals were refreshed for it.
    isSavingBilling: Signal.State<boolean>;
    billingSynced: Signal.State<boolean>;

    // Payment
    availablePaymentMethods: Signal.State<readonly PaymentMethodConfig[]>;
    selectedPaymentMethod: Signal.State<string | null>;
    paymentMethodData: Signal.State<Readonly<Record<string, Record<string, unknown>>>>;

    // Coupon
    appliedCoupon: Signal.State<string | null>;
    couponError: Signal.State<string | null>;

    // Totals
    totals: Signal.State<Totals | null>;

    // UI
    isPlacingOrder: Signal.State<boolean>;
    globalError: Signal.State<string | null>;
    fieldErrors: Signal.State<Readonly<Record<string, string>>>;

    // Agreements
    acceptedAgreements: Signal.State<readonly number[]>;

    // Min-order gate (Magento_Sales::MinimumOrderConfigProvider).
    // Holds the localised description when the cart fails the
    // minimum-amount check; null when valid or feature inactive.
    minimumOrderError: Signal.State<string | null>;
}

export function createStore(): Store {
    return {
        quoteId: new Signal.State<QuoteId | null>(null),
        maskedQuoteId: new Signal.State<MaskedQuoteId | null>(null),
        isGuest: new Signal.State<boolean>(true),
        customer: new Signal.State<CustomerDataAuthenticated | null>(null),
        customerToken: new Signal.State<string | null>(null),

        items: new Signal.State<readonly CartItem[]>([]),
        isVirtual: new Signal.State<boolean>(false),

        email: new Signal.State<string>(''),
        emailExists: new Signal.State<boolean | null>(null),
        password: new Signal.State<string>(''),
        loginError: new Signal.State<string | null>(null),

        shippingAddress: new Signal.State<Address | null>(null),
        billingAddress: new Signal.State<Address | null>(null),
        billingSameAsShipping: new Signal.State<boolean>(true),
        savedAddresses: new Signal.State<readonly Address[]>([]),
        selectedShippingAddressId: new Signal.State<AddressId | null>(null),
        selectedBillingAddressId: new Signal.State<AddressId | null>(null),

        availableShippingMethods: new Signal.State<readonly ShippingMethod[]>([]),
        selectedShippingMethod: new Signal.State<SelectedShippingMethod | null>(null),
        isLoadingShippingMethods: new Signal.State<boolean>(false),
        appliedShippingMethod: new Signal.State<SelectedShippingMethod | null>(null),
        isSavingShipping: new Signal.State<boolean>(false),

        isSavingBilling: new Signal.State<boolean>(false),
        billingSynced: new Signal.State<boolean>(false),

        availablePaymentMethods: new Signal.State<readonly PaymentMethodConfig[]>([]),
        selectedPaymentMethod: new Signal.State<string | null>(null),
        paymentMethodData: new Signal.State<Readonly<Record<string, Record<string, unknown>>>>({}),

        appliedCoupon: new Signal.State<string | null>(null),
        couponError: new Signal.State<string | null>(null),

        totals: new Signal.State<Totals | null>(null),

        isPlacingOrder: new Signal.State<boolean>(false),
        globalError: new Signal.State<string | null>(null),
        fieldErrors: new Signal.State<Readonly<Record<string, string>>>({}),

        acceptedAgreements: new Signal.State<readonly number[]>([]),

        minimumOrderError: new Signal.State<string | null>(null),
    };
}

/**
 * Module-scoped singleton. Initialized by `bootstrap.ts`. Components
 * read through `getStore()` rather than importing the raw singleton
 * so tests can replace it per-suite via `setStoreForTests`.
 */
let singleton: Store | null = null;

export function initStore(): Store {
    if (singleton) {
        throw new Error('[hyperion-checkout] store already initialized');
    }
    singleton = createStore();
    return singleton;
}

export function getStore(): Store {
    if (!singleton) {
        throw new Error(
            '[hyperion-checkout] getStore() called before initStore(). ' +
            'Did bootstrap.ts run?'
        );
    }
    return singleton;
}

export function setStoreForTests(store: Store | null): void {
    singleton = store;
}
