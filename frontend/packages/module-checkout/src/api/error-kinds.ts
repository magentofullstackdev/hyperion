// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The error taxonomy of the checkout.
 *
 * `classifyError()` is the only place that decides which class a failed
 * request belongs to (offline, timeout, expired session, quote gone, rate
 * limited, store unavailable, blocked, a known server refusal, a validation
 * message, ...). Each class has one translated message and one recovery;
 * `describeError()` gives the message for callers that only show text.
 *
 * Server refusals are recognized by their phrase. A web API error carries
 * the raw phrase and its parameters, so the match is on the English source
 * whatever the store's locale is. Two exceptions make it less than exact:
 * the order request rethrows a refusal with its message already rendered
 * (placeholders filled, in the locale of the store), and the quote
 * validator joins several messages with line breaks. A phrase is therefore
 * compiled to a pattern whose placeholders match anything, it is tried on
 * the raw phrase, on the rendered message and on each of their lines, and
 * `setPhraseTranslations()` adds the store's own wording of the phrases.
 * A pattern always covers a whole text or a whole line; the one refusal
 * core wraps in another text (`COUPON_REFUSAL_PREFIX`) is unwrapped by its
 * exact prefix.
 */
import type { CheckoutErrorKind } from '../types/errors.js';
import { t } from '../utils/i18n.js';
import { MagentoApiError, NetworkError } from './errors.js';

export type { CheckoutErrorKind };

export interface CheckoutError {
    kind: CheckoutErrorKind;
    /** Translated, or the server's own rendered message for the kinds that show it. */
    message: string;
    /** How long to wait before a retry (`rate-limited`). */
    retryAfterMs?: number;
    /** The HTTP status, when the request was answered. */
    httpStatus?: number;
    /** The server's phrase before its placeholders were rendered; what the phrase lists match. */
    rawMessage?: string;
    /** What was thrown. */
    cause?: unknown;
    /** For `order-unknown`: the class the failure has on any other request. */
    underlyingKind?: CheckoutErrorKind;
}

/** The request that failed: its REST path (no base URL, no store code) and its method. */
export interface ErrorContext {
    path: string;
    method: string;
}

/** `Magento\Quote\Model\CartMutex`: an order request for this cart is still running. */
export const CART_LOCKED_PHRASE = 'The cart is locked for processing. Please try again later.';

/** `Magento\Checkout\Model\ShippingInformationManagement` and the quote's shipping method validation rule. */
export const SHIPPING_METHOD_REJECTED_PHRASES: readonly string[] = [
    'Carrier with such method not found: %1, %2',
    'The shipping method is missing. Select the shipping method and try again.',
];

/**
 * What the stock checks of `Magento_CatalogInventory` and
 * `Magento_InventorySales` answer when a line cannot be bought as it is.
 */
export const STOCK_PHRASES: readonly string[] = [
    'Some of the products are out of stock.',
    'This product is out of stock.',
    'Product %name is out of stock.',
    'Please correct the quantity for some products.',
    'The requested qty. is not available',
    'Not enough items for sale',
    'Only %1 of %2 available',
    'The fewest you may purchase is %1.',
    'The requested qty exceeds the maximum qty allowed in shopping cart',
    'You cannot use decimal quantity for this product.',
    'You can buy %1 only in quantities of %2 at a time.',
    'You can buy this product only in quantities of %1 at a time.',
    'There are no source items with the in stock status',
    'The requested sku is not assigned to given stock',
    'The requested sku is not assigned to given stock.',
];

/**
 * The refusals of the image CAPTCHA: `Magento_Captcha`, the checkout's
 * payment rate limiter and the coupon code limiter of `Magento_SalesRule`.
 */
export const CAPTCHA_PHRASES: readonly string[] = [
    'Incorrect CAPTCHA',
    'Incorrect CAPTCHA.',
    'CAPTCHA is required.',
    'Please provide CAPTCHA code and try again',
    'Too many coupon code requests, please try again later.',
];

