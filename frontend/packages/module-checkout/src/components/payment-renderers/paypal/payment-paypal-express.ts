// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-paypal-express> -- PayPal Express Checkout (`paypal_express`,
 * `payflow_express`), the Lit counterpart of core's
 * `method-renderer/in-context/checkout-express.js` and `paypal-express.js`.
 * Its configuration is `options.paypalExpress` (the slice of
 * `HyperionCheckout\Model\Checkout\PaypalExpressConfigProvider`).
 *
 * In-context (`paypal_express` with "In-Context Checkout Experience" on):
 * the PayPal smart button replaces the Place Order button
 * (`ownsPlaceOrder`). The click waits until every pending edit is on the
 * quote and the checkout is complete (`context.requestCheckoutValidation()`;
 * the SDK holds its window on a loader while the promise of `onClick` is
 * open); `createOrder` saves the payment method and billing address on the
 * quote, then asks `paypal/express/getTokenData` for the transaction token
 * while the quote is held as it is; `onApprove` places the order through the
 * checkout's pipeline (`context.placeOrder()`), whose last step is this
 * element's `placeOrder()`: it hands the approval to
 * `paypal/express/onAuthorization` with the write queue closed and continues
 * on its `redirectUrl` (success page when the review step is skipped,
 * `paypal/express/review` otherwise). An approval that got no usable answer
 * may have placed the order: the quote is asked.
 *
 * The two `paypal/express/*` calls are storefront controllers, not REST
 * writes of the checkout, so they cannot be entries of the write queue.
 *
 * Redirect (in-context off, and always for the Payflow edition): the body
 * shows the PayPal mark and a note; Place Order saves the payment
 * information and continues on `paypal/express/start`, which sends the
 * shopper to paypal.com (`placeOrder()` answers the redirect).
 *
 * Both flows offer the billing agreement checkbox when the server names
 * its `additional_data` key for the method (a logged-in customer of a store
 * that asks): the choice travels in the payment data saved before PayPal
 * opens.
 *
 * The PayPal SDK is requested when this element is connected, which only
 * happens once the shopper selected the method.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import type {
    PaymentContext,
    PaymentData,
    PaymentMethodInfo,
    PlaceOrderOutcome,
    Unsubscribe,
    VaultTokenInfo,
} from '../../../../extension-api.js';
import type { PaypalExpressConfig } from '../../../types/config.js';
import { firstPartyOf, type FirstPartyServices } from '../first-party.js';
import { PaypalExpressError, authorizePaypalPayment, requestPaypalToken } from './api.js';
import { getBillingAgreementCode, getPaypalExpressConfig, getStartUrl, isInContext } from './config.js';
import { loadPaypalSdk } from './sdk.js';
import type { PaypalApproveData, PaypalButtonsInstance, PaypalSdk } from './types.js';
import '../../ui/checkbox.js';

type Status = 'idle' | 'loading' | 'ready' | 'error';

const FAILED = 'Something went wrong with your PayPal payment. Please try again later.';

function isSameOrigin(url: string): boolean {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.origin === window.location.origin && (parsed.protocol === 'https:' || parsed.protocol === 'http:');
    } catch {
        return false;
    }
}

function messageOf(err: unknown): string {
    return err instanceof PaypalExpressError ? err.message : '';
}

/** The Pay Later message amount is the base grand total: the SDK is loaded for the base currency. */
export function getPayLaterAmount(baseGrandTotal: unknown): string {
    const amount = parseFloat(String(baseGrandTotal ?? ''));
    return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '';
}

export class PaymentPaypalExpress extends LitElement {
    public static readonly hyperionApi = '1';

    /** A method without a start URL cannot be paid with. */
    public static canMakePayment(args: { method: PaymentMethodInfo; options: Readonly<Record<string, unknown>> }): boolean {
        return getStartUrl(getPaypalExpressConfig(args.options), args.method.code) !== null;
    }

    /** Core checks no reCAPTCHA form on a PayPal Express order. */
    public static hyperionRecaptchaAction(): null {
        return null;
    }

    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: PaymentMethodInfo;
    public config: Readonly<Record<string, unknown>> = {};
    public token: VaultTokenInfo | null = null;

    @state() private _status: Status = 'idle';
    @state() private _canceled = false;
    @state() private _billingAgreement = false;
    @state() private _payLaterAmount = '';

    private _sdk: PaypalSdk | null = null;
    private _button: PaypalButtonsInstance | null = null;
    private _message: HTMLElement | null = null;
    private _renderedAmount: string | null = null;
    private _generation = 0;
    private _initQueued = false;
    private _unsubscribe: Unsubscribe | null = null;
    /** Funding source of the last click (PayPal, Pay Later, ...), sent with the approval like core does. */
    private _fundingSource = '';
    /** The approval the smart button handed over, until the order pipeline places it. */
    private _approval: PaypalApproveData | null = null;
    /**
     * True once a step of ours put its reason in the error banner. PayPal
     * calls `onError` for every rejected `createOrder`, and that generic
     * handler must not replace the precise message.
     */
    private _failureReported = false;

