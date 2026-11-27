// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * The extension harness page (`harness.html`): loads a module, mounts its
 * element with a mock context of the testing kit and logs every event and
 * every context call. Only a same-origin module URL is loaded.
 */
import {
    CONTRACT_EVENTS,
    createMockCheckoutContext,
    createMockExpressContext,
    createMockPaymentContext,
    createMockShippingContext,
    mountExpressElement,
    mountPaymentElement,
    mountShippingElement,
    mountSlotElement,
} from './index.js';

const TYPES = ['payment', 'shipping', 'slot', 'express'];
const TAG = /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/;
const SHIPPING_METHODS = {
    flatrate_flatrate: { carrier_code: 'flatrate', method_code: 'flatrate', carrier_title: 'Flat Rate', method_title: 'Fixed', amount: 5, base_amount: 5 },
    tablerate_bestway: { carrier_code: 'tablerate', method_code: 'bestway', carrier_title: 'Best Way', method_title: 'Table Rate', amount: 10, base_amount: 10 },
    freeshipping_freeshipping: { carrier_code: 'freeshipping', method_code: 'freeshipping', carrier_title: 'Free Shipping', method_title: 'Free', amount: 0, base_amount: 0 },
};

const status = /** @type {HTMLElement} */ (document.getElementById('hyperion-harness-status'));
const stage = /** @type {HTMLElement} */ (document.getElementById('hyperion-harness-stage'));
const log = /** @type {HTMLOListElement} */ (document.getElementById('hyperion-harness-log'));
const panel = /** @type {HTMLFormElement} */ (document.getElementById('hyperion-harness-panel'));

/**
 * @param {unknown} value
 * @returns {string}
 */
function show(value) {
    if (value instanceof Error) {
        const kind = /** @type {{ kind?: unknown }} */ (value).kind;
        return `${value.name}${kind ? ` (${String(kind)})` : ''}: ${value.message}`;
    }
    try {
        return JSON.stringify(value, null, 2) ?? String(value);
    } catch (_error) {
        return String(value);
    }
}

/**
 * @param {string} label
 * @param {unknown} [value]
 * @param {'info' | 'error'} [tone]
 */
function write(label, value, tone = 'info') {
    const item = document.createElement('li');
    item.dataset.tone = tone;
    item.textContent = `${new Date().toISOString().slice(11, 23)}  ${label}${value === undefined ? '' : `\n${show(value)}`}`;
    log.prepend(item);
}

/** @param {string} name */
function field(name) {
    return /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} */ (panel.elements.namedItem(name));
}

/**
 * @param {string} name
 * @param {unknown} fallback
 */
function jsonField(name, fallback) {
    const text = field(name).value.trim();
    if (text === '') return fallback;
    try {
        return JSON.parse(text);
    } catch (_error) {
        write(`${name} is not valid JSON, using ${show(fallback)}`, undefined, 'error');
        return fallback;
    }
}

/** The snapshot the panel describes. */
function panelSnapshot() {
    const customer = /** @type {HTMLInputElement} */ (field('customer')).checked;
    const display = field('displayCurrency').value.toUpperCase() || 'USD';
    const base = field('baseCurrency').value.toUpperCase() || 'USD';
    const grandTotal = Number(field('grandTotal').value) || 0;
    const baseGrandTotal = Number(field('baseGrandTotal').value) || 0;
    const method = /** @type {Record<string, any>} */ (SHIPPING_METHODS)[field('shippingMethod').value] ?? null;
    const shipping = method ? method.amount : 0;
    const baseShipping = method ? method.base_amount : 0;
    return {
        isGuest: !customer,
        customerId: customer ? 1 : null,
        cartId: customer ? '1' : 'mockMaskedCartId0123456789abcdef',
        email: field('email').value,
        currency: { display, base, rate: grandTotal > 0 && baseGrandTotal > 0 ? grandTotal / baseGrandTotal : 1 },
        shippingAddress: {
            country_id: field('country').value.toUpperCase(),
            postcode: field('postcode').value,
            city: field('city').value,
        },
        shippingMethod: method,
        totals: {
            display: { currency: display, grandTotal, subtotal: grandTotal - shipping, shipping },
            base: { currency: base, grandTotal: baseGrandTotal, subtotal: baseGrandTotal - baseShipping, shipping: baseShipping },
        },
    };
}

/**
 * Log every request of a mock context and answer it with an empty object.
 *
 * @param {any} context
 */
function instrument(context) {
    const answer = (/** @type {string} */ kind) => (/** @type {string} */ path, /** @type {unknown} */ init) => {
        write(`context.${kind}(${path})`, init);
        return {};
    };
    context.answerRest?.(() => true, answer('rest'));
    context.answerStorefront?.(() => true, answer('storefront'));
    for (const name of ['placeOrder', 'savePaymentInformation', 'requestCheckoutValidation', 'refreshTotals', 'setError',
        'loadScript', 'addCurrentProductToCart', 'getCart', 'notify', 'redirect']) {
        const spy = context[name];
        if (typeof spy?.implement !== 'function') continue;
        const original = spy.implementation;
        spy.implement((/** @type {unknown[]} */ ...args) => {
            write(`context.${name}()`, args);
            return original(...args);
        });
    }
    return context;
}

