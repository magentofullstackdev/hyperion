// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * REST client for the Lit checkout.
 *
 * One function -- `apiFetch<T>(path, options)` -- wraps every call to
 * `/rest/<storeCode>/V1/...`. Three auth modes:
 *
 *   - `'customer'`: logged-in user, authenticated by the storefront
 *     session cookie. The client holds no token.
 *   - `'guest'`: REST endpoints under `/rest/V1/guest-carts/:maskedId/*`
 *     treat the masked cart ID as the auth token; cookies aren't
 *     cross-site readable and REST won't accept form-encoded POSTs from
 *     `<form>` submissions, so no CSRF token is required on this path.
 *     The `readFormKey` hook stays on the client config so non-REST
 *     callers can reuse the instance.
 *   - `'none'`: public endpoints (rare -- `customers/isEmailAvailable`).
 *
 * Time limits: every request has one. `options.timeoutMs`, or by default
 * `READ_TIMEOUT_MS` for a GET and for the POST routes that only read,
 * `ORDER_TIMEOUT_MS` for the order request, `WRITE_TIMEOUT_MS` for every
 * other write.
 *
 * Retry policy: the `RETRY_DELAYS_MS` table, by the class of the failure
 * and by what the request is (a read, a write that may be repeated, any
 * other write). The order request and a write not marked `idempotent`
 * are never sent twice.
 *
 * The Magento REST response can be:
 *   - 200 + JSON body  -> return parsed T
 *   - 200 + empty body -> return undefined as T (some DELETE endpoints)
 *   - 4xx/5xx + JSON error body -> throw MagentoApiError
 *   - any status + non-JSON body (a proxy's page) -> throw MagentoApiError
 *     marked `nonJsonBody`, with a translated message for the status
 *     class; the body itself never becomes the message
 *   - network / CORS -> throw NetworkError
 *   - no answer within the time limit -> throw RequestTimeoutError
 *     (a NetworkError)
 *   - aborted through `options.signal` -> the AbortError is rethrown as is
 *
 * `classifyError()` of `error-kinds.ts` names the class of each of them.
 */
import type { CheckoutErrorKind } from '../types/errors.js';
import { classifyError, isOrderPost, parseRetryAfter } from './error-kinds.js';
import {
    isAbortError,
    MagentoApiError,
    NetworkError,
    NON_JSON_BODY,
    normalizeMagentoError,
    RequestTimeoutError,
} from './errors.js';

export type AuthMode = 'customer' | 'guest' | 'none';

/** Time limit of a GET and of a POST that only reads (an estimate, the email lookup). */
export const READ_TIMEOUT_MS = 15000;
/** Time limit of a write. */
export const WRITE_TIMEOUT_MS = 20000;
/** Time limit of the order request. */
export const ORDER_TIMEOUT_MS = 60000;

export interface ApiFetchOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    auth?: AuthMode;
    /**
     * `false`: never send the request a second time. `true`: treat a
     * write as one that may be repeated (like `idempotent`). Unset: the
     * retry table decides.
     */
    retry?: boolean;
    /**
     * Additional headers (`X-Captcha`, ...). `Accept` and
     * `X-Requested-With` are the client's own.
     */
    headers?: Readonly<Record<string, string>>;
    /**
     * AbortSignal for user-canceled calls (debounced shipping-rate
     * fetch, tab-close during place-order). It also ends the wait
     * before a retry.
     */
    signal?: AbortSignal;
    /**
     * Optional reCAPTCHA token. When provided, the value is attached
     * as an `X-ReCaptcha` header -- the contract used by
     * `Magento_ReCaptchaWebapiRest` to validate API calls when a
     * storefront key check is enabled (e.g. checkout, login).
     */
    recaptchaToken?: string;
    /**
     * Give up after this many milliseconds and reject with
     * `RequestTimeoutError`. Unset: the default of the request's kind.
     */
    timeoutMs?: number;
    /** Repeating the request leaves the quote as one send would: it may be retried by itself. */
    idempotent?: boolean;
}

