// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Flow actions: the orchestration of every request of the checkout.
 *
 * Every request that changes the quote goes through one write queue
 * (`write-queue.ts`): shipping information, the billing address of a
 * virtual quote, the payment method, coupons and gift messages. The rates
 * estimate is a read and stays outside it; its answer is applied only when
 * the address still has the rate key the estimate was asked for.
 *
 * An edit of a form marks it as ahead of the quote (`shippingDirty`,
 * `billingDirty`) and is saved by whichever comes first: the form losing
 * the focus, a pause in the typing, or Place Order, which flushes the queue
 * (`prepareOrder()`), lets the payment renderer do its step and then sends
 * the order with the queue closed (`submitOrder()`).
 *
 * The extension API meets the flow here: the bodies of the
 * shipping-information, billing-address and payment-information requests go
 * through the request filters (`extension/filters.ts`) when the write
 * starts; the shipping address the quote receives is the effective one
 * (`extension/address-override.ts`, the typed address unless a shipping
 * extension put another in its place); an order starts with the cancelable
 * `hyperion:checkout:before-place-order` event and waits for the generic
 * extension modules still loading before its gate is read again.
 *
 * Components call these through `flowActions()` rather than importing the
 * API modules, so the critical path stays greppable.
 */
import type { PaymentData } from '../../extension-api.js';
import type { Address, AddressRequestPayload } from '../types/address.js';
import type { PaymentInformationRequest, PaymentMethodConfig, PaymentMethodPayload } from '../types/payment.js';
import type {
    EstimateShippingMethodsRequest,
    PaymentDetails,
    SelectedShippingMethod,
    ShippingInformationRequest,
    ShippingMethod,
} from '../types/shipping.js';
import type { ShippingPreselect } from '../types/config.js';
import type { SectionId, SectionStatusSource } from '../types/section.js';
import type { Totals } from '../types/totals.js';
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
import { saveCustomerGiftMessage, saveGuestGiftMessage, type GiftMessagePayload } from '../api/gift-message.js';
import { isAbortError } from '../api/client.js';
import { classifyError, type CheckoutError, type ErrorContext } from '../api/error-kinds.js';
import { getCheckoutConfig, peekCheckoutConfig } from '../bootstrap-config.js';
import { discardDrafts } from './drafts.js';
import { sendWithAntiAbuse } from './anti-abuse.js';
import { captchaError } from './captcha-state.js';
import { getStore } from './index.js';
import { placeOrderBlocker, checkoutUpdatingMessage, type PlaceOrderBlocker } from './place-order-hint.js';
import { DEFAULT_RATE_FIELDS, isEstimable, mergeRefreshedRates, pickShippingMethod, rateKey } from './rate-key.js';
import { handleQuoteGone, handleSessionExpired, recoverFromOrderFailure } from './recovery.js';
import { clearFailure, reportFailure } from './section-status.js';
import { createSelectors } from './selectors.js';
import {
    createWriteQueue,
    WriteNotNeeded,
    type QuoteWrite,
    type QuoteWriteInfo,
    type WriteOutcome,
    type WriteQueue,
} from './write-queue.js';
import { t } from '../utils/i18n.js';
import { isAddressComplete } from '../utils/address-validation.js';
import { debounce } from '../utils/debounce.js';
import { minimumOrderError } from '../utils/minimum-order.js';
import { navigateTo } from '../utils/navigate.js';
import { FREE_PAYMENT_METHOD, isZeroAmount, offeredPaymentMethods } from '../utils/payment-offer.js';
import { decideRedirectTarget } from '../utils/safe-redirect.js';
import { EMAIL_SHAPE } from '../validation/rules.js';
import { isPreselectable, savesOnSelection as entrySavesOnSelection } from '../components/payment-host/entries.js';
import { notifyOrderNotPlaced } from '../components/payment-host/host.js';
import { unsupportedReason } from '../components/payment-host/payment-rows.js';
import { billingFollowsShipping, effectiveShippingAddress } from '../extension/address-override.js';
import { emitCheckoutEvent } from '../extension/events.js';
import { applyFilters } from '../extension/filters.js';
import { extensionsSettled, refreshGates } from '../extension/gates.js';
import { configHoldsSave, shippingExtensionView } from '../components/shipping-extension-view.js';

/**
 * The quote address Magento receives, built from the checkout's address
 * (`Magento\Quote\Api\Data\AddressInterface` allowlist). A saved address of
 * the current customer is identified by `customer_address_id`, so core can
 * recognize it instead of treating it as new data; a new address carries
 * `save_in_address_book` as 1 or 0 (what the checkbox shows, never a guess).
 * An address that is only enough for an estimate travels with what it has.
 */
function addressToRequestPayload(addr: Address): AddressRequestPayload {
    const street = (addr.street ?? []).filter((s) => typeof s === 'string' && s.trim().length > 0);
    const out: AddressRequestPayload = {
        country_id: addr.country_id ?? '',
        street,
        postcode: addr.postcode ?? '',
        city: addr.city ?? '',
        firstname: addr.firstname ?? '',
        lastname: addr.lastname ?? '',
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
    //   3. No region, or only a typed one, on an address typed in the
    //      checkout -> the missing parts travel as explicit empty values.
    //      Core merges the request over the quote address, so a key left
    //      out would keep the region of the country chosen before.
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
        if (out.region_id === undefined) {
            out.region_id = 0;
            out.region ??= '';
            out.region_code = '';
        }
    }
    return out;
}

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

/** How long the rate fields of the shipping form must stay quiet before the rates are asked. */
export const SHIPPING_ESTIMATE_DELAY_MS = 300;
/** How long a form that is ahead of the quote must stay quiet before it is saved. */
export const DIRTY_FORM_FLUSH_DELAY_MS = 1500;
/** How long the billing form must stay quiet before its address is saved. */
export const BILLING_SYNC_DELAY_MS = 500;
/** How long the payment method selection must stay unchanged before it is saved. */
export const PAYMENT_METHOD_SAVE_DELAY_MS = 250;
/** How long a refused background request waits when the server named no delay. */
export const RATE_LIMIT_RETRY_DELAY_MS = 5000;

/** The failures a connection that came back can cure. */
const RECONNECT_KINDS: ReadonlySet<string> = new Set(['offline', 'network', 'timeout']);

/**
 * What `submitOrder()` resolves with: the order id,
 * `'placed-unconfirmed'` when the answer was lost and the quote shows the
 * order exists, or null when no order was placed: a refusal of the server
 * is in `globalError`, a request that got no answer is resolved by reading
 * the quote and shows in the `order` section.
 */
export type PlaceOrderOutcome = number | 'placed-unconfirmed' | null;

export interface PrepareOrderOptions {
    /** The caller is the selected payment renderer itself: its own readiness is not asked. */
    skipPaymentReady?: boolean;
    /**
     * False when the caller only checks the gate before a step of its own
     * (a wallet about to open its sheet) and gives the latch back at once:
     * no `before-place-order` event, that one belongs to the order itself.
     */
    announce?: boolean;
}

/**
 * Why `prepareOrder()` did not take the order further: a piece of the
 * checkout is missing (the codes of `placeOrderBlocker()`), an order
 * attempt is already under way (`busy`), a save the order needs failed
 * (`write-failed`, the message is where the failure was reported), or an
 * earlier attempt is still of unknown outcome (`outcome-unknown`).
 */
export type PrepareOrderBlockReason = PlaceOrderBlocker | 'busy' | 'write-failed' | 'outcome-unknown';