    public override createRenderRoot(): HTMLElement { return this; }

    /** The smart button completes the order in the in-context flow. */
    public get ownsPlaceOrder(): boolean {
        return isInContext(this._config(), this.method?.code ?? '');
    }

    private get _services(): FirstPartyServices {
        const services = firstPartyOf(this.context);
        if (services === null) throw new Error('the PayPal Express renderer needs the first-party context');
        return services;
    }

    private _config(): PaypalExpressConfig | null {
        return getPaypalExpressConfig(this.options);
    }

    public override connectedCallback(): void {
        super.connectedCallback();
        const amount = (): string => getPayLaterAmount(this._services.quote().totals?.base_grand_total);
        this._payLaterAmount = amount();
        this._unsubscribe = this.context.subscribe(() => {
            this._payLaterAmount = amount();
        });
        this.dispatchEvent(new CustomEvent('hyperion-payment:ready', { bubbles: true, composed: true, detail: {} }));
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._generation++;
        this._status = 'idle';
        this._sdk = null;
        this._renderedAmount = null;
        void this._closeButton();
    }

    /* ------------------------------------------------------------------ failures */

    private _reportFailure(message: string): void {
        this.context.setError(message || this.context.t(FAILED));
        this._failureReported = true;
    }

    /**
     * Report why the payment cannot go ahead. A save that failed already
     * shows its reason next to the controls it belongs to: that message is
     * not repeated in the banner.
     */
    private _reportBlocker(message: string): void {
        if (message !== '' && this._services.failureMessage() === message) {
            this._failureReported = true;
            return;
        }
        this._reportFailure(message);
    }

    /* ------------------------------------------------------------------ payment data */

    /** The billing agreement choice, where the payment information request reads it. */
    private _paymentData(): PaymentData {
        const key = getBillingAgreementCode(this._config(), this.method.code);
        return key !== null && this._billingAgreement ? { additional_data: { [key]: 1 } } : {};
    }

    public getPaymentData(): PaymentData {
        return this._paymentData();
    }

    /* ------------------------------------------------------------------ smart button */

    /**
     * `createOrder` of the smart button. The click already put the pending
     * edits on the quote (`requestCheckoutValidation()` in `onClick`); the
     * gate is read once more as it stands, because the SDK calls this in a
     * later task.
     */
    public async createPaypalOrder(): Promise<string> {
        const config = this._config();
        this._failureReported = false;
        const blocker = config ? this.context.snapshot().blocker : '';
        if (!config || blocker !== null) {
            this._reportBlocker(blocker ?? '');
            throw new PaypalExpressError(blocker ?? '');
        }
        if (!(await this.context.savePaymentInformation(this._paymentData()))) {
            this._failureReported = true;
            throw new PaypalExpressError('');
        }
        // The token is created for the quote as it is now: the totals read
        // that follows the save must be in, and nothing may be written
        // meanwhile.
        const snapshot = this.context.snapshot();
        try {
            return await this._services.holdQuote(() => requestPaypalToken({
                url: config.getTokenUrl,
                quoteId: snapshot.cartId,
                customerId: snapshot.customerId === null ? '' : String(snapshot.customerId),
            }));
        } catch (err) {
            this._reportFailure(messageOf(err));
            throw err;
        }
    }

    /**
     * `onApprove` of the smart button: the order goes through the checkout's
     * pipeline, which ends in `placeOrder()` below. Resolves in every case.
     */
    public async approvePaypalOrder(data: PaypalApproveData): Promise<void> {
        this._failureReported = false;
        this._approval = data;
        try {
            await this.context.placeOrder(this._paymentData());
        } finally {
            this._approval = null;
            this._fundingSource = '';
        }
    }

    /**
     * The order step of the pipeline. In context: the approval is handed to
     * PayPal's controller, which places the order when the review step is
     * skipped. Redirect flow: the payment information is saved and the
     * browser continues on the start URL.
     */
    public async placeOrder(): Promise<PlaceOrderOutcome> {
        const code = this.method.code;
        const config = this._config();
        const approval = this._approval;
        if (approval !== null && config !== null) return this._authorize(config, approval);
        const startUrl = getStartUrl(config, code);
        if (startUrl === null || isInContext(config, code)) {
            this._reportFailure('');
            return { status: 'failed' };
        }
        const blocker = this.context.snapshot().blocker;
        if (blocker !== null) {
            this._reportBlocker(blocker);
            return { status: 'failed' };
        }
        return (await this.context.savePaymentInformation(this._paymentData()))
            ? { status: 'redirect', url: startUrl }
            : { status: 'failed' };
    }

