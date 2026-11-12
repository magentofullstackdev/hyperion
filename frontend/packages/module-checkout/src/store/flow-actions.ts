// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Flow actions -- the real API orchestrations.
 *
 * These wrap `src/api/*` calls, update store slices on success, and
 * set `globalError` / `fieldErrors` on failure. Components call
 * these via `flowActions()` rather than importing the API modules
 * directly, so the critical path stays greppable.
 */
import type { Address, AddressRequestPayload } from '../types/address.js';
import type { PaymentInformationRequest, PaymentMethodPayload } from '../types/payment.js';
import type {
    EstimateShippingMethodsRequest,
    SelectedShippingMethod,
    ShippingInformationRequest,
    ShippingMethod,
} from '../types/shipping.js';
import {
    estimateCustomerShippingMethods,
    estimateGuestShippingMethods,
    saveCustomerShippingInformation,
    saveGuestShippingInformation,
} from '../api/shipping.js';
import {
    applyCustomerCoupon,
    applyGuestCoupon,
    removeCustomerCoupon,
    removeGuestCoupon,
} from '../api/coupon.js';
import {
    assignCustomerBillingAddress,
    assignGuestBillingAddress,
    getCustomerPaymentInformation,
    getGuestPaymentInformation,
    placeCustomerOrder,
    placeGuestOrder,
    setCustomerPaymentInformation,
    setGuestPaymentInformation,
} from '../api/payment.js';
import { getCustomerCartState, getGuestCartState } from '../api/cart.js';
import { isAbortError, MagentoApiError, NetworkError, RequestTimeoutError } from '../api/client.js';
import { getStore } from './index.js';
import { t } from '../utils/i18n.js';
import { isAddressComplete } from '../utils/address-validation.js';
import { debounce } from '../utils/debounce.js';
import { executeRecaptcha } from '../components/hyperion-recaptcha.js';
import { isSafeForGeneric } from '../components/payment-renderers/registry.js';
import type { PaymentMethodConfig } from '../types/payment.js';
import type { PaymentDetails } from '../types/shipping.js';
import type { Totals } from '../types/totals.js';

/**
 * The quote address Magento receives, built from the checkout's address
 * (`Magento\Quote\Api\Data\AddressInterface` allowlist). A saved address of
 * the current customer is identified by `customer_address_id`, so core can
 * recognize it instead of treating it as new data; a new address carries
 * `save_in_address_book` as 1 or 0 (what the checkbox shows, never a guess).
 */
function addressToRequestPayload(addr: Address): AddressRequestPayload {
    const street = addr.street.filter((s) => s.trim().length > 0);
    const out: AddressRequestPayload = {
        country_id: addr.country_id,
        street,
        postcode: addr.postcode ?? '',
        city: addr.city,
        firstname: addr.firstname,
        lastname: addr.lastname,
    };
    if (typeof addr.telephone === 'string' && addr.telephone.trim() !== '') {
        out.telephone = addr.telephone;
    }
    // Region travel splits two ways depending on whether the country
    // has a populated region collection in the directory:
    //   1. Select-mode (regions exist) -> `region_id` + nested object
    //      with `region`/`region_code` are set by the form. Magento
    //      requires `region_id`; `region` and `region_code` ride along
    //      for full fidelity with the saved-address shape.
    //   2. Free-text mode (no regions) -> `addr.region` is a bare string
    //      typed by the user. Magento accepts it as `region` only and
    //      derives nothing else server-side.
    if (addr.region_id != null && addr.region_id !== '') {
        out.region_id = Number(addr.region_id);
    }
    const region: unknown = addr.region;
    if (region && typeof region === 'object') {
        const named = region as { region?: string; region_code?: string };
        if (named.region) out.region = named.region;
        if (named.region_code) out.region_code = named.region_code;
    } else if (typeof region === 'string' && region.trim().length > 0) {
        out.region = region.trim();
    }
    if (addr.company) out.company = addr.company;
    if (addr.fax) out.fax = addr.fax;
    if (addr.vat_id) out.vat_id = addr.vat_id;
    if (addr.prefix) out.prefix = addr.prefix;
    if (addr.middlename) out.middlename = addr.middlename;
    if (addr.suffix) out.suffix = addr.suffix;
    if (addr.email) out.email = addr.email;
    if (addr.custom_attributes && addr.custom_attributes.length > 0) {
        out.custom_attributes = addr.custom_attributes;
    }
    if (addr.extension_attributes && Object.keys(addr.extension_attributes).length > 0) {
        out.extension_attributes = addr.extension_attributes;
    }
    const savedId = addr.id != null && addr.id !== '' ? Number(addr.id) : NaN;
    if (Number.isInteger(savedId) && savedId > 0) {
        out.customer_address_id = savedId;
    } else {
        out.save_in_address_book = addr.save_in_address_book === true ? 1 : 0;
    }
    return out;
}