export interface ClientConfig {
    /** `https://shop.example` -- no trailing slash. */
    baseUrl: string;
    storeCode: string;
    /** Form-key reader for storefront (non-REST) callers. */
    readFormKey: () => string;
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

function buildHeaders(options: ApiFetchOptions, isMutation: boolean): Headers {
    const headers = new Headers(options.headers);

    if (isMutation) {
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }
    }
    headers.set('Accept', 'application/json');

    // Magento only honors the session cookie on web API calls that declare
    // themselves as AJAX (Magento\Webapi\Model\Plugin\Authorization\
    // CustomerSessionUserContext); without it every `carts/mine` call of a
    // customer who signed in on the storefront answers 401.
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (options.recaptchaToken) {
        headers.set('X-ReCaptcha', options.recaptchaToken);
    }

    return headers;
}

/** A parsed body: the JSON value (`undefined` for an empty body) or `NON_JSON_BODY`. */
type ParsedBody = unknown;

/**
 * The body as JSON when it is JSON, the `NON_JSON_BODY` marker otherwise:
 * a text that does not parse, or an error answer whose `Content-Type` names
 * another format (a proxy's plain "503" would parse as a number).
 */
async function parseResponseBody(res: Response): Promise<ParsedBody> {
    const text = await res.text();
    if (text.length === 0) {
        return undefined;
    }
    const contentType = res.headers.get('Content-Type');
    const declaresOtherFormat = !res.ok && contentType !== null && !/json/i.test(contentType);
    if (!declaresOtherFormat) {
        try {
            return JSON.parse(text) as unknown;
        } catch {
            // Falls through to the marker.
        }
    }
    if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console -- developer builds only, below the default console level
        console.debug(`[hyperion-checkout] HTTP ${res.status} with a body that is not JSON:`, text.slice(0, 200));
    }
    return NON_JSON_BODY;
}

/**
 * The value of an answer, or the error it stands for. A body that is not
 * JSON (a proxy's error page, a firewall's challenge) is never data and
 * never a message: the error is built from the status alone.
 */
function unwrapResponse<T>(res: Response, body: ParsedBody): T {
    if (body === NON_JSON_BODY || !res.ok) {
        throw normalizeMagentoError(res.status, body, parseRetryAfter(res.headers.get('Retry-After')));
    }
    return body as T;
}

interface TimedSignal {
    signal: AbortSignal;
    /** True once the time limit, not the caller, ended the request. */
    timedOut: () => boolean;
    dispose: () => void;
}

interface CombinedSignal {
    signal: AbortSignal;
    dispose: () => void;
}

/**
 * One signal that fires when either of two does, with the reason of the
 * first: `AbortSignal.any()` where the browser has it, a controller that
 * forwards both otherwise.
 */
function combineSignals(first: AbortSignal, second: AbortSignal): CombinedSignal {
    const any = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
    if (typeof any === 'function') {
        return { signal: any.call(AbortSignal, [first, second]), dispose: () => undefined };
    }
    const controller = new AbortController();
    const sources = [first, second];
    const listeners = sources.map((source) => (): void => controller.abort(source.reason));
    const dispose = (): void => sources.forEach((source, i) => source.removeEventListener('abort', listeners[i]!));
    const fired = sources.find((source) => source.aborted);
    if (fired) {
        controller.abort(fired.reason);
    } else {
        sources.forEach((source, i) => source.addEventListener('abort', listeners[i]!, { once: true }));
    }
    return { signal: controller.signal, dispose };
}

/**
 * The signal a request runs under: the caller's own, cut short after
 * `timeoutMs` with a `TimeoutError`, the reason `AbortSignal.timeout()`
 * gives. The timer is the client's own so that an answer disarms it; the
 * limit covers the body read too, so it stays armed until `dispose()`.
 */