export type PrepareOrderResult =
    /** The latch is taken, every pending save is on the quote and the gate is open. */
    | { status: 'ready' }
    | { status: 'blocked'; reason: PrepareOrderBlockReason };

/** What a coupon write answers: whether core took the change, and the rates asked right after it. */
interface CouponResult {
    ok: boolean;
    rates: readonly ShippingMethod[] | null;
}

/** What a shipping-information request carried. */
interface ShippingSnapshot {
    /** The typed address, by identity (an edit stores a new object); null while an extension's address replaces it. */
    shipping: Address | null;
    /** The address the quote receives: `shipping`, or the address an extension put in its place. */
    effective: Address;
    /** The separate billing address sent with it, null when none was (same as shipping, or incomplete). */
    billing: Address | null;
    sameAsShipping: boolean;
    method: SelectedShippingMethod;
}

export interface FlowActions {
    /** The write queue itself, for the modules that enqueue, flush, close or reopen it. */
    queue: WriteQueue;
    /** Ask the rates of the shipping address now; resolves once the save it leads to is answered. */
    estimateShipping: () => Promise<void>;
    /**
     * The shipping address was edited: the quote no longer matches the form
     * (`shippingDirty`, at once). The rates are asked again once the typing
     * pauses, and only when the edit changed a field the rates depend on.
     */
    scheduleShippingEstimate: () => void;
    /**
     * The shipping address was replaced in one step (a saved address, another
     * country): rates or save start now instead of after a pause.
     */
    estimateShippingNow: () => Promise<void>;
    /**
     * Read the rates again behind a list already shown and confirmed,
     * without closing Place Order and without showing a failure.
     */
    refreshShippingRatesSilently: () => Promise<void>;
    /** Save the shipping form now when it is ahead of the quote and can be saved. */
    flushShippingForm: () => void;
    /** The shopper picked a rate: select it, show the expected totals and save it. */
    selectShippingMethod: (method: SelectedShippingMethod) => Promise<void>;
    saveShippingAndEstimateTotals: () => Promise<void>;
    applyCoupon: (code: string) => Promise<boolean>;
    removeCoupon: () => Promise<boolean>;
    /** The shopper selected a payment method: save it on the quote once the selection settles. */
    savePaymentMethod: () => void;
    /**
     * Save the selected payment method, its data and the billing address on
     * the quote without placing the order. False when it failed (the
     * message is in `globalError`).
     */
    savePaymentInformation: (data?: PaymentData | null) => Promise<boolean>;
    /**
     * Re-read the payment methods and totals of the quote once no write
     * runs or waits, and reconcile the selected method with the list.
     */
    refreshPaymentInformation: () => Promise<void>;
    /**
     * Put the billing address on the quote now: with the shipping
     * information on a physical quote (also after "same as shipping" was
     * ticked again), with its own request on a virtual one. Resolves once
     * the queue is idle.
     */
    syncBillingAddress: () => Promise<void>;
    /** The billing form was edited: save it once the typing pauses. */
    scheduleBillingSync: () => void;
    /**
     * The billing address (or the "same as shipping" choice) was edited:
     * the quote no longer matches it.
     */
    invalidateBillingSync: () => void;
    /** Save one gift message: `null` is the order, a number a quote item. */
    saveGiftMessage: (target: number | null, message: GiftMessagePayload) => Promise<WriteOutcome<boolean>>;
    /**
     * The connection is back: send again the background requests that
     * failed for want of one and save what the forms still owe the quote.
     */
    resumeAfterReconnect: () => void;
    /**
     * First half of Place Order: take the latch, put every pending edit on
     * the quote and evaluate the gate on what the server confirmed.
     */
    prepareOrder: (options?: PrepareOrderOptions) => Promise<PrepareOrderResult>;
    /** Second half, after `prepareOrder()` answered `ready`: send the order with the queue closed. */
    submitOrder: (data?: PaymentData | null) => Promise<PlaceOrderOutcome>;
    /** Give back the latch of a prepared order that will not be sent (the payment step was abandoned). */
    cancelOrder: () => void;
    /**
     * A prepared order was created outside the order request of the
     * checkout (a payment element placed it): close the latch for good, as
     * after an order the checkout placed itself.
     */
    confirmOrderPlaced: () => void;
    /**
     * An order request sent outside these actions (a wallet's own
     * endpoint) got no answer: let the quote say what became of it, exactly
     * as for the checkout's own order request. `'placed-unconfirmed'`:
     * leave for the success page; null: no order (the latch is released
     * and the `order` section says so) or not known yet (latched, "Check
     * again" in the `order` section). `cause`: `unavailable` for a server
     * error status, behind which the request may still be at work (the
     * quote is then read several times before it counts as "no order").
     */
    resolveLostOrder: (cause?: 'network' | 'unavailable') => Promise<PlaceOrderOutcome>;
}

