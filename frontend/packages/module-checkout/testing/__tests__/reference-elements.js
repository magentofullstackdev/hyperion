// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
// @ts-check

/**
 * Minimal vanilla extension elements that follow the public contracts,
 * used by the kit's own tests. They are what a third party element looks
 * like at its smallest.
 */

/**
 * @param {HTMLElement} target
 * @param {string} type
 * @param {unknown} [detail]
 */
function emit(target, type, detail = {}) {
    target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

export class ReferencePayment extends HTMLElement {
    static hyperionApi = '1';

    constructor() {
        super();
        /** @type {any} */
        this.context = null;
        /** @type {Readonly<Record<string, unknown>>} */
        this.options = {};
        /** @type {{ code: string; title: string } | null} */
        this.method = null;
        /** @type {Readonly<Record<string, unknown>>} */
        this.config = {};
        /** @type {unknown} */
        this.token = null;
        /** What the element had when it was connected the first time. */
        /** @type {Record<string, unknown> | null} */
        this.seenAtConnect = null;
        /** @type {(() => void) | null} */
        this.unsubscribe = null;
        /** @type {number[]} */
        this.grandTotals = [];
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (this.seenAtConnect === null) {
            this.seenAtConnect = { context: this.context, method: this.method, config: this.config, token: this.token };
        }
        const root = /** @type {ShadowRoot} */ (this.shadowRoot);
        if (!root.querySelector('input')) {
            const input = document.createElement('input');
            input.name = 'reference';
            input.setAttribute('aria-label', this.context.t('Reference'));
            root.appendChild(input);
        }
        this.unsubscribe = this.context.subscribe((/** @type {any} */ snapshot) => {
            this.grandTotals.push(snapshot.totals?.base.grandTotal ?? 0);
        });
        queueMicrotask(() => {
            const field = /** @type {HTMLElement} */ (root.querySelector('input'));
            emit(field, 'hyperion-payment:ready');
        });
    }

    disconnectedCallback() {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    get value() {
        return /** @type {HTMLInputElement} */ (/** @type {ShadowRoot} */ (this.shadowRoot).querySelector('input')).value;
    }

    validate() {
        const valid = this.value.trim() !== '';
        emit(this, valid ? 'hyperion-payment:valid' : 'hyperion-payment:invalid', valid ? {} : { message: this.context.t('Enter a reference.') });
        return valid;
    }

    async getPaymentData() {
        if (!this.validate()) throw new Error(this.context.t('Enter a reference.'));
        const base = this.context.snapshot().totals?.base;
        return { additional_data: { reference: this.value, amount: base ? base.grandTotal.toFixed(2) : '0.00' } };
    }
}

export class ReferenceShipping extends HTMLElement {
    static hyperionApi = '1';

    constructor() {
        super();
        /** @type {any} */
        this.context = null;
        /** @type {Readonly<Record<string, unknown>>} */
        this.options = {};
        /** @type {unknown} */
        this.method = null;
        /** @type {{ state?: unknown } | null} */
        this.value = null;
        /** @type {string | null} */
        this.selected = null;
    }

    connectedCallback() {
        const state = /** @type {{ point?: unknown } | null | undefined} */ (this.value?.state);
        this.selected = typeof state?.point === 'string' ? state.point : null;
        this.textContent = this.selected ?? '';
        emit(this, this.selected ? 'hyperion-shipping:valid' : 'hyperion-shipping:invalid',
            this.selected ? {} : { message: this.context.t('Choose a pickup point.') });
    }

    /** @param {string} point */
    choose(point) {
        this.selected = point;
        this.textContent = point;
        emit(this, 'hyperion-shipping:data', {
            address: { sample_point_id: point },
            summary: { label: this.context.t('Pickup point'), lines: [point] },
            state: { point },
        });
        emit(this, 'hyperion-shipping:valid');
    }

    validate() {
        return this.selected !== null;
    }
}

export class ReferenceSlot extends HTMLElement {
    static hyperionApi = '1';
}

export class ReferenceExpress extends HTMLElement {
    static hyperionApi = '1';

    constructor() {
        super();
        /** @type {any} */
        this.context = null;
        /** @type {string | null} */
        this.placementAtConnect = null;
    }

    connectedCallback() {
        this.placementAtConnect = this.context.placement;
        this.context.whenWanted().then(() => emit(this, 'hyperion-express:ready'));
    }
}

/** Define the reference elements once per test environment. */
export function defineReferenceElements() {
    for (const [tag, cls] of /** @type {[string, CustomElementConstructor][]} */ ([
        ['reference-payment', ReferencePayment],
        ['reference-shipping', ReferenceShipping],
        ['reference-slot', ReferenceSlot],
        ['reference-express', ReferenceExpress],
    ])) {
        if (customElements.get(tag) === undefined) customElements.define(tag, cls);
    }
}
