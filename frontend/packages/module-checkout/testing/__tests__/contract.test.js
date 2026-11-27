// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * The contract suites must fail for elements that break the contract. The
 * suites run here through a runner of their own (a plain `it` that collects
 * the cases and an `expect` that throws the problem list), which also
 * proves that they need nothing of Vitest.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { runPaymentRendererContract, runShippingExtensionContract } from '../index.js';
import { ReferencePayment, ReferenceShipping, defineReferenceElements } from './reference-elements.js';

defineReferenceElements();

afterEach(() => {
    document.body.innerHTML = '';
});

class ProblemList extends Error {
    /** @param {unknown} problems */
    constructor(problems) {
        super(JSON.stringify(problems));
        this.problems = problems;
    }
}

/**
 * Run a contract suite with a minimal runner; answer the problems of every
 * case by its title (an empty list when the case passed).
 *
 * @param {(runner: { it: (name: string, fn: () => unknown) => void; expect: (actual: unknown) => { toEqual(expected: unknown): void } }) => void} register
 * @returns {Promise<Record<string, string[]>>}
 */
async function runSuite(register) {
    /** @type {{ name: string; fn: () => unknown }[]} */
    const cases = [];
    register({
        it: (name, fn) => {
            cases.push({ name, fn });
        },
        expect: (actual) => ({
            toEqual(expected) {
                if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new ProblemList(actual);
            },
        }),
    });
    /** @type {Record<string, string[]>} */
    const results = {};
    for (const entry of cases) {
        try {
            await entry.fn();
            results[entry.name] = [];
        } catch (error) {
            results[entry.name] = error instanceof ProblemList ? /** @type {string[]} */ (error.problems) : [String(error)];
        }
        document.body.innerHTML = '';
    }
    return results;
}

/**
 * @param {Record<string, string[]>} results
 * @param {string} fragment
 */
function problemsOf(results, fragment) {
    const name = Object.keys(results).find((title) => title.includes(fragment));
    if (name === undefined) throw new Error(`no case named like "${fragment}" in ${Object.keys(results).join(' | ')}`);
    return /** @type {string[]} */ (results[name]);
}

/**
 * @param {string} tag
 * @param {CustomElementConstructor} cls
 */
function define(tag, cls) {
    if (customElements.get(tag) === undefined) customElements.define(tag, cls);
    return tag;
}

