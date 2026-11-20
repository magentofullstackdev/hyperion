// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Section status types: the parts of the checkout that can show a failed
 * request next to the controls it belongs to, and what such a failure
 * looks like in the store (`store.sectionStatus`).
 */
import type { CheckoutErrorKind } from './errors.js';

export type SectionId =
    | 'contact'
    | 'shipping-address'
    | 'shipping-methods'
    | 'billing'
    | 'payment'
    | 'coupon'
    | 'gift'
    | 'order';

/**
 * Who caused the failed request: `action` for something the shopper
 * pressed (announced as an alert), `background` for a request the checkout
 * started by itself (announced as a status, never focused).
 */
export type SectionStatusSource = 'action' | 'background';

export interface SectionStatus {
    kind: CheckoutErrorKind;
    /** Translated, ready to show. */
    message: string;
    /** Runs the failed request again; absent when a retry makes no sense. */
    retry?: () => void;
    source: SectionStatusSource;
    /** Epoch milliseconds before which the server asked not to be called again. */
    retryAt?: number;
}

export type SectionStatusMap = Readonly<Record<SectionId, SectionStatus | null>>;