function withTimeout(callerSignal: AbortSignal | undefined, timeoutMs: number): TimedSignal {
    const limit = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        limit.abort(new DOMException('The request timed out.', 'TimeoutError'));
    }, timeoutMs);
    const combined = callerSignal
        ? combineSignals(callerSignal, limit.signal)
        : { signal: limit.signal, dispose: (): void => undefined };
    return {
        signal: combined.signal,
        timedOut: () => timedOut,
        dispose: () => {
            clearTimeout(timer);
            combined.dispose();
        },
    };
}

function isTimeoutError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'TimeoutError';
}

/**
 * One exchange under a time limit, body read included. A failure to get an
 * answer is a `NetworkError` (`RequestTimeoutError` at the limit); the
 * caller's own cancellation is rethrown as it is.
 */
async function exchange(
    cfg: ClientConfig,
    url: string,
    init: RequestInit,
    callerSignal: AbortSignal | undefined,
    timeoutMs: number
): Promise<{ res: Response; body: ParsedBody }> {
    const timed = withTimeout(callerSignal, timeoutMs);
    try {
        const fetchImpl = cfg.fetch ?? globalThis.fetch.bind(globalThis);
        const res = await fetchImpl(url, { ...init, signal: timed.signal });
        return { res, body: await parseResponseBody(res) };
    } catch (err) {
        // The time limit is not a cancellation by the caller: it is
        // reported as a transport failure of its own kind.
        if (timed.timedOut() || isTimeoutError(err)) throw new RequestTimeoutError(err);
        if (isAbortError(err)) throw err;
        throw new NetworkError(err);
    } finally {
        timed.dispose();
    }
}

/** POST routes that only read: the estimates and the email lookup. */
const READ_ROUTE = /(^|\/)(estimate-shipping-methods(-by-address-id)?|totals-information|customers\/isEmailAvailable)\/?$/;

function defaultTimeoutMs(path: string, method: string): number {
    if (isOrderPost({ path, method })) return ORDER_TIMEOUT_MS;
    if (method === 'GET' || READ_ROUTE.test(path.split('?')[0] ?? '')) return READ_TIMEOUT_MS;
    return WRITE_TIMEOUT_MS;
}

async function fetchOnce<T>(
    path: string,
    options: ApiFetchOptions,
    cfg: ClientConfig
): Promise<T> {
    const method = options.method ?? 'GET';
    const init: RequestInit = {
        method,
        headers: buildHeaders(options, method !== 'GET'),
        credentials: 'same-origin',
    };
    if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
    }
    const { res, body } = await exchange(
        cfg,
        buildUrl(path, cfg),
        init,
        options.signal,
        options.timeoutMs ?? defaultTimeoutMs(path, method)
    );
    return unwrapResponse<T>(res, body);
}

/** What a request is to the retry policy. */
export type RequestClass = 'read' | 'idempotent-write' | 'write';

/**
 * The waits before each automatic retry, by the class of the failure and
 * by the class of the request; no entry means the failure is reported at
 * once. `unavailable` applies to 502, 503 and 504 only. A request is not
 * repeated while the browser is offline or after a rate limit: the first
 * waits for the connection, the second for the caller, which knows
 * whether a shopper is watching.
 */
export const RETRY_DELAYS_MS: Readonly<Partial<Record<CheckoutErrorKind, Readonly<Partial<Record<RequestClass, readonly number[]>>>>>> = {
    network: { read: [1000, 3000], 'idempotent-write': [1000] },
    timeout: { read: [1000, 3000], 'idempotent-write': [1000] },
    unavailable: { read: [2000] },
};

const RETRIED_GATEWAY_STATUSES: readonly number[] = [502, 503, 504];

function requestClass(path: string, method: string, options: ApiFetchOptions): RequestClass {
    if (isOrderPost({ path, method })) return 'write';
    if (method === 'GET') return 'read';
    return options.idempotent === true || options.retry === true ? 'idempotent-write' : 'write';
}

