// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-braintree-googlepay> -- Google Pay through Braintree
 * (`braintree_googlepay`).
 *
 * The method owns Place Order, like core's renderer: the Google Pay button
 * is the control that completes the order.
 *   1. On selection the Braintree `google-payment` component and Google's
 *      `pay.js` are loaded, a `PaymentsClient` is created for the configured
 *      environment and `isReadyToPay` decides whether the button renders at
 *      all (otherwise the row explains that Google Pay is not available in
 *      this browser).
 *   2. A click checks the same gate as the checkout's own button (email,
 *      addresses, the shipping method the server confirmed, agreements,
 *      totals that are not being refreshed) and opens the Google Pay sheet
 *      with the base grand total, the base currency and the cart lines as
 *      display items. The sheet is a window Google opens, and a browser
 *      only allows that inside the click: nothing is awaited between the
 *      click and `loadPaymentData()`. So the gate is read as it stands,
 *      which is exact when it is open (no edit is waiting, no save is
 *      running). When it is closed, the click saves what is pending and
 *      names what is missing or being updated, and the next click pays.
 *   3. Google's response is parsed into a Braintree nonce. A card that is
 *      not network tokenized goes through 3D Secure under the usual rules;
 *      a network tokenized one is already verified by the network.
 *   4. The order is placed at once through the checkout's order pipeline
 *      (`context.placeOrder()`) with `payment_method_nonce`, `device_data`,
 *      `is_network_tokenized` and, for an active vault with a non tokenized
 *      card, `is_active_payment_token_enabler`. The nonce is single use: a
 *      failed order drops it and the shopper pays again.
 * Closing the sheet is not an error.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import type {
    PaymentContext,
    PaymentMethodInfo,
    Unsubscribe,
    VaultTokenInfo,
} from '../../../../extension-api.js';
import { firstPartyOf, type FirstPartyQuote, type FirstPartyServices } from '../first-party.js';
import { getBraintreeClient, getDeviceData } from './client.js';
import {
    BRAINTREE_GOOGLEPAY_CODE,
    getBraintreeGooglePayConfig,
    isVaultEnabledFor,
    type BraintreeGooglePayConfig,
} from './config.js';
import { buildGooglePayDisplayItems } from './line-items.js';
import { getBaseCurrencyCode, getBaseGrandTotal } from './quote.js';
import { loadBraintreeModule, loadGooglePayLibrary } from './sdk.js';
import { verifyThreeDSecure } from './three-d-secure.js';
import type {
    GooglePayError,
    GooglePayPaymentData,
    GooglePayPaymentDataRequest,
    GooglePaymentInstance,
    GooglePaymentsClient,
} from './types.js';
import '../../ui/checkbox.js';

type Status = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export function buildPaymentDataRequest(
    config: BraintreeGooglePayConfig,
    quote: FirstPartyQuote,
    t: (source: string) => string
): Partial<GooglePayPaymentDataRequest> {
    const request: Partial<GooglePayPaymentDataRequest> = {
        transactionInfo: {
            currencyCode: getBaseCurrencyCode(quote),
            totalPrice: getBaseGrandTotal(quote),
            totalPriceStatus: 'FINAL',
            totalPriceLabel: t('Total'),
            displayItems: buildGooglePayDisplayItems(quote.items, quote.totals, config.priceIncludesTax, t),
        },
        allowedPaymentMethods: [{
            type: 'CARD',
            parameters: {
                ...(config.cardTypes.length > 0 ? { allowedCardNetworks: config.cardTypes } : {}),
                billingAddressRequired: true,
                billingAddressParameters: { format: 'FULL', phoneNumberRequired: true },
            },
        }],
        emailRequired: false,
        shippingAddressRequired: false,
    };
    if (config.environment === 'PRODUCTION' && config.merchantId) {
        request.merchantInfo = { merchantId: config.merchantId };
    }
    return request;
}

function isCancellation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as GooglePayError).statusCode === 'CANCELED';
}

const FAILED = 'The Google Pay payment could not be completed. Please try again.';

export class PaymentBraintreeGooglepay extends LitElement {
    public static readonly hyperionApi = '1';

    /** Hidden without a client token, like core's renderer. */
    public static canMakePayment(args: { config: Readonly<Record<string, unknown>> }): boolean {
        const config = getBraintreeGooglePayConfig({ payment: { [BRAINTREE_GOOGLEPAY_CODE]: { ...args.config } } });
        return Boolean(config?.isActive && config.clientToken);
    }

    /** Core checks no reCAPTCHA form on a Google Pay order. */
    public static hyperionRecaptchaAction(): null {
        return null;
    }

    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: PaymentMethodInfo;
    public config: Readonly<Record<string, unknown>> = {};
    public token: VaultTokenInfo | null = null;
    /** The Google Pay button completes the order, like core's renderer. */
    public readonly ownsPlaceOrder = true;

