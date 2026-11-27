// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-braintree-paypal> -- PayPal through Braintree (`braintree_paypal`).
 *
 * Flow with the checkout's own Place Order button:
 *   1. the shopper authorizes the payment with the PayPal button rendered
 *      here (PayPal popup, amount / currency / shipping address from the
 *      quote at click time);
 *   2. the approval (nonce + payer email) is kept by the element, the
 *      buttons give way to a confirmation line with a "change" action, and
 *      the element reports itself valid, which unlocks Place Order;
 *   3. Place Order sends `payment_method_nonce`, `device_data` and the vault
 *      choice as `additional_data`.
 * The approval is bound to what PayPal was shown: the base grand total and
 * the shipping address sent as the override. It no longer counts when
 * either changes, and it is dropped when the order request fails
 * (`orderFailed()`), because the nonce is single-use and the shopper
 * approved that amount for that address. The element outlives a switch to
 * another method and back, and so does the approval.
 *
 * A click on a PayPal button first passes the checkout's own gate
 * (`context.requestCheckoutValidation()`): every pending edit is put on the
 * quote, and the popup does not go on while something the order needs is
 * missing or a save failed; the checkout names the reason. `onClick` may
 * answer with a promise, so the click itself waits for the saves.
 *
 * Same PayPal options as core `method-renderer/paypal.js`: always the
 * `checkout` flow, plus `requestBillingAgreement` when a logged-in customer
 * asks to store the account (vault enabled); the shipping address is sent as
 * a non-editable override on physical carts; line items when configured.
 * PayPal Credit and Pay Later are not separate Magento methods, they are
 * extra buttons of this one and render when their config says `isActive`.
 * The billing address is never overwritten with PayPal's: this checkout
 * always has one before Place Order unlocks.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import type {
    PaymentContext,
    PaymentData,
    PaymentMethodInfo,
    VaultTokenInfo,
} from '../../../../extension-api.js';
import { firstPartyOf, type FirstPartyQuote, type FirstPartyServices } from '../first-party.js';
import { getBraintreeClient, getDeviceData } from './client.js';
import {
    BRAINTREE_PAYPAL_CODE,
    getBraintreePayPalConfig,
    getPayPalFundingConfig,
    isVaultEnabledFor,
    type BraintreePayPalConfig,
    type PayPalButtonStyle,
} from './config.js';
import { buildPayPalLineItems } from './line-items.js';
import { getBaseCurrencyCode, getBaseGrandTotal, regionCodeOf } from './quote.js';
import { loadBraintreeModule } from './sdk.js';
import type {
    PayPalButtonsInstance,
    PayPalCheckoutInstance,
    PayPalCreatePaymentOptions,
    PayPalSdkOptions,
    PayPalShippingAddressOverride,
} from './types.js';
import '../../ui/checkbox.js';

type Status = 'idle' | 'loading' | 'ready' | 'error';
type Funding = 'paypal' | 'credit' | 'paylater';

export interface PayPalApproval {
    nonce: string;
    email: string;
    /** Base grand total the shopper authorized. */
    amount: string;
    /** Fingerprint of the amount and the shipping address PayPal was shown. */
    fingerprint: string;
    savedForLater: boolean;
}

/** What a payment was created for, kept from `createOrder` until PayPal approves it. */
interface PendingPayment {
    amount: string;
    fingerprint: string;
    savedForLater: boolean;
}

export function buildShippingAddressOverride(quote: FirstPartyQuote): PayPalShippingAddressOverride | null {
    const address = quote.shippingAddress;
    if (!address) return null;
    const [line1 = '', second = '', third] = address.street;
    return {
        recipientName: `${address.firstname} ${address.lastname}`,
        line1,
        line2: third === undefined ? second : `${second} ${third}`,
        city: address.city,
        countryCode: address.country_id,
        postalCode: address.postcode ?? '',
        state: regionCodeOf(address) ?? '',
    };
}

/**
 * One string for the two things an approval covers. The address part is the
 * override exactly as PayPal receives it, so an edit that PayPal would not
 * see (a phone number) keeps the approval.
 */
export function approvalFingerprint(
    amount: string,
    override: PayPalShippingAddressOverride | null
): string {
    return JSON.stringify([
        amount,
        override
            ? [
                override.recipientName,
                override.line1,
                override.line2,
                override.city,
                override.state,
                override.postalCode,
                override.countryCode,
            ]
            : null,
    ]);
}

