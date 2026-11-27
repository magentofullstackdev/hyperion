// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The checkout snapshot of the extension API: a deep frozen plain object
 * that describes the checkout as an extension may read it.
 *
 * `buildSnapshot()` builds it from the store. `createSnapshotSource()`
 * keeps one `Signal.Computed` over it (a new object only when a value in
 * it changed) and one watcher that tells the subscribers, once per batch
 * of changes in a microtask, each inside its own try / catch.
 *
 * What it reads:
 *   - addresses: the effective ones (`address-override.ts`): a shipping
 *     address an extension put in place, "same as shipping" resolved for
 *     the billing address; null on a virtual quote for shipping;
 *   - totals: the totals the server confirmed (`store.totals`), never the
 *     expected ones of a change not answered yet, so a gateway never
 *     charges a provisional amount; null when a base amount is missing;
 *   - `isSettling`: a quote write is queued or running, the totals are
 *     being read, a form is ahead of the quote, or the rates are loading;
 *   - `blocker`: the single Place Order gate without the readiness of the
 *     payment method's own step (`placeOrderHint()`, extension gates
 *     included).
 */
import { Signal } from 'signal-polyfill';

import type {
    CartItemSnapshot,
    CheckoutSnapshot,
    ShippingMethodSnapshot,
    TotalSegment,
    Unsubscribe,
} from '../../extension-api.js';
import { peekCheckoutConfig } from '../bootstrap-config.js';
import type { Store } from '../store/index.js';
import { placeOrderHint } from '../store/place-order-hint.js';
import type { createSelectors } from '../store/selectors.js';
import { getActiveLocale } from '../utils/i18n.js';
import { billingFollowsShipping, effectiveShippingAddress } from './address-override.js';
import { toAddressSnapshot } from './address-snapshot.js';
import { amountOf, moneyTotalsOf } from './money.js';

type Selectors = ReturnType<typeof createSelectors>;

/** Freeze `value` and everything it holds. */
export function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const key of Object.keys(value as object)) {
        deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
}

/** Structural equality of two plain data values. */
export function sameData(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
    }
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function shippingMethodOf(store: Store): ShippingMethodSnapshot | null {
    if (store.isVirtual.get()) return null;
    const selected = store.selectedShippingMethod.get();
    if (selected === null) return null;
    const rate = store.availableShippingMethods.get().find(
        (m) => m.carrier_code === selected.carrier_code && m.method_code === selected.method_code
    );
    if (rate === undefined) return null;
    return {
        carrier_code: rate.carrier_code,
        method_code: rate.method_code,
        carrier_title: rate.carrier_title ?? '',
        method_title: rate.method_title ?? '',
        amount: amountOf(rate.amount) ?? Number.NaN,
        base_amount: amountOf(rate.base_amount) ?? Number.NaN,
    };
}

function itemsOf(store: Store): CartItemSnapshot[] {
    return store.items.get().map((item) => ({
        item_id: Number(item.item_id),
        sku: String(item.sku ?? ''),
        name: String(item.name ?? ''),
        qty: Number(item.qty),
        product_type: String(item.product_type ?? ''),
        price: amountOf(item.price) ?? Number.NaN,
        row_total: amountOf(item.row_total) ?? Number.NaN,
        base_price: amountOf(item.base_price) ?? Number.NaN,
        base_row_total: amountOf(item.base_row_total) ?? Number.NaN,
    }));
}

function segmentsOf(store: Store): TotalSegment[] {
    return (store.totals.get()?.total_segments ?? []).map((segment) => ({
        code: segment.code,
        title: segment.title ?? '',
        value: amountOf(segment.value),
    }));
}

