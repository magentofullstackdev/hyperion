// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * Contract suites for payment and shipping extension elements.
 *
 * Runner agnostic: the caller passes the `it` and `expect` of its own test
 * runner (Vitest, Jest, the Web Test Runner with an expect library). Each
 * case collects the problems it found and asserts
 * `expect(problems).toEqual([])`, so a failure lists every broken rule in
 * plain words.
 */
import { createMockPaymentContext, createMockShippingContext, isPlainObject } from './context.js';
import { apiVersionProblem, mountPaymentElement, mountShippingElement } from './mount.js';

/** Keys a payment element may return from `getPaymentData()`. */
export const PAYMENT_DATA_KEYS = Object.freeze(['method', 'po_number', 'additional_data', 'extension_attributes']);

/** Keys of the `hyperion-shipping:data` detail. */
export const SHIPPING_VALUE_KEYS = Object.freeze(['address', 'information', 'summary', 'state']);

/** Let pending callbacks, timers and a Lit style `updateComplete` run. */
async function settle(/** @type {unknown} */ element) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const update = /** @type {{ updateComplete?: unknown } | null} */ (element)?.updateComplete;
    if (update && typeof (/** @type {Promise<unknown>} */ (update)).then === 'function') await update;
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Run `fn` and collect what it threw and what the window reported (an
 * exception in a custom element callback is reported, not thrown).
 *
 * @param {() => unknown} fn
 * @returns {Promise<string[]>}
 */
async function collectErrors(fn) {
    /** @type {string[]} */
    const errors = [];
    /** @param {ErrorEvent} event */
    const onError = (event) => {
        event.preventDefault();
        errors.push(String(event.error?.message ?? event.message));
    };
    window.addEventListener('error', onError);
    try {
        await fn();
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    } finally {
        window.removeEventListener('error', onError);
    }
    return errors;
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<{ settled: true; value?: T; error?: unknown; rejected: boolean } | { settled: false }>}
 */
function within(promise, ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ settled: false }), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve({ settled: true, value, rejected: false });
            },
            (error) => {
                clearTimeout(timer);
                resolve({ settled: true, error, rejected: true });
            }
        );
    });
}

/**
 * @param {unknown} data
 * @returns {string[]}
 */
export function paymentDataProblems(data) {
    if (!isPlainObject(data)) return ['getPaymentData() must resolve to a plain object'];
    /** @type {string[]} */
    const problems = [];
    for (const key of Object.keys(data)) {
        if (!PAYMENT_DATA_KEYS.includes(key)) problems.push(`getPaymentData() returned the key "${key}", allowed: ${PAYMENT_DATA_KEYS.join(', ')}`);
    }
    if (data.method !== undefined && typeof data.method !== 'string') problems.push('method must be a string');
    if (data.po_number !== undefined && typeof data.po_number !== 'string') problems.push('po_number must be a string');
    for (const key of ['additional_data', 'extension_attributes']) {
        if (data[key] !== undefined && !isPlainObject(data[key])) problems.push(`${key} must be a plain object`);
    }
    if (isPlainObject(data.extension_attributes) && 'agreement_ids' in data.extension_attributes) {
        problems.push('extension_attributes must not carry agreement_ids (the checkout sets them)');
    }
    try {
        JSON.stringify(data);
    } catch (_error) {
        problems.push('getPaymentData() must resolve to JSON serializable data');
    }
    return problems;
}

/**
 * @param {unknown} detail
 * @returns {string[]}
 */
export function shippingValueProblems(detail) {
    if (!isPlainObject(detail)) return ['the hyperion-shipping:data detail must be a plain object'];
    /** @type {string[]} */
    const problems = [];
    for (const key of Object.keys(detail)) {
        if (!SHIPPING_VALUE_KEYS.includes(key)) problems.push(`the hyperion-shipping:data detail has the key "${key}", allowed: ${SHIPPING_VALUE_KEYS.join(', ')}`);
    }
    for (const key of ['address', 'information']) {
        if (detail[key] !== undefined && !isPlainObject(detail[key])) problems.push(`${key} must be a plain object`);
    }
    if (detail.summary !== undefined) {
        const summary = detail.summary;
        if (!isPlainObject(summary) || typeof summary.label !== 'string' || !Array.isArray(summary.lines)
            || summary.lines.some((line) => typeof line !== 'string')) {
            problems.push('summary must be { label: string, lines: string[] }');
        }
    }
    try {
        JSON.stringify(detail);
    } catch (_error) {
        problems.push('the hyperion-shipping:data detail must be JSON serializable');
    }
    return problems;
}

