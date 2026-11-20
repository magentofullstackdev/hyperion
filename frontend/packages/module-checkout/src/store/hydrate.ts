// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Store hydration from `checkoutConfig`.
 *
 * The quote on the server is the source of truth: whatever it already
 * carries (identity, items, totals, the saved addresses and email, the
 * shipping method, an applied coupon) is put into the store before the app
 * mounts, so a reload shows the same checkout the shopper left.
 *
 *   - A logged in customer hydrates from core's `customerData` (saved
 *     addresses, email). The addresses selected are the ones of the quote
 *     when `hyperion.initial.quoteAddresses` tells them (a saved address by
 *     its id, an address typed in the checkout as a new address), the
 *     default addresses otherwise.
 *   - A guest hydrates from `hyperion.guestQuote` (the quote shipping and
 *     billing addresses and email, emitted by
 *     `Model\Checkout\GuestQuoteConfigProvider`).
 *   - When `hyperion.initial` is there and the addresses in the store are
 *     the ones of the quote, its stored rates, payment methods and
 *     confirmed shipping method are taken as they are: the checkout starts
 *     with Place Order open and `startInitialRequests()` sends nothing but
 *     a late, silent refresh of the rate list.
 *   - Otherwise the quote's shipping method (core's
 *     `selectedShippingMethod`) is the selection and
 *     `startInitialRequests()` runs the estimate, which keeps a selection
 *     the rates still offer and saves it once, with a billing address
 *     entered on its own in the same request.
 *   - What the shopper typed and the quote does not carry yet is put back
 *     last (`restoreDraft()`).
 *
 * Pure with respect to the DOM and the network: `bootstrap.ts` calls it and
 * the unit tests exercise it with `createStore()`.
 */
import type { Address } from '../types/address.js';
import type { CheckoutConfig, InitialStateConfig, QuoteAddressConfig } from '../types/config.js';
import { AGREEMENT_MODE_AUTO } from '../types/config.js';
import { isAuthenticatedCustomer } from '../types/customer.js';
import type { ShippingMethod } from '../types/shipping.js';
import { isAddressComplete, regionIdOf, regionTextOf } from '../utils/address-validation.js';
import { normaliseQuoteAddress } from '../utils/checkout-config.js';
import { restoreDraft } from './drafts.js';
import { isPickupRate, reconcilePaymentSelection, type FlowActions } from './flow-actions.js';
import type { Store } from './index.js';
import { DEFAULT_RATE_FIELDS, rateKey } from './rate-key.js';
import { expectedAgreements } from './selectors.js';

/** How long after the first paint the stored rate list is refreshed. */
export const RATE_REFRESH_DELAY_MS = 200;

/** Whether the addresses in the store are, field by field, the ones the quote carries. */
interface QuoteMatch {
    shipping: boolean;
    billing: boolean;
}

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

    const match = isAuthenticatedCustomer(config.customerData)
        ? hydrateCustomer(store, config)
        : hydrateGuest(store, config);

    const method = config.selectedShippingMethod;
    if (!store.isVirtual.get() && method && method.carrier_code && method.method_code) {
        store.selectedShippingMethod.set({
            carrier_code: method.carrier_code,
            method_code: method.method_code,
        });
    }

    if (config.totalsData) {
        store.totals.set(config.totalsData);
        const coupon = config.totalsData.coupon_code;
        store.appliedCoupon.set(typeof coupon === 'string' && coupon !== '' ? coupon : null);
    }
    if (config.paymentMethods) {
        store.availablePaymentMethods.set(config.paymentMethods);
    }

    // Agreements gate: the manually accepted agreements expected
    // before Place Order can fire. Auto-mode agreements are accepted
    // server-side and never gated.
    if (config.checkoutAgreements?.isEnabled && config.checkoutAgreements.agreements) {
        expectedAgreements.set(
            config.checkoutAgreements.agreements
                .filter((a) => a.mode !== AGREEMENT_MODE_AUTO)
                .map((a) => a.agreementId)
        );
    }

    hydrateInitialState(store, config, match);

    // The stored rates belong to the quote address: an address a draft put
    // in its place with other rate fields needs its own estimate.
    const fields = config.hyperion.rateFields ?? DEFAULT_RATE_FIELDS;
    const quoteRateKey = rateKey(store.shippingAddress.get(), fields);
    restoreDraft(store, config);
    if (
        store.estimateState.get() === 'ready'
        && rateKey(store.shippingAddress.get(), fields) !== quoteRateKey
    ) {
        store.estimateState.set('idle');
    }
}