/** The shape `selectors.emailValid` accepts; an email that fails it never travels. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSameMethod(a: SelectedShippingMethod, b: SelectedShippingMethod): boolean {
    return a.carrier_code === b.carrier_code && a.method_code === b.method_code;
}

/**
 * True for the in-store pickup rate, which is never offered: the checkout
 * has no pickup location step, so an order with it would fail.
 */
export function isPickupRate(rate: SelectedShippingMethod): boolean {
    return rate.carrier_code === 'instore' && rate.method_code === 'pickup';
}

/** A rate the shopper can actually choose: not an error row, and with a method to save. */
function isUsableRate(rate: ShippingMethod): boolean {
    return rate.available !== false && Boolean(rate.method_code);
}

/** How long the shipping form must stay quiet before its address is estimated. */
const SHIPPING_ESTIMATE_DELAY_MS = 500;

/** What reading the quote says about an order request that lost its answer. */
type OrderOutcome = 'placed' | 'not-placed' | 'unknown';

/**
 * What `placeOrder()` resolves with: the order id, `'placed-unconfirmed'`
 * when the answer was lost and the quote shows the order exists, or null
 * when no order was placed (the reason is in `globalError`).
 */
export type PlaceOrderOutcome = number | 'placed-unconfirmed' | null;

/**
 * The estimate, shipping save or billing sync currently running, for
 * `settleShipping()` to wait on. Each run registers itself and clears the
 * slot when it is still the current one.
 */
let pendingShipping: Promise<void> | null = null;
let pendingBilling: Promise<void> | null = null;

export interface FlowActions {
    estimateShipping: () => Promise<void>;
    /**
     * The shipping address was edited: the quote no longer matches the
     * form (`shippingDirty`, at once) and the rates are estimated once the
     * typing pauses.
     */
    scheduleShippingEstimate: () => void;
    /** The shipping address was replaced in one step (a saved address): estimate it now. */
    estimateShippingNow: () => Promise<void>;
    /**
     * Run a scheduled estimate now and wait until no estimate, shipping save
     * or billing sync is in flight. When the form is ahead of the quote and
     * nothing is running (the last attempt failed), the estimate and save
     * are sent once more first.
     */
    settleShipping: () => Promise<void>;
    saveShippingAndEstimateTotals: () => Promise<void>;
    applyCoupon: (code: string) => Promise<boolean>;
    removeCoupon: () => Promise<boolean>;
    placeOrder: () => Promise<PlaceOrderOutcome>;
    /**
     * Save the selected payment method and billing address on the quote
     * without placing the order. False when it failed (the message is in
     * `globalError`).
     */
    savePaymentInformation: () => Promise<boolean>;
    /**
     * Re-read the payment methods and totals of the quote as it is now and
     * reconcile the selected method with the list (coupon applied or removed,
     * billing address changed).
     */
    refreshPaymentInformation: () => Promise<void>;
    /**
     * Put the billing address entered on its own (virtual quote, or "same as
     * shipping" unchecked) on the quote and refresh the payment methods and
     * totals for it. No-op when the billing address is the shipping one or
     * incomplete. Place Order waits for it (`billingSynced`).
     */
    syncBillingAddress: () => Promise<void>;
    /**
     * The billing address (or the "same as shipping" choice) was edited:
     * the quote no longer matches it. Any sync still in flight is
     * superseded at once, so its late answer cannot mark the new address as
     * synced during the debounce window before the next sync starts.
     */
    invalidateBillingSync: () => void;
}

