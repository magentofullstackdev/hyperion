// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-paypal-express> -- PayPal Express Checkout (`paypal_express`,
 * `payflow_express`), the Lit counterpart of core's
 * `method-renderer/in-context/checkout-express.js` and `paypal-express.js`.
 *
 * In-context (`paypal_express` with "In-Context Checkout Experience" on):
 * the PayPal smart button replaces the Place Order button
 * (`ownsPlaceOrder`). The click waits until every pending edit is on the
 * quote and the checkout is complete (the SDK holds its window on a loader
 * while the promise of `onClick` is open); `createOrder` saves the payment
 * method and billing address on the quote, then asks
 * `paypal/express/getTokenData` for the transaction token; `onApprove`
 * hands the approval to `paypal/express/onAuthorization` and follows its
 * `redirectUrl` (success page when the review step is skipped,
 * `paypal/express/review` otherwise).
 *
 * The two `paypal/express/*` calls are storefront controllers, not REST
 * writes of the checkout, so they cannot be entries of the write queue.
 * They read or order the quote as it is, so each runs once the queue is
 * idle, under the latch of an order (`isPlacingOrder`) and with the queue
 * closed: no save of the checkout can start while PayPal is given the
 * quote or the order is placed.
 *
 * Redirect (in-context off, and always for the Payflow edition): the body
 * shows the PayPal mark and a note; Place Order saves the payment
 * information and continues on `paypal/express/start`, which sends the
 * shopper to paypal.com (`placeOrder` hook).
 *
 * Both flows offer the billing agreement checkbox when the server names
 * its `additional_data` key for the method (a logged-in customer of a store
 * that asks): the choice is kept in the payment data of the method, so it
 * travels with the payment information saved before PayPal opens.
 *
 * The PayPal SDK is requested when this element is connected, which only
 * happens once the shopper selected the method.
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { discardDrafts } from '../../../store/drafts.js';
import { getStore } from '../../../store/index.js';
import { flowActions } from '../../../store/flow-actions.js';
import { failureMessage } from '../../../store/section-status.js';
import { getCheckoutConfig } from '../../../bootstrap-config.js';
import { t } from '../../../utils/i18n.js';
import { navigateTo } from '../../../utils/navigate.js';
import { decideRedirectTarget, resolveSameOriginUrl } from '../../../utils/safe-redirect.js';
import { getCheckoutBlocker, prepareCheckout } from '../checkout-gate.js';
import { registerPaymentRenderer } from '../registry.js';
import { PaypalExpressError, authorizePaypalPayment, requestPaypalToken } from './api.js';
import {
    PAYPAL_EXPRESS_CODE,
    PAYPAL_EXPRESS_CODES,
    getBillingAgreementCode,
    getPaypalExpressConfig,
    getStartUrl,
    isInContext,
} from './config.js';
import { loadPaypalSdk } from './sdk.js';
import type { PaypalExpressConfig } from '../../../types/config.js';
import type { PaypalApproveData, PaypalButtonsInstance, PaypalSdk } from './types.js';
import '../../ui/checkbox.js';

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

/**
 * Report why the payment cannot go ahead. A save that failed already shows
 * its reason next to the controls it belongs to: that message is not
 * repeated in the banner.
 */
function reportBlocker(message: string): void {
    if (message !== '' && failureMessage() === message) {
        failureReported = true;
        return;
    }
    reportFailure(message);
}

function messageOf(err: unknown): string {
    return err instanceof PaypalExpressError ? err.message : '';
}

/**
 * A billing address entered on its own must be on the quote before the
 * payment information is saved for the wallet. Returns false, with the
 * reason reported, when it could not be put there.
 */
async function ensureBillingSynced(): Promise<boolean> {
    const store = getStore();
    const needsOwnSync = store.isVirtual.get() || !store.billingSameAsShipping.get();
    if (!needsOwnSync || store.billingSynced.get()) return true;
    await flowActions().syncBillingAddress();
    if (store.billingSynced.get()) return true;
    reportBlocker(savedAddressFailure() ?? t('Hyperion_Checkout::checkout_incomplete_billing_address'));
    return false;
}

/** The reason a save of the billing address (alone, or with the shipping information) failed. */
function savedAddressFailure(): string | null {
    return failureMessage('billing', 'shipping-methods');
}

export function isBillingAgreementRequested(code: string): boolean {
    const key = getBillingAgreementCode(code);
    return key !== null && Boolean(getStore().paymentMethodData.get()[code]?.[key]);
}

/** Keep the billing agreement choice where the payment information request reads its `additional_data`. */
export function setBillingAgreementRequested(code: string, requested: boolean): void {
    const key = getBillingAgreementCode(code);
    if (key === null) return;
    const store = getStore();
    const all = store.paymentMethodData.get();
    const data = { ...(all[code] ?? {}) };
    if (requested) {
        data[key] = 1;
    } else {
        delete data[key];
    }
    store.paymentMethodData.set({ ...all, [code]: data });
}

/** The message amount is the base grand total: the SDK is loaded for the base currency. */
export function getPayLaterAmount(): string {
    const amount = parseFloat(String(getStore().totals.get()?.base_grand_total ?? ''));
    return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '';
}

/**
 * `createOrder` of the smart button. The click already put the pending
 * edits on the quote (`prepareCheckout()` in `onClick`); the gate is read
 * once more as it stands, because the SDK calls this in a later task.
 */