function hydrateCustomer(store: Store, config: CheckoutConfig): QuoteMatch {
    const match: QuoteMatch = { shipping: false, billing: false };
    if (!isAuthenticatedCustomer(config.customerData)) return match;
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

    // The addresses of the quote win over the defaults: the saved address
    // the shopper picked, or the new address typed in the checkout.
    const quote = config.hyperion.initial?.quoteAddresses;
    if (!quote) return match;
    if (!store.isVirtual.get()) {
        const shipping = quoteAddressOf(quote.shipping, findSaved);
        if (shipping) {
            store.selectedShippingAddressId.set(shipping.address.id ?? null);
            store.shippingAddress.set(shipping.address);
            match.shipping = shipping.matches;
        }
    }
    if (quote.billingSameAsShipping) {
        match.billing = !store.isVirtual.get();
        return match;
    }
    const billing = quoteAddressOf(quote.billing, findSaved);
    if (billing) {
        store.selectedBillingAddressId.set(billing.address.id ?? null);
        store.billingAddress.set(billing.address);
        store.billingSameAsShipping.set(false);
        match.billing = billing.matches;
    }
    return match;
}

/**
 * The store address for a quote address of a customer. With a
 * `customer_address_id` of the address book it is that saved address, and
 * `matches` tells whether the quote still holds the same fields (the saved
 * address may have been edited since). Without an id the quote holds an
 * address typed in the checkout: it comes back as a new address, to be
 * saved to the address book unless the quote says otherwise. Null when the
 * quote has no address, or one whose saved address is gone.
 */
function quoteAddressOf(
    raw: QuoteAddressConfig | null,
    findSaved: (id: unknown) => Address | null
): { address: Address; matches: boolean } | null {
    const typed = normaliseQuoteAddress(raw);
    if (!raw || !typed) return null;
    const id = raw['customer_address_id'];
    const hasId = (typeof id === 'string' || typeof id === 'number') && String(id).trim() !== '' && Number(id) !== 0;
    if (hasId) {
        const saved = findSaved(String(id).trim());
        return saved ? { address: saved, matches: isSameAddress(saved, typed) } : null;
    }
    const flag = raw['save_in_address_book'];
    const declined = flag === false || flag === 0 || flag === '0';
    return { address: { ...typed, save_in_address_book: !declined }, matches: true };
}

function fieldText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    return typeof value === 'number' ? String(value) : '';
}

const COMPARED_FIELDS = [
    'firstname',
    'lastname',
    'city',
    'telephone',
    'company',
    'fax',
    'vat_id',
    'prefix',
    'middlename',
    'suffix',
] as const;

/** The fields an address form edits are the same in both addresses. */
function isSameAddress(a: Address, b: Address): boolean {
    if (fieldText(a.country_id).toUpperCase() !== fieldText(b.country_id).toUpperCase()) return false;
    if (fieldText(a.postcode).toUpperCase() !== fieldText(b.postcode).toUpperCase()) return false;
    const street = (addr: Address): string => addr.street.map(fieldText).filter((line) => line !== '').join('\n');
    if (street(a) !== street(b)) return false;
    const idA = regionIdOf(a);
    const idB = regionIdOf(b);
    if (idA !== idB) return false;
    if (idA === '' && regionTextOf(a).toUpperCase() !== regionTextOf(b).toUpperCase()) return false;
    return COMPARED_FIELDS.every((field) => fieldText(a[field]) === fieldText(b[field]));
}

function hydrateGuest(store: Store, config: CheckoutConfig): QuoteMatch {
    const match: QuoteMatch = { shipping: false, billing: false };
    const guest = config.hyperion.guestQuote;
    if (!guest) return match;
    if (guest.email) {
        store.email.set(guest.email);
    }
    const shipping = store.isVirtual.get() ? null : normaliseQuoteAddress(guest.shippingAddress);
    const billing = normaliseQuoteAddress(guest.billingAddress);
    // A guest address is never saved to an address book: the flag is set
    // explicitly so the address is complete for `<address-form>`, which
    // otherwise adds the default and emits the address again at mount (an
    // estimate and a save nothing asked for).
    if (shipping) {
        store.shippingAddress.set({ ...shipping, save_in_address_book: false });
        match.shipping = true;
        match.billing = true;
    }
    if (billing) {
        // The provider emits the billing address only when it was entered
        // on its own (virtual quote, or different from the shipping one).
        store.billingAddress.set({ ...billing, save_in_address_book: false });
        store.billingSameAsShipping.set(false);
    }
    return match;
}