/**
 * What `Magento\Quote\Model\CouponManagement::set()` puts in front of the
 * reason a coupon code was refused for. Core joins the two before the text
 * becomes a phrase, so the answer has no placeholder and no parameter: the
 * prefix reads the same in every locale and the reason behind it is already
 * in the store's wording.
 */
export const COUPON_REFUSAL_PREFIX = 'The coupon code couldn\'t be applied: ';

/**
 * The 404 answers that mean the quote itself is gone: the first one when
 * its field is the cart or its customer. Other 404 answers of a cart route
 * (a coupon code that does not exist) are refusals of the value sent, with
 * the quote still there.
 */
const NO_SUCH_ENTITY_PHRASE = 'No such entity with %fieldName = %fieldValue';
const NO_ACTIVE_CART_PHRASE = 'Current customer does not have an active cart.';
export const QUOTE_GONE_PHRASES: readonly string[] = [NO_SUCH_ENTITY_PHRASE, NO_ACTIVE_CART_PHRASE];

/** The entity fields a missing quote is reported by. */
const QUOTE_ENTITY_FIELDS: readonly string[] = ['cartId', 'customerId'];

const DEFAULT_RETRY_AFTER_MS = 5000;
const MAX_RETRY_AFTER_MS = 60000;
const MIN_RETRY_AFTER_MS = 1000;

const NO_CONTEXT: ErrorContext = { path: '', method: '' };

let phraseTranslations: Readonly<Record<string, string>> = {};
const patternCache = new Map<string, RegExp>();

/**
 * The store's wording of the phrases above, keyed by the English phrase
 * (placeholders kept, as a translation catalog has them). With it a
 * refusal that reaches the browser already translated is still recognized.
 * `null` forgets the dictionary.
 */
export function setPhraseTranslations(dictionary: Readonly<Record<string, string>> | null): void {
    phraseTranslations = dictionary ?? {};
}

/** A phrase as a pattern for a whole text: each `%1` / `%name` placeholder matches anything. */
function phrasePattern(phrase: string): RegExp {
    let pattern = patternCache.get(phrase);
    if (!pattern) {
        const source = phrase
            .split(/%(?:\d+|[A-Za-z_]\w*)/)
            .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[\\s\\S]+?');
        pattern = new RegExp(`^${source}$`);
        patternCache.set(phrase, pattern);
    }
    return pattern;
}

/** True when `text`, or one of its lines, is one of `phrases` (raw, rendered or in the store's wording). */
export function matchesPhrase(text: string, phrases: readonly string[]): boolean {
    const whole = text.trim();
    if (whole === '') return false;
    const candidates = whole.includes('\n')
        ? [whole, ...whole.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')]
        : [whole];
    return phrases.some((phrase) => {
        const translated = phraseTranslations[phrase];
        const patterns = translated && translated !== phrase
            ? [phrasePattern(phrase), phrasePattern(translated)]
            : [phrasePattern(phrase)];
        return candidates.some((candidate) => patterns.some((pattern) => pattern.test(candidate)));
    });
}

/** True for a refusal of the image CAPTCHA, also when it arrives as plain text (the login controller). */
export function isCaptchaMessage(text: string): boolean {
    return matchesPhrase(text, CAPTCHA_PHRASES);
}

/**
 * The wait a `Retry-After` header asks for, in milliseconds: a number of
 * seconds or an HTTP date, never under one second and never over a minute.
 * `undefined` when the header is missing or says neither.
 */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
    const text = value?.trim() ?? '';
    if (text === '') return undefined;
    let ms: number;
    if (/^\d+(\.\d+)?$/.test(text)) {
        ms = Number(text) * 1000;
    } else {
        const at = Date.parse(text);
        if (Number.isNaN(at)) return undefined;
        ms = at - now;
    }
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(MIN_RETRY_AFTER_MS, Math.ceil(ms)));
}

function cleanPath(path: string): string {
    return (path.split('?')[0] ?? '').replace(/^\/+|\/+$/g, '');
}

