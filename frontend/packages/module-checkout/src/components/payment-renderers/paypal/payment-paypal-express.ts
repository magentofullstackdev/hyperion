// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-paypal-express> -- PayPal Express Checkout (`paypal_express`,
 * `payflow_express`), the Lit counterpart of core's
 * `method-renderer/in-context/checkout-express.js` and `paypal-express.js`.
 *
 * In-context (`paypal_express` with "In-Context Checkout Experience" on):
 * the PayPal smart button replaces the Place Order button
 * (`ownsPlaceOrder`). On click the checkout is validated; `createOrder`
 * saves the payment method and billing address on the quote, then asks
 * `paypal/express/getTokenData` for the transaction token; `onApprove`
 * hands the approval to `paypal/express/onAuthorization` and follows its
 * `redirectUrl` (success page when the review step is skipped,
 * `paypal/express/review` otherwise).
 *
 * Redirect (in-context off, and always for the Payflow edition): the body
 * shows the PayPal mark and a note; Place Order saves the payment
 * information and continues on `paypal/express/start`, which sends the
 * shopper to paypal.com (`placeOrder` hook).
 *
 * The PayPal SDK is requested when this element is connected, which only
 * happens once the shopper selected the method.
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../../../store/index.js';
import { flowActions } from '../../../store/flow-actions.js';
import type { PaypalExpressConfig } from '../../../types/config.js';
import { t } from '../../../utils/i18n.js';
import { navigateTo } from '../../../utils/navigate.js';
import { resolveSameOriginUrl } from '../../../utils/safe-redirect.js';
import { getCheckoutBlocker } from '../checkout-gate.js';
import { registerPaymentRenderer } from '../registry.js';
import { PaypalExpressError, authorizePaypalPayment, requestPaypalToken } from './api.js';
import {
    PAYPAL_EXPRESS_CODE,
    PAYPAL_EXPRESS_CODES,
    getPaypalExpressConfig,
    getStartUrl,
    isInContext,
} from './config.js';
import { loadPaypalSdk } from './sdk.js';
import type { PaypalApproveData, PaypalButtonsInstance, PaypalSdk } from './types.js';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** Funding source of the last click (PayPal, Pay Later, ...), sent with the approval like core does. */
let fundingSource = '';

/**
 * True once a step of ours put its reason in the error banner. PayPal calls
 * `onError` for every rejected `createOrder`, and that generic handler must
 * not replace the precise message.
 */
let failureReported = false;

function reportFailure(message: string): void {
    getStore().globalError.set(message || t('Hyperion_Checkout::paypal_express_failed'));
    failureReported = true;
}

function messageOf(err: unknown): string {
    return err instanceof PaypalExpressError ? err.message : '';
}

/** Why the order cannot be paid yet, null when the checkout is complete. */

/** The message amount is the base grand total: the SDK is loaded for the base currency. */
export function getPayLaterAmount(): string {
    const amount = parseFloat(String(getStore().totals.get()?.base_grand_total ?? ''));
    return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '';
}

export async function createPaypalOrder(): Promise<string> {
    const store = getStore();
    const config = getPaypalExpressConfig();
    failureReported = false;
    const blocker = config ? getCheckoutBlocker() : '';
    if (!config || blocker !== null) {
        reportFailure(blocker ?? '');
        throw new PaypalExpressError(blocker ?? '');
    }
    if (!(await flowActions().savePaymentInformation())) {
        const reason = store.globalError.get() ?? '';
        reportFailure(reason);
        throw new PaypalExpressError(reason);
    }
    try {
        return await requestPaypalToken({
            url: config.getTokenUrl,
            quoteId: (store.isGuest.get() ? store.maskedQuoteId.get() : store.quoteId.get()) ?? '',
            customerId: String(store.customer.get()?.id ?? ''),
        });
    } catch (err) {
        reportFailure(messageOf(err));
        throw err;
    }
}

