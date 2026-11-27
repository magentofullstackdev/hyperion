// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * Mount helpers: they hand an extension element its properties before it
 * is connected, exactly like the checkout, append it to a stand-in of
 * `<checkout-app>` and record every event the element dispatches. Like the
 * checkout and the storefront, they refuse an element of any kind whose
 * class declares no `static hyperionApi` of the supported major.
 */
import {
    API_MAJOR,
    createMockCheckoutContext,
    createMockExpressContext,
    createMockPaymentContext,
    createMockShippingContext,
} from './context.js';

/**
 * @param {unknown} declared
 * @returns {string | null}
 */
function majorOf(declared) {
    if (typeof declared !== 'string' && typeof declared !== 'number') return null;
    const match = /^\s*(\d+)/.exec(String(declared));
    return match ? String(Number(match[1])) : null;
}

/**
 * Why the checkout would not use the element of `tag`: it is not defined,
 * or its class declares no `static hyperionApi` with the supported major
 * (the rule is the same for payment, shipping, slot and express elements).
 * Null when it would.
 *
 * @param {string} tag
 * @returns {string | null}
 */
export function apiVersionProblem(tag) {
    const cls = /** @type {{ hyperionApi?: unknown } | undefined} */ (customElements.get(tag));
    if (cls === undefined) return `<${tag}> is not defined`;
    const major = majorOf(cls.hyperionApi);
    if (major === null) return 'the element class must declare static hyperionApi';
    return major === API_MAJOR ? null : `hyperionApi declares major ${major}, the checkout supports ${API_MAJOR}`;
}

/** The event names of the public contracts, listened for on the element and on the host. */
export const CONTRACT_EVENTS = Object.freeze([
    'hyperion-payment:ready',
    'hyperion-payment:valid',
    'hyperion-payment:invalid',
    'hyperion-payment:busy',
    'hyperion-payment:error',
    'hyperion-payment:request-place-order',
    'hyperion-shipping:data',
    'hyperion-shipping:valid',
    'hyperion-shipping:invalid',
    'hyperion-shipping:address-override',
    'hyperion-shipping:rates-refresh',
    'hyperion-express:ready',
    'hyperion-express:unavailable',
    'hyperion-express:error',
]);

/**
 * @typedef {object} RecordedEvent
 * @property {string} type
 * @property {unknown} detail
 * @property {boolean} bubbles
 * @property {boolean} composed
 * @property {boolean} cancelable
 * @property {boolean} reachedHost  true when a listener on the host saw it
 * @property {Event} event
 */

/**
 * Record the events `element` dispatches: through its own
 * `dispatchEvent()` (any name) and, for the contract names, on the element
 * and on `host` (what bubbled out of a shadow root).
 *
 * @param {HTMLElement} element
 * @param {HTMLElement} host
 * @param {readonly string[]} [names]
 */
export function recordEvents(element, host, names = CONTRACT_EVENTS) {
    /** @type {RecordedEvent[]} */
    const all = [];
    /** @type {Map<Event, RecordedEvent>} */
    const seen = new Map();
    /** @type {{ type: string; resolve: (entry: RecordedEvent) => void }[]} */
    const waiters = [];

    /** @param {Event} event */
    const record = (event) => {
        let entry = seen.get(event);
        if (entry === undefined) {
            entry = {
                type: event.type,
                detail: /** @type {CustomEvent} */ (event).detail,
                bubbles: event.bubbles,
                composed: event.composed,
                cancelable: event.cancelable,
                reachedHost: false,
                event,
            };
            seen.set(event, entry);
            all.push(entry);
            for (const waiter of waiters.slice()) {
                if (waiter.type === event.type) {
                    waiters.splice(waiters.indexOf(waiter), 1);
                    waiter.resolve(entry);
                }
            }
        }
        return entry;
    };
    /** @param {Event} event */
    const onHost = (event) => {
        if (event.composedPath().includes(element) || event.target === element) {
            record(event).reachedHost = true;
        }
    };
    const own = element.dispatchEvent;
    element.dispatchEvent = function (event) {
        record(event);
        return own.call(this, event);
    };
    for (const name of names) {
        element.addEventListener(name, record);
        host.addEventListener(name, onHost);
    }
    /** @type {ShadowRoot | null} */
    let watchedShadow = null;
    /** An open shadow root shows the events that never leave it (not composed). */
    const watchShadow = () => {
        const shadow = element.shadowRoot;
        if (shadow === null || shadow === watchedShadow) return;
        watchedShadow = shadow;
        for (const name of names) shadow.addEventListener(name, record);
    };
    watchShadow();

    return {
        all,
        /** @param {string} type */
        of: (type) => all.filter((entry) => entry.type === type),
        /** @param {string} type */
        last: (type) => all.filter((entry) => entry.type === type).pop() ?? null,
        /**
         * The first event of `type` (already recorded or still to come);
         * rejects after `timeoutMs`.
         *
         * @param {string} type
         * @param {number} [timeoutMs]
         * @returns {Promise<RecordedEvent>}
         */
        waitFor(type, timeoutMs = 2000) {
            watchShadow();
            const found = all.find((entry) => entry.type === type);
            if (found) return Promise.resolve(found);
            return new Promise((resolve, reject) => {
                const waiter = { type, resolve };
                waiters.push(waiter);
                setTimeout(() => {
                    const index = waiters.indexOf(waiter);
                    if (index !== -1) {
                        waiters.splice(index, 1);
                        reject(new Error(`no ${type} event within ${timeoutMs} ms`));
                    }
                }, timeoutMs);
            });
        },
        watchShadow,
        clear() {
            all.length = 0;
            seen.clear();
        },
        stop() {
            element.dispatchEvent = own;
            for (const name of names) {
                element.removeEventListener(name, record);
                host.removeEventListener(name, onHost);
                watchedShadow?.removeEventListener(name, record);
            }
        },
    };
}