/** @type {{ element: HTMLElement; host: HTMLElement; unmount(): void } | null} */
let mounted = null;
/** @type {any} */
let context = null;

/**
 * @param {string} tag
 * @param {string} type
 */
function mountElement(tag, type) {
    mounted?.unmount();
    mounted = null;
    stage.textContent = '';
    try {
        mountKind(tag, type);
    } catch (error) {
        // An element the checkout would not use (no static hyperionApi of the supported
        // major), or one that throws while its properties are set: the log says which.
        write(`<${tag}> could not be mounted`, error, 'error');
    }
}

/**
 * @param {string} tag
 * @param {string} type
 */
function mountKind(tag, type) {
    const snapshot = panelSnapshot();
    const options = jsonField('options', {});
    if (type === 'payment') {
        context = instrument(createMockPaymentContext({ snapshot }));
        mounted = mountPaymentElement(tag, { context, options, config: jsonField('config', {}), host: stage });
    } else if (type === 'shipping') {
        context = instrument(createMockShippingContext({ snapshot }));
        mounted = mountShippingElement(tag, { context, options, value: jsonField('value', null), host: stage });
    } else if (type === 'slot') {
        context = instrument(createMockCheckoutContext({ snapshot }));
        mounted = mountSlotElement(tag, { context, options, host: stage });
    } else {
        context = instrument(createMockExpressContext());
        mounted = mountExpressElement(tag, { context, options, host: stage });
    }
    write(`mounted <${tag}> as ${type}`);
}

/**
 * @param {string} name
 * @param {() => unknown} call
 */
async function report(name, call) {
    try {
        write(`${name} resolved`, await call());
    } catch (error) {
        write(`${name} rejected`, error, 'error');
    }
}

async function start() {
    const params = new URLSearchParams(window.location.search);
    const moduleParam = params.get('module') ?? '';
    const tag = params.get('tag') ?? '';
    const type = params.get('type') ?? 'payment';
    if (!TYPES.includes(type) || !TAG.test(tag) || moduleParam === '') {
        status.textContent = 'Open this page with ?module=<module URL>&tag=<element tag>&type=payment|shipping|slot|express';
        return;
    }
    const moduleUrl = new URL(moduleParam, window.location.href);
    if (moduleUrl.origin !== window.location.origin) {
        status.textContent = 'Only a module of this origin is loaded.';
        return;
    }
    for (const name of CONTRACT_EVENTS) {
        stage.addEventListener(name, (event) => {
            write(`event ${event.type}${event.bubbles && event.composed ? '' : ' (does not bubble or is not composed)'}`,
                /** @type {CustomEvent} */ (event).detail);
        });
    }
    window.addEventListener('error', (event) => write('uncaught error', event.error ?? event.message, 'error'));
    window.addEventListener('unhandledrejection', (event) => write('unhandled rejection', event.reason, 'error'));
    try {
        await import(/* @vite-ignore */ moduleUrl.href);
        await Promise.race([
            customElements.whenDefined(tag),
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`<${tag}> was not defined within 5 s`)), 5000)),
        ]);
    } catch (error) {
        status.textContent = 'The module could not be loaded.';
        write('module load failed', error, 'error');
        return;
    }
    status.textContent = `<${tag}> (${type}) from ${moduleUrl.pathname}`;
    mountElement(tag, type);

    panel.addEventListener('submit', (event) => {
        event.preventDefault();
        if (context?.setSnapshot) {
            write('snapshot applied', context.setSnapshot(panelSnapshot()));
        }
    });
    panel.addEventListener('click', (event) => {
        const button = /** @type {HTMLElement} */ (event.target).closest('button[data-action]');
        if (!button || !mounted) return;
        const element = /** @type {any} */ (mounted.element);
        switch (button.getAttribute('data-action')) {
            case 'remount':
                mountElement(tag, type);
                break;
            case 'reconnect': {
                const { host } = mounted;
                element.remove();
                host.appendChild(element);
                write('disconnected and reconnected');
                break;
            }
            case 'validate':
                if (typeof element.validate === 'function') void report('validate()', () => element.validate());
                else write('the element has no validate()');
                break;
            case 'payment-data':
                if (typeof element.getPaymentData === 'function') {
                    void report('getPaymentData()', () => element.getPaymentData(new AbortController().signal));
                } else {
                    write('the element has no getPaymentData()');
                }
                break;
            case 'clear':
                log.textContent = '';
                break;
            default:
                break;
        }
    });
}

void start();