/**
 * @param {{ all: { type: string; bubbles: boolean; composed: boolean }[] }} events
 * @returns {string[]}
 */
function eventFlagProblems(events) {
    return events.all
        .filter((entry) => !entry.bubbles || !entry.composed)
        .map((entry) => `the ${entry.type} event must bubble and be composed`);
}

/**
 * @param {string} tag
 * @returns {string[]}
 */
function versionProblems(tag) {
    const problem = apiVersionProblem(tag);
    return problem === null ? [] : [problem];
}

/**
 * @param {string[]} problems
 * @returns {string[]}
 */
function unique(problems) {
    return Array.from(new Set(problems));
}

/**
 * Mount under the error boundary: what the element throws while it is
 * created and connected lands in `problems`; null when it could not mount.
 *
 * @template {{ element: HTMLElement }} M
 * @param {string[]} problems
 * @param {() => M} mountIt
 * @returns {Promise<M | null>}
 */
async function guardedMount(problems, mountIt) {
    /** @type {M | null} */
    let mounted = null;
    problems.push(...await collectErrors(async () => {
        mounted = mountIt();
        await settle(/** @type {M} */ (mounted).element);
    }));
    return mounted;
}

/**
 * @param {any} element
 * @param {string} name
 * @param {number} timeoutMs
 * @param {unknown[]} args
 */
function callWithin(element, name, timeoutMs, args = []) {
    /** @type {Promise<unknown>} */
    let call;
    try {
        call = Promise.resolve(element[name](...args));
    } catch (error) {
        call = Promise.reject(error);
    }
    return within(call, timeoutMs);
}

/**
 * @typedef {object} ContractRunner
 * @property {(name: string, fn: () => unknown) => unknown} it
 * @property {(actual: unknown) => { toEqual(expected: unknown): unknown }} expect
 */

/**
 * @typedef {object} PaymentContractOptions
 * @property {import('../extension-api.js').PaymentMethodInfo} [method]
 * @property {Readonly<Record<string, unknown>>} [config]
 * @property {Readonly<Record<string, unknown>>} [options]
 * @property {import('../extension-api.js').VaultTokenInfo | null} [token]
 * @property {boolean} [awaitsReady]  the pool entry declares awaits_ready
 * @property {Record<string, unknown>} [snapshot]  overrides of the first snapshot
 * @property {Record<string, any>} [context]  overrides of the mock payment context
 * @property {number} [timeoutMs]  limit for ready, validate() and getPaymentData() (default 5000)
 * @property {(element: HTMLElement) => unknown} [prepare]  fills the element before getPaymentData()
 */

/**
 * Register the payment element contract cases with the caller's runner.
 *
 * @param {ContractRunner & { tag: string; options?: PaymentContractOptions }} args
 */