/**
 * Options of `loadPayPalSDK()`, the ones core `method-renderer/paypal.js`
 * passes: the component list, the page type and the nonce of the page's
 * Content Security Policy as data attributes, and the PayPal locale.
 * `commit` stays off because the order is completed with the checkout's own
 * Place Order button, not inside the popup.
 */
export function buildPayPalSdkOptions(config: BraintreePayPalConfig, creditActive: boolean, currency: string): PayPalSdkOptions {
    const dataAttributes: Record<string, string> = { 'page-type': 'checkout' };
    if (config.cspNonce) dataAttributes['csp-nonce'] = config.cspNonce;
    const options: PayPalSdkOptions = {
        'components': 'buttons,messages,funding-eligibility',
        'enable-funding': creditActive ? 'credit' : 'paylater',
        'currency': currency,
        'commit': false,
        dataAttributes,
    };
    if (config.locale) options['locale'] = config.locale;
    if (config.environment === 'sandbox' && config.merchantCountry) {
        options['buyer-country'] = config.merchantCountry;
    }
    return options;
}

export function buildCreatePaymentOptions(
    config: BraintreePayPalConfig,
    saveForLater: boolean,
    quote: FirstPartyQuote
): PayPalCreatePaymentOptions {
    const options: PayPalCreatePaymentOptions = {
        flow: 'checkout',
        amount: getBaseGrandTotal(quote),
        currency: getBaseCurrencyCode(quote),
    };
    if (config.locale) options.locale = config.locale;
    if (config.merchantName) options.displayName = config.merchantName;
    if (saveForLater) options.requestBillingAgreement = true;
    const override = buildShippingAddressOverride(quote);
    if (override) {
        options.enableShippingAddress = true;
        options.shippingAddressEditable = false;
        options.shippingAddressOverride = override;
    }
    if (config.canSendLineItems) {
        const lineItems = buildPayPalLineItems(quote.items, quote.totals);
        if (lineItems.length > 0) options.lineItems = lineItems;
    }
    return options;
}

export class PaymentBraintreePaypal extends SignalWatcher(LitElement) {
    public static readonly hyperionApi = '1';

    /** Hidden without a client token, like core's renderer. */
    public static canMakePayment(args: { config: Readonly<Record<string, unknown>> }): boolean {
        const config = getBraintreePayPalConfig({ payment: { [BRAINTREE_PAYPAL_CODE]: { ...args.config } } });
        return Boolean(config?.isActive && config.clientToken);
    }

    /** Core checks no reCAPTCHA form on a Braintree PayPal order. */
    public static hyperionRecaptchaAction(): null {
        return null;
    }

    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: PaymentMethodInfo;
    public config: Readonly<Record<string, unknown>> = {};
    public token: VaultTokenInfo | null = null;

    @state() private _status: Status = 'idle';
    @state() private _message: string | null = null;
    @state() private _saveForLater = false;
    @state() private _approval: PayPalApproval | null = null;

    private _checkout: PayPalCheckoutInstance | null = null;
    private _pending: PendingPayment | null = null;
    private _buttons: PayPalButtonsInstance[] = [];
    private _generation = 0;
    private _initQueued = false;
    private _reportedValid: boolean | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    private get _services(): FirstPartyServices {
        const services = firstPartyOf(this.context);
        if (services === null) throw new Error('the Braintree PayPal renderer needs the first-party context');
        return services;
    }

    private _config(): BraintreePayPalConfig | null {
        return getBraintreePayPalConfig(this._services.config());
    }

    /** The approval, when it still covers the amount and the address of the quote. Reads signals. */
    private _isApprovalCurrent(): boolean {
        const current = this._approval;
        if (current === null) return false;
        const quote = this._services.quote();
        return current.fingerprint === approvalFingerprint(getBaseGrandTotal(quote), buildShippingAddressOverride(quote));
    }

    public override connectedCallback(): void {
        super.connectedCallback();
        this._reportedValid = null;
        this.dispatchEvent(new CustomEvent('hyperion-payment:ready', { bubbles: true, composed: true, detail: {} }));
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._generation++;
        this._status = 'idle';
        void this._teardown();
    }