export function createFlowActions(): FlowActions {
    const store = getStore();
    let rateController: AbortController | null = null;
    // Every estimate and every save gets a generation number. A response
    // (or failure, or the `finally` reset of a loading flag) is applied only
    // when its generation is still the latest one: an older request that
    // resolves after a newer one started must not touch the store.
    let estimateGeneration = 0;
    let saveGeneration = 0;
    let billingGeneration = 0;
    let paymentInfoGeneration = 0;

    pendingShipping = null;
    pendingBilling = null;

    const resolveGuestId = (): string | null => store.maskedQuoteId.get();
    const isGuest = (): boolean => store.isGuest.get();

    /**
     * The quote address Magento receives, with the guest's email on it.
     * Core stores the email with the quote addresses (a customer's comes
     * from the account); without it the quote carries no email until the
     * order is placed, and a reload of the checkout could not show it
     * (`hyperion.guestQuote`, core's own `validatedEmailValue`).
     */
    const quoteAddress = (addr: Address): AddressRequestPayload => {
        const payload = addressToRequestPayload(addr);
        const email = store.email.get().trim();
        if (isGuest() && payload.email === undefined && EMAIL_SHAPE.test(email)) {
            payload.email = email;
        }
        return payload;
    };

    /**
     * The billing copy of the shipping address ("same as shipping"). For a
     * new address of a customer core saves it once from the shipping address
     * (`PaymentInformationManagement::processShippingAddress()`, same as
     * billing) and AGAIN from a billing address flagged
     * `save_in_address_book` (`QuoteManagement::_prepareCustomerQuote()`),
     * so the copy travels without the flag, as Luma's select-billing-address
     * does. A billing address typed on its own keeps what
     * its checkbox says.
     */
    const billingCopyOf = (shipping: Address): AddressRequestPayload => {
        const payload = quoteAddress(shipping);
        delete payload.save_in_address_book;
        return payload;
    };

    /** No estimate or save may start against a quote that is being ordered. */
    const isOrdering = (): boolean => store.isPlacingOrder.get() || store.orderPlaced.get();

    function trackShipping(run: Promise<void>): Promise<void> {
        const tracked = run.finally(() => {
            if (pendingShipping === tracked) pendingShipping = null;
        });
        pendingShipping = tracked;
        return tracked;
    }

    function trackBilling(run: Promise<void>): Promise<void> {
        const tracked = run.finally(() => {
            if (pendingBilling === tracked) pendingBilling = null;
        });
        pendingBilling = tracked;
        return tracked;
    }

    const estimateTimer = debounce((): void => {
        void estimateShipping();
    }, SHIPPING_ESTIMATE_DELAY_MS);

    function scheduleShippingEstimate(): void {
        store.shippingDirty.set(true);
        estimateTimer();
    }

    function estimateShippingNow(): Promise<void> {
        store.shippingDirty.set(true);
        estimateTimer.cancel();
        return estimateShipping();
    }

    async function settleShipping(): Promise<void> {
        estimateTimer.flush();
        // The form is ahead of the quote and nothing is on its way to fix
        // that (an earlier estimate or save failed): try once more, for the
        // current address and selection. One attempt per call, no loop.
        const idle = pendingShipping === null
            && pendingBilling === null
            && !store.isLoadingShippingMethods.get()
            && !store.isSavingShipping.get()
            && !store.isSavingBilling.get();
        if (idle && store.shippingDirty.get() && !store.isVirtual.get()) {
            store.globalError.set(null);
            void estimateShipping();
        }
        // Bounded: one run can start another (an estimate ends in a save, a
        // billing sync in a shipping save), never an endless chain.
        for (let i = 0; i < 5; i += 1) {
            const pending = pendingShipping ?? pendingBilling;
            if (pending === null) return;
            await pending.catch(() => undefined);
            const busy = store.isLoadingShippingMethods.get()
                || store.isSavingShipping.get()
                || store.isSavingBilling.get();
            if (pendingShipping === null && pendingBilling === null && !busy) return;
        }
    }

    function estimateShipping(): Promise<void> {
        if (isOrdering()) return Promise.resolve();
        return trackShipping(runEstimate());
    }

    async function runEstimate(): Promise<void> {
        const addr = store.shippingAddress.get();
        if (!isAddressComplete(addr)) return;
        if (rateController) rateController.abort();
        rateController = new AbortController();
        const signal = rateController.signal;
        const generation = ++estimateGeneration;
        // The address changed: whatever the quote carries no longer matches
        // it, so Place Order stays closed until a save confirms a method.
        store.appliedShippingMethod.set(null);
        store.isLoadingShippingMethods.set(true);
        let methods: readonly ShippingMethod[] | null = null;
        try {
            const payload: EstimateShippingMethodsRequest = {
                address: quoteAddress(addr),
            };
            methods = isGuest()
                ? await estimateGuestShippingMethods(resolveGuestId() ?? '', payload, signal)
                : await estimateCustomerShippingMethods(payload, signal);
        } catch (err) {
            if (generation === estimateGeneration && !isAbortError(err)) {
                store.globalError.set(extractMessage(err));
            }
        } finally {
            if (generation === estimateGeneration) {
                store.isLoadingShippingMethods.set(false);
            }
        }
        if (generation !== estimateGeneration || methods === null) return;

        // Error rows stay in the list so the shopper sees why a carrier
        // does not serve the address; only usable rates can be selected.
        const listed = methods.filter((m) => !isPickupRate(m));
        store.availableShippingMethods.set(listed);
        const usable = listed.filter(isUsableRate);
        const current = store.selectedShippingMethod.get();
        const stillThere = current !== null && usable.some((m) => isSameMethod(m, current));
        if (!stillThere) {
            const first = usable[0];
            if (!first) {
                // Nothing serves this address: drop the stale selection and
                // everything that was derived from it.
                store.selectedShippingMethod.set(null);
                store.availablePaymentMethods.set([]);
                return;
            }
            store.selectedShippingMethod.set({
                carrier_code: first.carrier_code,
                method_code: first.method_code,
            });
        }
        // The shipping radios use `@change`, which never fires when the user
        // clicks an already-checked option. With a single method (or whenever
        // the auto-pre-selection above lands on the option the user wants),
        // the user can never trigger saveShippingAndEstimateTotals manually,
        // so payment methods + totals never load and Place Order stays
        // disabled. Drive the save from here so the auto-selection follows
        // the same downstream path as a user click.
        await saveShippingAndEstimateTotals();
    }

    function saveShippingAndEstimateTotals(): Promise<void> {
        if (isOrdering()) return Promise.resolve();
        return trackShipping(runShippingSave());
    }

    async function runShippingSave(): Promise<void> {
        const shipping = store.shippingAddress.get();
        const selectedMethod = store.selectedShippingMethod.get();
        if (!isAddressComplete(shipping) || !selectedMethod) return;
        const sameAsShipping = store.billingSameAsShipping.get();
        const billingSnapshot = sameAsShipping ? shipping : store.billingAddress.get();
        if (!isAddressComplete(billingSnapshot)) return;
        const request: ShippingInformationRequest = {
            addressInformation: {
                shipping_address: quoteAddress(shipping),
                billing_address: sameAsShipping ? billingCopyOf(shipping) : quoteAddress(billingSnapshot),
                shipping_method_code: selectedMethod.method_code,
                shipping_carrier_code: selectedMethod.carrier_code,
            },
        };
        const generation = ++saveGeneration;
        store.isSavingShipping.set(true);
        try {
            const details = isGuest()
                ? await saveGuestShippingInformation(resolveGuestId() ?? '', request)
                : await saveCustomerShippingInformation(request);
            if (generation !== saveGeneration) return;
            // Methods, totals and the selection follow the answer, exactly as
            // after a coupon: a method the new list no longer offers is
            // dropped, `free` is picked at a zero total, and when nothing is
            // selected the first offline method is (gateways are never
            // pre-selected: their SDK loads when the shopper picks them).
            applyPaymentDetails(details);
            store.appliedShippingMethod.set(selectedMethod);
            // The quote now carries the address this request was built
            // from. Every edit stores a new address object, so an edit made
            // meanwhile keeps the form marked as ahead of the quote.
            if (store.shippingAddress.get() === shipping) {
                store.shippingDirty.set(false);
            }
        } catch (err) {
            if (generation !== saveGeneration) return;
            store.appliedShippingMethod.set(null);
            store.globalError.set(extractMessage(err));
        } finally {
            if (generation === saveGeneration) {
                store.isSavingShipping.set(false);
            }
        }
    }

    /**
     * Apply a payment-information answer: methods and totals, then the
     * selection. `free` is the only method at a zero grand total, so it is
     * picked whenever the totals reach zero; a selection that the list no
     * longer offers falls back to the first offline method (or none).
     */
    function applyPaymentDetails(details: PaymentDetails): void {
        store.availablePaymentMethods.set(details.payment_methods);
        store.totals.set(details.totals);
        store.selectedPaymentMethod.set(
            reconcilePaymentSelection(store.selectedPaymentMethod.get(), details.payment_methods, details.totals)
        );
    }

    async function refreshPaymentInformation(): Promise<void> {
        const generation = ++paymentInfoGeneration;
        store.isRefreshingTotals.set(true);
        try {
            const details = isGuest()
                ? await getGuestPaymentInformation(resolveGuestId() ?? '')
                : await getCustomerPaymentInformation();
            if (generation !== paymentInfoGeneration) return;
            applyPaymentDetails(details);
        } catch (err) {
            if (generation !== paymentInfoGeneration) return;
            store.globalError.set(extractMessage(err));
        } finally {
            if (generation === paymentInfoGeneration) {
                store.isRefreshingTotals.set(false);
            }
        }
    }

    function billingNeedsOwnSync(): boolean {
        return store.isVirtual.get() || !store.billingSameAsShipping.get();
    }

    function invalidateBillingSync(): void {
        billingGeneration++;
        store.billingSynced.set(false);
        store.isSavingBilling.set(false);
    }

    function syncBillingAddress(): Promise<void> {
        return trackBilling(runBillingSync());
    }

    /**
     * True when the quote does not carry the shipping selection although
     * one exists: a shipping save was skipped while the separate billing
     * address was incomplete, and nothing else is about to send it.
     */
    function shippingSaveIsOwed(): boolean {
        if (store.isVirtual.get()) return false;
        const selected = store.selectedShippingMethod.get();
        if (selected === null) return false;
        if (estimateTimer.pending() || store.isLoadingShippingMethods.get() || store.isSavingShipping.get()) {
            return false;
        }
        const applied = store.appliedShippingMethod.get();
        return store.shippingDirty.get() || applied === null || !isSameMethod(applied, selected);
    }

    async function runBillingSync(): Promise<void> {
        if (!billingNeedsOwnSync()) return;
        const billing = store.billingAddress.get();
        if (!isAddressComplete(billing)) return;
        const generation = ++billingGeneration;
        store.billingSynced.set(false);
        store.isSavingBilling.set(true);
        let synced = false;
        try {
            const request = { address: quoteAddress(billing), useForShipping: false };
            if (isGuest()) {
                await assignGuestBillingAddress(resolveGuestId() ?? '', request);
            } else {
                await assignCustomerBillingAddress(request);
            }
            const details = isGuest()
                ? await getGuestPaymentInformation(resolveGuestId() ?? '')
                : await getCustomerPaymentInformation();
            if (generation !== billingGeneration) return;
            applyPaymentDetails(details);
            store.billingSynced.set(true);
            synced = true;
        } catch (err) {
            if (generation !== billingGeneration) return;
            store.globalError.set(extractMessage(err));
        } finally {
            if (generation === billingGeneration) {
                store.isSavingBilling.set(false);
            }
        }
        // The shipping save carries the billing address too, so sending it
        // after the billing sync leaves the quote with both.
        if (synced && shippingSaveIsOwed()) {
            await saveShippingAndEstimateTotals();
        }
    }

    async function applyCoupon(code: string): Promise<boolean> {
        try {
            const ok = isGuest()
                ? await applyGuestCoupon(resolveGuestId() ?? '', code)
                : await applyCustomerCoupon(code);
            if (ok) {
                store.appliedCoupon.set(code);
                store.couponError.set(null);
                await refreshPaymentInformation();
                return true;
            }
            store.couponError.set(t('Hyperion_Checkout::coupon_invalid'));
            return false;
        } catch (err) {
            store.couponError.set(extractMessage(err));
            return false;
        }
    }

    async function removeCoupon(): Promise<boolean> {
        try {
            const ok = isGuest()
                ? await removeGuestCoupon(resolveGuestId() ?? '')
                : await removeCustomerCoupon();
            if (ok) {
                store.appliedCoupon.set(null);
                store.couponError.set(null);
                await refreshPaymentInformation();
                return true;
            }
            return false;
        } catch (err) {
            store.couponError.set(extractMessage(err));
            return false;
        }
    }

    function buildPaymentRequest(): PaymentInformationRequest | null {
        const method = store.selectedPaymentMethod.get();
        if (!method) return null;
        const sameAsShipping = store.billingSameAsShipping.get() && !store.isVirtual.get();
        const billingSnapshot = sameAsShipping ? store.shippingAddress.get() : store.billingAddress.get();
        if (!isAddressComplete(billingSnapshot)) return null;

        const data = store.paymentMethodData.get()[method] ?? {};
        const agreements = store.acceptedAgreements.get();
        const email = store.email.get();

        // The purchase order number is a field of the payment itself; core
        // ignores it inside `additional_data`.
        const { po_number: poNumber, ...additionalData } = data;
        const paymentMethod: PaymentMethodPayload = { method };
        if ('po_number' in data) paymentMethod.po_number = String(poNumber ?? '').trim();
        if (Object.keys(additionalData).length > 0) paymentMethod.additional_data = additionalData;
        if (agreements.length > 0) {
            paymentMethod.extension_attributes = {
                agreement_ids: agreements.map((id) => String(id)),
            };
        }
        const request: PaymentInformationRequest = {
            paymentMethod,
            billingAddress: sameAsShipping ? billingCopyOf(billingSnapshot) : quoteAddress(billingSnapshot),
        };
        if (isGuest() && email) request.email = email;
        return request;
    }

    /**
     * Read the quote to learn whether an order request that lost its answer
     * placed the order. An ordered guest quote answers 200 with `is_active`
     * false (404 once it is gone); a customer's `carts/mine` answers 404, or
     * another quote when a new cart was started since. The quote of this
     * checkout, still active, means no order exists. Anything else (no
     * answer, a session that ended, a server error) decides nothing.
     */
    async function probeOrderOutcome(): Promise<OrderOutcome> {
        try {
            if (isGuest()) {
                const maskedId = resolveGuestId();
                if (!maskedId) return 'unknown';
                const cart = await getGuestCartState(maskedId);
                return outcomeOfActiveFlag(cart?.is_active);
            }
            // `quoteData.entity_id` of the checkout config, hydrated into the store.
            const quoteId = Number(store.quoteId.get());
            if (!Number.isInteger(quoteId) || quoteId <= 0) return 'unknown';
            const cart = await getCustomerCartState();
            if (cart === null || typeof cart !== 'object' || cart.id === undefined) return 'unknown';
            if (Number(cart.id) !== quoteId) return 'placed';
            return outcomeOfActiveFlag(cart.is_active);
        } catch (err) {
            return err instanceof MagentoApiError && err.httpStatus === 404 ? 'placed' : 'unknown';
        }
    }

    /**
     * The order request got no answer: decide from the quote. Resolves like
     * `placeOrder()`. After a timeout the server may still be working on
     * the request, so a quote that is still active proves nothing yet.
     */
    async function resolveLostAnswer(timedOut: boolean): Promise<PlaceOrderOutcome> {
        let outcome = await probeOrderOutcome();
        if (timedOut && outcome === 'not-placed') outcome = 'unknown';
        if (outcome === 'placed') {
            store.orderOutcomeUnknown.set(false);
            store.orderPlaced.set(true);
            return 'placed-unconfirmed';
        }
        store.isPlacingOrder.set(false);
        if (outcome === 'not-placed') {
            store.orderOutcomeUnknown.set(false);
            store.globalError.set(t('Hyperion_Checkout::order_not_placed_network'));
            return null;
        }
        store.orderOutcomeUnknown.set(true);
        store.globalError.set(t('Hyperion_Checkout::order_outcome_unknown'));
        return null;
    }

    async function placeOrder(): Promise<PlaceOrderOutcome> {
        if (store.isPlacingOrder.get() || store.orderPlaced.get()) return null;
        // The form holds an address the quote does not: no order request
        // may leave until a shipping save confirmed it.
        if (!store.isVirtual.get() && store.shippingDirty.get()) return null;

        if (store.orderOutcomeUnknown.get()) {
            // An earlier attempt may have placed the order: ask the quote
            // before sending anything.
            store.isPlacingOrder.set(true);
            store.globalError.set(null);
            const outcome = await probeOrderOutcome();
            if (outcome === 'placed') {
                store.orderOutcomeUnknown.set(false);
                store.orderPlaced.set(true);
                return 'placed-unconfirmed';
            }
            store.isPlacingOrder.set(false);
            if (outcome === 'unknown') {
                store.globalError.set(t('Hyperion_Checkout::order_outcome_unknown'));
                return null;
            }
            store.orderOutcomeUnknown.set(false);
        }

        if (billingNeedsOwnSync() && !store.billingSynced.get()) {
            await syncBillingAddress();
            if (!store.billingSynced.get()) return null;
        }
        const request = buildPaymentRequest();
        if (!request) return null;

        store.isPlacingOrder.set(true);
        store.globalError.set(null);
        try {
            const recaptchaToken = await executeRecaptcha('place_order');
            const orderId = isGuest()
                ? await placeGuestOrder(resolveGuestId() ?? '', request, recaptchaToken)
                : await placeCustomerOrder(request, recaptchaToken);
            // Terminal: the loading state holds until the browser leaves.
            store.orderPlaced.set(true);
            return orderId;
        } catch (err) {
            if (err instanceof NetworkError) {
                return resolveLostAnswer(err instanceof RequestTimeoutError);
            }
            store.isPlacingOrder.set(false);
            store.globalError.set(extractMessage(err));
            return null;
        }
    }

    async function savePaymentInformation(): Promise<boolean> {
        const request = buildPaymentRequest();
        if (!request) return false;
        store.globalError.set(null);
        try {
            if (isGuest()) {
                await setGuestPaymentInformation(resolveGuestId() ?? '', request);
            } else {
                await setCustomerPaymentInformation(request);
            }
            return true;
        } catch (err) {
            store.globalError.set(extractMessage(err));
            return false;
        }
    }

    return {
        estimateShipping,
        scheduleShippingEstimate,
        estimateShippingNow,
        settleShipping,
        saveShippingAndEstimateTotals,
        applyCoupon,
        removeCoupon,
        placeOrder,
        savePaymentInformation,
        refreshPaymentInformation,
        syncBillingAddress,
        invalidateBillingSync,
    };
}