    @state() private _status: Status = 'idle';
    @state() private _message: string | null = null;
    @state() private _saveCard = false;
    /** The sheet is open or the order is on its way: the button ignores clicks. */
    @state() private _paying = false;
    /** Google confirmed the payment and the order is being placed. */
    @state() private _placing = false;
    /** An order is being placed (by any control): the button waits. */
    @state() private _orderUnderWay = false;

    private _instance: GooglePaymentInstance | null = null;
    private _client: GooglePaymentsClient | null = null;
    private _generation = 0;
    private _initQueued = false;
    private _unsubscribe: Unsubscribe | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    private get _services(): FirstPartyServices {
        const services = firstPartyOf(this.context);
        if (services === null) throw new Error('the Google Pay renderer needs the first-party context');
        return services;
    }

    private _config(): BraintreeGooglePayConfig | null {
        return getBraintreeGooglePayConfig(this._services.config());
    }

    public override connectedCallback(): void {
        super.connectedCallback();
        this._orderUnderWay = this.context.snapshot().isPlacingOrder;
        this._unsubscribe = this.context.subscribe((snapshot) => {
            this._orderUnderWay = snapshot.isPlacingOrder;
        });
        this.dispatchEvent(new CustomEvent('hyperion-payment:ready', { bubbles: true, composed: true, detail: {} }));
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._generation++;
        this._status = 'idle';
        void this._teardown();
    }

    public override render(): unknown {
        const config = this._config();
        const vaultEnabled = config !== null && isVaultEnabledFor(this._services.config(), config.vaultCode);
        const busy = this._paying || this._orderUnderWay;
        const placing = this._placing || this._orderUnderWay;
        return html`
            <div class="space-y-3">
                <p class="text-sm text-muted">${this.context.t('Pay with Google Pay. Your order is placed as soon as Google confirms the payment.')}</p>
                ${vaultEnabled
                    ? html`<hc-checkbox
                              name="braintree_googlepay_save"
                              label=${this.context.t('Save this card for future purchases')}
                              .checked=${this._saveCard}
                              @value-change=${this._onSaveChange}
                          ></hc-checkbox>`
                    : nothing}
                ${this._status === 'loading'
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${this.context.t('Loading Google Pay...')}
                      </p>`
                    : nothing}
                ${placing
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${this.context.t('Processing your order\u2026')}
                      </p>`
                    : nothing}
                ${this._message
                    ? html`<p role="alert" class="text-sm text-danger">${this._message}</p>`
                    : nothing}
                ${this._status === 'error'
                    ? html`<button type="button"
                                   class="text-sm text-accent hover:underline"
                                   @click=${this._onRetry}>
                              ${this.context.t('Try again')}
                          </button>`
                    : nothing}
                <div class="max-w-sm ${busy ? 'pointer-events-none opacity-60' : ''}"
                     data-googlepay-button
                     aria-busy=${busy ? 'true' : 'false'}></div>
            </div>
        `;
    }

    protected override updated(): void {
        if (this._initQueued || !this._needsInit()) return;
        this._initQueued = true;
        queueMicrotask(() => {
            this._initQueued = false;
            if (this._needsInit()) void this._init();
        });
    }

    private _needsInit(): boolean {
        return this.isConnected && this._status === 'idle';
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        this._status = 'loading';
        this._message = null;
        try {
            const config = this._config();
            if (!config?.clientToken) throw new Error('missing Braintree client token');
            const [client, googlePayment, google] = await Promise.all([
                getBraintreeClient(this.context, config.clientToken),
                loadBraintreeModule(this.context, 'google-payment'),
                loadGooglePayLibrary(this.context),
            ]);
            void getDeviceData(this.context, config.clientToken);
            if (stale()) return;
            await this._teardown();
            const instance = await googlePayment.create({
                client,
                googlePayVersion: 2,
                ...(config.environment === 'PRODUCTION' && config.merchantId ? { googleMerchantId: config.merchantId } : {}),
            });
            if (stale()) {
                void instance.teardown?.().catch(() => undefined);
                return;
            }
            this._instance = instance;
            const paymentsClient = new google.payments.api.PaymentsClient({ environment: config.environment });
            this._client = paymentsClient;
            const allowedPaymentMethods = instance.createPaymentDataRequest(this._request(config)).allowedPaymentMethods;
            const ready = await paymentsClient.isReadyToPay({ apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods });
            if (stale()) return;
            if (!ready.result) {
                this._status = 'unavailable';
                this._message = this.context.t('Google Pay is not available in this browser. Please choose another payment method.');
                return;
            }
            const container = this.querySelector<HTMLElement>('[data-googlepay-button]');
            if (!container) throw new Error('missing Google Pay button container');
            const locale = this._services.config().hyperion?.locale;
            container.replaceChildren(paymentsClient.createButton({
                onClick: this._onPay,
                buttonColor: config.buttonColor,
                buttonType: 'buy',
                buttonSizeMode: 'fill',
                ...(locale ? { buttonLocale: locale.slice(0, 2) } : {}),
                allowedPaymentMethods,
            }));
            this._status = 'ready';
        } catch (err) {
            if (stale()) return;
            console.error('[hyperion-checkout] Braintree Google Pay could not be initialized', err);
            this._status = 'error';
            this._message = this.context.t('Google Pay could not be loaded. Try again or choose another payment method.');
        }
    }

