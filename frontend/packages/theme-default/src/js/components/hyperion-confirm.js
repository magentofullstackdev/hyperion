// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-confirm -- site-styled replacement for `window.confirm()`.
 *
 * A single instance lives in the page (mounted by the theme's
 * Magento_Theme::html/confirm.phtml, or created on demand). It renders a
 * native `<dialog>` in light DOM so Tailwind utilities and the semantic
 * colour tokens apply, and exposes one promise-based method:
 *
 *     const ok = await HyperionConfirm.ask('Remove this item?');
 *
 * entry.js wires it to HTMX: every element with `hx-confirm` goes through
 * this dialog instead of the browser's modal (see `htmx:confirm` handler).
 * The mini-cart uses it directly before removing an item.
 *
 * Attributes:
 *   confirm-label   text of the confirming button (default "OK")
 *   cancel-label    text of the cancel button (default "Cancel")
 */

import { LitElement, html } from 'lit';

const TAG = 'hyperion-confirm';

export class HyperionConfirm extends LitElement {
    static properties = {
        confirmLabel: { type: String, attribute: 'confirm-label' },
        cancelLabel: { type: String, attribute: 'cancel-label' },
        _message: { state: true },
    };

    constructor() {
        super();
        this.confirmLabel = 'OK';
        this.cancelLabel = 'Cancel';
        this._message = '';
        this._resolve = null;
    }

    createRenderRoot() {
        return this;
    }

    /**
     * Resolve the shared instance (create one if the page did not mount it).
     * @returns {HyperionConfirm}
     */
    static instance() {
        let el = document.querySelector(TAG);
        if (!el) {
            el = document.createElement(TAG);
            document.body.appendChild(el);
        }
        return el;
    }

    /**
     * @param {string} message
     * @returns {Promise<boolean>} true when confirmed
     */
    static ask(message) {
        return HyperionConfirm.instance().ask(message);
    }

    ask(message) {
        // A second question while one is pending cancels the first.
        if (this._resolve) this._settle(false);
        this._message = message;
        return new Promise((resolve) => {
            this._resolve = resolve;
            this.updateComplete.then(() => {
                const dialog = this.querySelector('dialog');
                if (!dialog) {
                    this._settle(false);
                    return;
                }
                if (!dialog.open) dialog.showModal();
                dialog.querySelector('[data-hyperion-confirm-cancel]')?.focus();
            });
        });
    }

    _settle(value) {
        const resolve = this._resolve;
        this._resolve = null;
        const dialog = this.querySelector('dialog');
        if (dialog && dialog.open) dialog.close();
        if (resolve) resolve(value);
    }

    _onCancel = (event) => {
        // ESC key and clicks outside come through the dialog's `cancel` /
        // `close` events; keep the promise in sync with the DOM state.
        event?.preventDefault?.();
        this._settle(false);
    };

    _onBackdropClick = (event) => {
        // The dialog element itself is only hit when clicking the backdrop;
        // clicks inside land on the panel children.
        if (event.target === event.currentTarget) this._settle(false);
    };

    render() {
        return html`
            <dialog class="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-subtle
                           bg-surface p-0 text-secondary shadow-xl backdrop:bg-black/50"
                    aria-labelledby="hyperion-confirm-message"
                    @cancel=${this._onCancel}
                    @click=${this._onBackdropClick}>
                <div class="p-6">
                    <p id="hyperion-confirm-message" class="text-base font-medium">${this._message}</p>
                    <div class="mt-6 flex justify-end gap-3">
                        <button type="button"
                                data-hyperion-confirm-cancel
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
                                       bg-surface border border-subtle text-secondary
                                       hover:border-primary hover:text-primary transition-colors
                                       focus:outline-none focus:ring-2 focus:ring-primary"
                                @click=${() => this._settle(false)}>
                            ${this.cancelLabel}
                        </button>
                        <button type="button"
                                data-hyperion-confirm-ok
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold
                                       uppercase tracking-wider bg-primary text-on-primary shadow-sm
                                       hover:bg-primary-hover hover:shadow-md transition-all
                                       focus:outline-none focus:ring-2 focus:ring-primary"
                                @click=${() => this._settle(true)}>
                            ${this.confirmLabel}
                        </button>
                    </div>
                </div>
            </dialog>
        `;
    }
}

if (!customElements.get(TAG)) {
    customElements.define(TAG, HyperionConfirm);
}
