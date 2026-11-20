// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-session-expired>: the modal shown once the customer session ended
 * while the checkout was open (`store.sessionExpired`).
 *
 * Nothing on the page can reach the quote any more, so the dialog cannot
 * be dismissed: its one way on is "Sign in again", the sign in page that
 * returns to the checkout, where what the shopper entered is put back from
 * the handoff draft. When an order request was under way and its outcome
 * is not known, the dialog says so, so nobody pays twice.
 */
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { peekCheckoutConfig } from '../bootstrap-config.js';
import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';

/** The sign in page that returns to the checkout; core's plain one when the config names none. */
function loginUrl(): string {
    const hyperion = peekCheckoutConfig()?.hyperion;
    if (hyperion?.loginUrl) return hyperion.loginUrl;
    const base = hyperion?.baseUrl ?? '/';
    return `${base.endsWith('/') ? base : `${base}/`}customer/account/login/`;
}

export class SessionExpiredDialog extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        if (!store.sessionExpired.get()) return nothing;
        return html`
            <dialog class="w-full max-w-md rounded-md border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                    aria-labelledby="hc-session-expired-message"
                    data-session-expired
                    @cancel=${this._keepOpen}>
                <div class="p-4 space-y-3">
                    <p id="hc-session-expired-message" class="text-sm">
                        ${t('Hyperion_Checkout::error_session_expired')}
                    </p>
                    ${store.orderOutcome.get() === 'unknown'
                        ? html`<p class="text-sm text-danger" data-session-expired-order>
                                   ${t('Hyperion_Checkout::order_outcome_unknown')}
                               </p>`
                        : nothing}
                    <a href=${loginUrl()}
                       data-session-expired-login
                       class="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent/90">
                        ${t('Hyperion_Checkout::sign_in_again')}
                    </a>
                </div>
            </dialog>
        `;
    }

    public override updated(): void {
        const dialog = this.querySelector<HTMLDialogElement>('dialog[data-session-expired]');
        if (!dialog || dialog.open) return;
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    }

    /** Escape must not close a dialog whose page behind it no longer works. */
    private _keepOpen = (event: Event): void => {
        event.preventDefault();
    };
}

if (!customElements.get('hc-session-expired')) {
    customElements.define('hc-session-expired', SessionExpiredDialog);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-session-expired': SessionExpiredDialog; }
}