function currencyOf(store: Store): CheckoutSnapshot['currency'] {
    const config = peekCheckoutConfig();
    const totals = store.totals.get();
    const quote = config?.quoteData;
    const display = String(totals?.quote_currency_code ?? quote?.quote_currency_code ?? '');
    const base = String(totals?.base_currency_code ?? quote?.base_currency_code ?? '');
    const quoted = amountOf(quote?.['base_to_quote_rate']);
    let rate = quoted !== null && quoted > 0 ? quoted : null;
    if (rate === null) {
        const grand = amountOf(totals?.grand_total);
        const baseGrand = amountOf(totals?.base_grand_total);
        rate = display === base ? 1 : (grand !== null && baseGrand !== null && baseGrand !== 0 ? grand / baseGrand : 1);
    }
    return { display, base, rate };
}

/** The snapshot of the checkout as it stands, deep frozen. Reads signals. */
export function buildSnapshot(store: Store, selectors: Selectors): CheckoutSnapshot {
    const config = peekCheckoutConfig();
    const isGuest = store.isGuest.get();
    const isVirtual = store.isVirtual.get();
    const shipping = isVirtual ? null : toAddressSnapshot(effectiveShippingAddress(store));
    const billing = billingFollowsShipping(store) && !isVirtual
        ? shipping
        : toAddressSnapshot(store.billingAddress.get());
    const money = moneyTotalsOf(store.totals.get());
    const customer = store.customer.get();
    const customerId = customer === null ? null : Number(customer.id);
    const outcome = store.orderOutcome.get();
    return deepFreeze({
        isGuest,
        isVirtual,
        email: store.email.get(),
        cartId: String((isGuest ? store.maskedQuoteId.get() : store.quoteId.get()) ?? ''),
        customerId: customerId !== null && Number.isFinite(customerId) ? customerId : null,
        storeCode: config?.storeCode ?? '',
        locale: getActiveLocale(),
        currency: currencyOf(store),
        shippingAddress: shipping,
        billingAddress: billing,
        shippingMethod: shippingMethodOf(store),
        paymentMethod: store.selectedPaymentMethod.get(),
        items: itemsOf(store),
        totals: money === null ? null : { display: money.display, base: money.base, segments: segmentsOf(store) },
        agreementsAccepted: selectors.agreementsAccepted.get(),
        isSettling: store.quoteWritesPending.get() > 0
            || store.isSettlingTotals.get()
            || store.shippingDirty.get()
            || store.billingDirty.get()
            || store.estimateState.get() === 'loading',
        isPlacingOrder: outcome !== 'none',
        blocker: placeOrderHint(store, selectors, { skipPaymentReady: true }),
    } satisfies CheckoutSnapshot);
}

export interface SnapshotSource {
    snapshot(): CheckoutSnapshot;
    subscribe(listener: (snapshot: CheckoutSnapshot) => void): Unsubscribe;
}

/** One computed snapshot and its subscribers. */
export function createSnapshotSource(store: Store, selectors: Selectors): SnapshotSource {
    const computed = new Signal.Computed<CheckoutSnapshot>(
        () => buildSnapshot(store, selectors),
        { equals: sameData }
    );
    const listeners = new Set<(snapshot: CheckoutSnapshot) => void>();
    let delivered: CheckoutSnapshot | null = null;
    let scheduled = false;
    const notify = (): void => {
        scheduled = false;
        const current = computed.get();
        watcher.watch();
        if (current === delivered) return;
        delivered = current;
        for (const listener of [...listeners]) {
            try {
                listener(current);
            } catch (err) {
                console.error('[hyperion-checkout] a checkout snapshot subscriber failed', err);
            }
        }
    };
    const watcher = new Signal.subtle.Watcher(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(notify);
    });
    let watching = false;

    return {
        snapshot: () => computed.get(),
        subscribe: (listener) => {
            listeners.add(listener);
            if (!watching) {
                watching = true;
                watcher.watch(computed);
                delivered = computed.get();
            }
            return (): void => {
                listeners.delete(listener);
                if (listeners.size === 0 && watching) {
                    watching = false;
                    watcher.unwatch(computed);
                }
            };
        },
    };
}