describe('payment contract', () => {
    it('passes for an element that follows it', async () => {
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({
            tag: 'reference-payment',
            it: register,
            expect: check,
            options: { awaitsReady: true },
        }));
        expect(Object.keys(results).length).toBe(10);
        expect(Object.values(results).flat()).toEqual([]);
    });

    it('fails when the tag is not defined', async () => {
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({
            tag: 'never-defined-payment', it: register, expect: check,
        }));
        expect(problemsOf(results, 'is defined')).toEqual(['<never-defined-payment> is not defined']);
    });

    it('fails without static hyperionApi and with another major', async () => {
        const missing = define('broken-missing-api', class extends HTMLElement {});
        const other = define('broken-other-major', class extends HTMLElement {
            static hyperionApi = '2';
        });
        const a = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag: missing, it: register, expect: check }));
        const b = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag: other, it: register, expect: check }));
        expect(problemsOf(a, 'hyperionApi')).toEqual(['the element class must declare static hyperionApi']);
        expect(problemsOf(b, 'hyperionApi')).toEqual(['hyperionApi declares major 2, the checkout supports 1']);
    });

    it('fails when getPaymentData() answers keys outside the contract', async () => {
        const tag = define('broken-payment-keys', class extends HTMLElement {
            static hyperionApi = '1';
            getPaymentData() {
                return { method: 'sample', nonce: 'n', extension_attributes: { agreement_ids: ['1'] } };
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag, it: register, expect: check }));
        expect(problemsOf(results, 'getPaymentData()')).toEqual([
            'getPaymentData() returned the key "nonce", allowed: method, po_number, additional_data, extension_attributes',
            'extension_attributes must not carry agreement_ids (the checkout sets them)',
        ]);
    });

    it('fails when getPaymentData() rejects with a string or never settles', async () => {
        const rejecting = define('broken-payment-reject', class extends HTMLElement {
            static hyperionApi = '1';
            getPaymentData() {
                return Promise.reject('declined');
            }
        });
        const hanging = define('broken-payment-hang', class extends HTMLElement {
            static hyperionApi = '1';
            getPaymentData() {
                return new Promise(() => undefined);
            }
        });
        const a = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag: rejecting, it: register, expect: check }));
        const b = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({
            tag: hanging, it: register, expect: check, options: { timeoutMs: 30 },
        }));
        expect(problemsOf(a, 'getPaymentData()')).toEqual(['getPaymentData() must reject with an Error']);
        expect(problemsOf(b, 'getPaymentData()')).toEqual(['getPaymentData() did not settle within 30 ms']);
    });

    it('fails when validate() does not answer a boolean', async () => {
        const tag = define('broken-payment-validate', class extends HTMLElement {
            static hyperionApi = '1';
            validate() {
                return 'yes';
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag, it: register, expect: check }));
        expect(problemsOf(results, 'validate()')).toEqual(['validate() must answer a boolean']);
    });

    it('fails when ready never arrives for an entry that awaits it', async () => {
        const tag = define('broken-payment-ready', class extends HTMLElement {
            static hyperionApi = '1';
        });
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({
            tag, it: register, expect: check, options: { awaitsReady: true, timeoutMs: 30 },
        }));
        expect(problemsOf(results, 'hyperion-payment:ready')).toEqual(['no hyperion-payment:ready within 30 ms']);
    });

    it('fails when an event does not bubble or is not composed', async () => {
        const tag = define('broken-payment-events', class extends ReferencePayment {
            /** @override */
            validate() {
                this.dispatchEvent(new CustomEvent('hyperion-payment:valid', { detail: {} }));
                this.shadowRoot?.querySelector('input')?.dispatchEvent(
                    new CustomEvent('hyperion-payment:busy', { detail: { busy: true }, bubbles: true })
                );
                return true;
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag, it: register, expect: check }));
        expect(problemsOf(results, 'bubbling, composed')).toEqual([
            'the hyperion-payment:valid event must bubble and be composed',
            'the hyperion-payment:busy event must bubble and be composed',
        ]);
    });

    it('fails when the element replaces its context or keeps a subscription after removal', async () => {
        const tag = define('broken-payment-context', class extends HTMLElement {
            static hyperionApi = '1';
            connectedCallback() {
                const self = /** @type {any} */ (this);
                self.context.subscribe(() => undefined);
                self.context = { ...self.context };
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag, it: register, expect: check }));
        expect(problemsOf(results, 'properties set before')).toEqual(['context was replaced or lost after connection']);
        expect(problemsOf(results, 'totals change')).toEqual(['a subscription is still active after the element was removed']);
    });

    it('fails when the element throws while it is connected', async () => {
        const tag = define('broken-payment-throws', class extends HTMLElement {
            static hyperionApi = '1';
            connectedCallback() {
                const self = /** @type {any} */ (this);
                if (self.token === null) throw new Error('token.publicHash of null');
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runPaymentRendererContract({ tag, it: register, expect: check }));
        expect(problemsOf(results, 'token is null')).toEqual(['token.publicHash of null']);
        expect(problemsOf(results, 'reconnect')).toEqual(['token.publicHash of null']);
    });
});