export function createFlowActions(): FlowActions {
    const store = getStore();
    const selectors = createSelectors(store);
    let rateController: AbortController | null = null;
    // Every estimate gets a generation number: the answer, the failure and
    // the reset of the loading flag of an estimate that a newer one replaced
    // never touch the store.
    let estimateGeneration = 0;
    /** The rate key the rates were last asked for; null when they must be asked again. */
    let estimatedKey: string | null = null;
    let estimateInFlight: Promise<void> | null = null;
    /** A shipping save sent ahead of the rates was refused: send it again once they are known. */
    let resendAfterEstimate = false;
    let shippingTicket = 0;
    /** The shipping write that waits in the queue; it will read the form when it starts. */
    let waitingShippingTicket: number | null = null;
    let runningShipping: ShippingSnapshot | null = null;
    /** The shopper selected a payment method the quote does not carry yet. */
    let paymentSaveOwed = false;
    /** `prepareOrder()` is flushing: saves and estimates are allowed under the latch. */
    let preparing = false;
    /** `prepareOrder()` answered `ready` and the order was not sent yet. */
    let prepared = false;
    let submitting = false;
    /** The last `prepareOrder()` gave up because a save failed (the failure is on screen). */
    /** How many failed requests were shown to the shopper so far. */
    let reportedFailures = 0;
    /** The flush may ask again for rates whose last estimate failed (once per press). */
    let retryRatesOnFlush = true;
    /** The request contexts of the payment method saves a selection asked for. */
    const selectionSaves = new WeakSet<object>();
    /** The request contexts of the payment saves a renderer asked for; it shows their failure itself. */
    const rendererSaves = new WeakSet<object>();
    /** The quote is out of reach (it is gone, or the session ended): nothing is sent any more. */
    let halted = false;
    /** The automatic retry each section's refused background request waits for. */
    const retryTimers = new Map<SectionId, ReturnType<typeof setTimeout>>();
    /** The sections whose failure on screen already had its automatic retry. */
    const retried = new Set<SectionId>();

    const resolveGuestId = (): string | null => store.maskedQuoteId.get();
    const isGuest = (): boolean => store.isGuest.get();
    const cartPath = (suffix: string): string =>
        isGuest() ? `guest-carts/${resolveGuestId() ?? ''}/${suffix}` : `carts/mine/${suffix}`;

    const rateFields = (): readonly string[] => peekCheckoutConfig()?.hyperion?.rateFields ?? DEFAULT_RATE_FIELDS;
    const preselect = (): ShippingPreselect => peekCheckoutConfig()?.hyperion?.shippingPreselect ?? 'cheapest';
    const currentRateKey = (): string => rateKey(effectiveShippingAddress(store), rateFields());

    // A list that is already there for the address (put by the hydration)
    // needs no estimate.
    if (store.estimateState.get() === 'ready') estimatedKey = currentRateKey();

    // The rate key of the address the list in the store was read for.
    let listedKey: string | null = estimatedKey;

    /**
     * The rates to list for the current address, pickup rates left out. A
     * list read again for the address already listed keeps the rows on
     * screen where they are (`mergeRefreshedRates()`); the list of another
     * address comes in the order of the answer.
     */
    function listRates(methods: readonly ShippingMethod[]): readonly ShippingMethod[] {
        const listed = methods.filter((m) => !isPickupRate(m));
        const key = currentRateKey();
        const ordered = key === listedKey
            ? mergeRefreshedRates(store.availableShippingMethods.get(), listed)
            : listed;
        listedKey = key;
        return ordered;
    }

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

    /**
     * No estimate or save may start against a quote that is being ordered:
     * not while the payment step runs on the totals `prepareOrder()`
     * settled, not while the order is sent, not once it exists or may
     * exist. The flush of `prepareOrder()` itself runs under the latch and
     * is the exception.
     */
    const isOrdering = (): boolean => {
        const outcome = store.orderOutcome.get();
        if (halted || submitting || store.orderPlaced.get() || outcome === 'placed' || outcome === 'unknown') return true;
        return store.isPlacingOrder.get() && !preparing;
    };

    // -- Failures ---------------------------------------------------------

    const navigateToSuccess = (): void => {
        navigateTo(decideRedirectTarget(getCheckoutConfig().defaultSuccessPageUrl));
    };

    function expireSession(): void {
        halted = true;
        handleSessionExpired({ store, queue });
    }

    function loseQuote(): void {
        if (halted) return;
        halted = true;
        void handleQuoteGone({ store, queue, navigateToSuccess });
    }

    /**
     * True when the failure is not one of a section but of the whole
     * checkout, and was dealt with here: the session ended (the shopper is
     * asked to sign in again) or the quote is gone (it was ordered in
     * another tab, or the way back to the cart is shown).
     */
    function handledGlobally(failure: CheckoutError): boolean {
        if (failure.kind === 'session-expired') {
            expireSession();
            return true;
        }
        if (failure.kind === 'quote-gone') {
            loseQuote();
            return true;
        }
        return false;
    }

    /**
     * Show a failed request in its section, the one place its message
     * appears. `blocksOrder`: Place Order must not go ahead on top of this
     * failure.
     */
    function report(
        section: SectionId,
        error: unknown,
        ctx: ErrorContext,
        source: SectionStatusSource,
        retry?: () => void,
        blocksOrder = true
    ): void {
        showFailure(section, classifyError(error, ctx), source, retry, blocksOrder);
    }

    function showFailure(
        section: SectionId,
        failure: CheckoutError,
        source: SectionStatusSource,
        retry?: () => void,
        blocksOrder = true
    ): void {
        if (blocksOrder) reportedFailures += 1;
        if (handledGlobally(failure)) return;
        reportFailure(section, failure, retry ? { source, retry } : { source });
        if (retry && source === 'background') scheduleRetry(section, failure, retry);
    }

    /**
     * A background request the server asked to wait for is sent again by
     * itself, once, when the wait is over; a second refusal in a row stays
     * on screen with its Retry. (A request the shopper started shows the
     * wait and leaves the retry to them.)
     */
    function scheduleRetry(section: SectionId, failure: CheckoutError, retry: () => void): void {
        const again = retried.delete(section);
        if (failure.kind !== 'rate-limited' || again) return;
        const waiting = retryTimers.get(section);
        if (waiting !== undefined) clearTimeout(waiting);
        retryTimers.set(section, setTimeout(() => {
            retryTimers.delete(section);
            if (isOrdering() || store.sectionStatus.get()[section]?.kind !== 'rate-limited') return;
            retried.add(section);
            retry();
        }, failure.retryAfterMs ?? RATE_LIMIT_RETRY_DELAY_MS));
    }

    /** A request of `section` went through: its failure and its retry bookkeeping go. */
    function succeeded(section: SectionId): void {
        retried.delete(section);
        clearFailure(section);
    }

    function resumeAfterReconnect(): void {
        if (isOrdering()) return;
        for (const status of Object.values(store.sectionStatus.get())) {
            if (status !== null && status.source === 'background' && status.retry && RECONNECT_KINDS.has(status.kind)) {
                status.retry();
            }
        }
        // A save the shopper asked for and that failed is owed again by
        // its form: the flushers send it.
        void queue.flush();
    }

    function onWriteFailure(write: QuoteWriteInfo, error: unknown, retry: () => void): void {
        const ctx = write.errorContext ?? { path: '', method: 'POST' };
        if (write.key === 'shipping') {
            store.optimisticTotals.set(null);
            // The save went out before the rates of the new address were
            // known and core refused its method: the rates on their way
            // decide what is saved, the shopper never sees this refusal.
            if (estimateInFlight !== null && classifyError(error, ctx).kind === 'shipping-method-rejected') {
                resendAfterEstimate = true;
                return;
            }
            store.appliedShippingMethod.set(null);
        }
        let again = retry;
        if (write.key === 'shipping') again = () => { void enqueueShipping('action'); };
        if (write.key === 'billing') again = () => { void enqueueBilling('action'); };
        // The save of a payment method selection never holds the order
        // back and shows only in its section: the order request carries
        // the method again.
        const selectionSave = selectionSaves.has(ctx);
        if (rendererSaves.has(ctx)) {
            // The renderer that asked for this save reads the reason from
            // `globalError` and shows it with its own control.
            const failure = classifyError(error, ctx);
            reportedFailures += 1;
            if (!handledGlobally(failure)) store.globalError.set(failure.message);
            return;
        }
        const failure = classifyError(error, ctx);
        // A code or a CAPTCHA answer the server refused is an error of the
        // coupon form, shown there; sending the same again is no remedy.
        // A refused CAPTCHA answer already stands at the CAPTCHA field
        // (`sendWithAntiAbuse()`), the code field stays valid.
        if (write.key === 'coupon' && (failure.kind === 'validation' || failure.kind === 'captcha')) {
            reportedFailures += 1;
            if (failure.kind === 'validation' || captchaError('sales_rule_coupon_request') === null) {
                store.couponError.set(failure.message);
            }
            return;
        }
        showFailure(write.section, failure, write.source ?? 'background', again, !selectionSave);
    }

    const queue = createWriteQueue({
        store,
        settle: () => (isGuest()
            ? getGuestPaymentInformation(resolveGuestId() ?? '')
            : getCustomerPaymentInformation()),
        applyDetails: applyPaymentDetails,
        onFailure: onWriteFailure,
        onSuccess: (write) => {
            // A shipping save that went through says nothing about rates
            // that could not be read: that failure stays on screen.
            if (write.key === 'shipping' && store.estimateState.get() === 'error') return;
            succeeded(write.section);
        },
        onSettleFailure: (error, retry) => {
            const ctx = { path: cartPath('payment-information'), method: 'GET' };
            report('payment', error, ctx, 'background', retry);
        },
    });

    /**
     * Apply a payment-information answer: methods and totals, then the
     * selection (see `reconcilePaymentSelection()`) and the coupon the
     * totals carry, so a coupon the server dropped is no longer shown as
     * applied. The totals expected from an unanswered change give way to
     * the confirmed ones.
     */
    function applyPaymentDetails(details: PaymentDetails): void {
        store.availablePaymentMethods.set(details.payment_methods);
        store.totals.set(details.totals);
        store.optimisticTotals.set(null);
        // A coupon or another rate can move the order across the minimum amount.
        const config = peekCheckoutConfig();
        if (config !== null) store.minimumOrderError.set(minimumOrderError(details.totals, config));
        store.selectedPaymentMethod.set(
            reconcilePaymentSelection(store.selectedPaymentMethod.get(), details.payment_methods, details.totals)
        );
        const coupon = details.totals.coupon_code;
        store.appliedCoupon.set(typeof coupon === 'string' && coupon !== '' ? coupon : null);
    }

    // -- Shipping information ----------------------------------------------

    /** The selection is one of the usable rates of the list on screen. */
    function selectionIsOffered(): boolean {
        const selected = store.selectedShippingMethod.get();
        if (selected === null) return false;
        return store.availableShippingMethods.get().some((m) => isUsableRate(m) && isSameMethod(m, selected));
    }

    /**
     * A required shipping extension of the selected rate that is not complete
     * yet (no pickup point chosen) holds the save: the carrier would refuse
     * the rate without its data. Asked for the selection of this very
     * moment; until the extension chunk arrived, a store with a required
     * shipping extension holds every save. The chunk asks for the save once
     * nothing holds it.
     */
    function shippingHeld(): boolean {
        const selected = store.selectedShippingMethod.get();
        return shippingExtensionView.get()?.holdsSave(selected) ?? configHoldsSave(selected);
    }

    function canSendShipping(): boolean {
        return !store.isVirtual.get() && isAddressComplete(effectiveShippingAddress(store), undefined, 'shipping') && selectionIsOffered()
            && !shippingHeld();
    }

    function readShippingSnapshot(): ShippingSnapshot | null {
        const shipping = store.shippingAddress.get();
        const effective = effectiveShippingAddress(store);
        const method = store.selectedShippingMethod.get();
        if (store.isVirtual.get() || effective === null || !isAddressComplete(effective, undefined, 'shipping') || method === null) return null;
        const sameAsShipping = billingFollowsShipping(store);
        const typed = sameAsShipping ? null : store.billingAddress.get();
        return { shipping, effective, billing: isAddressComplete(typed, undefined, 'billing') ? typed : null, sameAsShipping, method };
    }

    /** The quote misses the billing address of the form, or the "same as shipping" choice. */
    function billingIsOwed(): boolean {
        if (billingFollowsShipping(store)) return store.billingDirty.get();
        if (!isAddressComplete(store.billingAddress.get(), undefined, 'billing')) return false;
        return !store.billingSynced.get() || store.billingDirty.get();
    }

    /**
     * True when a shipping-information request must still be sent for what
     * the form shows now: no write is waiting (a waiting one reads the form
     * when it starts) and the one running, if any, carries something else.
     */
    function needsShippingWrite(): boolean {
        if (!canSendShipping()) return false;
        if (waitingShippingTicket !== null) return false;
        const now = readShippingSnapshot();
        if (now === null) return false;
        if (
            runningShipping !== null
            && runningShipping.shipping === now.shipping
            && runningShipping.effective === now.effective
            && runningShipping.billing === now.billing
            && runningShipping.sameAsShipping === now.sameAsShipping
            && isSameMethod(runningShipping.method, now.method)
        ) {
            return false;
        }
        const applied = store.appliedShippingMethod.get();
        return runningShipping !== null
            || store.shippingDirty.get()
            || applied === null
            || !isSameMethod(applied, now.method)
            || billingIsOwed();
    }

    function enqueueShipping(source: SectionStatusSource): Promise<WriteOutcome<PaymentDetails>> {
        shippingTicket += 1;
        const ticket = shippingTicket;
        waitingShippingTicket = ticket;
        let sent: ShippingSnapshot | null = null;
        const write: QuoteWrite<PaymentDetails> = {
            key: 'shipping',
            section: 'shipping-methods',
            returnsDetails: true,
            source,
            errorContext: { path: cartPath('shipping-information'), method: 'POST' },
            run: async () => {
                if (waitingShippingTicket === ticket) waitingShippingTicket = null;
                const snapshot = readShippingSnapshot();
                if (snapshot === null) throw new WriteNotNeeded();
                // A separate billing address that is not complete yet is
                // left out (core treats it as optional): the shipping
                // method reaches the quote now, the billing address with
                // the write its completion asks for.
                const request = applyFilters<ShippingInformationRequest>('shippingInformation', {
                    addressInformation: {
                        shipping_address: quoteAddress(snapshot.effective),
                        ...(snapshot.sameAsShipping
                            ? { billing_address: billingCopyOf(snapshot.effective) }
                            : snapshot.billing !== null ? { billing_address: quoteAddress(snapshot.billing) } : {}),
                        shipping_method_code: snapshot.method.method_code,
                        shipping_carrier_code: snapshot.method.carrier_code,
                    },
                });
                sent = snapshot;
                runningShipping = snapshot;
                store.isSavingShipping.set(true);
                try {
                    return isGuest()
                        ? await saveGuestShippingInformation(resolveGuestId() ?? '', request)
                        : await saveCustomerShippingInformation(request);
                } finally {
                    runningShipping = null;
                    store.isSavingShipping.set(false);
                }
            },
            apply: () => {
                if (sent !== null) confirmShipping(sent);
            },
        };
        return queue.enqueue(write).then((outcome) => {
            // A write that never ran (the queue was closed) must not leave
            // the form waiting for it. A newer write that replaced this
            // one holds its own ticket.
            if (waitingShippingTicket === ticket) waitingShippingTicket = null;
            return outcome;
        });
    }

    /**
     * The quote now carries what `sent` describes. Every edit stores a new
     * address object, so an edit made while the request ran keeps its form
     * marked as ahead of the quote.
     */
    function confirmShipping(sent: ShippingSnapshot): void {
        store.appliedShippingMethod.set(sent.method);
        if (store.shippingAddress.get() === sent.shipping) {
            store.shippingDirty.set(false);
            shippingIdleTimer.cancel();
        }
        if (sent.sameAsShipping) {
            if (billingFollowsShipping(store)) store.billingDirty.set(false);
        } else if (
            sent.billing !== null
            && !billingFollowsShipping(store)
            && store.billingAddress.get() === sent.billing
        ) {
            store.billingSynced.set(true);
            store.billingDirty.set(false);
        }
    }

    function flushShippingForm(): void {
        shippingIdleTimer.cancel();
        if (isOrdering()) return;
        // Rates on their way decide the save when they arrive.
        if (estimateTimer.pending() || estimateInFlight !== null) return;
        if (needsShippingWrite()) void enqueueShipping('background');
    }

    async function saveShippingAndEstimateTotals(): Promise<void> {
        if (isOrdering()) return;
        if (canSendShipping()) await enqueueShipping('action');
        await queue.whenIdle();
    }

    async function selectShippingMethod(method: SelectedShippingMethod): Promise<void> {
        if (isOrdering()) return;
        const rates = store.availableShippingMethods.get();
        const rateOf = (m: SelectedShippingMethod | null): ShippingMethod | null =>
            m === null ? null : rates.find((rate) => isSameMethod(rate, m)) ?? null;
        const previous = rateOf(store.selectedShippingMethod.get());
        const next = rateOf(method);
        store.selectedShippingMethod.set({ carrier_code: method.carrier_code, method_code: method.method_code });
        store.optimisticTotals.set(next === null ? null : totalsWithShippingRate(store.totals.get(), previous, next));
        await saveShippingAndEstimateTotals();
    }

    // -- Rates ---------------------------------------------------------------

    /**
     * Ask the rates of the shipping address. Resolves with the list, or
     * null when there is nothing to apply: the address is not enough for an
     * estimate, the request failed (reported here), a newer estimate
     * replaced this one, or the address changed its rate key meanwhile.
     */
    async function fetchRates(): Promise<readonly ShippingMethod[] | null> {
        const addr = effectiveShippingAddress(store);
        if (addr === null || !isEstimable(addr)) return null;
        if (rateController) rateController.abort();
        rateController = new AbortController();
        const signal = rateController.signal;
        estimateGeneration += 1;
        const generation = estimateGeneration;
        const key = currentRateKey();
        estimatedKey = key;
        store.isLoadingShippingMethods.set(true);
        store.estimateState.set('loading');
        let methods: readonly ShippingMethod[];
        try {
            const payload: EstimateShippingMethodsRequest = { address: quoteAddress(addr) };
            methods = isGuest()
                ? await estimateGuestShippingMethods(resolveGuestId() ?? '', payload, signal)
                : await estimateCustomerShippingMethods(payload, signal);
        } catch (err) {
            if (generation === estimateGeneration && !isAbortError(err)) {
                estimatedKey = null;
                store.estimateState.set('error');
                const ctx = { path: cartPath('estimate-shipping-methods'), method: 'POST' };
                report('shipping-methods', err, ctx, 'background', () => { void estimateShipping(); });
            }
            return null;
        } finally {
            if (generation === estimateGeneration) {
                store.isLoadingShippingMethods.set(false);
            }
        }
        if (generation !== estimateGeneration || currentRateKey() !== key) return null;
        return methods;
    }

    /**
     * Show a rate list and settle the selection: a selection the list still
     * offers is kept, otherwise one is picked by the store's preselection
     * rule. Error rows stay in the list so the shopper sees why a carrier
     * does not serve the address; only usable rates can be selected. The
     * shipping information is then saved when the quote does not carry
     * what the form shows (`force`: in any case, the totals changed).
     */
    function applyRates(methods: readonly ShippingMethod[], force: boolean): void {
        const listed = listRates(methods);
        store.availableShippingMethods.set(listed);
        succeeded('shipping-methods');
        const usable = listed.filter(isUsableRate);
        const current = store.selectedShippingMethod.get();
        const picked = pickShippingMethod(usable, current, preselect());
        store.estimateState.set(usable.length === 0 ? 'empty' : 'ready');
        if (picked === null) {
            // Nothing serves this address, or the shopper has to choose:
            // drop the stale selection and what the quote confirmed for it.
            store.selectedShippingMethod.set(null);
            store.appliedShippingMethod.set(null);
            store.optimisticTotals.set(null);
            if (usable.length === 0) store.availablePaymentMethods.set([]);
            resendAfterEstimate = false;
            return;
        }
        if (current === null || !isSameMethod(picked, current)) {
            store.selectedShippingMethod.set({
                carrier_code: picked.carrier_code,
                method_code: picked.method_code,
            });
        }
        const resend = resendAfterEstimate;
        resendAfterEstimate = false;
        if (canSendShipping() && (force || resend || needsShippingWrite())) {
            void enqueueShipping('background');
        }
    }

    function startEstimate(): Promise<void> {
        if (isOrdering()) return Promise.resolve();
        const run = (async (): Promise<void> => {
            // The address is complete and the selected rate was offered for
            // the previous one: save at the same moment the rates are
            // asked. When the new list drops that rate, the save that
            // follows the new selection supersedes this one.
            if (needsShippingWrite()) void enqueueShipping('background');
            const methods = await fetchRates();
            if (methods !== null) applyRates(methods, false);
        })();
        const tracked = run.finally(() => {
            if (estimateInFlight === tracked) estimateInFlight = null;
        });
        estimateInFlight = tracked;
        return tracked;
    }

    async function estimateShipping(): Promise<void> {
        estimateTimer.cancel();
        await startEstimate();
        await queue.whenIdle();
    }

    const estimateTimer = debounce((): void => {
        void startEstimate();
    }, SHIPPING_ESTIMATE_DELAY_MS);

    const shippingIdleTimer = debounce(flushShippingForm, DIRTY_FORM_FLUSH_DELAY_MS);

    /** The shipping address in the store was replaced by an edit of the shopper. */
    function shippingAddressEdited(immediate: boolean): void {
        // Marked in any case: an edit made while an order is being prepared
        // must keep that order from being sent for the address before it.
        store.shippingDirty.set(true);
        if (isOrdering()) return;
        const key = currentRateKey();
        if (key === estimatedKey) {
            // Back on the address the list on screen belongs to.
            estimateTimer.cancel();
        } else if (isEstimable(effectiveShippingAddress(store))) {
            if (immediate) {
                estimateTimer.cancel();
                void startEstimate();
            } else {
                estimateTimer();
            }
        } else {
            // Not enough for rates any more: an answer on its way is for
            // an address the form no longer shows.
            estimateTimer.cancel();
            if (rateController) rateController.abort();
            estimateGeneration += 1;
            estimatedKey = null;
            store.isLoadingShippingMethods.set(false);
            store.estimateState.set('idle');
        }
        shippingIdleTimer();
    }

    function scheduleShippingEstimate(): void {
        shippingAddressEdited(false);
    }

    async function estimateShippingNow(): Promise<void> {
        shippingAddressEdited(true);
        if (estimateInFlight === null) flushShippingForm();
        if (estimateInFlight !== null) await estimateInFlight;
        await queue.whenIdle();
    }

    /**
     * Read the rates of the address again behind a list that is already
     * shown and confirmed (a list the page was rendered with can miss
     * carriers). Nothing is marked as loading and Place Order stays open
     * while it runs; a failure is not shown. The answer is applied when
     * the address still has the rate key it was asked for and no other
     * estimate started meanwhile: the rows on screen keep their positions
     * and the rates the list missed go below them (`listRates()`). A
     * selection the new list still offers is kept with what the quote
     * confirmed for it; one it no longer offers
     * goes through the normal path (another rate is selected and saved).
     */
    async function refreshShippingRatesSilently(): Promise<void> {
        const addr = effectiveShippingAddress(store);
        if (isOrdering() || store.isVirtual.get() || addr === null || !isEstimable(addr)) return;
        if (store.estimateState.get() !== 'ready' || estimateInFlight !== null || estimateTimer.pending()) return;
        const key = currentRateKey();
        const generation = estimateGeneration;
        let methods: readonly ShippingMethod[];
        try {
            const payload: EstimateShippingMethodsRequest = { address: quoteAddress(addr) };
            methods = isGuest()
                ? await estimateGuestShippingMethods(resolveGuestId() ?? '', payload)
                : await estimateCustomerShippingMethods(payload);
        } catch {
            return;
        }
        if (
            generation !== estimateGeneration
            || estimateInFlight !== null
            || currentRateKey() !== key
            || store.estimateState.get() !== 'ready'
            || isOrdering()
        ) {
            return;
        }
        const selected = store.selectedShippingMethod.get();
        if (selected !== null && methods.some((m) => !isPickupRate(m) && isUsableRate(m) && isSameMethod(m, selected))) {
            store.availableShippingMethods.set(listRates(methods));
            return;
        }
        applyRates(methods, false);
    }

    // -- Billing address -------------------------------------------------------

    function invalidateBillingSync(): void {
        store.billingDirty.set(true);
        store.billingSynced.set(false);
    }

    function enqueueBilling(source: SectionStatusSource): Promise<WriteOutcome<number>> {
        let sent: Address | null = null;
        return queue.enqueue<number>({
            key: 'billing',
            section: 'billing',
            returnsDetails: false,
            source,
            errorContext: { path: cartPath('billing-address'), method: 'POST' },
            run: async () => {
                const billing = store.billingAddress.get();
                if (!isAddressComplete(billing, undefined, 'billing')) throw new WriteNotNeeded();
                sent = billing;
                const request = applyFilters('billingAddress', { address: quoteAddress(billing), useForShipping: false });
                store.isSavingBilling.set(true);
                try {
                    return isGuest()
                        ? await assignGuestBillingAddress(resolveGuestId() ?? '', request)
                        : await assignCustomerBillingAddress(request);
                } finally {
                    store.isSavingBilling.set(false);
                }
            },
            apply: () => {
                if (store.billingAddress.get() !== sent) return;
                store.billingSynced.set(true);
                store.billingDirty.set(false);
            },
        });
    }

    /** A virtual quote whose billing address is complete and not on the quote as it stands. */
    function virtualBillingIsOwed(): boolean {
        if (!store.isVirtual.get() || !isAddressComplete(store.billingAddress.get(), undefined, 'billing')) return false;
        return !store.billingSynced.get() || store.billingDirty.get();
    }

    function startBillingSync(source: SectionStatusSource): void {
        billingTimer.cancel();
        if (isOrdering()) return;
        if (store.isVirtual.get()) {
            if (virtualBillingIsOwed()) void enqueueBilling(source);
        } else if (estimateInFlight === null && needsShippingWrite()) {
            // One writer on a physical quote: the shipping information
            // carries the billing address.
            void enqueueShipping(source);
        }
    }

    async function syncBillingAddress(): Promise<void> {
        startBillingSync('background');
        await queue.whenIdle();
    }

    const billingTimer = debounce((): void => {
        startBillingSync('background');
    }, BILLING_SYNC_DELAY_MS);

    function scheduleBillingSync(): void {
        billingTimer();
    }

    // -- Coupon -----------------------------------------------------------------

    async function changeCoupon(code: string | null): Promise<boolean> {
        store.couponError.set(null);
        const outcome = await queue.enqueue<CouponResult>({
            key: 'coupon',
            section: 'coupon',
            returnsDetails: false,
            source: 'action',
            errorContext: {
                path: cartPath(code === null ? 'coupons' : `coupons/${code}`),
                method: code === null ? 'DELETE' : 'PUT',
            },
            run: async () => {
                let ok: boolean;
                if (code === null) {
                    ok = isGuest() ? await removeGuestCoupon(resolveGuestId() ?? '') : await removeCustomerCoupon();
                } else {
                    ok = await sendWithAntiAbuse(store, 'coupon', ({ headers: _headers, ...proof }) => (isGuest()
                        ? applyGuestCoupon(resolveGuestId() ?? '', code, proof)
                        : applyCustomerCoupon(code, proof)));
                }
                // A coupon can change the rates (free shipping): ask them
                // inside the write, so the shipping save that follows is
                // the last write of the drain and answers with the totals.
                const rates = ok && !store.isVirtual.get() ? await fetchRates() : null;
                return { ok, rates };
            },
            apply: (result) => {
                if (!result.ok) return;
                store.appliedCoupon.set(code);
                if (result.rates !== null) applyRates(result.rates, true);
            },
        });
        if (outcome.status !== 'applied') return false;
        if (!outcome.value.ok) {
            if (code !== null) store.couponError.set(t('Hyperion_Checkout::coupon_invalid'));
            return false;
        }
        await queue.whenIdle();
        return true;
    }

    // -- Payment -----------------------------------------------------------------

    /**
     * The payment-information body. `forSelection`: only what tells the
     * quote which method is selected, without the data and the agreements
     * that belong to the order request. `data` is what the payment method
     * contributes (`PaymentData` of the extension API): `method` (the
     * selected code by default), `po_number` at the top level of the
     * payment (core ignores it inside `additional_data`), `additional_data`
     * when it has a key, `extension_attributes` next to the accepted
     * agreement ids, which only the checkout sets.
     */
    function buildPaymentRequest(forSelection = false, data: PaymentData | null = null): PaymentInformationRequest | null {
        const selected = store.selectedPaymentMethod.get();
        if (!selected) return null;
        const sameAsShipping = billingFollowsShipping(store) && !store.isVirtual.get();
        const billingSnapshot = sameAsShipping ? effectiveShippingAddress(store) : store.billingAddress.get();
        // The shipping address that doubles as the billing address carries the billing fields too.
        if (!isAddressComplete(billingSnapshot, undefined, sameAsShipping ? 'shipping' : 'billing')) return null;

        const contributed = data ?? {};
        const method = !forSelection && typeof contributed.method === 'string' && contributed.method !== ''
            ? contributed.method
            : selected;
        const paymentMethod: PaymentMethodPayload = { method };
        if (!forSelection) {
            const agreements = store.acceptedAgreements.get();
            if (contributed.po_number !== undefined) paymentMethod.po_number = String(contributed.po_number ?? '').trim();
            const additionalData = contributed.additional_data;
            if (additionalData && Object.keys(additionalData).length > 0) paymentMethod.additional_data = { ...additionalData };
            const extension: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(contributed.extension_attributes ?? {})) {
                if (key === 'agreement_ids') {
                    console.warn('[hyperion-checkout] a payment method may not set extension_attributes.agreement_ids; the value was dropped');
                    continue;
                }
                extension[key] = value;
            }
            if (agreements.length > 0) extension['agreement_ids'] = agreements.map((id) => String(id));
            if (Object.keys(extension).length > 0) paymentMethod.extension_attributes = extension;
        }
        const request: PaymentInformationRequest = {
            paymentMethod,
            billingAddress: sameAsShipping ? billingCopyOf(billingSnapshot) : quoteAddress(billingSnapshot),
        };
        const email = store.email.get();
        if (isGuest() && email) request.email = email;
        return request;
    }

    function enqueuePaymentMethod(forSelection: boolean, data: PaymentData | null = null): Promise<WriteOutcome<boolean>> {
        const errorContext = { path: cartPath('set-payment-information'), method: 'POST' };
        (forSelection ? selectionSaves : rendererSaves).add(errorContext);
        return queue.enqueue<boolean>({
            key: 'payment-method',
            section: 'payment',
            returnsDetails: false,
            source: 'action',
            errorContext,
            run: async () => {
                const built = buildPaymentRequest(forSelection, data);
                if (built === null) throw new WriteNotNeeded();
                const request = applyFilters('paymentInformation', built);
                return sendWithAntiAbuse(store, 'payment-method', ({ headers }) => (isGuest()
                    ? setGuestPaymentInformation(resolveGuestId() ?? '', request, headers)
                    : setCustomerPaymentInformation(request, headers)));
            },
        });
    }

    /** The quote carries the shipping information of the form (core refuses a payment method without it). */
    function shippingIsConfirmed(): boolean {
        if (store.isVirtual.get()) return !virtualBillingIsOwed();
        const selected = store.selectedShippingMethod.get();
        const applied = store.appliedShippingMethod.get();
        return selected !== null
            && applied !== null
            && isSameMethod(applied, selected)
            && !store.shippingDirty.get()
            && !billingIsOwed();
    }

    /**
     * Send the owed save of the selected payment method when core would
     * accept it. `flushing`: the saves it depends on were just put in the
     * queue ahead of it. A save that cannot go yet stays owed.
     */
    function attemptPaymentMethodSave(flushing: boolean): void {
        if (!paymentSaveOwed || isOrdering()) return;
        const method = store.selectedPaymentMethod.get();
        if (method === null || !savesOnSelection(method)) {
            paymentSaveOwed = false;
            return;
        }
        if (buildPaymentRequest(true) === null) return;
        // Core requires the email of a guest with this request.
        if (isGuest() && !EMAIL_SHAPE.test(store.email.get().trim())) return;
        const sendable = flushing
            ? store.isVirtual.get() || canSendShipping()
            : shippingIsConfirmed();
        if (!sendable) return;
        paymentSaveOwed = false;
        void enqueuePaymentMethod(true);
    }

    /**
     * Whether the method is written to the quote when it is selected: false
     * when its renderer entry says so (`savesOnSelection` of
     * `hyperion.paymentRenderers`).
     */
    function savesOnSelection(method: string): boolean {
        return entrySavesOnSelection(method);
    }

    const paymentTimer = debounce((): void => {
        attemptPaymentMethodSave(false);
    }, PAYMENT_METHOD_SAVE_DELAY_MS);

    function savePaymentMethod(): void {
        if (isOrdering()) return;
        paymentSaveOwed = true;
        paymentTimer();
    }

    async function savePaymentInformation(data: PaymentData | null = null): Promise<boolean> {
        if (buildPaymentRequest(false, data) === null) return false;
        store.globalError.set(null);
        paymentTimer.cancel();
        paymentSaveOwed = false;
        const outcome = await enqueuePaymentMethod(false, data);
        return outcome.status === 'applied';
    }

    async function refreshPaymentInformation(): Promise<void> {
        await queue.settle();
    }

    // -- Gift messages -----------------------------------------------------------

    function saveGiftMessage(target: number | null, message: GiftMessagePayload): Promise<WriteOutcome<boolean>> {
        const suffix = target === null ? 'gift-message' : `gift-message/${target}`;
        return queue.enqueue<boolean>({
            key: `gift:${target === null ? 'order' : String(target)}`,
            section: 'gift',
            returnsDetails: false,
            source: 'action',
            errorContext: { path: cartPath(suffix), method: 'POST' },
            run: () => (isGuest()
                ? saveGuestGiftMessage(resolveGuestId() ?? '', target, message)
                : saveCustomerGiftMessage(target, message)),
        });
    }

    // -- Place Order ---------------------------------------------------------------

    /**
     * Turn every pending edit into its write now. Registered with the
     * queue, so `flush()` runs it first.
     */
    function flushPendingEdits(): void {
        shippingIdleTimer.cancel();
        billingTimer.cancel();
        if (isOrdering()) return;
        if (store.isVirtual.get()) {
            if (virtualBillingIsOwed()) void enqueueBilling('background');
        } else {
            if (estimateTimer.pending()) {
                estimateTimer.flush();
            } else if ((retryRatesOnFlush && ratesAreOwed()) || ratesAreStale()) {
                void startEstimate();
            }
            if (estimateInFlight === null && needsShippingWrite()) void enqueueShipping('background');
        }
        if (paymentSaveOwed) {
            paymentTimer.cancel();
            if (estimateInFlight === null) attemptPaymentMethodSave(true);
        }
    }
    queue.registerFlusher(flushPendingEdits);

    /** The last estimate failed and nothing asks the rates again yet. */
    function ratesAreOwed(): boolean {
        return estimateInFlight === null
            && !store.isVirtual.get()
            && store.estimateState.get() === 'error'
            && isEstimable(effectiveShippingAddress(store));
    }

    /**
     * The list on screen was asked for another rate key and nothing asks
     * for the current one: an edit that arrived while requests were held
     * back.
     */
    function ratesAreStale(): boolean {
        return estimateInFlight === null
            && !estimateTimer.pending()
            && !store.isVirtual.get()
            && estimatedKey !== null
            && estimatedKey !== currentRateKey()
            && isEstimable(effectiveShippingAddress(store));
    }

    /** Something is on its way to the quote, or owed to it. */
    function hasPendingWork(): boolean {
        return queue.isBusy()
            || ratesAreOwed()
            || estimateInFlight !== null
            || estimateTimer.pending()
            || billingTimer.pending()
            || paymentSaveOwed
            || virtualBillingIsOwed()
            || needsShippingWrite();
    }

    function releaseOrder(): void {
        prepared = false;
        store.orderOutcome.set('none');
        store.orderStep.set('idle');
        store.isPlacingOrder.set(false);
        if (!halted) queue.reopen();
    }

    /**
     * Terminal: the loading state holds until the browser leaves, and what
     * the shopper typed is no longer kept for a reload.
     */
    function markPlaced(): void {
        prepared = false;
        store.orderOutcome.set('placed');
        store.orderStep.set('idle');
        store.orderPlaced.set(true);
        store.isPlacingOrder.set(true);
        discardDrafts();
    }

    /**
     * The order request failed. A refusal the server answered with releases
     * the latch and shows its message. Without a usable answer (none at
     * all, or a cart still locked by an earlier request for it) the quote
     * decides, see `recoverFromOrderFailure()`: this function then resolves
     * with what the quote said by the time the first reads were made, and
     * a verdict that arrives later (the quote could not be read at first)
     * leaves for the success page, or releases the latch, from there.
     */
    async function resolveOrderFailure(error: unknown): Promise<PlaceOrderOutcome> {
        const failure = classifyError(error, { path: cartPath('payment-information'), method: 'POST' });
        if (failure.kind !== 'order-unknown' && failure.kind !== 'cart-locked') {
            releaseOrder();
            if (handledGlobally(failure)) return null;
            if (failure.kind === 'stock') {
                // Shown next to Place Order, where it comes with the way
                // to the cart.
                reportFailure('order', failure, { source: 'action' });
            } else {
                store.globalError.set(failure.message);
            }
            return null;
        }
        return recoverOrder(failure);
    }

    async function recoverOrder(failure: CheckoutError): Promise<PlaceOrderOutcome> {
        prepared = false;
        const verdict = await recoverFromOrderFailure(failure, {
            store,
            queue,
            navigateToSuccess,
            onNotPlaced: notifyOrderNotPlaced,
            onSessionExpired: expireSession,
        });
        return verdict === 'placed' || verdict === 'gone' ? 'placed-unconfirmed' : null;
    }

    function resolveLostOrder(cause: 'network' | 'unavailable' = 'network'): Promise<PlaceOrderOutcome> {
        if (halted || store.orderPlaced.get() || store.orderOutcome.get() === 'unknown') return Promise.resolve(null);
        store.isPlacingOrder.set(true);
        return recoverOrder({ kind: 'order-unknown', message: '', underlyingKind: cause });
    }

    async function prepareOrder(options: PrepareOrderOptions = {}): Promise<PrepareOrderResult> {
        const outcome = store.orderOutcome.get();
        if (
            halted
            || outcome === 'placing'
            || outcome === 'placed'
            || store.orderPlaced.get()
            || store.isPlacingOrder.get()
        ) {
            return { status: 'blocked', reason: 'busy' };
        }
        // An earlier attempt may have placed the order and the quote is
        // being asked: nothing is sent, and no press shortens that.
        if (outcome === 'unknown') return { status: 'blocked', reason: 'outcome-unknown' };
        // The first step of an order: an extension may stop it (and its gate says why).
        const method = store.selectedPaymentMethod.get() ?? '';
        if (options.announce !== false && !emitCheckoutEvent('before-place-order', { method }, { cancelable: true })) {
            return { status: 'blocked', reason: 'extension' };
        }
        refreshGates();
        // Nothing to wait for and a piece missing: answer without the latch.
        if (!hasPendingWork()) {
            const missing = placeOrderBlocker(store, selectors, options);
            if (missing !== null) return { status: 'blocked', reason: missing };
        }

        store.orderOutcome.set('placing');
        store.orderStep.set('preparing');
        store.isPlacingOrder.set(true);
        store.globalError.set(null);
        clearFailure('order');
        preparing = true;
        const failuresBefore = reportedFailures;
        try {
            // An estimate is not part of the queue and ends in a save, and
            // a save that depends on it waits for the next flush: flush,
            // wait for the rates, and flush again when rates were asked
            // meanwhile. Bounded, and one attempt per press for rates that
            // failed before.
            for (let round = 0; round < 4; round += 1) {
                const estimatesBefore = estimateGeneration;
                await queue.flush();
                retryRatesOnFlush = false;
                const estimate: Promise<void> | null = estimateInFlight;
                if (estimate !== null) await estimate;
                if (estimateGeneration === estimatesBefore) break;
            }
            await queue.whenIdle();
            // Modules of the generic extension pool still loading may add a
            // gate; the gates are read again on the state the flush left.
            const loading = extensionsSettled();
            if (loading !== null) await loading;
            refreshGates();
        } finally {
            retryRatesOnFlush = true;
            preparing = false;
        }
        const saved = reportedFailures === failuresBefore;
        const missing = placeOrderBlocker(store, selectors, options);
        if (!saved || missing !== null) {
            releaseOrder();
            const reason: PrepareOrderBlockReason = missing !== null && (saved || missing !== 'updating')
                ? missing
                : 'write-failed';
            return { status: 'blocked', reason };
        }
        prepared = true;
        // From here to `submitOrder()` the payment method has the page.
        store.orderStep.set('payment');
        return { status: 'ready' };
    }

    async function submitOrder(data: PaymentData | null = null): Promise<PlaceOrderOutcome> {
        if (!prepared || submitting) return null;
        prepared = false;
        submitting = true;
        queue.close();
        store.orderStep.set('submitting');
        try {
            // Second line of defense: an edit made while the payment step
            // ran left a form ahead of the quote.
            if ((!store.isVirtual.get() && store.shippingDirty.get()) || store.billingDirty.get()) {
                releaseOrder();
                store.globalError.set(checkoutUpdatingMessage());
                return null;
            }
            const built = buildPaymentRequest(false, data);
            if (built === null) {
                releaseOrder();
                return null;
            }
            let request: PaymentInformationRequest;
            try {
                request = applyFilters('paymentInformation', built);
            } catch (err) {
                releaseOrder();
                store.globalError.set(err instanceof Error ? err.message : t('Hyperion_Checkout::unexpected_error'));
                return null;
            }
            let orderId: number;
            try {
                // The proof that the request comes from a person travels as headers.
                orderId = await sendWithAntiAbuse(store, 'order', ({ headers }) => (isGuest()
                    ? placeGuestOrder(resolveGuestId() ?? '', request, headers)
                    : placeCustomerOrder(request, headers)));
            } catch (err) {
                return await resolveOrderFailure(err);
            }
            markPlaced();
            return orderId;
        } finally {
            submitting = false;
        }
    }

    function cancelOrder(): void {
        if (!prepared || submitting) return;
        releaseOrder();
    }

    function confirmOrderPlaced(): void {
        if (store.orderOutcome.get() === 'placed') return;
        markPlaced();
    }

    return {
        queue,
        estimateShipping,
        scheduleShippingEstimate,
        estimateShippingNow,
        refreshShippingRatesSilently,
        flushShippingForm,
        selectShippingMethod,
        saveShippingAndEstimateTotals,
        resumeAfterReconnect,
        applyCoupon: (code) => changeCoupon(code),
        removeCoupon: () => changeCoupon(null),
        savePaymentMethod,
        savePaymentInformation,
        refreshPaymentInformation,
        syncBillingAddress,
        scheduleBillingSync,
        invalidateBillingSync,
        saveGiftMessage,
        prepareOrder,
        submitOrder,
        cancelOrder,
        confirmOrderPlaced,
        resolveLostOrder,
    };
}

