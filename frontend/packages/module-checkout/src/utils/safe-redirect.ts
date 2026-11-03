// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Resolve a server-supplied redirect target into a same-origin URL
 * string we'll hand to `window.location.assign()`.
 *
 * The Place Order flow navigates to whatever `defaultSuccessPageUrl`
 * the backend sent. That value is server-rendered today, but treating
 * it as untrusted is the cheap defense:
 *   - cross-origin or scheme-relative (`//evil.com`) -> fall back to
 *     the canonical success page rather than redirect off-origin.
 *   - non-http(s) scheme (`javascript:`, `data:`) -> fall back.
 *   - `URL()` constructor throws (malformed input) -> fall back.
 *
 * The fallback is chosen so a misconfigured backend still lands the
 * customer on the success page after a successful charge instead of
 * stranding them on `/checkout`.
 */
export function decideRedirectTarget(
    targetUrl: string,
    fallbackPath: string = '/checkout/onepage/success'
): string {
    return resolveSameOriginUrl(targetUrl) ?? fallbackPath;
}

/**
 * Same checks for a target that has no sensible fallback (a gateway step
 * in the middle of the payment): null when the URL must not be followed.
 */
export function resolveSameOriginUrl(targetUrl: string): string | null {
    try {
        const url = new URL(targetUrl, window.location.origin);
        if (url.origin !== window.location.origin) return null;
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.toString();
    } catch {
        return null;
    }
}