function isUsableRate(rate: ShippingMethod): boolean {
    return rate.available !== false && Boolean(rate.method_code);
}

/**
 * Take the stored rates, the payment methods and the confirmed shipping
 * method of `hyperion.initial` as the state of the checkout. Only when the
 * store holds exactly what the quote holds: complete addresses that are the
 * quote's own, and a confirmed method that is a usable rate of the stored
 * list. Anything else leaves the store as it is, and the rates are asked.
 */
function hydrateInitialState(store: Store, config: CheckoutConfig, match: QuoteMatch): void {
    const initial: InitialStateConfig | null | undefined = config.hyperion.initial;
    if (!initial || store.isVirtual.get()) return;
    if (!match.shipping || !match.billing) return;
    if (!isAddressComplete(store.shippingAddress.get())) return;
    const ownBilling = !store.billingSameAsShipping.get();
    if (ownBilling && !isAddressComplete(store.billingAddress.get())) return;

    const applied = initial.appliedShippingMethod;
    const rates = (initial.shippingMethods ?? []).filter((rate) => !isPickupRate(rate));
    const confirmed = applied
        ? rates.find((rate) =>
            isUsableRate(rate)
            && rate.carrier_code === applied.carrier_code
            && rate.method_code === applied.method_code)
        : undefined;
    if (!confirmed) return;

    const method = { carrier_code: confirmed.carrier_code, method_code: confirmed.method_code };
    const paymentMethods = initial.paymentMethods ?? [];
    store.availableShippingMethods.set(rates);
    store.selectedShippingMethod.set(method);
    store.appliedShippingMethod.set(method);
    store.availablePaymentMethods.set(paymentMethods);
    store.selectedPaymentMethod.set(
        reconcilePaymentSelection(store.selectedPaymentMethod.get(), paymentMethods, config.totalsData ?? null)
    );
    store.estimateState.set('ready');
    store.shippingDirty.set(false);
    store.billingDirty.set(false);
    store.billingSynced.set(true);
}

/** The store shows what the quote confirmed: rates known, the method applied, no form ahead of the quote. */
function quoteIsConfirmed(store: Store): boolean {
    const selected = store.selectedShippingMethod.get();
    const applied = store.appliedShippingMethod.get();
    return store.estimateState.get() === 'ready'
        && selected !== null
        && applied !== null
        && applied.carrier_code === selected.carrier_code
        && applied.method_code === selected.method_code
        && !store.shippingDirty.get()
        && !store.billingDirty.get();
}

/**
 * Run `task` a moment after the checkout painted: once `<checkout-app>` is
 * defined (it is mounted right then), one frame and a short pause later.
 */
function afterFirstPaint(task: () => void): void {
    const nextFrame = (run: () => void): void => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => run());
        } else {
            setTimeout(run, 16);
        }
    };
    const start = (): void => nextFrame(() => { setTimeout(task, RATE_REFRESH_DELAY_MS); });
    if (typeof customElements === 'undefined') {
        start();
    } else {
        void customElements.whenDefined('checkout-app').then(start);
    }
}

/**
 * The requests the hydrated state calls for, right away instead of after a
 * click.
 *
 * A physical quote hydrated with its stored rates and confirmed method
 * needs none: nothing is written and nothing holds Place Order back. The
 * stored list may be shorter than what the carriers offer (after a save the
 * quote keeps the rates of the chosen carrier only), so it is read again in
 * the background, `schedule`d after the first paint.
 *
 * Otherwise a physical quote asks the rates of a shipping address already
 * known (a saved address, the guest's quote address or a restored draft);
 * the estimate ends in ONE shipping-information save whenever a method is
 * selected, and that save carries a billing address entered on its own, so
 * no billing request is ever started here for a physical quote. A virtual
 * quote has no shipping step: its billing address, which drives taxes and
 * payment availability, is put on the quote by its own request. Nothing
 * else may touch `shippingAddress` meanwhile, see `<address-form>`
 * connectedCallback.
 */
export function startInitialRequests(
    store: Store,
    flow: FlowActions,
    schedule: (task: () => void) => void = afterFirstPaint
): void {
    if (store.isVirtual.get()) {
        if (store.billingAddress.get()) void flow.syncBillingAddress();
        return;
    }
    if (!store.shippingAddress.get()) return;
    if (quoteIsConfirmed(store)) {
        schedule(() => { void flow.refreshShippingRatesSilently(); });
        return;
    }
    void flow.estimateShipping();
}
