// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <error-banner>: the message of an order that was refused, or of a payment
 * step that failed, and the minimum order notice.
 *
 * A failed request of a section shows next to its controls
 * (`<hc-section-status>`), not here. The banner is an alert, which a
 * screen reader announces by itself, so it never takes the keyboard focus:
 * a message that arrives while the shopper types must not pull them out of
 * the field.
 */
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';
import './section-status.js';

export class ErrorBanner extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const globalErr = store.globalError.get();
        const minOrderErr = store.minimumOrderError.get();
        // The minimum order notice shows by itself, so the shopper sees why
        // the order is held back before any request was refused.
        if (!globalErr && !minOrderErr) return nothing;

        return html`
            <div role="alert"
                 data-error-banner
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3">
                <p class="flex-1 text-sm text-error-strong">${globalErr ?? minOrderErr ?? ''}</p>
                ${globalErr
                    ? html`<button type="button"
                                   class="text-xs text-error-strong hover:underline"
                                   @click=${() => store.globalError.set(null)}>
                              ${t('Hyperion_Checkout::dismiss')}
                          </button>`
                    : nothing}
            </div>
        `;
    }
}

if (!customElements.get('error-banner')) {
    customElements.define('error-banner', ErrorBanner);
}

declare global {
    interface HTMLElementTagNameMap { 'error-banner': ErrorBanner; }
}
