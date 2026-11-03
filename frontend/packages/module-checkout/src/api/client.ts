// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * REST client for the Lit checkout.
 *
 * One function -- `apiFetch<T>(path, options)` -- wraps every call to
 * `/rest/<storeCode>/V1/...`. Three auth modes:
 *
 *   - `'customer'`: logged-in user. Relies on the `PHPSESSID` cookie
 *     (native Magento frontend auth) unless an inline-login token is
 *     held in memory, in which case a `Authorization: Bearer ...`
 *     header is attached. Never writes tokens to localStorage /
 *     sessionStorage / IndexedDB (Q11).
 *   - `'guest'`: REST endpoints under `/rest/V1/guest-carts/:maskedId/*`
 *     treat the masked cart ID as the auth token; cookies aren't
 *     cross-site readable and REST won't accept form-encoded POSTs from
 *     `<form>` submissions, so no CSRF token is required on this path.
 *     The `readFormKey` hook stays on the client config so future
 *     non-REST callers (e.g. cart-page HTMX wiring) can reuse the
 *     instance.
 *   - `'none'`: public endpoints (rare -- `customers/isEmailAvailable`).
 *
 * Retry policy: GETs retry ONCE on transport failure
 * (`NetworkError`), 1 s backoff. Mutations never retry. HTTP 4xx/5xx
 * never retry.
 *
 * The Magento REST response can be:
 *   - 200 + JSON body  -> return parsed T
 *   - 200 + empty body -> return undefined as T (some DELETE endpoints)
 *   - 4xx/5xx + JSON error body -> throw MagentoApiError
 *   - 4xx/5xx + non-JSON body (nginx page) -> throw MagentoApiError with
 *     httpStatus + fallback message
 *   - network / CORS / timeout -> throw NetworkError
 *   - aborted through `options.signal` -> the AbortError is rethrown as is
 */
import type { CheckoutConfig } from '../types/config.js';
import { isAbortError, NetworkError, normaliseMagentoError } from './errors.js';

export type AuthMode = 'customer' | 'guest' | 'none';

export interface ApiFetchOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    auth?: AuthMode;
    /**
     * Override the default retry-on-network-error behavior. GETs
     * retry once by default; mutations never do.
     */
    retry?: boolean;
    /**
     * Additional headers. Intentionally narrow -- callers should not
     * need to override Content-Type / Authorization here.
     */
    headers?: Readonly<Record<string, string>>;
    /**
     * AbortSignal for user-canceled calls (debounced shipping-rate
     * fetch, tab-close during place-order).
     */
    signal?: AbortSignal;
    /**
     * Optional reCAPTCHA token. When provided, the value is attached
     * as an `X-ReCaptcha` header -- the contract used by
     * `Magento_ReCaptchaWebapiRest` to validate API calls when a
     * storefront key check is enabled (e.g. checkout, login).
     */
    recaptchaToken?: string;
}

export interface ClientConfig {
    /** `https://shop.example` -- no trailing slash. */
    baseUrl: string;
    storeCode: string;
    /** Form-key reader; called on every guest mutation. */
    readFormKey: () => string;
    /**
     * Customer bearer token, if the user inline-logged-in. Returning
     * `null` falls back to the PHPSESSID cookie auth path.
     */
    readCustomerToken: () => string | null;
    /** Optional fetch implementation for tests. Defaults to global fetch. */
    fetch?: typeof fetch;
}

/**
 * Module-scoped singleton -- populated by `bootstrap.ts` at boot time.
 * Components import `apiFetch` and it resolves through this instance.
 */
let clientConfig: ClientConfig | null = null;

export function configureApiClient(config: ClientConfig): void {
    clientConfig = config;
}

/**
 * Test-only reset. Keeps unit tests isolated.
 */
export function resetApiClientForTests(): void {
    clientConfig = null;
}

function assertConfigured(): ClientConfig {
    if (!clientConfig) {
        throw new Error(
            '[hyperion-checkout] apiFetch() called before configureApiClient(). ' +
            'Did bootstrap.ts run?'
        );
    }
    return clientConfig;
}

function buildUrl(path: string, cfg: ClientConfig): string {
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const clean = path.replace(/^\/+/, '');
    return `${base}/rest/${encodeURIComponent(cfg.storeCode)}/V1/${clean}`;
}

