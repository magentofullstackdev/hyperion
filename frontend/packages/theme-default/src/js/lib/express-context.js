// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The `context` an express button element receives from
 * `<hyperion-express-slot>` (the `ExpressContext` of the extension API).
 *
 *   t(source, params)          the entry's phrases (English source =>
 *                              translation, rendered by the server), else
 *                              the source; `{name}` placeholders
 *   storefront(path, init)     a same-origin storefront controller, path
 *                              relative to the store base URL: GET (the
 *                              default) without a body, or POST (any other
 *                              method value) with a JSON body, `{}` when
 *                              none, and the form key as the `form_key`
 *                              query parameter; `X-Requested-With`; a JSON
 *                              answer; the same contract as the checkout's
 *   addCurrentProductToCart()  product placement: posts the page's add to
 *                              cart form like its own button, marked as an
 *                              express add (`X-Hyperion-Express: 1`)
 *   getCart()                  GET hyperion/cart/summary: the visitor's cart
 *                              on demand, so cached pages stay session free
 *   notify(message, tone)      the page toast
 *   whenWanted() / whenEngaged() / whenPageIdle()
 *                              the loading policy of lib/engagement.js: a
 *                              button loads no SDK before one resolves
 *   loadScript(url, attrs)     one classic script per URL, CSP nonce aware
 *   redirect(url)              same origin, or a host of the entry's
 *                              `redirectHosts` over https
 *
 * The context is frozen and never carries Lit, signals or Tailwind classes.
 */

import { htmlToText } from '@magentofullstackdev/hyperion-shared/html';
import { whenWanted as wantedElement, whenEngaged, whenPageIdle } from './engagement.js';
import { loadScript, cspNonce, notify, readCookie } from './paypal-sdk.js';
import { EXTENSION_API } from './extension-loader.js';

const SUPER_ATTRIBUTE_SELECTOR = '[data-hyperion-super]';
const DEFAULT_FORM = '#product_addtocart_form';
const SUMMARY_PATH = 'hyperion/cart/summary';
const NOTIFY_TONES = ['success', 'error', 'warning', 'info'];
const MAX_MESSAGE_LENGTH = 500;
const DEFAULT_OPTIONS_MESSAGE = 'You need to choose options for your item.';
const DEFAULT_ERROR_MESSAGE = 'Something went wrong with your request. Please try again later.';

/** Ends the waits and observers of a context (called by the express slot when it is removed). */
export const DISPOSE = Symbol('hyperion-express-dispose');

/**
 * The add to cart request of an express button carries this header: the server never
 * answers it with the redirect to the cart ("After Adding a Product Redirect to Shopping
 * Cart"), which would leave the page while the button goes on with its own flow.
 */
export const EXPRESS_ADD_HEADERS = Object.freeze({ 'X-Hyperion-Express': '1' });

/** An error of `storefront()`, a `CheckoutError` of the extension API: `kind`, `status` and a message safe to show. */
function storefrontError(kind, status, message) {
    const error = new Error(message);
    error.name = 'CheckoutError';
    error.kind = kind;
    error.status = status;
    return error;
}

/** Plain text, capped: messages from extensions are untrusted. */
export function plainMessage(value) {
    if (typeof value !== 'string') return '';
    return htmlToText(value).trim().slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * The add to cart form the express slot names (its `form` attribute), null when the
 * page has none.
 *
 * @param {Element} slot
 * @returns {HTMLFormElement|null}
 */
export function productForm(slot) {
    const selector = slot?.getAttribute?.('form') || DEFAULT_FORM;
    try {
        const form = document.querySelector(selector);
        return form instanceof HTMLFormElement ? form : null;
    } catch {
        return null;
    }
}

/**
 * Why the form cannot be posted yet, checked in the browser only: an option
 * not chosen or a field the browser rejects. Reveals the browser's message.
 *
 * @param {HTMLFormElement|null} form
 * @returns {'missing-form'|'options'|null}
 */
export function productFormProblem(form) {
    if (!form) return 'missing-form';
    if ([...form.querySelectorAll(SUPER_ATTRIBUTE_SELECTOR)].some((input) => !input.value)) return 'options';
    if (!form.checkValidity()) {
        form.reportValidity();
        return 'options';
    }
    return null;
}

/**
 * HTTP status of the add to cart request, posted the way the form's own button posts it
 * (the answer is handled as for that button: htmx swaps the toast), plus the express mark.
 */
function submitProductForm(form, errorMessage) {
    const url = form.getAttribute('action') || '';
    const htmx = window.htmx;
    if (htmx && typeof htmx.ajax === 'function') {
        return new Promise((resolve) => {
            const onAfterRequest = (event) => {
                if (event.detail?.elt !== form) return;
                form.removeEventListener('htmx:afterRequest', onAfterRequest);
                resolve(event.detail?.xhr?.status ?? 0);
            };
            form.addEventListener('htmx:afterRequest', onAfterRequest);
            Promise.resolve(htmx.ajax('POST', url, { source: form, headers: { ...EXPRESS_ADD_HEADERS } })).catch(() => {
                form.removeEventListener('htmx:afterRequest', onAfterRequest);
                resolve(0);
            });
        });
    }
    const data = new FormData(form);
    data.set('form_key', readCookie('form_key') || String(data.get('form_key') ?? ''));
    return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'HX-Request': 'true', ...EXPRESS_ADD_HEADERS },
        body: data,
    }).then(async (response) => {
        if (response.status === 422) {
            // The refusal carries its reason in the toast markup of the response.
            const body = new DOMParser().parseFromString(await response.text(), 'text/html');
            notify(body.querySelector('[data-hyperion-notification]')?.textContent?.trim() || errorMessage);
        }
        return response.status;
    }).catch(() => 0);
}