/** Resolves in every case: a failed approval is reported here, the checkout stays usable. */
export async function approvePaypalOrder(data: PaypalApproveData): Promise<void> {
    const store = getStore();
    const config = getPaypalExpressConfig();
    failureReported = false;
    store.globalError.set(null);
    store.isPlacingOrder.set(true);
    try {
        if (!config) throw new PaypalExpressError('');
        const redirectUrl = await authorizePaypalPayment({
            url: config.onAuthorizeUrl,
            token: data.orderID,
            payerId: data.payerID ?? '',
            fundingSource,
        });
        const target = resolveSameOriginUrl(redirectUrl);
        if (target === null) throw new PaypalExpressError('');
        navigateTo(target);
    } catch (err) {
        store.isPlacingOrder.set(false);
        reportFailure(messageOf(err));
    } finally {
        fundingSource = '';
    }
}

/** Place Order of the redirect flow: core `set-payment-method` + redirect to the start URL. */
export async function startPaypalRedirect(code: string): Promise<string | null> {
    const startUrl = getStartUrl(code);
    if (startUrl === null) {
        reportFailure('');
        return null;
    }
    const blocker = getCheckoutBlocker();
    if (blocker !== null) {
        reportFailure(blocker);
        return null;
    }
    return (await flowActions().savePaymentInformation()) ? startUrl : null;
}

export class PaymentPaypalExpress extends SignalWatcher(LitElement) {
    @property({ type: String }) public code = PAYPAL_EXPRESS_CODE;

    @state() private _status: Status = 'idle';
    @state() private _cancelled = false;