export async function createPaypalOrder(): Promise<string> {
    const store = getStore();
    const config = getPaypalExpressConfig();
    failureReported = false;
    const blocker = config ? getCheckoutBlocker() : '';
    if (!config || blocker !== null) {
        reportBlocker(blocker ?? '');
        throw new PaypalExpressError(blocker ?? '');
    }
    if (!(await ensureBillingSynced())) {
        throw new PaypalExpressError(savedAddressFailure() ?? store.globalError.get() ?? '');
    }
    if (!(await flowActions().savePaymentInformation())) {
        const reason = store.globalError.get() ?? '';
        reportFailure(reason);
        throw new PaypalExpressError(reason);
    }
    // The token is created for the quote as it is now: the totals read that
    // follows the save must be in, and nothing may be written meanwhile.
    // The latch goes with the closed queue: it keeps the flow from offering
    // a save the queue would refuse, so an edit made now simply waits for
    // the next flush.
    const queue = flowActions().queue;
    await queue.whenIdle();
    store.isPlacingOrder.set(true);
    queue.close();
    try {
        return await requestPaypalToken({
            url: config.getTokenUrl,
            quoteId: (store.isGuest.get() ? store.maskedQuoteId.get() : store.quoteId.get()) ?? '',
            customerId: String(store.customer.get()?.id ?? ''),
        });
    } catch (err) {
        reportFailure(messageOf(err));
        throw err;
    } finally {
        queue.reopen();
        store.isPlacingOrder.set(false);
    }
}

/**
 * `onApprove` of the smart button. The authorization places the order when
 * the review step is skipped, so it is sent like an order: after the
 * pending saves, under the latch and with the queue closed. Both hold
 * while the browser leaves the page and are given back when PayPal's
 * controller refuses the approval. An approval that got no usable answer
 * may have placed the order: the quote is asked, and the flow leaves for
 * the success page, releases the latch or keeps it with "Check again".
 * Resolves in every case: a failed approval is reported here.
 */
export async function approvePaypalOrder(data: PaypalApproveData): Promise<void> {
    const store = getStore();
    const config = getPaypalExpressConfig();
    failureReported = false;
    const blocker = await prepareCheckout();
    if (blocker !== null) {
        reportBlocker(blocker);
        fundingSource = '';
        return;
    }
    const queue = flowActions().queue;
    store.globalError.set(null);
    store.isPlacingOrder.set(true);
    queue.close();
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
        // The order exists, or continues on PayPal's review page with the
        // quote as it is: what was typed here is no longer needed.
        discardDrafts();
        navigateTo(target);
    } catch (err) {
        if (!(err instanceof PaypalExpressError) || err.unanswered) {
            failureReported = true;
            // A server error status may sit in front of a request still at work.
            const unavailable = err instanceof PaypalExpressError;
            const outcome = await flowActions().resolveLostOrder(unavailable ? 'unavailable' : 'network');
            if (outcome === 'placed-unconfirmed') {
                navigateTo(decideRedirectTarget(getCheckoutConfig().defaultSuccessPageUrl));
            }
            return;
        }
        store.isPlacingOrder.set(false);
        queue.reopen();
        reportFailure(messageOf(err));
    } finally {
        fundingSource = '';
    }
}

/**
 * Place Order of the redirect flow: core `set-payment-method` + redirect to
 * the start URL. The Place Order button calls it under the latch of its own
 * `prepareOrder()`, which already put the pending edits on the quote, so
 * the gate is only read here.
 */
export async function startPaypalRedirect(code: string): Promise<string | null> {
    const startUrl = getStartUrl(code);
    if (startUrl === null) {
        reportFailure('');
        return null;
    }
    const blocker = getCheckoutBlocker();
    if (blocker !== null) {
        reportBlocker(blocker);
        return null;
    }
    if (!(await ensureBillingSynced())) return null;
    return (await flowActions().savePaymentInformation()) ? startUrl : null;
}

export class PaymentPaypalExpress extends SignalWatcher(LitElement) {
    @property({ type: String }) public code = PAYPAL_EXPRESS_CODE;

    @state() private _status: Status = 'idle';
    @state() private _canceled = false;

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
                ${getBillingAgreementCode(this.code) !== null
                    ? html`<hc-checkbox
                              name="paypal_express_billing_agreement"
                              label=${t('Hyperion_Checkout::paypal_express_billing_agreement')}
                              .checked=${isBillingAgreementRequested(this.code)}
                              @value-change=${this._onBillingAgreementChange}
                          ></hc-checkbox>`
                    : nothing}
                ${this._canceled
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
            console.error('[hyperion-checkout] PayPal Express could not be initialized', err);
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
            onClick: async (data, actions) => {
                fundingSource = data.fundingSource ?? '';
                this._canceled = false;
                const blocker = await prepareCheckout();
                if (blocker === null) {
                    getStore().globalError.set(null);
                    return actions.resolve();
                }
                reportBlocker(blocker);
                return actions.reject();
            },
            createOrder: createPaypalOrder,
            onApprove: approvePaypalOrder,
            onCancel: () => {
                this._canceled = true;
            },
            onError: (err) => {
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

    private _onBillingAgreementChange = (e: CustomEvent<{ checked: boolean }>): void => {
        setBillingAgreementRequested(this.code, e.detail.checked);
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
            recaptchaAction: () => null,
            placeOrder: () => startPaypalRedirect(code),
        });
    }
}

registerPaypalExpressRenderers();

declare global {
    interface HTMLElementTagNameMap { 'payment-paypal-express': PaymentPaypalExpress; }
}

export { getCheckoutBlocker };
