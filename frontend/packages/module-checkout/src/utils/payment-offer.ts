// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Which of the payment methods the server lists can be chosen.
 *
 * The server lists every active method whatever the grand total is, and
 * refuses all of them except `free` once the total is zero. So at a zero
 * grand total, when `free` is in the list, it is the only method offered.
 * In every other case the list is offered as it came: a zero total without
 * `free` keeps the other methods, and a total above zero brings the whole
 * list back without another request.
 *
 * A gateway module can list a method and mark it as not presentable in its
 * own slice of the checkout configuration (`payment.<code>.isVisible` is
 * `false`, for instance while the merchant is not onboarded): such a
 * method is never offered, and neither is a Braintree method without a
 * client token.
 */
import type { PaymentMethodConfig } from '../types/payment.js';
import type { Totals } from '../types/totals.js';

export const FREE_PAYMENT_METHOD = 'free';

export function isZeroAmount(amount: unknown): boolean {
    const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? ''));
    return Number.isFinite(n) && Math.abs(n) < 0.005;
}

let hiddenCodes: ReadonlySet<string> = new Set();

/**
 * The Braintree methods whose module is installed without working
 * credentials: the slice is there, inactive or without a client token, and
 * the method cannot take a payment. Known before any gateway chunk loads,
 * so the row never shows and then goes.
 */
const CLIENT_TOKEN_METHODS: readonly string[] = ['braintree', 'braintree_paypal', 'braintree_googlepay'];

function isPresentable(code: string, slice: Record<string, unknown>): boolean {
    if (slice.isVisible === false) return false;
    if (!CLIENT_TOKEN_METHODS.includes(code)) return true;
    return Boolean(slice.isActive) && typeof slice.clientToken === 'string' && slice.clientToken !== '';
}

/** Reads the methods a gateway module marked as not presentable. */
export function setPaymentVisibility(payment: Readonly<Record<string, unknown>> | null | undefined): void {
    const hidden = new Set<string>();
    for (const [code, slice] of Object.entries(payment ?? {})) {
        if (slice !== null && typeof slice === 'object' && !Array.isArray(slice) && !isPresentable(code, slice as Record<string, unknown>)) {
            hidden.add(code);
        }
    }
    hiddenCodes = hidden;
}

export function offeredPaymentMethods(
    methods: readonly PaymentMethodConfig[],
    totals: Pick<Totals, 'grand_total'> | null
): readonly PaymentMethodConfig[] {
    const visible = hiddenCodes.size === 0 ? methods : methods.filter((m) => !hiddenCodes.has(m.code));
    if (totals === null || !isZeroAmount(totals.grand_total)) return visible;
    const free = visible.find((m) => m.code === FREE_PAYMENT_METHOD);
    return free === undefined ? visible : [free];
}
