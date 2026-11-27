// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * `@magentofullstackdev/hyperion-checkout/testing`: unit test helpers for
 * payment renderers, shipping extensions, slot elements and express
 * buttons written against `extension-api.d.ts`. Dependency free ES
 * modules: no Lit, no signals, nothing of the checkout's internals.
 */
export {
    API_MAJOR,
    API_VERSION,
    MOCK_BASE_URL,
    createCheckoutError,
    createMockCheckoutContext,
    createMockExpressContext,
    createMockPaymentContext,
    createMockShippingContext,
    createSnapshot,
    createSpy,
    isPlainObject,
    mockSanitizeHtml,
} from './context.js';
export {
    CONTRACT_EVENTS,
    createCheckoutHost,
    mountExpressElement,
    mountPaymentElement,
    mountShippingElement,
    mountSlotElement,
    recordEvents,
} from './mount.js';
export {
    PAYMENT_DATA_KEYS,
    SHIPPING_VALUE_KEYS,
    paymentDataProblems,
    runPaymentRendererContract,
    runShippingExtensionContract,
    shippingValueProblems,
} from './contract.js';
