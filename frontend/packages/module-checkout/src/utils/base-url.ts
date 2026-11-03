// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The application base URL every REST and storefront call is built on.
 *
 * `checkoutConfig.hyperion.baseUrl` is the store's web base URL emitted by
 * `Magentofullstackdev\HyperionCheckout\Model\ConfigProvider`: scheme, host
 * and the install path when Magento runs under a sub directory. It is used
 * only when it is an absolute http(s) URL on the page's own origin, so a
 * tampered or misconfigured value can never send credentials elsewhere.
 * Without it the page origin is used; core's `staticBaseUrl` is never a
 * source, it points at the static files host (a CDN on many stores).
 */
import type { CheckoutConfig } from '../types/config.js';

export function deriveBaseUrl(config: CheckoutConfig, pageOrigin: string): string {
    const configured = config.hyperion?.baseUrl;
    if (typeof configured === 'string' && configured !== '') {
        try {
            const parsed = new URL(configured);
            if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.origin === pageOrigin) {
                return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
            }
        } catch {
            // fall through to the page origin
        }
    }
    return pageOrigin.replace(/\/+$/, '');
}
