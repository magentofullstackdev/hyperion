// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Store hydration from `checkoutConfig`.
 *
 * The quote on the server is the source of truth: whatever it already
 * carries (identity, items, totals, the saved addresses and email, the
 * shipping method) is put into the store before the app mounts, so a reload
 * shows the same checkout the shopper left.
 *
 *   - A logged in customer hydrates from core's `customerData` (saved
 *     addresses, defaults pre-selected, email).
 *   - A guest hydrates from `hyperion.guestQuote` (the quote shipping and
 *     billing addresses and email, emitted by
 *     `Model\Checkout\GuestQuoteConfigProvider`).
 *   - Both take the quote's shipping method (core's `selectedShippingMethod`)
 *     as the selection; `startInitialRequests()` then runs the estimate,
 *     which keeps a selection the rates still offer and re-saves it, so the
 *     server confirms the method (`appliedShippingMethod`) and Place Order
 *     opens once a payment method is chosen.
 *
 * Pure with respect to the DOM and the network: `bootstrap.ts` calls it and
 * the unit tests exercise it with `createStore()`.
 */
import type { Address } from '../types/address.js';
import type { CheckoutConfig } from '../types/config.js';
import { AGREEMENT_MODE_AUTO } from '../types/config.js';
import { isAuthenticatedCustomer } from '../types/customer.js';
import { normaliseQuoteAddress } from '../utils/checkout-config.js';
import type { FlowActions } from './flow-actions.js';
import type { Store } from './index.js';
import { expectedAgreements } from './selectors.js';

export function hydrateStore(store: Store, config: CheckoutConfig): void {
    if (config.quoteData?.entity_id) {
        const id = String(config.quoteData.entity_id);
        // Logged-in customers get the numeric quote ID; guests get the
        // 32-character masked ID. Trust the typed config flag rather than
        // guessing from the ID's shape.
        if (config.isCustomerLoggedIn) {
            store.quoteId.set(id);
        } else {
            store.maskedQuoteId.set(id);
        }
    }
    store.isGuest.set(!config.isCustomerLoggedIn);
    if (config.quoteItemData) {
        store.items.set(config.quoteItemData);
    }
    if (config.quoteData?.is_virtual) {
        const isV = config.quoteData.is_virtual;
        store.isVirtual.set(isV === 1 || isV === '1');
    }

    if (isAuthenticatedCustomer(config.customerData)) {
        hydrateCustomer(store, config);
    } else {
        hydrateGuest(store, config);
    }

    const method = config.selectedShippingMethod;
    if (!store.isVirtual.get() && method && method.carrier_code && method.method_code) {
        store.selectedShippingMethod.set({
            carrier_code: method.carrier_code,
            method_code: method.method_code,
        });
    }

    if (config.totalsData) {
        store.totals.set(config.totalsData);
    }
    if (config.paymentMethods) {
        store.availablePaymentMethods.set(config.paymentMethods);
    }

    // Agreements gate (Q6): the manually accepted agreements expected
    // before Place Order can fire. Auto-mode agreements are accepted
    // server-side and never gated.
    if (config.checkoutAgreements?.isEnabled && config.checkoutAgreements.agreements) {
        expectedAgreements.set(
            config.checkoutAgreements.agreements
                .filter((a) => a.mode !== AGREEMENT_MODE_AUTO)
                .map((a) => a.agreementId)
        );
    }
}

function hydrateCustomer(store: Store, config: CheckoutConfig): void {
    if (!isAuthenticatedCustomer(config.customerData)) return;
    const customer = config.customerData;
    store.customer.set(customer);
    const savedAddresses = Object.values(customer.addresses);
    const findSaved = (id: unknown): Address | null =>
        savedAddresses.find((a) => String(a.id) === String(id)) ?? null;
    store.savedAddresses.set(savedAddresses);
    // Pre-select the default addresses like the saved-address picker does
    // on click: the id alone shows the card as selected, but rates and
    // totals are computed from `shippingAddress` / `billingAddress`.
    if (customer.default_shipping) {
        store.selectedShippingAddressId.set(customer.default_shipping);
        store.shippingAddress.set(findSaved(customer.default_shipping));
    }
    if (customer.default_billing) {
        store.selectedBillingAddressId.set(customer.default_billing);
        store.billingAddress.set(findSaved(customer.default_billing));
    }
    if (customer.email) {
        store.email.set(customer.email);
    }
}

function hydrateGuest(store: Store, config: CheckoutConfig): void {
    const guest = config.hyperion.guestQuote;
    if (!guest) return;
    if (guest.email) {
        store.email.set(guest.email);
    }
    const shipping = store.isVirtual.get() ? null : normaliseQuoteAddress(guest.shippingAddress);
    const billing = normaliseQuoteAddress(guest.billingAddress);
    // A guest address is never saved to an address book: the flag is set
    // explicitly so the address is complete for `<address-form>`, which
    // otherwise adds the default and emits the address again at mount (a
    // second estimate and save on top of the ones started below).
    if (shipping) {
        store.shippingAddress.set({ ...shipping, save_in_address_book: false });
    }
    if (billing) {
        // The provider emits the billing address only when it was entered
        // on its own (virtual quote, or different from the shipping one).
        store.billingAddress.set({ ...billing, save_in_address_book: false });
        store.billingSameAsShipping.set(false);
    }
}

/**
 * The requests the hydrated state calls for, right away instead of after a
 * click: the rates of a shipping address already known (a saved address or
 * the guest's quote address; the estimate re-saves the kept selection), and
 * the sync of a billing address entered on its own (virtual quote, or
 * "same as shipping" off), which drives taxes and payment availability.
 */
export function startInitialRequests(store: Store, flow: FlowActions): void {
    if (!store.isVirtual.get() && store.shippingAddress.get()) {
        // `estimateShipping()` ends in `saveShippingAndEstimateTotals()`
        // whenever a method is selected: with the quote's method hydrated,
        // this ONE call re-confirms the shipping information (payment
        // methods, totals, `appliedShippingMethod`). Nothing else may touch
        // `shippingAddress` meanwhile, see `<address-form>` connectedCallback.
        void flow.estimateShipping();
    }
    if (store.billingAddress.get() && (store.isVirtual.get() || !store.billingSameAsShipping.get())) {
        void flow.syncBillingAddress();
    }
}