describe('shipping contract', () => {
    it('passes for an element that follows it', async () => {
        const results = await runSuite(({ it: register, expect: check }) => runShippingExtensionContract({
            tag: 'reference-shipping',
            it: register,
            expect: check,
            options: { value: { state: { point: 'P2' } }, interact: (element) => /** @type {any} */ (element).choose('P1') },
        }));
        expect(Object.keys(results).length).toBe(4);
        expect(Object.values(results).flat()).toEqual([]);
    });

    it('passes for an element that reports two values, each followed by hyperion-shipping:valid', async () => {
        const results = await runSuite(({ it: register, expect: check }) => runShippingExtensionContract({
            tag: 'reference-shipping',
            it: register,
            expect: check,
            options: {
                interact: (element) => {
                    /** @type {any} */ (element).choose('P1');
                    /** @type {any} */ (element).choose('P2');
                },
            },
        }));
        expect(problemsOf(results, 'alternates')).toEqual([]);
        expect(Object.values(results).flat()).toEqual([]);
    });

    it('fails when hyperion-shipping:valid repeats with no data event between the two', async () => {
        const tag = define('broken-shipping-repeat', class extends ReferenceShipping {
            /**
             * @override
             * @param {string} point
             */
            choose(point) {
                super.choose(point);
                this.dispatchEvent(new CustomEvent('hyperion-shipping:valid', { detail: {}, bubbles: true, composed: true }));
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runShippingExtensionContract({
            tag, it: register, expect: check, options: { interact: (element) => /** @type {any} */ (element).choose('P1') },
        }));
        expect(problemsOf(results, 'alternates')).toEqual(['hyperion-shipping:valid was dispatched twice in a row with nothing changed']);
    });

    it('fails when the data detail carries other keys or a malformed summary', async () => {
        const tag = define('broken-shipping-keys', class extends ReferenceShipping {
            /**
             * @override
             * @param {string} point
             */
            choose(point) {
                this.dispatchEvent(new CustomEvent('hyperion-shipping:data', {
                    detail: { address: { point }, price: 3, summary: { label: 'Point' } },
                    bubbles: true,
                    composed: true,
                }));
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runShippingExtensionContract({
            tag, it: register, expect: check, options: { interact: (element) => /** @type {any} */ (element).choose('P1') },
        }));
        expect(problemsOf(results, 'allowed keys')).toEqual([
            'the hyperion-shipping:data detail has the key "price", allowed: address, information, summary, state',
            'summary must be { label: string, lines: string[] }',
        ]);
    });

    it('fails when no data arrives after the interaction', async () => {
        const tag = define('broken-shipping-silent', class extends ReferenceShipping {
            /** @override */
            choose() {
                this.selected = 'P1';
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runShippingExtensionContract({
            tag, it: register, expect: check, options: { interact: (element) => /** @type {any} */ (element).choose('P1') },
        }));
        expect(problemsOf(results, 'allowed keys')).toEqual(['no hyperion-shipping:data after interact()']);
    });

    it('fails when valid repeats, invalid has no message or validate() disagrees', async () => {
        const tag = define('broken-shipping-states', class extends HTMLElement {
            static hyperionApi = '1';
            connectedCallback() {
                for (const type of ['hyperion-shipping:invalid', 'hyperion-shipping:valid', 'hyperion-shipping:valid']) {
                    this.dispatchEvent(new CustomEvent(type, { detail: {}, bubbles: true, composed: true }));
                }
            }
            validate() {
                return false;
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runShippingExtensionContract({ tag, it: register, expect: check }));
        expect(problemsOf(results, 'alternates')).toEqual([
            'hyperion-shipping:invalid needs a non empty message',
            'hyperion-shipping:valid was dispatched twice in a row with nothing changed',
            'validate() disagrees with the last valid / invalid event',
        ]);
    });

    it('fails when the element replaces the value it was given', async () => {
        const tag = define('broken-shipping-value', class extends ReferenceShipping {
            /** @override */
            connectedCallback() {
                super.connectedCallback();
                this.value = { state: { point: 'other' } };
            }
        });
        const results = await runSuite(({ it: register, expect: check }) => runShippingExtensionContract({
            tag, it: register, expect: check, options: { value: { state: { point: 'P2' } } },
        }));
        expect(problemsOf(results, 'restores from value')).toEqual([
            'value was replaced or changed by the element (report a new value through hyperion-shipping:data)',
        ]);
    });
});
