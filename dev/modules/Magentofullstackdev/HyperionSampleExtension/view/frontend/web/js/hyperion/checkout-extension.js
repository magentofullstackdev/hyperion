// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// The generic checkout extension of the sample module, a module of the
// checkout extension pool: it exports `hyperionApi` and a default function
// the checkout calls with the extension API (no framework, no Hyperion
// import).
//
// - The slot element <sample-checkout-confirmation> (declared for the
//   `after-agreements` slot in etc/frontend/di.xml) is a checkbox.
// - A gate keeps Place Order closed with "Tick the sample confirmation"
//   until the box is ticked.
// - A `paymentInformation` filter adds
//   paymentMethod.extension_attributes.hyperion_sample_confirmation, a
//   declared extension attribute, next to what the checkout already sends.

export const hyperionApi = '1';

const TAG = 'sample-checkout-confirmation';

/** Shared by the gate and every element instance of the page. */
const state = { confirmed: false, listeners: new Set() };

function setConfirmed(confirmed) {
    state.confirmed = confirmed;
    for (const listener of state.listeners) listener();
}

function fill(source, params) {
    if (!params) return source;
    return source.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

class SampleCheckoutConfirmation extends HTMLElement {
    static hyperionApi = '1';

    #checkbox = null;
    #sync = () => {
        if (this.#checkbox) this.#checkbox.checked = state.confirmed;
    };

    connectedCallback() {
        if (!this.#checkbox) this.#render();
        state.listeners.add(this.#sync);
        this.#sync();
    }

    disconnectedCallback() {
        state.listeners.delete(this.#sync);
    }

    /** Focus the box when it is not ticked; true once it is. */
    validate() {
        if (!state.confirmed) this.#checkbox?.focus();
        return state.confirmed;
    }

    #render() {
        this.style.display = 'block';
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:0.5rem;min-height:44px;cursor:pointer';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-sample-confirmation', '');
        checkbox.addEventListener('change', () => setConfirmed(checkbox.checked));
        const text = document.createElement('span');
        const translate = this.context?.t;
        const source = 'I confirm this is a sample order';
        text.textContent = typeof translate === 'function' ? translate.call(this.context, source) : fill(source);
        label.append(checkbox, text);
        this.#checkbox = checkbox;
        this.append(label);
    }
}

/**
 * Called once by the checkout.
 *
 * @param {import('@magentofullstackdev/hyperion-checkout/extension-api').CheckoutExtensionApi} api
 */
export default function register(api) {
    if (!customElements.get(TAG)) customElements.define(TAG, SampleCheckoutConfirmation);

    const attribute = typeof api.options?.attribute === 'string' ? api.options.attribute : 'hyperion_sample_confirmation';
    const value = typeof api.options?.value === 'string' ? api.options.value : 'confirmed';

    const gate = api.registerGate(() => (state.confirmed ? null : api.context.t('Tick the sample confirmation')));
    state.listeners.add(() => gate.refresh());

    api.filter('paymentInformation', (payload) => {
        const paymentMethod = payload.paymentMethod ?? {};
        const extensionAttributes = paymentMethod.extension_attributes && typeof paymentMethod.extension_attributes === 'object'
            ? paymentMethod.extension_attributes
            : {};
        return {
            ...payload,
            paymentMethod: {
                ...paymentMethod,
                extension_attributes: { ...extensionAttributes, [attribute]: value },
            },
        };
    });
}
