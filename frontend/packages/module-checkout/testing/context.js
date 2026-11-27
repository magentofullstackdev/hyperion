// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * Snapshots and mock contexts for unit tests of checkout extensions.
 *
 * Built only on the public contracts of `extension-api.d.ts`: nothing here
 * reads the checkout's store, its REST client or its stylesheet, so a test
 * written against these mocks runs the same in this repository and in a
 * project that installed the published package.
 *
 * Every mock records what the element asked for (`calls`; a `storefront()`
 * call as the request the checkout sends: GET without a body, or POST with
 * the body, `{}` when none) and answers what the test programmed
 * (`answerRest()`, `answerStorefront()`, the spies).
 */

/** @typedef {import('../extension-api.js').CheckoutSnapshot} CheckoutSnapshot */
/** @typedef {import('../extension-api.js').CheckoutContext} CheckoutContext */
/** @typedef {import('../extension-api.js').PaymentContext} PaymentContext */
/** @typedef {import('../extension-api.js').ShippingContext} ShippingContext */
/** @typedef {import('../extension-api.js').ExpressContext} ExpressContext */
/** @typedef {import('../extension-api.js').CheckoutError} CheckoutError */
/** @typedef {import('../extension-api.js').RequestInit} RequestInit */
/** @typedef {import('../extension-api.js').StorefrontInit} StorefrontInit */
/** @typedef {import('../extension-api.js').MoneyTotals} MoneyTotals */
/** @typedef {import('../extension-api.js').CartSummary} CartSummary */

/** The version of the public extension contracts this kit mirrors. */
export const API_VERSION = '1.0-beta';

/** The major an element declares in `static hyperionApi`. */
export const API_MAJOR = '1';

/** Base URL of every mock context: a reserved example host. */
export const MOCK_BASE_URL = 'https://shop.example/';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) {
            deepFreeze(/** @type {Record<string, unknown>} */ (value)[key]);
        }
    }
    return value;
}

/**
 * Plain objects merge key by key; arrays, null and every other value
 * replace what they override.
 *
 * @param {unknown} base
 * @param {unknown} override
 * @returns {unknown}
 */
function merge(base, override) {
    if (override === undefined) return clone(base);
    if (!isPlainObject(base) || !isPlainObject(override)) return clone(override);
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(override)])) {
        out[key] = merge(base[key], override[key]);
    }
    return out;
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isPlainObject(value)) {
        /** @type {Record<string, unknown>} */
        const out = {};
        for (const key of Object.keys(value)) out[key] = clone(value[key]);
        return out;
    }
    return value;
}

/**
 * @param {string} currency
 * @param {number} grandTotal
 * @param {number} shipping
 * @returns {MoneyTotals}
 */
function money(currency, grandTotal, shipping) {
    return { currency, grandTotal, subtotal: grandTotal - shipping, shipping, tax: 0, discount: 0 };
}

/** @returns {CheckoutSnapshot} */
function defaultSnapshot() {
    const address = {
        firstname: 'Veronica',
        lastname: 'Costello',
        street: ['6146 Honey Bluff Parkway'],
        city: 'Calder',
        postcode: '49628-7978',
        country_id: 'US',
        region: 'Michigan',
        region_code: 'MI',
        region_id: 33,
        telephone: '(555) 229-3326',
    };
    return {
        isGuest: true,
        isVirtual: false,
        email: 'shopper@example.com',
        cartId: 'mockMaskedCartId0123456789abcdef',
        customerId: null,
        storeCode: 'default',
        locale: 'en_US',
        currency: { display: 'USD', base: 'USD', rate: 1 },
        shippingAddress: address,
        billingAddress: address,
        shippingMethod: {
            carrier_code: 'flatrate',
            method_code: 'flatrate',
            carrier_title: 'Flat Rate',
            method_title: 'Fixed',
            amount: 5,
            base_amount: 5,
        },
        paymentMethod: null,
        items: [{
            item_id: 1,
            sku: 'MH01-S-Black',
            name: 'Chaz Kangeroo Hoodie',
            qty: 1,
            product_type: 'configurable',
            price: 52,
            row_total: 52,
            base_price: 52,
            base_row_total: 52,
        }],
        totals: {
            display: money('USD', 57, 5),
            base: money('USD', 57, 5),
            segments: [
                { code: 'subtotal', title: 'Subtotal', value: 52 },
                { code: 'shipping', title: 'Shipping & Handling', value: 5 },
                { code: 'grand_total', title: 'Grand Total', value: 57 },
            ],
        },
        agreementsAccepted: true,
        isSettling: false,
        isPlacingOrder: false,
        blocker: null,
    };
}

