// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-order-cancel -- self-service order cancellation (Magento 2.4.7+
 * Magento_OrderCancellation) without RequireJS or GraphQL in the browser.
 *
 * Renders a trigger (text button or icon link) and a native `<dialog>`
 * with the cancellation reason `<select>`. The dialog form is an HTMX POST
 * to `hyperion/order/cancel` (`hx-swap="none"`: the response is a toast
 * plus out-of-band swaps of the order status / actions, see
 * HyperionCustomer\Controller\Order\Cancel). Without HTMX the form falls
 * back to a plain POST, which the controller answers with a redirect.
 *
 * Light DOM, so the Tailwind utilities and semantic colour tokens apply.
 *
 * Attributes:
 *   action          POST url
 *   order-id        entity id (hidden `order_id`)
 *   order-number    increment id, shown in the dialog title
 *   form-key        Magento form key (hidden `form_key`)
 *   context         "view" | "list": which out-of-band fragments the page
 *                   can host (hidden `context`)
 *   variant         "button" (default) | "icon"
 *   reasons         JSON array of reason labels
 *   button-class    classes of the text trigger (variant "button")
 *   trigger-label, title-label, prompt-label, keep-label, confirm-label
 */

import { LitElement, html } from 'lit';

const TAG = 'hyperion-order-cancel';

export class HyperionOrderCancel extends LitElement {
    static properties = {
        action: { type: String },
        orderId: { type: String, attribute: 'order-id' },
        orderNumber: { type: String, attribute: 'order-number' },
        formKey: { type: String, attribute: 'form-key' },
        context: { type: String },
        variant: { type: String },
        reasons: { type: Array },
        buttonClass: { type: String, attribute: 'button-class' },
        triggerLabel: { type: String, attribute: 'trigger-label' },
        titleLabel: { type: String, attribute: 'title-label' },
        promptLabel: { type: String, attribute: 'prompt-label' },
        keepLabel: { type: String, attribute: 'keep-label' },
        confirmLabel: { type: String, attribute: 'confirm-label' },
        _busy: { state: true },
    };

    constructor() {
        super();
        this.action = '';
        this.orderId = '';
        this.orderNumber = '';
        this.formKey = '';
        this.context = 'view';
        this.variant = 'button';
        this.reasons = [];
        this.buttonClass = '';
        this.triggerLabel = 'Cancel Order';
        this.titleLabel = '';
        this.promptLabel = 'Provide a cancellation reason:';
        this.keepLabel = 'Keep Order';
        this.confirmLabel = 'Cancel Order';
        this._busy = false;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.addEventListener('htmx:afterRequest', this._onAfterRequest);
    }

    disconnectedCallback() {
        this.removeEventListener('htmx:beforeRequest', this._onBeforeRequest);
        this.removeEventListener('htmx:afterRequest', this._onAfterRequest);
        super.disconnectedCallback();
    }

    firstUpdated() {
        // The form carries hx-post; HTMX only scans the document once at
        // load, so a Lit-rendered form must be handed to it explicitly.
        if (window.htmx && typeof window.htmx.process === 'function') {
            window.htmx.process(this);
        }
    }

    get dialog() {
        return this.querySelector('dialog');
    }

    get isOpen() {
        return Boolean(this.dialog?.open);
    }

    open() {
        const dialog = this.dialog;
        if (!dialog || dialog.open) return;
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
        dialog.querySelector('select')?.focus();
    }

    close() {
        const dialog = this.dialog;
        if (!dialog || !dialog.open) return;
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    }

    _onBeforeRequest = () => {
        this._busy = true;
    };

    _onAfterRequest = () => {
        // Success or failure, the toast carries the outcome and the
        // out-of-band swaps update (or remove) this element.
        this._busy = false;
        this.close();
    };

    _onBackdropClick = (event) => {
        // The dialog element itself is only hit when clicking the backdrop.
        if (event.target === event.currentTarget) this.close();
    };

    _renderTrigger() {
        if (this.variant === 'icon') {
            return html`
                <button type="button"
                        data-hyperion-order-cancel-trigger
                        class="p-1.5 text-muted hover:text-error transition-colors rounded
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-error"
                        aria-label=${this.triggerLabel}
                        title=${this.triggerLabel}
                        @click=${this.open}>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2"
                         viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round"
                              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </button>
            `;
        }
        return html`
            <button type="button"
                    data-hyperion-order-cancel-trigger
                    class=${this.buttonClass || 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border border-subtle text-secondary hover:bg-surface-raised transition-colors focus:outline-none focus:ring-2 focus:ring-primary'}
                    @click=${this.open}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"
                     viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                ${this.triggerLabel}
            </button>
        `;
    }

    render() {
        const title = this.titleLabel || `${this.confirmLabel} #${this.orderNumber}`;
        const reasons = Array.isArray(this.reasons) ? this.reasons : [];
        // The trigger sits in a display:contents wrapper: a template that
        // starts with a child binding loses it in happy-dom (the test DOM).
        return html`
            <span class="contents">${this._renderTrigger()}</span>
            <dialog class="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-subtle
                           bg-surface p-0 text-secondary shadow-xl backdrop:bg-black/50"
                    aria-labelledby="hyperion-order-cancel-title-${this.orderId}"
                    @click=${this._onBackdropClick}>
                <form method="post"
                      action=${this.action}
                      hx-post=${this.action}
                      hx-swap="none"
                      class="p-6 space-y-4"
                      data-hyperion-order-cancel-form>
                    <input type="hidden" name="form_key" value=${this.formKey}>
                    <input type="hidden" name="order_id" value=${this.orderId}>
                    <input type="hidden" name="context" value=${this.context}>
                    <h3 id="hyperion-order-cancel-title-${this.orderId}" class="text-lg font-semibold">
                        ${title}
                    </h3>
                    <label class="block space-y-1">
                        <span class="text-sm text-muted">${this.promptLabel}</span>
                        <select name="reason" required
                                class="block w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm
                                       text-secondary focus:outline-none focus:ring-2 focus:ring-primary">
                            ${reasons.map((reason) => html`<option value=${reason}>${reason}</option>`)}
                        </select>
                    </label>
                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button"
                                data-hyperion-order-cancel-keep
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
                                       bg-surface border border-subtle text-secondary
                                       hover:border-primary hover:text-primary transition-colors
                                       focus:outline-none focus:ring-2 focus:ring-primary"
                                @click=${this.close}>
                            ${this.keepLabel}
                        </button>
                        <button type="submit"
                                data-hyperion-order-cancel-confirm
                                ?disabled=${this._busy}
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold
                                       uppercase tracking-wider bg-error text-on-error shadow-sm
                                       hover:bg-error-hover hover:shadow-md transition-all
                                       disabled:opacity-60 disabled:cursor-wait
                                       focus:outline-none focus:ring-2 focus:ring-error">
                            ${this.confirmLabel}
                        </button>
                    </div>
                </form>
            </dialog>
        `;
    }
}

if (!customElements.get(TAG)) {
    customElements.define(TAG, HyperionOrderCancel);
}