/** True for a route under the shopper's quote (`guest-carts/<id>/...`, `carts/mine/...`). */
export function isCartPath(path: string): boolean {
    return /^(guest-carts\/[^/]+|carts\/mine)(\/|$)/.test(cleanPath(path));
}

/** True for the request that places the order. Saving the payment method alone is another route. */
export function isOrderPost(ctx: ErrorContext): boolean {
    return ctx.method.toUpperCase() === 'POST'
        && /^(guest-carts\/[^/]+|carts\/mine)\/payment-information$/.test(cleanPath(ctx.path));
}

/** The texts of an answer a phrase can sit in: the raw phrase, the rendered message, the nested messages, the arguments. */
function textsOf(err: MagentoApiError): string[] {
    return [err.rawMessage, err.message, ...err.errors, ...Object.values(err.parameters)];
}

/** The reason behind the coupon refusal prefix; null when the answer does not start with it. */
function couponRefusalReason(err: MagentoApiError): string | null {
    const text = [err.message, err.rawMessage].find((candidate) => candidate.startsWith(COUPON_REFUSAL_PREFIX));
    return text === undefined ? null : text.slice(COUPON_REFUSAL_PREFIX.length).trim();
}

function saysQuoteIsGone(err: MagentoApiError): boolean {
    if (matchesPhrase(err.rawMessage, [NO_ACTIVE_CART_PHRASE])
        || matchesPhrase(err.message, [NO_ACTIVE_CART_PHRASE])) {
        return true;
    }
    const field = err.parameters.fieldName;
    if (field !== undefined) {
        return QUOTE_ENTITY_FIELDS.includes(field)
            && matchesPhrase(err.rawMessage, [NO_SUCH_ENTITY_PHRASE]);
    }
    return QUOTE_ENTITY_FIELDS.some((name) => err.message.startsWith(`No such entity with ${name} = `));
}

function classifyAnswer(err: MagentoApiError, ctx: ErrorContext): CheckoutError {
    const base = { httpStatus: err.httpStatus, rawMessage: err.rawMessage, cause: err };
    const status = err.httpStatus;

    if (status === 401) {
        return { ...base, kind: 'session-expired', message: t('Hyperion_Checkout::error_session_expired') };
    }
    // Some platform versions answer a refused CAPTCHA word with the status of
    // the rate limiter: the phrase tells it apart, and the field resolves it.
    if (status === 429 && !err.nonJsonBody && textsOf(err).some((text) => matchesPhrase(text, CAPTCHA_PHRASES))) {
        return { ...base, kind: 'captcha', message: err.message };
    }
    if (status === 429) {
        const asked = err.retryAfterMs;
        return {
            ...base,
            kind: 'rate-limited',
            retryAfterMs: asked ?? DEFAULT_RETRY_AFTER_MS,
            message: asked === undefined
                ? t('Hyperion_Checkout::error_too_many_requests')
                : t('Hyperion_Checkout::error_rate_limited', { seconds: Math.ceil(asked / 1000) }),
        };
    }
    const hasServerMessage = err.rawMessage.trim() !== '' || err.errors.length > 0;
    // A firewall refuses with a page, or with nothing at all.
    if (status === 403 && (err.nonJsonBody || !hasServerMessage)) {
        return { ...base, kind: 'blocked', message: t('Hyperion_Checkout::error_request_blocked') };
    }
    if (err.nonJsonBody) {
        if (status >= 200 && status < 300) {
            return { ...base, kind: 'unexpected', message: t('Hyperion_Checkout::unexpected_error') };
        }
        return { ...base, kind: 'unavailable', message: t('Hyperion_Checkout::error_store_unavailable') };
    }

    const texts = textsOf(err);
    const says = (phrases: readonly string[]): boolean => texts.some((text) => matchesPhrase(text, phrases));
    if (says([CART_LOCKED_PHRASE])) return { ...base, kind: 'cart-locked', message: err.message };
    if (says(SHIPPING_METHOD_REJECTED_PHRASES)) return { ...base, kind: 'shipping-method-rejected', message: err.message };
    if (says(STOCK_PHRASES)) return { ...base, kind: 'stock', message: err.message };
    if (says(CAPTCHA_PHRASES)) return { ...base, kind: 'captcha', message: err.message };
    // The coupon limiter's refusal of a CAPTCHA answer arrives behind the
    // coupon prefix: the reason alone is the message of the CAPTCHA field.
    const couponReason = couponRefusalReason(err);
    if (couponReason !== null && isCaptchaMessage(couponReason)) {
        return { ...base, kind: 'captcha', message: couponReason };
    }

    if (status >= 500) {
        return { ...base, kind: 'unavailable', message: t('Hyperion_Checkout::error_store_unavailable') };
    }
    if (status === 404 && saysQuoteIsGone(err) && (isCartPath(ctx.path) || ctx.path === '')) {
        return { ...base, kind: 'quote-gone', message: t('Hyperion_Checkout::error_quote_gone') };
    }
    // Another entity is missing: the phrase names a field of the data model, not something a shopper can act on.
    if (texts.some((text) => text.startsWith('No such entity with '))) {
        return { ...base, kind: 'unexpected', message: t('Hyperion_Checkout::unexpected_error') };
    }
    if (status >= 400 && hasServerMessage) {
        return { ...base, kind: 'validation', message: err.message };
    }
    return { ...base, kind: 'unexpected', message: t('Hyperion_Checkout::unexpected_error') };
}

