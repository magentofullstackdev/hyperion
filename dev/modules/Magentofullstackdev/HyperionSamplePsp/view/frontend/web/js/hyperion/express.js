// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// <sample-psp-express>: the express button of the sample provider, written
// against the public express contract only (no framework, no Hyperion
// import). The slot sets `context`, `options` and `placement`, then connects
// the element inside the box it reserved (45 px).
//
// Click: on the product page the page's own add to cart form is posted
// first (`context.addCurrentProductToCart()`); then the module's start
// controller answers the fake wallet page, where the shopper pays or cancels.

const BUTTON_HEIGHT = '45px';

function fill(source, params) {
    if (!params) return source;
    return source.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

class SamplePspExpress extends HTMLElement {
    /** The major of the express contract this element was written for. */
    static hyperionApi = '1';

    #button = null;
    #busy = false;
    #readySent = false;

    connectedCallback() {
        if (!this.#button) this.#render();
        if (!this.#readySent) {
            this.#readySent = true;
            queueMicrotask(() => this.#emit('hyperion-express:ready', {}));
        }
    }

    #render() {
        this.style.display = 'block';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-sample-psp-express', '');
        button.textContent = this.#t('Pay with Sample');
        button.style.cssText = [
            'display:block', 'width:100%', `height:${BUTTON_HEIGHT}`, 'margin:0', 'padding:0 1rem',
            'border:0', 'border-radius:6px', 'font:inherit', 'font-weight:600',
            'color:#fff', 'background:#0f766e', 'cursor:pointer',
        ].join(';');
        button.addEventListener('click', () => void this.#start());
        this.#button = button;
        this.append(button);
    }

    async #start() {
        if (this.#busy || !this.context) return;
        this.#setBusy(true);
        try {
            if (this.placement === 'product') {
                const added = await this.context.addCurrentProductToCart();
                if (!added?.ok) {
                    if (added?.message) this.context.notify(added.message, 'error');
                    return;
                }
            }
            const path = typeof this.options?.startPath === 'string' && this.options.startPath !== ''
                ? this.options.startPath
                : 'hyperionsample/express/start';
            const answer = await this.context.storefront(path, { method: 'POST', body: { placement: this.placement } });
            const url = answer && typeof answer === 'object' ? answer.url : null;
            if (typeof url !== 'string' || url === '') throw new Error(this.#t('The sample express payment could not start.'));
            this.context.redirect(url);
        } catch (error) {
            const message = error && typeof error.message === 'string' && error.message !== ''
                ? error.message
                : this.#t('The sample express payment could not start.');
            this.context.notify(message, 'error');
            this.#emit('hyperion-express:error', { message });
        } finally {
            this.#setBusy(false);
        }
    }

    #setBusy(busy) {
        this.#busy = busy;
        if (!this.#button) return;
        this.#button.setAttribute('aria-disabled', busy ? 'true' : 'false');
        this.#button.style.opacity = busy ? '0.7' : '';
    }

    #emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    }

    #t(source, params) {
        const translate = this.context?.t;
        return typeof translate === 'function' ? translate.call(this.context, source, params) : fill(source, params);
    }
}

if (!customElements.get('sample-psp-express')) {
    customElements.define('sample-psp-express', SamplePspExpress);
}