    private _sdk: PaypalSdk | null = null;
    private _button: PaypalButtonsInstance | null = null;
    private _message: HTMLElement | null = null;
    private _renderedAmount: string | null = null;
    private _generation = 0;
    private _initQueued = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._generation++;
        this._status = 'idle';
        this._sdk = null;
        this._renderedAmount = null;
        void this._closeButton();
    }

    public override render(): unknown {
        const config = getPaypalExpressConfig();
        if (!config) return nothing;
        const inContext = isInContext(this.code);
        return html`
            <div class="space-y-3">
                ${this._renderMark(config)}
                ${inContext
                    ? html`<p class="text-sm text-muted">${t('Hyperion_Checkout::paypal_express_button_hint')}</p>`
                    : html`<p class="text-sm text-muted" data-paypal-express-redirect>
                          ${t('Hyperion_Checkout::paypal_express_redirect_note')}
                      </p>`}
                ${this._cancelled
                    ? html`<p class="text-sm text-muted" role="status">
                          ${t('Hyperion_Checkout::paypal_express_cancelled')}
                      </p>`
                    : nothing}
                ${this._status === 'loading'
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${t('Hyperion_Checkout::paypal_express_loading')}
                      </p>`
                    : nothing}
                ${this._status === 'error'
                    ? html`<p role="alert" class="text-sm text-danger">
                              ${t('Hyperion_Checkout::paypal_express_init_failed')}
                          </p>
                          <button type="button"
                                  class="text-sm text-accent hover:underline"
                                  @click=${this._onRetry}>
                              ${t('Hyperion_Checkout::braintree_retry')}
                          </button>`
                    : nothing}
                ${this._usesSdk(config) ? this._messageElement(config) : nothing}
                ${inContext
                    ? html`<div class="max-w-sm" data-paypal-express-button></div>`
                    : nothing}
            </div>
        `;
    }

    private _renderMark(config: PaypalExpressConfig): unknown {
        return html`
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                ${config.markImageUrl
                    ? html`<img src=${config.markImageUrl}
                                alt=${t('Hyperion_Checkout::paypal_express_mark_alt')}
                                class="h-8 w-auto"
                                loading="lazy" />`
                    : nothing}
                ${config.whatIsPaypalUrl
                    ? html`<a href=${config.whatIsPaypalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-sm text-accent hover:underline">
                              ${t('Hyperion_Checkout::paypal_express_what_is')}
                          </a>`
                    : nothing}
            </div>
        `;
    }

    private _usesSdk(config: PaypalExpressConfig): boolean {
        return config.sdkUrl !== '' && (isInContext(this.code) || config.payLater !== null);
    }

    /**
     * The Pay Later message container. It is built by hand because its
     * `data-pp-*` attributes are a server-side list, and it is kept across
     * renders because the SDK draws into it.
     */
    private _messageElement(config: PaypalExpressConfig): HTMLElement | typeof nothing {
        const payLater = config.payLater;
        if (payLater === null) return nothing;
        let element = this._message;
        if (element === null) {
            element = document.createElement('div');
            element.setAttribute('data-pp-message', '');
            for (const [name, value] of Object.entries(payLater.attributes)) {
                if (name.startsWith('data-pp-')) element.setAttribute(name, value);
            }
            this._message = element;
        }
        const amount = payLater.displayAmount ? getPayLaterAmount() : '';
        if (amount) {
            element.setAttribute('data-pp-amount', amount);
        } else {
            element.removeAttribute('data-pp-amount');
        }
        return element;
    }

    protected override updated(): void {
        if (this._status === 'ready') {
            void this._renderMessage();
            return;
        }
        if (this._initQueued || !this._needsInit()) return;
        this._initQueued = true;
        queueMicrotask(() => {
            this._initQueued = false;
            if (this._needsInit()) void this._init();
        });
    }

    private _needsInit(): boolean {
        const config = getPaypalExpressConfig();
        return this.isConnected && this._status === 'idle' && config !== null && this._usesSdk(config);
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        const config = getPaypalExpressConfig();
        if (!config) return;
        this._status = 'loading';
        try {
            const sdk = await loadPaypalSdk(config.sdkUrl, config.dataAttributes);
            if (stale()) return;
            this._sdk = sdk;
            if (isInContext(this.code)) {
                await this._renderButton(sdk, config);
                if (stale()) return;
            }
            this._status = 'ready';
        } catch (err) {
            if (stale()) return;
            // eslint-disable-next-line no-console
            console.error('[hyperion-checkout] PayPal Express could not be initialised', err);
            this._status = 'error';
        }
    }

    private async _renderButton(sdk: PaypalSdk, config: PaypalExpressConfig): Promise<void> {
        const container = this.querySelector<HTMLElement>('[data-paypal-express-button]');
        if (!container) throw new Error('missing PayPal button container');
        await this._closeButton();
        container.replaceChildren();
        const button = sdk.Buttons({
            style: config.styles,
            onClick: (data, actions) => {
                fundingSource = data.fundingSource ?? '';
                this._cancelled = false;
                const blocker = getCheckoutBlocker();
                if (blocker === null) {
                    getStore().globalError.set(null);
                    return actions.resolve();
                }
                reportFailure(blocker);
                return actions.reject();
            },
            createOrder: createPaypalOrder,
            onApprove: approvePaypalOrder,
            onCancel: () => {
                this._cancelled = true;
            },
            onError: (err) => {
                // eslint-disable-next-line no-console
                console.error('[hyperion-checkout] PayPal Express button error', err);
                if (!failureReported) reportFailure('');
                failureReported = false;
            },
        });
        if (button.isEligible && !button.isEligible()) throw new Error('PayPal button is not eligible');
        await button.render(container);
        this._button = button;
    }

    private async _renderMessage(): Promise<void> {
        const sdk = this._sdk;
        const element = this._message;
        if (!sdk?.Messages || element === null || !element.isConnected) return;
        const amount = element.getAttribute('data-pp-amount') ?? '';
        if (this._renderedAmount === amount) return;
        this._renderedAmount = amount;
        try {
            await sdk.Messages(amount ? { amount: Number(amount) } : {}).render(element);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[hyperion-checkout] PayPal Pay Later message could not be rendered', err);
        }
    }

    private async _closeButton(): Promise<void> {
        const button = this._button;
        this._button = null;
        try {
            await button?.close?.();
        } catch {
            // The button is already gone with its container.
        }
    }

    private _onRetry = (): void => {
        void this._init();
    };
}

if (!customElements.get('payment-paypal-express')) {
    customElements.define('payment-paypal-express', PaymentPaypalExpress);
}

export function registerPaypalExpressRenderers(): void {
    for (const code of PAYPAL_EXPRESS_CODES) {
        registerPaymentRenderer({
            code,
            component: 'payment-paypal-express',
            isAvailable: () => getStartUrl(code) !== null,
            ownsPlaceOrder: () => isInContext(code),
            placeOrder: () => startPaypalRedirect(code),
        });
    }
}

registerPaypalExpressRenderers();

declare global {
    interface HTMLElementTagNameMap { 'payment-paypal-express': PaymentPaypalExpress; }
}

export { getCheckoutBlocker };
