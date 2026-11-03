// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-app> -- root Lit element.
 *
 * Shell: email (guest) or read-only email (customer), shipping
 * (non-virtual carts only), payment + billing, order summary, place
 * order. Error banner + loading overlay are global.
 */
import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';

import './checkout-email.js';
import './checkout-shipping.js';
import './checkout-payment.js';
import './checkout-agreements.js';
import './checkout-gift-message.js';
import './hyperion-recaptcha.js';
import './order-summary.js';
import './place-order-button.js';
import './loading-overlay.js';
import './error-banner.js';

export class CheckoutApp extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement {
        return this;
    }

    public override render(): unknown {
        const store = getStore();
        const isVirtual = store.isVirtual.get();
        const isLoggedIn = store.customer.get() !== null;

        return html`
            <div class="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 p-4">
                <main class="space-y-6" role="main">
                    <h1 class="text-2xl font-semibold text-brand">
                        ${t('Hyperion_Checkout::skeleton_heading')}
                    </h1>
                    <error-banner></error-banner>
                    <section aria-labelledby="hc-email-heading"
                             class="rounded-md border border-subtle bg-surface p-4 space-y-3">
                        <h2 id="hc-email-heading" class="text-lg font-semibold text-brand">
                            ${isLoggedIn
                                ? t('Hyperion_Checkout::signed_in_as')
                                : t('Hyperion_Checkout::contact_heading')}
                        </h2>
                        ${isLoggedIn
                            ? html`<p class="text-sm text-muted">${store.email.get()}</p>`
                            : html`<checkout-email @login-request=${this._onLoginRequest}></checkout-email>`}
                    </section>
                    ${isVirtual
                        ? null
                        : html`
                              <section aria-labelledby="hc-shipping-heading"
                                       class="rounded-md border border-subtle bg-surface p-4 space-y-3">
                                  <h2 id="hc-shipping-heading" class="text-lg font-semibold text-brand">
                                      ${t('Hyperion_Checkout::shipping_heading')}
                                  </h2>
                                  <checkout-shipping></checkout-shipping>
                              </section>
                          `}
                    <checkout-gift-message></checkout-gift-message>
                    <section aria-labelledby="hc-payment-heading"
                             class="rounded-md border border-subtle bg-surface p-4 space-y-3">
                        <h2 id="hc-payment-heading" class="text-lg font-semibold text-brand">
                            ${t('Hyperion_Checkout::payment_heading')}
                        </h2>
                        <checkout-payment></checkout-payment>
                        <checkout-agreements></checkout-agreements>
                        <div class="pt-3 border-t border-subtle space-y-3">
                            <hc-recaptcha-badge></hc-recaptcha-badge>
                            <place-order-button></place-order-button>
                        </div>
                    </section>
                </main>
                <aside class="lg:sticky lg:top-4 lg:self-start">
                    <order-summary></order-summary>
                </aside>
            </div>
            <loading-overlay></loading-overlay>
        `;
    }

    private _onLoginRequest = async (): Promise<void> => {
        const { inlineLogin } = await import('../store/login-action.js');
        await inlineLogin();
    };
}

if (!customElements.get('checkout-app')) {
    customElements.define('checkout-app', CheckoutApp);
}

declare global {
    interface HTMLElementTagNameMap {
        'checkout-app': CheckoutApp;
    }
}
