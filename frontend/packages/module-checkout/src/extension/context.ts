// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The context objects handed to extension elements (`CheckoutContext`,
 * `PaymentContext`, `ShippingContext` of `extension-api.d.ts`).
 *
 * A thin facade over modules the checkout already runs on: `rest()` is the
 * REST client (`api/client.ts`) on `/rest/<store>/V1/`, with the session
 * of the page; `storefront()` the storefront JSON calls with
 * `X-Requested-With` (GET without a body, or POST with a JSON body and the
 * form key); `t()` the phrases of the entry, then the
 * checkout's catalog; `formatPrice()` the store's price formats;
 * `sanitizeHtml()` the shared sanitizer; `loadScript()` the one script
 * loader. Every URL is built on `hyperion.baseUrl`. A failure of `rest()`
 * or `storefront()` rejects with the public `CheckoutError`
 * (`toPublicError()`): never a raw body, never a status text.
 *
 * Create one context per element and keep it: the host assigns it once,
 * before the element is connected.
 *
 * The payment context also places the order and saves the payment: those
 * belong to the order pipeline, which hands its implementation in
 * (`PaymentPipeline`).
 */
import type {
    CheckoutContext,
    CheckoutError,
    CheckoutSnapshot,
    PaymentContext,
    PaymentData,
    PlaceOrderOutcome,
    RequestInit as ExtensionRequestInit,
    ShippingContext,
    StorefrontInit,
    Unsubscribe,
} from '../../extension-api.js';
import { apiFetch, isAbortError, MagentoApiError, storefrontGetJson, storefrontPostJson } from '../api/client.js';
import { classifyError, type CheckoutError as InternalCheckoutError } from '../api/error-kinds.js';
import { getCheckoutConfig, peekCheckoutConfig } from '../bootstrap-config.js';
import { getStore } from '../store/index.js';
import { initFlowSelectors } from '../store/flow-selectors.js';
import { deriveBaseUrl } from '../utils/base-url.js';
import { formatMoney } from '../utils/currency.js';
import { readFormKeyCookie } from '../utils/form-key.js';
import enUS from '../i18n/en_US.json' with { type: 'json' };
import { serverTranslation, t } from '../utils/i18n.js';
import { sanitiseHtml } from '../utils/sanitize-html.js';
import { loadScript, readCspNonce } from './load-script.js';
import { extensionApiVersion } from './loader.js';
import { publicError, publicErrorKind } from './public-error.js';
import { createSnapshotSource, type SnapshotSource } from './snapshot.js';

export type { InternalCheckoutError };

/**
 * What the order pipeline implements for the payment context. Each method
 * keeps the meaning of its `PaymentContext` twin.
 */
export interface PaymentPipeline {
    requestCheckoutValidation(): Promise<boolean>;
    placeOrder(data: PaymentData): Promise<PlaceOrderOutcome>;
    savePaymentInformation(data: PaymentData): Promise<boolean>;
    refreshTotals(): Promise<void>;
    setError(message: string | null): void;
}

/** What a context is created for: the entry's own phrases. */
export interface ContextEntry {
    readonly phrases?: Readonly<Record<string, string>> | null;
}

let source: SnapshotSource | null = null;
let sourceStore: unknown = null;

/** The snapshot source of the running checkout, created on first use (and again for another store). */
export function checkoutSnapshots(): SnapshotSource {
    const store = getStore();
    if (source === null || sourceStore !== store) {
        source = createSnapshotSource(store, initFlowSelectors());
        sourceStore = store;
    }
    return source;
}

export function resetCheckoutContextForTests(): void {
    source = null;
    tokens = null;
}

/**
 * The public error for whatever a request of an extension threw: the
 * checkout's taxonomy (`classifyError()`) mapped to the eight public kinds,
 * with the taxonomy's translated message. A cancellation is `aborted`.
 */
export function toPublicError(err: unknown, ctx: { path: string; method: string } = { path: '', method: '' }): CheckoutError {
    if (isAbortError(err)) return publicError('aborted', t('Hyperion_Checkout::unexpected_error'), null, err);
    const failure: InternalCheckoutError = classifyError(err, ctx);
    return publicError(publicErrorKind(failure.kind), failure.message, failure.httpStatus ?? null, err);
}