/**
 * A frozen `CheckoutSnapshot`: a guest with a US address, one item and flat
 * rate shipping, merged with `overrides` (plain objects merge key by key).
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {CheckoutSnapshot}
 */
export function createSnapshot(overrides = {}) {
    return deepFreeze(/** @type {CheckoutSnapshot} */ (merge(defaultSnapshot(), overrides)));
}

/**
 * A recording function: every call is pushed to `calls` (its argument
 * list) and answered by the current implementation.
 *
 * @template {(...args: any[]) => any} F
 * @param {F} implementation
 */
export function createSpy(implementation) {
    let current = implementation;
    /** @type {unknown[][]} */
    const calls = [];
    /** @param {...any} args */
    const call = function (...args) {
        calls.push(args);
        return current(...args);
    };
    const spy = Object.assign(call, {
        calls,
        /** @param {F} next */
        implement(next) {
            current = next;
        },
        reset() {
            calls.length = 0;
        },
    });
    Object.defineProperty(spy, 'implementation', { get: () => current, enumerable: true });
    return /** @type {typeof spy & { readonly implementation: F }} */ (spy);
}

/**
 * A public `CheckoutError` built like the checkout's own.
 *
 * @param {CheckoutError['kind']} kind
 * @param {string} message
 * @param {number | null} [status]
 * @returns {CheckoutError}
 */
export function createCheckoutError(kind, message, status = null) {
    const error = /** @type {Error & { kind: CheckoutError['kind']; status: number | null }} */ (new Error(message));
    error.name = 'CheckoutError';
    error.kind = kind;
    error.status = status;
    return error;
}

/**
 * @param {string} path
 * @param {RequestInit | StorefrontInit | undefined} init
 * @param {unknown} matcher
 */
function matches(path, init, matcher) {
    if (typeof matcher === 'string') return matcher === path;
    if (matcher instanceof RegExp) return matcher.test(path);
    if (typeof matcher === 'function') return Boolean(matcher(path, init));
    return false;
}

/**
 * A `storefront()` request as the checkout sends it: `{ method: 'GET' }`
 * without a body, or `{ method: 'POST', body }` with `{}` for a missing body
 * (any method value other than GET is a POST); `signal` when given.
 *
 * @param {StorefrontInit | RequestInit} init
 * @returns {StorefrontInit}
 */
function storefrontRequest(init) {
    const post = String(init.method ?? 'GET').toUpperCase() !== 'GET';
    return {
        method: post ? 'POST' : 'GET',
        ...(post ? { body: init.body ?? {} } : {}),
        ...(init.signal ? { signal: init.signal } : {}),
    };
}

/**
 * The programmable transport of `rest()` or `storefront()`. An answer may
 * be a value, an `Error` (the call rejects with it) or a function of
 * `(path, init)`; the newest matching answer wins; an unanswered call
 * rejects with kind `not-found`. `normalize` turns the caller's options
 * into the request that is recorded and matched.
 *
 * @param {string} label
 * @param {(init: RequestInit) => RequestInit} [normalize]
 */
function createTransport(label, normalize = (init) => init) {
    /** @type {{ path: string; init: RequestInit }[]} */
    const calls = [];
    /** @type {{ matcher: unknown; answer: unknown }[]} */
    const answers = [];
    /**
     * @param {string} path
     * @param {RequestInit} [given]
     * @returns {Promise<any>}
     */
    async function call(path, given = {}) {
        const init = normalize(given);
        calls.push({ path, init });
        if (init.signal?.aborted) {
            throw createCheckoutError('aborted', 'The request was canceled.');
        }
        for (let i = answers.length - 1; i >= 0; i -= 1) {
            const entry = /** @type {{ matcher: unknown; answer: unknown }} */ (answers[i]);
            if (!matches(path, init, entry.matcher)) continue;
            const answer = typeof entry.answer === 'function' ? await entry.answer(path, init) : entry.answer;
            if (answer instanceof Error) throw answer;
            return clone(answer);
        }
        throw createCheckoutError('not-found', `No mock answer for ${label} ${path}`, 404);
    }
    return {
        call,
        calls,
        /**
         * @param {string | RegExp | ((path: string, init: RequestInit | undefined) => boolean)} matcher
         * @param {unknown} answer
         */
        answer(matcher, answer) {
            answers.push({ matcher, answer });
        },
    };
}

/**
 * `t()` of the contexts: the phrase table first, then the source, with
 * `{name}` placeholders replaced.
 *
 * @param {Readonly<Record<string, string>>} phrases
 * @returns {(source: string, params?: Readonly<Record<string, string | number>>) => string}
 */
function translator(phrases) {
    return (source, params) => {
        const template = phrases[source] || source;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name) => {
            const value = params[name];
            return value === undefined ? match : String(value);
        });
    };
}