const TRANSPORT_MESSAGE_KEYS = {
    offline: 'Hyperion_Checkout::error_offline',
    network: 'Hyperion_Checkout::error_network',
    timeout: 'Hyperion_Checkout::error_timeout',
} as const;

function classifyAnyRequest(err: unknown, ctx: ErrorContext): CheckoutError {
    if (err instanceof MagentoApiError) return classifyAnswer(err, ctx);
    if (err instanceof NetworkError) {
        return { kind: err.kind, message: t(TRANSPORT_MESSAGE_KEYS[err.kind]), cause: err };
    }
    // A `DOMException` is not an `Error` in every environment: go by the name.
    if (typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'TimeoutError') {
        return { kind: 'timeout', message: t(TRANSPORT_MESSAGE_KEYS.timeout), cause: err };
    }
    // A plain `Error` is thrown on purpose, with a text written for the
    // shopper (a payment form that is not ready). Every other error class
    // is a fault whose text says nothing to them.
    if (err instanceof Error && err.name === 'Error' && err.message.trim() !== '') {
        return { kind: 'unexpected', message: err.message, cause: err };
    }
    return { kind: 'unexpected', message: t('Hyperion_Checkout::unexpected_error'), cause: err };
}

const ORDER_UNKNOWN_KINDS: readonly CheckoutErrorKind[] = ['offline', 'network', 'timeout', 'unavailable'];

/**
 * The class, message and recovery data of whatever a request threw. An
 * order request that got no usable answer is `order-unknown`: the server
 * may have placed the order. A canceled request (`isAbortError()`) is not
 * a failure; callers drop it before they ask.
 */
export function classifyError(err: unknown, ctx: ErrorContext): CheckoutError {
    const classified = classifyAnyRequest(err, ctx);
    if (isOrderPost(ctx) && ORDER_UNKNOWN_KINDS.includes(classified.kind)) {
        return {
            ...classified,
            kind: 'order-unknown',
            underlyingKind: classified.kind,
            message: t('Hyperion_Checkout::order_outcome_unknown'),
        };
    }
    return classified;
}

/**
 * The message to show for whatever a request threw. Without `ctx` an
 * order whose outcome is unknown is not told apart from any other request
 * that got no answer.
 */
export function describeError(err: unknown, ctx: ErrorContext = NO_CONTEXT): string {
    return classifyError(err, ctx).message;
}