    public override render(): unknown {
        const config = this._config();
        const current = this._approval;
        const approved = this._isApprovalCurrent();
        const vaultEnabled = config !== null && isVaultEnabledFor(this._services.config(), config.vaultCode);
        return html`
            <div class="space-y-3">
                ${approved && current ? this._renderApproved(current) : nothing}
                ${!approved && current
                    ? html`<p class="text-sm text-muted" role="status">
                          ${current.amount === getBaseGrandTotal(this._services.quote())
                              ? this.context.t('Your shipping address changed. Please authorize the payment with PayPal again.')
                              : this.context.t('Your order total changed. Please authorize the payment with PayPal again.')}
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
                <div class="space-y-3 ${approved ? 'hidden' : ''}">
                    <p class="text-sm text-muted">${this.context.t('Authorize the payment with PayPal, then place your order.')}</p>
                    ${vaultEnabled
                        ? html`<hc-checkbox
                                  name="braintree_paypal_save"
                                  label=${this.context.t('Save this PayPal account for future purchases')}
                                  .checked=${this._saveForLater}
                                  @value-change=${this._onSaveChange}
                              ></hc-checkbox>`
                        : nothing}
                    ${this._status === 'loading'
                        ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                              ${this.context.t('Loading PayPal...')}
                          </p>`
                        : nothing}
                    <div class="max-w-sm space-y-2">
                        <div data-paypal-button="paypal"></div>
                        <div data-paypal-button="credit"></div>
                        <div data-paypal-button="paylater"></div>
                    </div>
                </div>
            </div>
        `;
    }

    private _renderApproved(current: PayPalApproval): unknown {
        return html`
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-subtle bg-surface-raised p-3"
                 role="status">
                <p class="flex-1 text-sm text-brand" data-paypal-approved>
                    ${current.email
                        ? this.context.t('PayPal payment authorized by {email}. Place your order to complete it.', { email: current.email })
                        : this.context.t('PayPal payment authorized. Place your order to complete it.')}
                </p>
                <button type="button"
                        class="text-sm text-accent hover:underline"
                        @click=${this._onChange}>
                    ${this.context.t('Use another PayPal account')}
                </button>
            </div>
        `;
    }

    /**
     * Place Order follows the approval (`valid` / `invalid`). The PayPal SDK
     * is only needed while there is nothing authorized: on the first render,
     * or once an approval is gone (changed by the shopper, another amount or
     * shipping address, failed order).
     */
    protected override updated(): void {
        const valid = this._isApprovalCurrent();
        if (valid !== this._reportedValid) {
            this._reportedValid = valid;
            this.dispatchEvent(new CustomEvent(valid ? 'hyperion-payment:valid' : 'hyperion-payment:invalid', {
                bubbles: true,
                composed: true,
                detail: {},
            }));
        }
        if (this._initQueued || !this._needsInit()) return;
        this._initQueued = true;
        queueMicrotask(() => {
            this._initQueued = false;
            if (this._needsInit()) void this._init();
        });
    }

    private _needsInit(): boolean {
        return this.isConnected && this._status === 'idle' && !this._isApprovalCurrent();
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        this._status = 'loading';
        this._message = null;
        try {
            const config = this._config();
            if (!config?.clientToken) throw new Error('missing Braintree client token');
            const [client, paypalCheckout] = await Promise.all([
                getBraintreeClient(this.context, config.clientToken),
                loadBraintreeModule(this.context, 'paypal-checkout'),
            ]);
            void getDeviceData(this.context, config.clientToken, { paypal: true });
            if (stale()) return;
            await this._teardown();
            const checkout = await paypalCheckout.create({ client });
            if (stale()) {
                void checkout.teardown().catch(() => undefined);
                return;
            }
            this._checkout = checkout;

            const source = this._services.config();
            const credit = getPayPalFundingConfig(source, 'credit');
            const payLater = getPayPalFundingConfig(source, 'paylater');
            await checkout.loadPayPalSDK(buildPayPalSdkOptions(
                config,
                credit?.isActive === true,
                getBaseCurrencyCode(this._services.quote())
            ));
            if (stale()) return;

            const rendered = await Promise.all([
                this._renderButton(checkout, config, 'paypal', config.style),
                credit?.isActive ? this._renderButton(checkout, config, 'credit', credit.style) : false,
                payLater?.isActive ? this._renderButton(checkout, config, 'paylater', payLater.style) : false,
            ]);
            if (stale()) return;
            if (!rendered.some(Boolean)) throw new Error('no eligible PayPal button');
            this._status = 'ready';
        } catch (err) {
            if (stale()) return;
            console.error('[hyperion-checkout] Braintree PayPal could not be initialized', err);
            this._status = 'error';
            this._message = this.context.t('PayPal could not be loaded. Try again or choose another payment method.');
        }
    }

    private async _renderButton(
        checkout: PayPalCheckoutInstance,
        config: BraintreePayPalConfig,
        funding: Funding,
        style: PayPalButtonStyle
    ): Promise<boolean> {
        const container = this.querySelector<HTMLElement>(`[data-paypal-button="${funding}"]`);
        const paypal = window.paypal;
        if (!container || !paypal) return false;
        container.replaceChildren();
        const button = paypal.Buttons({
            fundingSource: funding,
            style,
            // The SDK holds its window on a loader while this promise is
            // open: the payment is created for the quote with every
            // pending edit saved, or not at all.
            onClick: async (_data, actions) => {
                this._message = null;
                const ok = await this.context.requestCheckoutValidation();
                return ok ? actions.resolve() : actions.reject();
            },
            createOrder: () => {
                this._message = null;
                const savedForLater = this._isSaving();
                const options = buildCreatePaymentOptions(config, savedForLater, this._services.quote());
                this._pending = {
                    amount: options.amount,
                    fingerprint: approvalFingerprint(options.amount, options.shippingAddressOverride ?? null),
                    savedForLater,
                };
                return checkout.createPayment(options);
            },
            onApprove: async (data) => {
                // Without a payment created here there is nothing the approval could be bound to.
                const pending = this._pending;
                this._pending = null;
                if (!pending) throw new Error('PayPal approved a payment this checkout did not create');
                const payload = await checkout.tokenizePayment(data);
                this._approval = {
                    nonce: payload.nonce,
                    email: payload.details.email ?? '',
                    amount: pending.amount,
                    fingerprint: pending.fingerprint,
                    savedForLater: pending.savedForLater,
                };
            },
            onError: (err) => {
                console.error('[hyperion-checkout] PayPal button error', err);
                this._message = this.context.t('The PayPal payment could not be authorized. Please try again.');
            },
        });
        if (!button.isEligible()) return false;
        await button.render(container);
        this._buttons.push(button);
        return true;
    }

    private _isSaving(): boolean {
        const config = this._config();
        return config !== null && isVaultEnabledFor(this._services.config(), config.vaultCode) && this._saveForLater;
    }

    private async _teardown(): Promise<void> {
        const buttons = this._buttons;
        const checkout = this._checkout;
        this._buttons = [];
        this._checkout = null;
        for (const button of buttons) {
            try {
                await button.close?.();
            } catch {
                // The button is already gone with its container.
            }
        }
        if (checkout) {
            try {
                await checkout.teardown();
            } catch (err) {
                console.error('[hyperion-checkout] Braintree PayPal teardown failed', err);
            }
        }
    }

    private _onSaveChange(e: CustomEvent<{ checked: boolean }>): void {
        this._saveForLater = e.detail.checked;
    }

    private _onChange = (): void => {
        this._approval = null;
    };

    private _onRetry = (): void => {
        void this._init();
    };

    /** Place Order: the approved nonce, the device data and the vault choice. */
    public async getPaymentData(): Promise<PaymentData> {
        const config = this._config();
        const current = this._approval;
        if (!config || !current || !this._isApprovalCurrent()) {
            throw new Error(this.context.t('Authorize the payment with the PayPal button before placing your order.'));
        }
        const deviceData = await getDeviceData(this.context, config.clientToken, { paypal: true });
        return {
            additional_data: {
                payment_method_nonce: current.nonce,
                ...(deviceData ? { device_data: deviceData } : {}),
                ...(isVaultEnabledFor(this._services.config(), config.vaultCode)
                    ? { is_active_payment_token_enabler: current.savedForLater }
                    : {}),
            },
        };
    }

    /** The nonce was spent on an order that failed: the shopper authorizes again. */
    public orderFailed(): void {
        this._approval = null;
    }
}

if (!customElements.get('hc-payment-braintree-paypal')) {
    customElements.define('hc-payment-braintree-paypal', PaymentBraintreePaypal);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-braintree-paypal': PaymentBraintreePaypal; }
}