const DANGEROUS_ELEMENTS = 'script, style, iframe, object, embed, link, meta, base, form, template';

/**
 * A small stand-in for the checkout's sanitizer: drops active elements,
 * event handler attributes and `javascript:` URLs. It is enough for tests;
 * the production sanitizer is stricter.
 *
 * @param {string} html
 * @returns {string}
 */
export function mockSanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
    for (const el of Array.from(doc.body.querySelectorAll(DANGEROUS_ELEMENTS))) el.remove();
    for (const el of Array.from(doc.body.querySelectorAll('*'))) {
        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            const value = Array.from(attr.value).filter((char) => char.charCodeAt(0) > 0x20).join('').toLowerCase();
            if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'action') && value.startsWith('javascript:'))) {
                el.removeAttribute(attr.name);
            }
        }
    }
    return doc.body.innerHTML;
}

/**
 * @param {CheckoutSnapshot} snapshot
 * @param {'display' | 'base'} kind
 */
function priceFormatter(snapshot, kind) {
    const currency = kind === 'base' ? snapshot.currency.base : snapshot.currency.display;
    return new Intl.NumberFormat(snapshot.locale.replace('_', '-'), { style: 'currency', currency });
}

/**
 * The common part of every mock context.
 *
 * @param {Record<string, any>} overrides
 */
function createBase(overrides) {
    const {
        snapshot: snapshotOverrides,
        phrases = {},
        ...members
    } = overrides;
    let current = createSnapshot(snapshotOverrides ?? {});
    /** @type {Set<(snapshot: CheckoutSnapshot) => void>} */
    const listeners = new Set();
    const rest = createTransport('rest');
    const storefront = createTransport('storefront', storefrontRequest);
    const loadScript = createSpy(
        /** @type {(url: string, attributes?: Readonly<Record<string, string>>) => Promise<void>} */
        (async () => undefined)
    );
    const base = {
        apiVersion: API_VERSION,
        snapshot: () => current,
        /** @param {(snapshot: CheckoutSnapshot) => void} listener */
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        /**
         * @param {string} path
         * @param {RequestInit} [init]
         */
        rest: (path, init) => rest.call(path, init),
        /** @param {string} [suffix] */
        cartPath(suffix) {
            const root = current.isGuest ? `guest-carts/${encodeURIComponent(current.cartId)}` : 'carts/mine';
            const tail = (suffix ?? '').replace(/^\/+/, '');
            return tail === '' ? root : `${root}/${tail}`;
        },
        /**
         * @param {string} path
         * @param {StorefrontInit} [init]
         */
        storefront: (path, init) => storefront.call(path, init),
        t: translator(phrases),
        /**
         * @param {number} amount
         * @param {'display' | 'base'} [kind]
         */
        formatPrice: (amount, kind = 'display') => priceFormatter(current, kind).format(amount),
        sanitizeHtml: mockSanitizeHtml,
        loadScript,
        cspNonce: null,
        designTokens: Object.freeze({
            color: '#1f2937',
            colorMuted: '#6b7280',
            colorDanger: '#dc2626',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '16px',
        }),
        urls: Object.freeze({
            base: MOCK_BASE_URL,
            cart: `${MOCK_BASE_URL}checkout/cart/`,
            checkout: `${MOCK_BASE_URL}checkout/`,
            success: `${MOCK_BASE_URL}checkout/onepage/success/`,
        }),
    };
    const controls = {
        calls: { rest: rest.calls, storefront: storefront.calls, loadScript: loadScript.calls },
        answerRest: rest.answer,
        answerStorefront: storefront.answer,
        /**
         * Merge `next` into the current snapshot (or replace it with a full
         * snapshot) and notify every subscriber, like the checkout does
         * after a change.
         *
         * @param {Record<string, unknown>} next
         */
        setSnapshot(next) {
            current = deepFreeze(/** @type {CheckoutSnapshot} */ (merge(current, next)));
            for (const listener of Array.from(listeners)) listener(current);
            return current;
        },
        subscriberCount: () => listeners.size,
    };
    return { base, controls, members };
}

/**
 * A mock `CheckoutContext` for a slot element or a generic extension.
 * `overrides.snapshot` shapes the first snapshot, `overrides.phrases` feeds
 * `t()`, any other key replaces the context member of the same name.
 *
 * @param {Record<string, any>} [overrides]
 */
export function createMockCheckoutContext(overrides = {}) {
    const { base, controls, members } = createBase(overrides);
    return Object.assign(base, controls, members);
}