    private async _authorize(config: PaypalExpressConfig, approval: PaypalApproveData): Promise<PlaceOrderOutcome> {
        const services = this._services;
        try {
            const redirectUrl = await services.sendOrderRequest(() => authorizePaypalPayment({
                url: config.onAuthorizeUrl,
                token: approval.orderID,
                payerId: approval.payerID ?? '',
                fundingSource: this._fundingSource,
            }));
            if (!isSameOrigin(redirectUrl)) throw new PaypalExpressError('');
            // The order exists, or continues on PayPal's review page with the
            // quote as it is: what was typed here is no longer needed.
            services.forgetTypedInput();
            return { status: 'redirect', url: redirectUrl };
        } catch (err) {
            if (!(err instanceof PaypalExpressError) || err.unanswered) {
                this._failureReported = true;
                // A server error status may sit in front of a request still at work.
                const placed = await services.resolveLostOrder(err instanceof PaypalExpressError ? 'unavailable' : 'network');
                return placed ? { status: 'placed' } : { status: 'canceled' };
            }
            this._reportFailure(messageOf(err));
            return { status: 'failed' };
        }
    }

    /* ------------------------------------------------------------------ rendering */

    public override render(): unknown {
        const config = this._config();
        if (!config) return nothing;
        const code = this.method.code;
        const inContext = isInContext(config, code);
        return html`
            <div class="space-y-3">
                ${this._renderMark(config)}
                ${inContext
                    ? html`<p class="text-sm text-muted">${this.context.t('Pay with the PayPal button to complete your order.')}</p>`
                    : html`<p class="text-sm text-muted" data-paypal-express-redirect>
                          ${this.context.t('You will be redirected to PayPal to complete your payment.')}
                      </p>`}
                ${getBillingAgreementCode(config, code) !== null
                    ? html`<hc-checkbox
                              name="paypal_express_billing_agreement"
                              label=${this.context.t('Sign a billing agreement to streamline further purchases with PayPal.')}
                              .checked=${this._billingAgreement}
                              @value-change=${this._onBillingAgreementChange}
                          ></hc-checkbox>`
                    : nothing}
                ${this._canceled
                    ? html`<p class="text-sm text-muted" role="status">
                          ${this.context.t('The PayPal payment was canceled. You can try again or choose another payment method.')}
                      </p>`
                    : nothing}
                ${this._status === 'loading'
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${this.context.t('Loading PayPal...')}
                      </p>`
                    : nothing}
                ${this._status === 'error'
                    ? html`<p role="alert" class="text-sm text-danger">
                              ${this.context.t('PayPal could not be loaded. Try again or choose another payment method.')}
                          </p>
                          <button type="button"
                                  class="text-sm text-accent hover:underline"
                                  @click=${this._onRetry}>
                              ${this.context.t('Try again')}
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
                                alt=${this.context.t('PayPal')}
                                class="h-8 w-auto"
                                loading="lazy" />`
                    : nothing}
                ${config.whatIsPaypalUrl
                    ? html`<a href=${config.whatIsPaypalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-sm text-accent hover:underline">
                              ${this.context.t('What is PayPal?')}
                          </a>`
                    : nothing}
            </div>
        `;
    }

    private _usesSdk(config: PaypalExpressConfig): boolean {
        return config.sdkUrl !== '' && (isInContext(config, this.method.code) || config.payLater !== null);
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
        const amount = payLater.displayAmount ? this._payLaterAmount : '';
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
        const config = this._config();
        return this.isConnected && this._status === 'idle' && config !== null && this._usesSdk(config);
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        const config = this._config();
        if (!config) return;
        this._status = 'loading';
        try {
            const sdk = await loadPaypalSdk(this.context, config.sdkUrl, config.dataAttributes);
            if (stale()) return;
            this._sdk = sdk;
            if (isInContext(config, this.method.code)) {
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
                this._fundingSource = data.fundingSource ?? '';
                this._canceled = false;
                if (await this.context.requestCheckoutValidation()) {
                    this.context.setError(null);
                    return actions.resolve();
                }
                return actions.reject();
            },
            createOrder: () => this.createPaypalOrder(),
            onApprove: (data) => this.approvePaypalOrder(data),
            onCancel: () => {
                this._canceled = true;
            },
            onError: (err) => {
                console.error('[hyperion-checkout] PayPal Express button error', err);
                if (!this._failureReported) this._reportFailure('');
                this._failureReported = false;
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
        this._billingAgreement = e.detail.checked;
    };
}

if (!customElements.get('hc-payment-paypal-express')) {
    customElements.define('hc-payment-paypal-express', PaymentPaypalExpress);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-paypal-express': PaymentPaypalExpress; }
}