function isZero(amount: unknown): boolean {
    const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? ''));
    return Number.isFinite(n) && Math.abs(n) < 0.005;
}

/**
 * The payment method to keep selected after the list changed. Exported for
 * the unit tests.
 */
export function reconcilePaymentSelection(
    selected: string | null,
    methods: readonly PaymentMethodConfig[],
    totals: Totals | null
): string | null {
    const offered = (code: string | null): boolean => code !== null && methods.some((m) => m.code === code);
    if (totals !== null && isZero(totals.grand_total) && offered('free')) {
        return 'free';
    }
    if (offered(selected)) {
        return selected;
    }
    return methods.find((m) => isSafeForGeneric(m.code))?.code ?? null;
}

function outcomeOfActiveFlag(isActive: unknown): OrderOutcome {
    if (isActive === true) return 'not-placed';
    if (isActive === false) return 'placed';
    return 'unknown';
}

function extractMessage(err: unknown): string {
    if (err instanceof MagentoApiError) return err.message;
    // The browser's own text ("Failed to fetch") says nothing to a shopper.
    if (err instanceof NetworkError) return t('Hyperion_Checkout::error_network');
    if (err instanceof Error) return err.message;
    return t('Hyperion_Checkout::unexpected_error');
}

// Module singleton -- initialized by bootstrap after the store.
let singleton: FlowActions | null = null;

export function initFlowActions(): FlowActions {
    if (singleton) return singleton;
    singleton = createFlowActions();
    return singleton;
}

export function flowActions(): FlowActions {
    if (!singleton) {
        throw new Error('[hyperion-checkout] flowActions() called before initFlowActions().');
    }
    return singleton;
}

export function resetFlowActionsForTests(): void {
    singleton = null;
    pendingShipping = null;
    pendingBilling = null;
}