/**
 * The payment method to keep selected after the list changed: `free` at a
 * zero grand total (it is the only method offered then, see
 * `offeredPaymentMethods()`), the selection while the
 * list still offers it and a renderer serves it, the only offered method
 * when it is an offline method of the bundle. Otherwise nothing: the shopper chooses, and a gateway is
 * never selected for them (its SDK loads on selection). Exported for the
 * unit tests.
 */
export function reconcilePaymentSelection(
    selected: string | null,
    methods: readonly PaymentMethodConfig[],
    totals: Totals | null
): string | null {
    const offer = offeredPaymentMethods(methods, totals);
    if (totals !== null && isZeroAmount(totals.grand_total) && offer.length === 1 && offer[0]?.code === FREE_PAYMENT_METHOD) {
        return FREE_PAYMENT_METHOD;
    }
    if (selected !== null && offer.some((m) => m.code === selected) && unsupportedReason(selected) === null) {
        return selected;
    }
    const only = offer.length === 1 ? offer[0] : undefined;
    return only !== undefined && isPreselectable(only.code) ? only.code : null;
}

function shifted(value: unknown, delta: number): string {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    return ((Number.isFinite(n) ? n : 0) + delta).toFixed(4);
}

/**
 * The totals expected once the quote carries `next` instead of `previous`
 * as its shipping rate: the shipping amounts, the tax on shipping (the
 * difference between the price with and without tax) and the grand total
 * move by the difference between the two rates, in the fields and in the
 * `shipping`, `tax` and `grand_total` segments. Without a previous rate the
 * amounts the totals carry are the starting point. A cart rule that depends
 * on the method is not known here: the answer of the save corrects it.
 * Null without totals. Exported for the unit tests.
 */