/**
 * A mock `PaymentContext`: the checkout context plus recording spies for
 * the payment pipeline. `placeOrder` answers `{ status: 'placed', orderId: 1 }`,
 * `savePaymentInformation` and `requestCheckoutValidation` answer true,
 * until the test changes them with `spy.implement()` or an override.
 *
 * @param {Record<string, any>} [overrides]
 */
export function createMockPaymentContext(overrides = {}) {
    const { base, controls, members } = createBase(overrides);
    /** @type {(string | null)[]} */
    const errors = [];
    const payment = {
        requestCheckoutValidation: createSpy(
            /** @type {() => Promise<boolean>} */ (async () => true)
        ),
        placeOrder: createSpy(
            /** @type {(data: import('../extension-api.js').PaymentData) => Promise<import('../extension-api.js').PlaceOrderOutcome>} */
            (async () => ({ status: 'placed', orderId: 1 }))
        ),
        savePaymentInformation: createSpy(
            /** @type {(data: import('../extension-api.js').PaymentData) => Promise<boolean>} */ (async () => true)
        ),
        refreshTotals: createSpy(/** @type {() => Promise<void>} */ (async () => undefined)),
        setError: createSpy(
            /** @type {(message: string | null) => void} */ ((message) => {
                errors.push(message);
            })
        ),
    };
    return Object.assign(base, payment, controls, { errors }, members);
}

/**
 * A mock `ShippingContext` (`extensionId` defaults to `test-extension`).
 *
 * @param {Record<string, any>} [overrides]
 */
export function createMockShippingContext(overrides = {}) {
    const { extensionId = 'test-extension', ...rest } = overrides;
    const { base, controls, members } = createBase(rest);
    return Object.assign(base, { extensionId }, controls, members);
}

/**
 * A mock `ExpressContext`. The loading policy promises resolve at once;
 * with `overrides.loading: 'manual'` they wait for `release('wanted' |
 * 'engaged' | 'idle')`. `overrides.cart` is what `getCart()` answers (a
 * summary built from the default snapshot when absent).
 *
 * @param {Record<string, any>} [overrides]
 */
export function createMockExpressContext(overrides = {}) {
    const {
        placement = 'product',
        phrases = {},
        loading = 'immediate',
        cart,
        ...members
    } = overrides;
    const storefront = createTransport('storefront', storefrontRequest);
    /** @type {Record<'wanted' | 'engaged' | 'idle', { promise: Promise<void>; resolve: () => void }>} */
    const gates = /** @type {any} */ ({});
    for (const name of /** @type {const} */ (['wanted', 'engaged', 'idle'])) {
        /** @type {() => void} */
        let resolve = () => undefined;
        const promise = new Promise((done) => {
            resolve = () => done(undefined);
        });
        gates[name] = { promise, resolve };
        if (loading !== 'manual') resolve();
    }
    const snapshot = createSnapshot();
    /** @type {CartSummary} */
    const defaultCart = {
        cartId: snapshot.cartId,
        isGuest: true,
        isVirtual: false,
        itemsCount: 1,
        display: /** @type {NonNullable<CheckoutSnapshot['totals']>} */ (snapshot.totals).display,
        base: /** @type {NonNullable<CheckoutSnapshot['totals']>} */ (snapshot.totals).base,
    };
    /** @type {string[]} */
    const redirects = [];
    const loadScript = createSpy(
        /** @type {(url: string, attributes?: Readonly<Record<string, string>>) => Promise<void>} */
        (async () => undefined)
    );
    const context = {
        apiVersion: API_VERSION,
        placement,
        t: translator(phrases),
        /**
         * @param {string} path
         * @param {StorefrontInit} [init]
         */
        storefront: (path, init) => storefront.call(path, init),
        addCurrentProductToCart: createSpy(
            /** @type {() => Promise<{ ok: boolean; message?: string }>} */ (async () => ({ ok: true }))
        ),
        getCart: createSpy(/** @type {() => Promise<CartSummary | null>} */ (async () => (cart === undefined ? defaultCart : cart))),
        notify: createSpy(/** @type {(message: string, tone?: 'success' | 'error') => void} */ (() => undefined)),
        whenWanted: () => gates.wanted.promise,
        whenEngaged: () => gates.engaged.promise,
        whenPageIdle: () => gates.idle.promise,
        loadScript,
        cspNonce: null,
        redirect: createSpy(/** @type {(url: string) => void} */ ((url) => {
            redirects.push(url);
        })),
    };
    const controls = {
        calls: { storefront: storefront.calls, loadScript: loadScript.calls },
        answerStorefront: storefront.answer,
        redirects,
        /** @param {'wanted' | 'engaged' | 'idle'} name */
        release(name) {
            gates[name].resolve();
        },
    };
    return Object.assign(context, controls, members);
}