export function runPaymentRendererContract({ tag, it, expect, options = {} }) {
    const timeoutMs = options.timeoutMs ?? 5000;
    const mountInit = () => ({
        ...(options.method ? { method: options.method } : {}),
        ...(options.config ? { config: options.config } : {}),
        options: options.options ?? {},
        token: options.token ?? null,
        context: createMockPaymentContext({ ...(options.context ?? {}), snapshot: options.snapshot ?? {} }),
    });
    /**
     * @param {string[]} problems
     * @param {ReturnType<typeof mountInit>} [init]
     */
    const mountFor = (problems, init = mountInit()) => guardedMount(problems, () => mountPaymentElement(tag, init));
    /** @param {string[]} problems @param {HTMLElement} element */
    const prepare = async (problems, element) => {
        if (!options.prepare) return;
        problems.push(...await collectErrors(async () => {
            await /** @type {(element: HTMLElement) => unknown} */ (options.prepare)(element);
            await settle(element);
        }));
    };

    it(`<${tag}> is defined as a custom element`, () => {
        expect(customElements.get(tag) === undefined ? [`<${tag}> is not defined`] : []).toEqual([]);
    });

    it(`<${tag}> declares the supported hyperionApi major`, () => {
        expect(versionProblems(tag)).toEqual([]);
    });

    it(`<${tag}> keeps the properties set before it is connected`, async () => {
        /** @type {string[]} */
        const problems = [];
        const init = mountInit();
        const mounted = await mountFor(problems, init);
        if (mounted) {
            const element = /** @type {any} */ (mounted.element);
            if (element.context !== init.context) problems.push('context was replaced or lost after connection');
            if (element.options !== init.options) problems.push('options was replaced or lost after connection');
            if (typeof element.method?.code !== 'string') problems.push('method was lost after connection');
            if (element.token !== init.token) problems.push('token was replaced after connection');
            mounted.unmount();
        }
        expect(unique(problems)).toEqual([]);
    });

    if (options.awaitsReady) {
        it(`<${tag}> dispatches hyperion-payment:ready`, async () => {
            /** @type {string[]} */
            const problems = [];
            const mounted = await mountFor(problems);
            if (mounted) {
                try {
                    await mounted.events.waitFor('hyperion-payment:ready', timeoutMs);
                } catch (_error) {
                    problems.push(`no hyperion-payment:ready within ${timeoutMs} ms`);
                }
                mounted.unmount();
            }
            expect(unique(problems)).toEqual([]);
        });
    }

    it(`<${tag}> answers getPaymentData() with allowed keys or an Error within the time limit`, async () => {
        /** @type {string[]} */
        const problems = [];
        const mounted = await mountFor(problems);
        const element = /** @type {any} */ (mounted?.element);
        if (mounted && typeof element.getPaymentData === 'function') {
            await prepare(problems, element);
            const controller = new AbortController();
            const outcome = await callWithin(element, 'getPaymentData', timeoutMs, [controller.signal]);
            if (!outcome.settled) {
                controller.abort();
                problems.push(`getPaymentData() did not settle within ${timeoutMs} ms`);
            } else if (outcome.rejected) {
                if (!(outcome.error instanceof Error)) problems.push('getPaymentData() must reject with an Error');
            } else {
                problems.push(...paymentDataProblems(outcome.value));
            }
        }
        mounted?.unmount();
        expect(unique(problems)).toEqual([]);
    });

    it(`<${tag}> answers validate() with a boolean`, async () => {
        /** @type {string[]} */
        const problems = [];
        const mounted = await mountFor(problems);
        const element = /** @type {any} */ (mounted?.element);
        if (mounted && typeof element.validate === 'function') {
            const outcome = await callWithin(element, 'validate', timeoutMs);
            if (!outcome.settled) problems.push(`validate() did not settle within ${timeoutMs} ms`);
            else if (outcome.rejected) problems.push('validate() must not throw');
            else if (typeof outcome.value !== 'boolean') problems.push('validate() must answer a boolean');
        }
        mounted?.unmount();
        expect(unique(problems)).toEqual([]);
    });

    it(`<${tag}> survives a disconnect and a reconnect`, async () => {
        /** @type {string[]} */
        const problems = [];
        const mounted = await mountFor(problems);
        if (mounted) {
            const { element, host } = mounted;
            problems.push(...await collectErrors(async () => {
                element.remove();
                await settle(element);
                host.appendChild(element);
                await settle(element);
            }));
            if (!element.isConnected) problems.push('the element is not connected after the reconnect');
            mounted.unmount();
        }
        expect(unique(problems)).toEqual([]);
    });

    it(`<${tag}> tolerates a totals change through subscribe()`, async () => {
        /** @type {string[]} */
        const problems = [];
        const init = mountInit();
        const mounted = await mountFor(problems, init);
        if (mounted) {
            const totals = init.context.snapshot().totals;
            problems.push(...await collectErrors(async () => {
                init.context.setSnapshot({ isSettling: true });
                init.context.setSnapshot({
                    isSettling: false,
                    totals: totals === null ? null : {
                        display: { ...totals.display, grandTotal: totals.display.grandTotal + 10 },
                        base: { ...totals.base, grandTotal: totals.base.grandTotal + 10 },
                    },
                });
                await settle(mounted.element);
            }));
            mounted.unmount();
            if (init.context.subscriberCount() > 0) problems.push('a subscription is still active after the element was removed');
        }
        expect(unique(problems)).toEqual([]);
    });

    it(`<${tag}> throws nothing when token is null`, async () => {
        /** @type {string[]} */
        const problems = [];
        const mounted = await mountFor(problems, { ...mountInit(), token: null });
        mounted?.unmount();
        expect(unique(problems)).toEqual([]);
    });

    it(`<${tag}> dispatches only bubbling, composed events`, async () => {
        /** @type {string[]} */
        const problems = [];
        // Errors are the subject of the other cases: this one looks at the events only.
        const mounted = await mountFor([]);
        if (mounted) {
            const element = /** @type {any} */ (mounted.element);
            await prepare([], element);
            await collectErrors(async () => {
                if (typeof element.validate === 'function') await callWithin(element, 'validate', timeoutMs);
                if (typeof element.getPaymentData === 'function') {
                    await callWithin(element, 'getPaymentData', timeoutMs, [new AbortController().signal]);
                }
                await settle(element);
            });
            problems.push(...eventFlagProblems(mounted.events));
            mounted.unmount();
        }
        expect(unique(problems)).toEqual([]);
    });
}

