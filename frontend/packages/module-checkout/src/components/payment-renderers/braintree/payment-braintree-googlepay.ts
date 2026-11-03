// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-braintree-googlepay> -- Google Pay through Braintree
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
 *      addresses, shipping method, agreements, totals) and opens the Google
 *      Pay sheet with the base grand total, the base currency and the cart
 *      lines as display items.
 *   3. Google's response is parsed into a Braintree nonce. A card that is
 *      not network tokenized goes through 3D Secure under the usual rules;
 *      a network tokenized one is already verified by the network.
 *   4. The order is placed at once with `payment_method_nonce`,
 *      `device_data`, `is_network_tokenized` and, for an active vault with a
 *      non tokenized card, `is_active_payment_token_enabler`. The nonce is
 *      single use: a failed order drops it and the shopper pays again.
 * Closing the sheet is not an error.
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getCheckoutConfig } from '../../../bootstrap-config.js';
import { getStore } from '../../../store/index.js';
import { flowActions } from '../../../store/flow-actions.js';
import { requestValidation } from '../../../store/validation-request.js';
import { t } from '../../../utils/i18n.js';
import { navigateTo } from '../../../utils/navigate.js';
import { decideRedirectTarget } from '../../../utils/safe-redirect.js';
import { getCheckoutBlocker } from '../checkout-gate.js';
import { registerPaymentRenderer } from '../registry.js';
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

/** `additional_data` of the order the shopper just authorised; cleared once used. */
let authorised: Record<string, unknown> | null = null;

export function getGooglePayAuthorisation(): Record<string, unknown> | null {
    return authorised;
}

