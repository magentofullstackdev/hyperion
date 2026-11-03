// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';

export class ErrorBanner extends SignalWatcher(LitElement) {
    private _lastMessage: string | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const globalErr = store.globalError.get();
        const minOrderErr = store.minimumOrderError.get();
        // Min-order error is rendered alongside the global error so users
        // see the precise reason their order is blocked even when no
        // server-side error has been raised yet.
        if (!globalErr && !minOrderErr) {
            this._lastMessage = null;
            return nothing;
        }

        const message = globalErr ?? minOrderErr ?? '';
        // Move focus to the banner only on transitions (new message
        // appearing) -- repeated renders of the same message must NOT
        // steal focus from the user typing into a field.
        const shouldFocus = message !== this._lastMessage;
        this._lastMessage = message;
        if (shouldFocus) {
            // Defer to next paint so the element exists in the light DOM.
            queueMicrotask(() => {
                const banner = this.querySelector<HTMLDivElement>('[data-error-banner]');
                banner?.focus();
            });
        }

        return html`
            <div role="alert"
                 aria-live="assertive"
                 tabindex="-1"
                 data-error-banner
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3 outline-none focus-visible:ring-2 focus-visible:ring-danger">
                <p class="flex-1 text-sm text-danger">${message}</p>
                ${globalErr
                    ? html`<button type="button"
                                   class="text-xs text-danger hover:underline"
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