function waitForLoad() {
    if (document.readyState === 'complete') return Promise.resolve();
    return new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
}

function relativePath(path) {
    if (typeof path !== 'string' || path === '' || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')
        || path.split(/[/?#]/).includes('..')) {
        return null;
    }
    return path.replace(/^\/+/, '');
}

function storeBase(slot) {
    try {
        const base = new URL(slot?.getAttribute?.('base-url') || '/', window.location.href);
        if (base.origin !== window.location.origin) return new URL('/', window.location.href);
        return base.pathname.endsWith('/') ? base : new URL(`${base.pathname}/`, base);
    } catch {
        return new URL('/', window.location.href);
    }
}

/**
 * The context of one express button entry.
 *
 * @param {Element} slot the `<hyperion-express-slot>`
 * @param {{ id: string, phrases?: Object<string, string>, redirectHosts?: string[] }} entry
 * @param {Element} [box] the button's box (default: the express slot)
 * @returns {Readonly<object>}
 */
export function createExpressContext(slot, entry, box = slot) {
    const phrases = entry?.phrases && typeof entry.phrases === 'object' ? entry.phrases : {};
    const redirectHosts = Array.isArray(entry?.redirectHosts)
        ? entry.redirectHosts.filter((host) => typeof host === 'string' && host !== '')
        : [];
    const placement = String(slot?.getAttribute?.('placement') || '');
    const waits = new Set();
    let disposed = false;

    const t = (source, params) => {
        let text = typeof phrases[source] === 'string' && phrases[source] !== '' ? phrases[source] : String(source ?? '');
        if (params && typeof params === 'object') {
            text = text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
        }
        return text;
    };
    const optionsMessage = () => slot?.getAttribute?.('options-message') || t(DEFAULT_OPTIONS_MESSAGE);
    const errorMessage = () => slot?.getAttribute?.('error-message') || t(DEFAULT_ERROR_MESSAGE);

    const storefront = async (path, init = {}) => {
        const relative = relativePath(path);
        if (relative === null) throw storefrontError('validation', null, errorMessage());
        const url = new URL(relative, storeBase(slot));
        // GET (the default) without a body; any other method value is a POST with a JSON
        // body and the form key as a parameter (core's validator reads getParam(), a JSON
        // body is not parsed into params). The checkout's contexts send the same.
        const post = String(init.method ?? 'GET').toUpperCase() !== 'GET';
        const formKey = readCookie('form_key');
        if (post && formKey) url.searchParams.set('form_key', formKey);
        let response;
        try {
            response = await fetch(url.href, {
                method: post ? 'POST' : 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(post ? { 'Content-Type': 'application/json' } : {}),
                },
                body: post ? JSON.stringify(init.body ?? {}) : undefined,
                signal: init.signal,
            });
        } catch (error) {
            if (error?.name === 'AbortError') throw error;
            throw storefrontError('network', null, errorMessage());
        }
        if (!response.ok) {
            const kind = response.status === 401 || response.status === 403 ? 'unauthorized'
                : response.status === 404 ? 'not-found'
                    : response.status === 429 ? 'rate-limited'
                        : response.status >= 500 ? 'server' : 'validation';
            throw storefrontError(kind, response.status, errorMessage());
        }
        const text = await response.text();
        try {
            return text === '' ? null : JSON.parse(text);
        } catch {
            throw storefrontError('server', response.status, errorMessage());
        }
    };

    const track = (promise, cancel) => {
        if (disposed) return new Promise(() => {});
        const entryOfWait = { cancel };
        waits.add(entryOfWait);
        return promise.finally(() => waits.delete(entryOfWait));
    };

    const context = {
        apiVersion: EXTENSION_API,
        placement,
        t,
        storefront,
        async addCurrentProductToCart() {
            if (placement !== 'product') return { ok: false, message: errorMessage() };
            const form = productForm(slot);
            const problem = productFormProblem(form);
            if (problem === 'missing-form') return { ok: false, message: errorMessage() };
            if (problem === 'options') return { ok: false, message: optionsMessage() };
            const status = await submitProductForm(form, errorMessage());
            if (status >= 200 && status < 300) {
                document.dispatchEvent(new CustomEvent('hyperion:cart-changed'));
                return { ok: true };
            }
            // 422: the refusal is on screen already.
            return status === 422 ? { ok: false } : { ok: false, message: errorMessage() };
        },
        async getCart() {
            const summary = await storefront(SUMMARY_PATH);
            return summary && typeof summary === 'object' ? summary : null;
        },
        notify(message, tone = 'success') {
            const text = plainMessage(message);
            if (text !== '') notify(text, NOTIFY_TONES.includes(tone) ? tone : 'error');
        },
        whenWanted() {
            const wanted = wantedElement(box);
            return track(wanted.then(waitForLoad), wanted.cancel);
        },
        whenEngaged() {
            return track(whenEngaged(), () => {});
        },
        whenPageIdle() {
            return track(whenPageIdle(), () => {});
        },
        loadScript(url, attributes) {
            return loadScript(url, attributes);
        },
        get cspNonce() {
            return cspNonce();
        },
        redirect(url) {
            let target;
            try {
                target = new URL(String(url), window.location.href);
            } catch {
                throw new Error('The redirect URL is not valid');
            }
            const allowed = target.origin === window.location.origin
                || (target.protocol === 'https:' && redirectHosts.includes(target.hostname));
            if (!allowed) throw new Error(`The redirect to ${target.origin} is not allowed`);
            window.location.assign(target.href);
        },
    };
    Object.defineProperty(context, DISPOSE, {
        value() {
            disposed = true;
            waits.forEach((wait) => wait.cancel());
            waits.clear();
        },
    });

    return Object.freeze(context);
}