export function buildPaymentDataRequest(config: BraintreeGooglePayConfig): Partial<GooglePayPaymentDataRequest> {
    const store = getStore();
    const request: Partial<GooglePayPaymentDataRequest> = {
        transactionInfo: {
            currencyCode: getBaseCurrencyCode(),
            totalPrice: getBaseGrandTotal(),
            totalPriceStatus: 'FINAL',
            totalPriceLabel: t('Hyperion_Checkout::braintree_line_total'),
            displayItems: buildGooglePayDisplayItems(store.items.get(), store.totals.get(), config.priceIncludesTax),
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

export class PaymentBraintreeGooglepay extends SignalWatcher(LitElement) {
    @property({ type: String }) public code = BRAINTREE_GOOGLEPAY_CODE;

    @state() private _status: Status = 'idle';
    @state() private _message: string | null = null;
    @state() private _saveCard = false;
    /** The sheet is open or the order is on its way: the button ignores clicks. */
    @state() private _paying = false;
    /** Google confirmed the payment and the order is being placed. */
    @state() private _placing = false;

    private _instance: GooglePaymentInstance | null = null;
    private _client: GooglePaymentsClient | null = null;
    private _generation = 0;
    private _initQueued = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._generation++;
        this._status = 'idle';
        void this._teardown();
    }

    public override render(): unknown {
        const config = getBraintreeGooglePayConfig();
        const vaultEnabled = config !== null && isVaultEnabledFor(config.vaultCode);
        const busy = this._paying || getStore().isPlacingOrder.get();
        const placing = this._placing || getStore().isPlacingOrder.get();
        return html`
            <div class="space-y-3">
                <p class="text-sm text-muted">${t('Hyperion_Checkout::braintree_googlepay_hint')}</p>
                ${vaultEnabled
                    ? html`<hc-checkbox
                              name="braintree_googlepay_save"
                              label=${t('Hyperion_Checkout::braintree_save_card')}
                              .checked=${this._saveCard}
                              @value-change=${this._onSaveChange}
                          ></hc-checkbox>`
                    : nothing}
                ${this._status === 'loading'
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${t('Hyperion_Checkout::braintree_googlepay_loading')}
                      </p>`
                    : nothing}
                ${placing
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${t('Hyperion_Checkout::placing_order')}
                      </p>`
                    : nothing}
                ${this._message
                    ? html`<p role="alert" class="text-sm text-danger">${this._message}</p>`
                    : nothing}
                ${this._status === 'error'
                    ? html`<button type="button"
                                   class="text-sm text-accent hover:underline"
                                   @click=${this._onRetry}>
                              ${t('Hyperion_Checkout::braintree_retry')}
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
            const config = getBraintreeGooglePayConfig();
            if (!config?.clientToken) throw new Error('missing Braintree client token');
            const [client, googlePayment, google] = await Promise.all([
                getBraintreeClient(config.clientToken),
                loadBraintreeModule('google-payment'),
                loadGooglePayLibrary(),
            ]);
            void getDeviceData(config.clientToken);
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
            const allowedPaymentMethods = instance.createPaymentDataRequest(buildPaymentDataRequest(config)).allowedPaymentMethods;
            const ready = await paymentsClient.isReadyToPay({ apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods });
            if (stale()) return;
            if (!ready.result) {
                this._status = 'unavailable';
                this._message = t('Hyperion_Checkout::braintree_googlepay_unavailable');
                return;
            }
            const container = this.querySelector<HTMLElement>('[data-googlepay-button]');
            if (!container) throw new Error('missing Google Pay button container');
            const locale = getCheckoutConfig().hyperion?.locale;
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
            // eslint-disable-next-line no-console
            console.error('[hyperion-checkout] Braintree Google Pay could not be initialised', err);
            this._status = 'error';
            this._message = t('Hyperion_Checkout::braintree_googlepay_init_failed');
        }
    }

    /** The button click: gate, Google Pay sheet, nonce, 3D Secure, order. */
    private _onPay = async (event: Event): Promise<void> => {
        event.preventDefault();
        const store = getStore();
        const config = getBraintreeGooglePayConfig();
        const instance = this._instance;
        const client = this._client;
        if (this._paying || store.isPlacingOrder.get() || !config || !instance || !client) return;
        const blocker = getCheckoutBlocker();
        if (blocker !== null) {
            requestValidation();
            store.globalError.set(blocker);
            return;
        }
        store.globalError.set(null);
        this._message = null;
        this._paying = true;
        try {
            let paymentData: GooglePayPaymentData;
            try {
                paymentData = await client.loadPaymentData(instance.createPaymentDataRequest(buildPaymentDataRequest(config)));
            } catch (err) {
                if (!isCancellation(err)) {
                    // eslint-disable-next-line no-console
                    console.error('[hyperion-checkout] Google Pay sheet failed', err);
                    this._message = t('Hyperion_Checkout::braintree_googlepay_failed');
                }
                return;
            }
            this._placing = true;
            const data = await this._collectPaymentData(config, instance, paymentData);
            authorised = data;
            store.paymentMethodData.set({ ...store.paymentMethodData.get(), [this.code]: data });
            const orderId = await flowActions().placeOrder();
            if (orderId !== null) {
                navigateTo(decideRedirectTarget(getCheckoutConfig().defaultSuccessPageUrl));
                return;
            }
            authorised = null;
        } catch (err) {
            authorised = null;
            this._message = (err as Error).message || t('Hyperion_Checkout::braintree_googlepay_failed');
        } finally {
            if (this.isConnected) {
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
            // eslint-disable-next-line no-console
            console.error('[hyperion-checkout] Google Pay response could not be tokenized', err);
            throw new Error(t('Hyperion_Checkout::braintree_googlepay_failed'));
        }
        const networkTokenized = payload.details.isNetworkTokenized === true;
        const vaultEnabled = isVaultEnabledFor(config.vaultCode);
        const savingCard = vaultEnabled && !networkTokenized && this._saveCard;
        const nonce = networkTokenized
            ? payload.nonce
            : await verifyThreeDSecure({
                authorization: config.clientToken,
                nonce: payload.nonce,
                bin: payload.details.bin ?? '',
                storedCard: false,
                savingCard,
            });
        const deviceData = await getDeviceData(config.clientToken);
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
            // eslint-disable-next-line no-console
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

if (!customElements.get('payment-braintree-googlepay')) {
    customElements.define('payment-braintree-googlepay', PaymentBraintreeGooglepay);
}

export function registerBraintreeGooglePayRenderer(): void {
    registerPaymentRenderer({
        code: BRAINTREE_GOOGLEPAY_CODE,
        component: 'payment-braintree-googlepay',
        isAvailable: () => {
            const config = getBraintreeGooglePayConfig();
            return Boolean(config?.isActive && config.clientToken);
        },
        ownsPlaceOrder: () => true,
        // Only the Google Pay button places this order; the data below is what it collected.
        beforePlaceOrder: async () => {
            if (!authorised) throw new Error(t('Hyperion_Checkout::braintree_googlepay_not_authorised'));
            return authorised;
        },
        afterPlaceOrderFailed: () => { authorised = null; },
    });
}

registerBraintreeGooglePayRenderer();

declare global {
    interface HTMLElementTagNameMap { 'payment-braintree-googlepay': PaymentBraintreeGooglepay; }
}
