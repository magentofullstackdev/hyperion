// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-app> -- root Lit element.
 *
 * Shell: email (guest) or read-only email (customer), shipping
 * (non-virtual carts only), payment + billing, order summary, place
 * order. Error banner + loading overlay are global.
 *
 * Two layouts, one order summary. From the `lg` breakpoint the summary is
 * the sticky rail on the right, after the sections in the document. Below
 * it the summary is the first block: a collapsed bar with the item count
 * and the grand total. Which one is rendered follows a media query read
 * before the first render, so the first frame is already the final layout
 * and the page never holds two summaries (one set of ids, one coupon form,
 * one live region for the grand total).
 *
 * Place Order sits at the end of the payment card inside a bar that, below
 * `lg`, sticks to the bottom of the viewport while the card crosses it and
 * repeats the grand total next to the button. The bar is in the document
 * flow, so it covers nothing and reserves its own space.
 *
 * The page's `<main>` is the theme's: the shell adds no landmark of that
 * kind.
 *
 * The sections only some stores show (gift options, terms, the image
 * CAPTCHA field, the reCAPTCHA attribution) are chunks of their own,
 * defined before this element mounts when the store uses them
 * (`optional-sections.ts`); their tags are always written.
 *
 * The named slots of the extension API are `<hc-slot-outlet>` elements:
 * `after-email` in the contact card, `after-agreements` and
 * `before-place-order` in the payment card. The second sits above the
 * status of the order and the Place Order bar, outside the bar, so a slot
 * element never sticks to the bottom of the viewport with it and the
 * failure of an order stays next to the button. An outlet without a
 * registered element is hidden and takes no space.
 */
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';

import './checkout-email.js';
import './checkout-shipping.js';
import './checkout-payment.js';
import './order-summary.js';
import { readGrandTotal } from './summary-totals.js';
import './place-order-button.js';
import './error-banner.js';
import './section-status.js';
import './anti-abuse-field.js';
import '../extension/slot-outlet.js';

export { loadOptionalSections } from './optional-sections.js';

/**
 * The runtime of the generic extension pool, imported from this chunk so
 * the code it shares with the application stays here.
 */
export const loadExtensionRuntime = (): Promise<typeof import('../extension/runtime.js')> =>
    import('../extension/runtime.js');

/** The `lg` breakpoint of the stylesheet: the summary is a rail from here on. */
const WIDE_LAYOUT_QUERY = '(min-width: 1024px)';

const CARD_CLASS = 'rounded-card border border-subtle bg-surface p-4 space-y-3';
const CARD_HEADING_CLASS = 'text-lg font-bold text-heading tracking-tight';

export class CheckoutApp extends SignalWatcher(LitElement) {
    private _wideLayout: MediaQueryList | null = null;

    private readonly _onLayoutChange = (): void => { this.requestUpdate(); };

    public override createRenderRoot(): HTMLElement {
        return this;
    }

    public override connectedCallback(): void {
        super.connectedCallback();
        if (typeof window.matchMedia === 'function') {
            this._wideLayout = window.matchMedia(WIDE_LAYOUT_QUERY);
            this._wideLayout.addEventListener('change', this._onLayoutChange);
        }
    }

    public override disconnectedCallback(): void {
        this._wideLayout?.removeEventListener('change', this._onLayoutChange);
        this._wideLayout = null;
        super.disconnectedCallback();
    }

    public override render(): unknown {
        const store = getStore();
        const isVirtual = store.isVirtual.get();
        const isLoggedIn = store.customer.get() !== null;
        const wide = this._wideLayout?.matches ?? false;
        const total = readGrandTotal(store);

        return html`
            <div class="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 p-4">
                ${wide ? nothing : html`<order-summary class="block min-w-0" collapsible></order-summary>`}
                <div class="space-y-6 min-w-0" data-hyperion-checkout-sections>
                    <h1 class="text-3xl font-bold text-heading tracking-tight">
                        ${t('Hyperion_Checkout::checkout_heading')}
                    </h1>
                    <error-banner></error-banner>
                    <section aria-labelledby="hc-email-heading" class=${CARD_CLASS}>
                        <h2 id="hc-email-heading" class=${CARD_HEADING_CLASS}>
                            ${isLoggedIn
                                ? t('Hyperion_Checkout::signed_in_as')
                                : t('Hyperion_Checkout::contact_heading')}
                        </h2>
                        ${isLoggedIn
                            ? html`<p class="text-sm text-muted">${store.email.get()}</p>`
                            : html`<checkout-email class="block" @login-request=${this._onLoginRequest}></checkout-email>`}
                        <hc-slot-outlet name="after-email"></hc-slot-outlet>
                    </section>
                    ${isVirtual
                        ? null
                        : html`
                              <section aria-labelledby="hc-shipping-heading" class=${CARD_CLASS}>
                                  <h2 id="hc-shipping-heading" class=${CARD_HEADING_CLASS}>
                                      ${t('Hyperion_Checkout::shipping_heading')}
                                  </h2>
                                  <checkout-shipping class="block"></checkout-shipping>
                              </section>
                          `}
                    <checkout-gift-message></checkout-gift-message>
                    <section aria-labelledby="hc-payment-heading" class=${CARD_CLASS}>
                        <h2 id="hc-payment-heading" class=${CARD_HEADING_CLASS}>
                            ${t('Hyperion_Checkout::payment_heading')}
                        </h2>
                        <checkout-payment class="block"></checkout-payment>
                        <checkout-agreements></checkout-agreements>
                        <hc-slot-outlet name="after-agreements"></hc-slot-outlet>
                        <hc-recaptcha-badge></hc-recaptcha-badge>
                        <hc-order-captcha></hc-order-captcha>
                        <hc-slot-outlet name="before-place-order"></hc-slot-outlet>
                        <hc-section-status section="order"></hc-section-status>
                        <div class="sticky bottom-0 z-10 -mx-4 -mb-4 space-y-3 rounded-b-card border-t border-subtle bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:static lg:z-auto lg:mx-0 lg:mb-0 lg:rounded-none lg:px-0 lg:pb-0"
                             data-hyperion-place-order-bar>
                            ${wide
                                ? nothing
                                : html`
                                      <p class="flex h-6 items-center justify-between gap-3 text-base font-bold text-heading"
                                         aria-hidden="true"
                                         data-hyperion-place-order-total>
                                          <span>${total?.label ?? nothing}</span>
                                          <span>${total?.text ?? nothing}</span>
                                      </p>
                                  `}
                            <place-order-button class="block"></place-order-button>
                        </div>
                    </section>
                </div>
                ${wide
                    ? html`
                          <aside class="min-w-0 self-start" data-hyperion-summary-rail>
                              <order-summary class="block"></order-summary>
                          </aside>
                      `
                    : nothing}
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