/** The English source string to its key in the checkout's English catalog, built on first use. */
let keysBySource: Map<string, string> | null = null;

/**
 * Translate an English source string, the way extensions name their
 * phrases (Magento's own convention): the entry's own `phrases` (already
 * rendered through `__()` on the server), then the server's dictionary,
 * then the checkout's catalog for a string the checkout itself ships; the
 * source string when none has it. `{placeholder}` interpolation as in `t()`.
 */
export function translateSource(
    source: string,
    params?: Readonly<Record<string, string | number>>,
    phrases?: Readonly<Record<string, string>> | null
): string {
    let template = phrases?.[source] || serverTranslation(source);
    if (template === undefined) {
        if (keysBySource === null) {
            keysBySource = new Map();
            for (const [key, value] of Object.entries(enUS as Record<string, string>)) {
                if (!keysBySource.has(value)) keysBySource.set(value, key);
            }
        }
        const key = keysBySource.get(source);
        template = key === undefined ? source : t(key);
    }
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name];
        return value === undefined ? match : String(value);
    });
}

function relativePath(path: string): string {
    if (typeof path !== 'string' || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//') || path.split(/[/?#]/).includes('..')) {
        throw publicError('validation', t('Hyperion_Checkout::unexpected_error'), null);
    }
    return path.replace(/^\/+/, '');
}

function guestCartId(): string {
    return getStore().maskedQuoteId.get() ?? '';
}

function cartPath(suffix?: string): string {
    const store = getStore();
    const base = store.isGuest.get() ? `guest-carts/${encodeURIComponent(guestCartId())}` : 'carts/mine';
    const tail = (suffix ?? '').replace(/^\/+/, '');
    return tail === '' ? base : `${base}/${tail}`;
}

async function rest<T>(path: string, init: ExtensionRequestInit = {}): Promise<T> {
    const method = init.method ?? 'GET';
    let clean: string;
    try {
        clean = relativePath(path);
    } catch (err) {
        return Promise.reject(err as CheckoutError);
    }
    try {
        return await apiFetch<T>(clean, {
            method,
            ...(init.body !== undefined ? { body: init.body } : {}),
            ...(init.signal ? { signal: init.signal } : {}),
        });
    } catch (err) {
        throw toPublicError(err, { path: clean, method });
    }
}

/**
 * A JSON controller of the storefront, the same contract as the express
 * context of the theme: GET (the default) without a body, or a POST for any
 * other method value, with the JSON body (`{}` when none) and the form key
 * as the `form_key` query parameter. An empty answer resolves with null. A
 * non-2xx answer rejects with the kind and the status the taxonomy gives it
 * and a generic message: the controller's own text is never shown.
 */
async function storefront<T>(path: string, init: StorefrontInit = {}): Promise<T> {
    const method = String(init.method ?? 'GET').toUpperCase() === 'GET' ? 'GET' : 'POST';
    let clean: string;
    try {
        clean = relativePath(path);
    } catch (err) {
        return Promise.reject(err as CheckoutError);
    }
    const options = init.signal ? { signal: init.signal } : {};
    const formKey = readFormKeyCookie();
    try {
        const answer = method === 'GET'
            ? await storefrontGetJson<T>(clean, {}, options)
            : await storefrontPostJson<T>(clean, init.body ?? {}, formKey === '' ? {} : { form_key: formKey }, options);
        return (answer ?? null) as T;
    } catch (err) {
        const error = toPublicError(err, { path: clean, method });
        throw err instanceof MagentoApiError
            ? publicError(error.kind, t('Hyperion_Checkout::unexpected_error'), error.status, err)
            : error;
    }
}

function formatPrice(amount: number, kind: 'display' | 'base' = 'display'): string {
    const config = getCheckoutConfig();
    const format = kind === 'base' ? (config.basePriceFormat ?? config.priceFormat) : config.priceFormat;
    return formatMoney(amount, format);
}

let tokens: Readonly<Record<string, string>> | null = null;

/**
 * The literal colors and font of the checkout, for content the page's CSS
 * cannot reach (hosted field iframes): resolved once, from the mounted
 * application and two hidden probes styled by the stylesheet.
 */