/**
 * @typedef {object} ShippingContractOptions
 * @property {import('../extension-api.js').ShippingMethodSnapshot | null} [method]
 * @property {import('../extension-api.js').ShippingExtensionValue | null} [value]  a value to restore from
 * @property {Readonly<Record<string, unknown>>} [options]
 * @property {Record<string, unknown>} [snapshot]
 * @property {Record<string, any>} [context]
 * @property {(element: HTMLElement) => unknown} [interact]  drives the element to report a value
 * @property {(element: HTMLElement) => unknown} [expectRestored]  the caller's own check of a restored element
 */

/**
 * Register the shipping extension element contract cases with the
 * caller's runner.
 *
 * @param {ContractRunner & { tag: string; options?: ShippingContractOptions }} args
 */
export function runShippingExtensionContract({ tag, it, expect, options = {} }) {
    const mountInit = (/** @type {import('../extension-api.js').ShippingExtensionValue | null} */ value = null) => ({
        ...(options.method !== undefined ? { method: options.method } : {}),
        ...(options.options ? { options: options.options } : {}),
        value,
        context: createMockShippingContext({ ...(options.context ?? {}), snapshot: options.snapshot ?? {} }),
    });
    /**
     * @param {string[]} problems
     * @param {import('../extension-api.js').ShippingExtensionValue | null} [value]
     */
    const mountFor = (problems, value = null) => guardedMount(problems, () => mountShippingElement(tag, mountInit(value)));
    /** @param {string[]} problems @param {HTMLElement} element */
    const interact = async (problems, element) => {
        if (!options.interact) return;
        problems.push(...await collectErrors(async () => {
            await /** @type {(element: HTMLElement) => unknown} */ (options.interact)(element);
            await settle(element);
        }));
    };

    it(`<${tag}> is defined with the supported hyperionApi major`, () => {
        expect(versionProblems(tag)).toEqual([]);
    });

    it(`<${tag}> restores from value without changing it`, async () => {
        /** @type {string[]} */
        const problems = [];
        const value = options.value ?? { state: { restored: true } };
        const expected = JSON.stringify(value);
        const mounted = await mountFor(problems, deepFrozenCopy(value));
        if (mounted) {
            if (options.expectRestored) {
                const check = /** @type {(element: HTMLElement) => unknown} */ (options.expectRestored);
                problems.push(...await collectErrors(() => check(mounted.element)));
            }
            if (JSON.stringify(/** @type {any} */ (mounted.element).value) !== expected) {
                problems.push('value was replaced or changed by the element (report a new value through hyperion-shipping:data)');
            }
            for (const entry of mounted.events.of('hyperion-shipping:data')) problems.push(...shippingValueProblems(entry.detail));
            mounted.unmount();
        }
        expect(unique(problems)).toEqual([]);
    });

    it(`<${tag}> reports hyperion-shipping:data with the allowed keys only`, async () => {
        /** @type {string[]} */
        const problems = [];
        const mounted = await mountFor(problems);
        if (mounted) {
            await interact(problems, mounted.element);
            const data = mounted.events.of('hyperion-shipping:data');
            if (options.interact && data.length === 0) problems.push('no hyperion-shipping:data after interact()');
            for (const entry of data) problems.push(...shippingValueProblems(entry.detail));
            for (const entry of mounted.events.of('hyperion-shipping:address-override')) {
                const detail = /** @type {any} */ (entry.detail);
                if (!isPlainObject(detail) || (detail.address !== null && !isPlainObject(detail.address))
                    || typeof detail.keepContact !== 'boolean' || typeof detail.separateBilling !== 'boolean') {
                    problems.push('hyperion-shipping:address-override needs { address: object | null, keepContact: boolean, separateBilling: boolean }');
                }
            }
            problems.push(...eventFlagProblems(mounted.events));
            mounted.unmount();
        }
        expect(unique(problems)).toEqual([]);
    });

    it(`<${tag}> alternates hyperion-shipping:valid and :invalid consistently`, async () => {
        /** @type {string[]} */
        const problems = [];
        const mounted = await mountFor(problems);
        if (mounted) {
            const element = /** @type {any} */ (mounted.element);
            await interact(problems, element);
            const isState = (/** @type {{ type: string }} */ entry) =>
                entry.type === 'hyperion-shipping:valid' || entry.type === 'hyperion-shipping:invalid';
            const states = () => mounted.events.all.filter(isState);
            /** @type {{ type: string; message: string | null } | null} */
            let previous = null;
            for (const entry of mounted.events.all) {
                // A new value resets validity, so the element reports it again after every
                // data event: the same report twice is a repeat only with no data event between.
                if (entry.type === 'hyperion-shipping:data') {
                    previous = null;
                    continue;
                }
                if (!isState(entry)) continue;
                const message = entry.type === 'hyperion-shipping:invalid'
                    ? /** @type {{ message?: unknown } | null} */ (entry.detail)?.message
                    : null;
                if (entry.type === 'hyperion-shipping:invalid' && (typeof message !== 'string' || message.trim() === '')) {
                    problems.push('hyperion-shipping:invalid needs a non empty message');
                }
                const state = { type: entry.type, message: typeof message === 'string' ? message : null };
                if (previous !== null && previous.type === state.type && previous.message === state.message) {
                    problems.push(`${state.type} was dispatched twice in a row with nothing changed`);
                }
                previous = state;
            }
            if (typeof element.validate === 'function') {
                const outcome = await callWithin(element, 'validate', 5000);
                await settle(element);
                const last = states().pop();
                if (!outcome.settled || outcome.rejected || typeof outcome.value !== 'boolean') {
                    problems.push('validate() must answer a boolean');
                } else if (last !== undefined && outcome.value !== (last.type === 'hyperion-shipping:valid')) {
                    problems.push('validate() disagrees with the last valid / invalid event');
                }
            }
            mounted.unmount();
        }
        expect(unique(problems)).toEqual([]);
    });
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFrozenCopy(value) {
    /** @param {unknown} node */
    const freeze = (node) => {
        if (node !== null && typeof node === 'object') {
            for (const child of Object.values(node)) freeze(child);
            Object.freeze(node);
        }
        return node;
    };
    return /** @type {T} */ (freeze(JSON.parse(JSON.stringify(value))));
}
