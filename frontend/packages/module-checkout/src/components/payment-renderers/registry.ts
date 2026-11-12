// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Payment-renderers registry + safe-for-generic allowlist.
 *
 * The registry maps Magento method codes to a `PaymentRenderer`:
 *   - `component`: the custom-element tag to render inside
 *     <payment-method-row> when the method is selected.
 *   - `isAvailable`: optional runtime gate (e.g. "hide billing
 *     agreement when no saved agreements exist"). If omitted, the
 *     renderer is treated as always available once the code appears
 *     in `availablePaymentMethods`.
 *   - `beforePlaceOrder`: async hook invoked before the
 *     payment-information POST; returns the `additional_data` blob.
 *     A rejection aborts the order and its (translated) message lands
 *     in the global error banner.
 *   - `isReady`: optional gate read by the `canPlaceOrder` selector.
 *     It must read signals only, so the Place Order button follows it
 *     (PayPal stays locked until the shopper authorized the payment).
 *   - `notReadyMessage`: optional, what the shopper has to do while
 *     `isReady` is false (translated); the generic "select a payment
 *     method" line is used without it.
 *   - `afterPlaceOrderFailed`: optional hook invoked when the order
 *     POST failed, for renderers holding single-use gateway state.
 *   - `ownsPlaceOrder`: true when the renderer completes the order with
 *     a control of its own (PayPal smart button); the checkout's Place
 *     Order button is not rendered while that method is selected.
 *   - `placeOrder`: replaces the order POST for methods whose order is
 *     placed elsewhere (redirect gateways). Resolves with the same-origin
 *     URL the shopper continues on, or null when it failed and already
 *     reported why in `globalError`. `beforePlaceOrder` still runs first.
 *
 * Shipped renderers: the offline methods (`payment-offline`), Braintree
 * cards (`braintree`), Braintree PayPal (`braintree_paypal`), Braintree
 * Google Pay (`braintree_googlepay`), PayPal Express (`paypal_express`,
 * `payflow_express`) and stored payment tokens (`*_vault` codes, see
 * `vault-tokens.ts`).
 *
 * Methods not in the registry fall through to `payment-generic`: when
 * a code is neither registered nor in the safe-for-generic allowlist,
 * the UI shows a "not yet supported" banner and disables selection.
 */
import type { PaymentMethodConfig } from '../../types/payment.js';

export interface PaymentRenderer {
    code: string;
    component: string;
    isAvailable?: (cfg: PaymentMethodConfig) => boolean;
    beforePlaceOrder?: () => Promise<Record<string, unknown>>;
    isReady?: () => boolean;
    notReadyMessage?: () => string;
    afterPlaceOrderFailed?: () => void;
    ownsPlaceOrder?: () => boolean;
    placeOrder?: () => Promise<string | null>;
}

const registry = new Map<string, PaymentRenderer>();

export function registerPaymentRenderer(renderer: PaymentRenderer): void {
    registry.set(renderer.code, renderer);
}

export function getPaymentRenderer(code: string): PaymentRenderer | null {
    return registry.get(code) ?? null;
}

export function hasPaymentRenderer(code: string): boolean {
    return registry.has(code);
}

/**
 * Codes that are safe to render with the generic (no-UI) fallback --
 * pure offline methods that need nothing more than the method code in
 * the payment-information POST body. Anything outside this list
 * requires an explicit renderer (gateway SDK, redirect URL, etc.).
 */
const SAFE_FOR_GENERIC: ReadonlySet<string> = new Set([
    'checkmo',
    'banktransfer',
    'cashondelivery',
    'free',
]);

export function isSafeForGeneric(code: string): boolean {
    return SAFE_FOR_GENERIC.has(code);
}

export function clearRegistryForTests(): void {
    registry.clear();
}