function buildHeaders(
    options: ApiFetchOptions,
    cfg: ClientConfig,
    isMutation: boolean
): Headers {
    const headers = new Headers(options.headers);

    if (isMutation) {
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }
    }
    headers.set('Accept', 'application/json');

    const auth: AuthMode = options.auth ?? 'guest';
    if (auth === 'customer') {
        const token = cfg.readCustomerToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        // else: rely on PHPSESSID cookie (Q11 path 1).
    }
    // Magento only honours the session cookie on web API calls that declare
    // themselves as AJAX (Magento\Webapi\Model\Plugin\Authorization\
    // CustomerSessionUserContext); without it every `carts/mine` call of a
    // customer who signed in on the storefront answers 401.
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (options.recaptchaToken) {
        headers.set('X-ReCaptcha', options.recaptchaToken);
    }

    return headers;
}

async function parseResponseBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (text.length === 0) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

async function fetchOnce<T>(
    path: string,
    options: ApiFetchOptions,
    cfg: ClientConfig
): Promise<T> {
    const method = options.method ?? 'GET';
    const isMutation = method !== 'GET';
    const headers = buildHeaders(options, cfg, isMutation);
    const url = buildUrl(path, cfg);

    const init: RequestInit = {
        method,
        headers,
        credentials: 'same-origin',
    };
    if (options.signal) {
        init.signal = options.signal;
    }
    if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
    }

    let res: Response;
    try {
        const fetchImpl = cfg.fetch ?? globalThis.fetch.bind(globalThis);
        res = await fetchImpl(url, init);
    } catch (err) {
        if (isAbortError(err)) throw err;
        throw new NetworkError(err);
    }

    if (!res.ok) {
        const body = await parseResponseBody(res);
        throw normaliseMagentoError(res.status, body);
    }

    const body = await parseResponseBody(res);
    return body as T;
}

export async function apiFetch<T>(
    path: string,
    options: ApiFetchOptions = {}
): Promise<T> {
    const cfg = assertConfigured();
    const method = options.method ?? 'GET';
    const isMutation = method !== 'GET';
    const shouldRetry = options.retry ?? !isMutation;

    try {
        return await fetchOnce<T>(path, options, cfg);
    } catch (err) {
        if (err instanceof NetworkError && shouldRetry) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return fetchOnce<T>(path, options, cfg);
        }
        throw err;
    }
}

/**
 * POST a JSON body to a storefront controller (not a REST route) on the
 * configured base URL, with the headers Magento's AJAX controllers require
 * (`X-Requested-With`, so `isXmlHttpRequest()` holds and the CSRF validator
 * accepts the request). Cookies travel with it, which is the point: these
 * controllers act on the PHP session. Query parameters are appended when
 * given (reCAPTCHA observers read `getParam()`). Non-2xx answers become
 * `MagentoApiError`, transport failures `NetworkError`, never retried.
 */
export async function storefrontPostJson<T>(
    path: string,
    body: unknown,
    query?: Readonly<Record<string, string>>
): Promise<T> {
    const cfg = assertConfigured();
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(query ?? {})) {
        url.searchParams.set(key, value);
    }
    const headers = new Headers({
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    });
    let res: Response;
    try {
        const fetchImpl = cfg.fetch ?? globalThis.fetch.bind(globalThis);
        res = await fetchImpl(url.toString(), {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify(body),
        });
    } catch (err) {
        if (isAbortError(err)) throw err;
        throw new NetworkError(err);
    }
    const parsed = await parseResponseBody(res);
    if (!res.ok) {
        throw normaliseMagentoError(res.status, parsed);
    }
    return parsed as T;
}

/**
 * Config-derived helper: build an API client config from a parsed
 * `CheckoutConfig` + runtime hooks. Used by bootstrap.ts.
 */
export function buildClientConfig(
    config: CheckoutConfig,
    hooks: {
        baseUrl: string;
        readFormKey: () => string;
        readCustomerToken: () => string | null;
    }
): ClientConfig {
    return {
        baseUrl: hooks.baseUrl,
        storeCode: config.storeCode,
        readFormKey: hooks.readFormKey,
        readCustomerToken: hooks.readCustomerToken,
    };
}

// Re-export the error types so callers only need one import.
export { isAbortError, MagentoApiError, NetworkError } from './errors.js';