function retryDelays(err: unknown, kind: CheckoutErrorKind, cls: RequestClass): readonly number[] {
    if (kind === 'unavailable' && !(err instanceof MagentoApiError && RETRIED_GATEWAY_STATUSES.includes(err.httpStatus))) {
        return [];
    }
    return RETRY_DELAYS_MS[kind]?.[cls] ?? [];
}

/** Resolves after `ms`; rejects with the signal's reason when it fires first. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason as Error);
            return;
        }
        const onAbort = (): void => {
            clearTimeout(timer);
            reject(signal?.reason as Error);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

export async function apiFetch<T>(
    path: string,
    options: ApiFetchOptions = {}
): Promise<T> {
    const cfg = assertConfigured();
    const method = options.method ?? 'GET';
    const cls = requestClass(path, method, options);

    for (let attempt = 0; ; attempt += 1) {
        try {
            return await fetchOnce<T>(path, options, cfg);
        } catch (err) {
            if (isAbortError(err)) throw err;
            const kind = classifyError(err, { path, method }).kind;
            if (err instanceof MagentoApiError) err.kind = kind;
            const delay = options.retry === false ? undefined : retryDelays(err, kind, cls)[attempt];
            if (delay === undefined) throw err;
            await wait(delay, options.signal);
        }
    }
}

export interface StorefrontPostOptions {
    /** `GET` reads the controller without a body; `POST` by default. */
    method?: 'GET' | 'POST';
    /** Cancels the request. */
    signal?: AbortSignal;
    /** Time limit; `WRITE_TIMEOUT_MS` when unset. */
    timeoutMs?: number;
    /** Additional headers. */
    headers?: Readonly<Record<string, string>>;
}

/**
 * POST a JSON body to a storefront controller (not a REST route) on the
 * configured base URL, with the headers Magento's AJAX controllers require
 * (`X-Requested-With`, so `isXmlHttpRequest()` holds and the CSRF validator
 * accepts the request). Cookies travel with it, which is the point: these
 * controllers act on the PHP session. Query parameters are appended when
 * given (reCAPTCHA observers read `getParam()`). Same time limit and same
 * errors as `apiFetch()`: non-2xx answers and bodies that are not JSON
 * become `MagentoApiError`, transport failures `NetworkError`. Never
 * retried. `options.method` `GET` reads the controller instead, without a
 * body and with the time limit of a read.
 */
export async function storefrontPostJson<T>(
    path: string,
    body: unknown,
    query?: Readonly<Record<string, string>>,
    options: StorefrontPostOptions = {}
): Promise<T> {
    const cfg = assertConfigured();
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}/${path.replace(/^\/+/, '')}`);
    for (const [key, value] of Object.entries(query ?? {})) {
        url.searchParams.set(key, value);
    }
    const method = options.method ?? 'POST';
    const headers = new Headers(options.headers);
    if (method === 'POST') headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');
    const init: RequestInit = { method, headers, credentials: 'same-origin' };
    if (method === 'POST') init.body = JSON.stringify(body);
    try {
        const limit = options.timeoutMs ?? (method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
        const answer = await exchange(cfg, url.toString(), init, options.signal, limit);
        return unwrapResponse<T>(answer.res, answer.body);
    } catch (err) {
        if (err instanceof MagentoApiError) err.kind = classifyError(err, { path, method }).kind;
        throw err;
    }
}

/**
 * GET a storefront controller on the configured base URL and read its JSON
 * answer: the read twin of `storefrontPostJson()`, with the same headers,
 * time limit and errors. Never retried.
 */
export function storefrontGetJson<T>(
    path: string,
    query?: Readonly<Record<string, string>>,
    options: StorefrontPostOptions = {}
): Promise<T> {
    return storefrontPostJson<T>(path, undefined, query, { ...options, method: 'GET' });
}

// Re-export the error types so callers only need one import.
export { isAbortError, MagentoApiError, NetworkError, RequestTimeoutError } from './errors.js';