    private _request(config: BraintreeGooglePayConfig): Partial<GooglePayPaymentDataRequest> {
        return buildPaymentDataRequest(config, this._services.quote(), (source) => this.context.t(source));
    }

    /** The button click: gate, Google Pay sheet, nonce, 3D Secure, order. */
    private _onPay = async (event: Event): Promise<void> => {
        event.preventDefault();
        const config = this._config();
        const instance = this._instance;
        const client = this._client;
        const snapshot = this.context.snapshot();
        if (this._paying || snapshot.isPlacingOrder || !config || !instance || !client) return;
        const blocker = snapshot.blocker;
        if (blocker !== null) {
            // The sheet may only open inside the click: put the pending edits
            // on the quote for the next click. What is still missing or
            // failed replaces the first message; when everything was saved
            // the first message stays, because the shopper has to press again.
            this.context.setError(blocker);
            this._paying = true;
            try {
                if (await this.context.requestCheckoutValidation()) this.context.setError(blocker);
            } finally {
                if (this.isConnected) this._paying = false;
            }
            return;
        }
        this.context.setError(null);
        this._message = null;
        this._paying = true;
        let placed = false;
        try {
            let paymentData: GooglePayPaymentData;
            try {
                paymentData = await client.loadPaymentData(instance.createPaymentDataRequest(this._request(config)));
            } catch (err) {
                if (!isCancellation(err)) {
                    console.error('[hyperion-checkout] Google Pay sheet failed', err);
                    this._message = this.context.t(FAILED);
                }
                return;
            }
            this._placing = true;
            const data = await this._collectPaymentData(config, instance, paymentData);
            // A number, or an order the quote confirmed after its answer was
            // lost: the checkout continues on the success page.
            const outcome = await this.context.placeOrder({ additional_data: data });
            placed = outcome.status === 'placed' || outcome.status === 'redirect';
        } catch (err) {
            this._message = (err as Error).message || this.context.t(FAILED);
        } finally {
            // Once the order exists the button stays busy until the
            // browser leaves the page.
            if (this.isConnected && !placed) {
                this._paying = false;
                this._placing = false;
            }
        }
    };

    private async _collectPaymentData(
        config: BraintreeGooglePayConfig,
        instance: GooglePaymentInstance,
        paymentData: GooglePayPaymentData
    ): Promise<Record<string, unknown>> {
        let payload;
        try {
            payload = await instance.parseResponse(paymentData);
        } catch (err) {
            console.error('[hyperion-checkout] Google Pay response could not be tokenized', err);
            throw new Error(this.context.t(FAILED), { cause: err });
        }
        const networkTokenized = payload.details.isNetworkTokenized === true;
        const vaultEnabled = isVaultEnabledFor(this._services.config(), config.vaultCode);
        const savingCard = vaultEnabled && !networkTokenized && this._saveCard;
        const nonce = networkTokenized
            ? payload.nonce
            : await verifyThreeDSecure(this.context, {
                authorization: config.clientToken,
                nonce: payload.nonce,
                bin: payload.details.bin ?? '',
                storedCard: false,
                savingCard,
            });
        const deviceData = await getDeviceData(this.context, config.clientToken);
        return {
            payment_method_nonce: nonce,
            ...(deviceData ? { device_data: deviceData } : {}),
            is_network_tokenized: networkTokenized,
            ...(vaultEnabled && !networkTokenized ? { is_active_payment_token_enabler: savingCard } : {}),
        };
    }

    private async _teardown(): Promise<void> {
        const instance = this._instance;
        this._instance = null;
        this._client = null;
        if (!instance?.teardown) return;
        try {
            await instance.teardown();
        } catch (err) {
            console.error('[hyperion-checkout] Braintree Google Pay teardown failed', err);
        }
    }

    private _onSaveChange(e: CustomEvent<{ checked: boolean }>): void {
        this._saveCard = e.detail.checked;
    }

    private _onRetry = (): void => {
        this._status = 'idle';
        this.requestUpdate();
    };
}

if (!customElements.get('hc-payment-braintree-googlepay')) {
    customElements.define('hc-payment-braintree-googlepay', PaymentBraintreeGooglepay);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-braintree-googlepay': PaymentBraintreeGooglepay; }
}
