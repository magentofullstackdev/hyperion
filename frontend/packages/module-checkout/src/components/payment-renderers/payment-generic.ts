// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-generic> -- fallback renderer for unknown method codes.
 *
 * Renders a warning banner and a "not yet supported" message.
 * `<payment-method-list>` uses `isSafeForGeneric()` to decide whether
 * to enable the radio for a method with no dedicated renderer -- this
 * component covers the rare "method enabled in admin before its
 * renderer shipped" case with a graceful UX.
 */
import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

import { t } from '../../utils/i18n.js';

export class PaymentGeneric extends LitElement {
    @property({ type: String }) public code = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        return html`
            <div role="alert"
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                ${t('Hyperion_Checkout::payment_method_unavailable', { code: this.code })}
            </div>
        `;
    }
}

if (!customElements.get('payment-generic')) {
    customElements.define('payment-generic', PaymentGeneric);
}

declare global {
    interface HTMLElementTagNameMap { 'payment-generic': PaymentGeneric; }
}
