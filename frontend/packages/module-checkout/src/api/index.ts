// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Barrel export for `src/api/`.
 */
export {
    apiFetch,
    configureApiClient,
    resetApiClientForTests,
    buildClientConfig,
    MagentoApiError,
    NetworkError,
    RequestTimeoutError,
} from './client.js';
export type {
    ApiFetchOptions,
    AuthMode,
    ClientConfig,
} from './client.js';
export { normalizeMagentoError } from './errors.js';

export * from './cart.js';
export * from './shipping.js';
export * from './payment.js';
export * from './coupon.js';