/**
 * The `<checkout-app>` stand-in. When the real `<checkout-app>` is defined
 * in the test environment a neutral element takes its place, so the real
 * application is never booted by a mount.
 */
export function createCheckoutHost() {
    const host = customElements.get('checkout-app') === undefined
        ? document.createElement('checkout-app')
        : document.createElement('div');
    host.setAttribute('data-hyperion-testing-host', '');
    document.body.appendChild(host);
    return host;
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} properties
 * @param {HTMLElement | undefined} host
 */
function mount(tag, properties, host) {
    if (customElements.get(tag) === undefined) {
        throw new Error(`<${tag}> is not defined: import the module that defines it before mounting`);
    }
    const problem = apiVersionProblem(tag);
    if (problem !== null) throw new Error(`<${tag}> would not be used by the checkout: ${problem}`);
    const element = /** @type {HTMLElement & Record<string, unknown>} */ (document.createElement(tag));
    for (const [name, value] of Object.entries(properties)) {
        element[name] = value;
    }
    const root = host ?? createCheckoutHost();
    const events = recordEvents(element, root);
    root.appendChild(element);
    events.watchShadow();
    return {
        element,
        host: root,
        events,
        /** Remove the element and its host (when the helper created it). */
        unmount() {
            events.stop();
            element.remove();
            if (host === undefined) root.remove();
        },
    };
}

/**
 * @typedef {object} PaymentMountOptions
 * @property {import('../extension-api.js').PaymentMethodInfo} [method]
 * @property {Readonly<Record<string, unknown>>} [config]
 * @property {Readonly<Record<string, unknown>>} [options]
 * @property {import('../extension-api.js').VaultTokenInfo | null} [token]
 * @property {any} [context]
 * @property {HTMLElement} [host]
 */

/**
 * Mount a payment element: `context`, `options`, `method`, `config` and
 * `token` are set before it is connected.
 *
 * @param {string} tag
 * @param {PaymentMountOptions} [init]
 */
export function mountPaymentElement(tag, init = {}) {
    const context = init.context ?? createMockPaymentContext();
    const mounted = mount(tag, {
        context,
        options: init.options ?? {},
        method: init.method ?? { code: 'test_method', title: 'Test method' },
        config: init.config ?? {},
        token: init.token ?? null,
    }, init.host);
    return { ...mounted, context };
}

/**
 * Mount a shipping extension element: `context`, `options`, `method` and
 * `value` are set before it is connected.
 *
 * @param {string} tag
 * @param {{ method?: import('../extension-api.js').ShippingMethodSnapshot | null;
 *   value?: import('../extension-api.js').ShippingExtensionValue | null;
 *   options?: Readonly<Record<string, unknown>>; context?: any; host?: HTMLElement }} [init]
 */
export function mountShippingElement(tag, init = {}) {
    const context = init.context ?? createMockShippingContext();
    const method = init.method === undefined ? context.snapshot().shippingMethod : init.method;
    const mounted = mount(tag, {
        context,
        options: init.options ?? {},
        method,
        value: init.value ?? null,
    }, init.host);
    return { ...mounted, context };
}

/**
 * Mount an element of a checkout slot: `context`, `options` and `slot` are
 * set before it is connected.
 *
 * @param {string} tag
 * @param {{ slot?: import('../extension-api.js').CheckoutSlotName;
 *   options?: Readonly<Record<string, unknown>>; context?: any; host?: HTMLElement }} [init]
 */
export function mountSlotElement(tag, init = {}) {
    const context = init.context ?? createMockCheckoutContext();
    const mounted = mount(tag, {
        context,
        options: init.options ?? {},
        slot: init.slot ?? 'after-agreements',
    }, init.host);
    return { ...mounted, context };
}

/**
 * Mount an express button: `context`, `options` and `placement` are set
 * before it is connected.
 *
 * @param {string} tag
 * @param {{ placement?: import('../extension-api.js').ExpressPlacement;
 *   options?: Readonly<Record<string, unknown>>; context?: any; host?: HTMLElement }} [init]
 */
export function mountExpressElement(tag, init = {}) {
    const placement = init.placement ?? init.context?.placement ?? 'product';
    const context = init.context ?? createMockExpressContext({ placement });
    const mounted = mount(tag, {
        context,
        options: init.options ?? {},
        placement,
    }, init.host);
    return { ...mounted, context };
}