export function totalsWithShippingRate(
    totals: Totals | null,
    previous: ShippingMethod | null,
    next: ShippingMethod
): Totals | null {
    if (totals === null) return null;
    const amount = (value: unknown): number => {
        const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
        return Number.isFinite(n) ? n : 0;
    };
    const exclDelta = amount(next.price_excl_tax) - amount(previous ? previous.price_excl_tax : totals.shipping_amount);
    const inclDelta = amount(next.price_incl_tax) - amount(previous ? previous.price_incl_tax : totals.shipping_incl_tax);
    const taxDelta = inclDelta - exclDelta;
    const segmentDelta: Readonly<Record<string, number>> = { shipping: exclDelta, tax: taxDelta, grand_total: inclDelta };
    return {
        ...totals,
        shipping_amount: shifted(totals.shipping_amount, exclDelta),
        shipping_incl_tax: shifted(totals.shipping_incl_tax, inclDelta),
        shipping_tax_amount: shifted(totals.shipping_tax_amount, taxDelta),
        tax_amount: shifted(totals.tax_amount, taxDelta),
        grand_total: shifted(totals.grand_total, inclDelta),
        total_segments: totals.total_segments.map((segment) => {
            const delta = segmentDelta[segment.code];
            return delta === undefined ? segment : { ...segment, value: shifted(segment.value, delta) };
        }),
    };
}

// Module singleton: initialized by bootstrap after the store.
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
}