function designTokens(): Readonly<Record<string, string>> {
    if (tokens !== null) return tokens;
    const host = document.querySelector('checkout-app') ?? document.body;
    const own = getComputedStyle(host);
    const probe = (className: string, fallback: string): string => {
        const el = document.createElement('span');
        el.className = `hidden ${className}`;
        host.appendChild(el);
        const color = getComputedStyle(el).color;
        el.remove();
        return color || fallback;
    };
    tokens = Object.freeze({
        color: own.color || '#1f2937',
        colorMuted: probe('text-muted', '#6b7280'),
        colorDanger: probe('text-danger', '#dc2626'),
        fontFamily: own.fontFamily || 'system-ui, sans-serif',
        fontSize: '16px',
    });
    return tokens;
}

function absoluteOnBase(base: string, configured: unknown, fallbackPath: string): string {
    if (typeof configured === 'string' && configured !== '') {
        try {
            const url = new URL(configured, `${base}/`);
            if (url.origin === new URL(`${base}/`).origin) return url.href;
        } catch {
            // falls back to the path on the base URL
        }
    }
    return `${base}/${fallbackPath}`;
}

function urls(): CheckoutContext['urls'] {
    const config = peekCheckoutConfig();
    const base = config === null
        ? window.location.origin
        : deriveBaseUrl(config, window.location.origin);
    return Object.freeze({
        base: `${base}/`,
        cart: absoluteOnBase(base, config?.hyperion?.cartUrl || config?.cartUrl, 'checkout/cart/'),
        checkout: absoluteOnBase(base, config?.checkoutUrl, 'checkout/'),
        success: absoluteOnBase(base, config?.defaultSuccessPageUrl, 'checkout/onepage/success/'),
    });
}

/** A context for an element of the checkout (a slot element, a module of the generic pool). */
export function createCheckoutContext(entry: ContextEntry = {}): CheckoutContext {
    const phrases = entry.phrases ?? null;
    const snapshots = checkoutSnapshots();
    const context: CheckoutContext = {
        apiVersion: extensionApiVersion(),
        snapshot: (): CheckoutSnapshot => snapshots.snapshot(),
        subscribe: (listener: (snapshot: CheckoutSnapshot) => void): Unsubscribe => snapshots.subscribe(listener),
        rest,
        cartPath,
        storefront,
        t: (text, params) => translateSource(text, params, phrases),
        formatPrice,
        sanitizeHtml: (html: string): string => sanitiseHtml(String(html ?? '')),
        loadScript,
        get cspNonce(): string | null {
            return readCspNonce();
        },
        get designTokens(): Readonly<Record<string, string>> {
            return designTokens();
        },
        get urls(): CheckoutContext['urls'] {
            return urls();
        },
    };
    return Object.freeze(context);
}

/** A context for a payment element; the order and the payment go through `pipeline`. */
export function createPaymentContext(entry: ContextEntry, pipeline: PaymentPipeline): PaymentContext {
    const base = createCheckoutContext(entry);
    return Object.freeze(Object.defineProperties(Object.create(null) as PaymentContext, {
        ...Object.getOwnPropertyDescriptors(base),
        requestCheckoutValidation: { value: (): Promise<boolean> => pipeline.requestCheckoutValidation(), enumerable: true },
        placeOrder: { value: (data: PaymentData): Promise<PlaceOrderOutcome> => pipeline.placeOrder(data), enumerable: true },
        savePaymentInformation: { value: (data: PaymentData): Promise<boolean> => pipeline.savePaymentInformation(data), enumerable: true },
        refreshTotals: { value: (): Promise<void> => pipeline.refreshTotals(), enumerable: true },
        setError: { value: (message: string | null): void => pipeline.setError(message), enumerable: true },
    }));
}

/** A context for a shipping extension element. */
export function createShippingContext(entry: ContextEntry & { readonly id: string }): ShippingContext {
    const base = createCheckoutContext(entry);
    return Object.freeze(Object.defineProperties(Object.create(null) as ShippingContext, {
        ...Object.getOwnPropertyDescriptors(base),
        extensionId: { value: entry.id, enumerable: true },
    }));
}
