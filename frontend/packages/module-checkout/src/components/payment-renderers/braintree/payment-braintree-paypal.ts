// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-braintree-paypal> -- PayPal through Braintree (`braintree_paypal`).
 *
 * Flow with the checkout's own Place Order button:
 *   1. the shopper authorises the payment with the PayPal button rendered
 *      here (PayPal popup, amount / currency / shipping address from the
 *      quote at click time);
 *   2. the approval (nonce + payer email) is kept, the buttons give way to a
 *      confirmation line with a "change" action, and Place Order unlocks
 *      (`isReady` feeds `canPlaceOrder`);
 *   3. Place Order sends `payment_method_nonce`, `device_data` and the vault
 *      choice as `additional_data`.
 * The approval is dropped when the base grand total changes or when the
 * order POST fails, because the nonce is single-use and amount-bound.
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
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import { Signal } from 'signal-polyfill';

import { getStore } from '../../../store/index.js';
import { t } from '../../../utils/i18n.js';
import { registerPaymentRenderer } from '../registry.js';
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
import {
    getBaseCurrencyCode,
    getBaseGrandTotal,
    getShippingAddress,
    regionCodeOf,
} from './quote.js';
import { loadBraintreeModule } from './sdk.js';
import type {
    PayPalButtonsInstance,
    PayPalCheckoutInstance,
    PayPalCreatePaymentOptions,
    PayPalShippingAddressOverride,
} from './types.js';
import '../../ui/checkbox.js';

type Status = 'idle' | 'loading' | 'ready' | 'error';
type Funding = 'paypal' | 'credit' | 'paylater';

export interface PayPalApproval {
    nonce: string;
    email: string;
    /** Base grand total the shopper authorised. */
    amount: string;
    savedForLater: boolean;
}

/**
 * Module-level so the approval survives switching to another payment method
 * and back (the element is destroyed when its row is deselected).
 */
const approval = new Signal.State<PayPalApproval | null>(null);

export function getPayPalApproval(): PayPalApproval | null {
    return approval.get();
}

export function setPayPalApproval(next: PayPalApproval | null): void {
    approval.set(next);
}

function isApprovalCurrent(): boolean {
    const current = approval.get();
    return current !== null && current.amount === getBaseGrandTotal();
}

export function buildShippingAddressOverride(): PayPalShippingAddressOverride | null {
    const address = getShippingAddress();
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

export function buildCreatePaymentOptions(
    config: BraintreePayPalConfig,
    saveForLater: boolean
): PayPalCreatePaymentOptions {
    const store = getStore();
    const options: PayPalCreatePaymentOptions = {
        flow: 'checkout',
        amount: getBaseGrandTotal(),
        currency: getBaseCurrencyCode(),
    };
    if (config.locale) options.locale = config.locale;
    if (config.merchantName) options.displayName = config.merchantName;
    if (saveForLater) options.requestBillingAgreement = true;
    const override = buildShippingAddressOverride();
    if (override) {
        options.enableShippingAddress = true;
        options.shippingAddressEditable = false;
        options.shippingAddressOverride = override;
    }
    if (config.canSendLineItems) {
        const lineItems = buildPayPalLineItems(store.items.get(), store.totals.get());
        if (lineItems.length > 0) options.lineItems = lineItems;
    }
    return options;
}

export class PaymentBraintreePaypal extends SignalWatcher(LitElement) {
    @property({ type: String }) public code = BRAINTREE_PAYPAL_CODE;

    @state() private _status: Status = 'idle';
    @state() private _message: string | null = null;
    @state() private _saveForLater = false;

    private _checkout: PayPalCheckoutInstance | null = null;
    private _buttons: PayPalButtonsInstance[] = [];
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
        const config = getBraintreePayPalConfig();
        const current = approval.get();
        const approved = isApprovalCurrent();
        const vaultEnabled = config !== null && isVaultEnabledFor(config.vaultCode);
        return html`
            <div class="space-y-3">
                ${approved && current ? this._renderApproved(current) : nothing}
                ${!approved && current
                    ? html`<p class="text-sm text-muted" role="status">
                          ${t('Hyperion_Checkout::braintree_paypal_amount_changed')}
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
                <div class="space-y-3 ${approved ? 'hidden' : ''}">
                    <p class="text-sm text-muted">${t('Hyperion_Checkout::braintree_paypal_hint')}</p>
                    ${vaultEnabled
                        ? html`<hc-checkbox
                                  name="braintree_paypal_save"
                                  label=${t('Hyperion_Checkout::braintree_paypal_save')}
                                  .checked=${this._saveForLater}
                                  @value-change=${this._onSaveChange}
                              ></hc-checkbox>`
                        : nothing}
                    ${this._status === 'loading'
                        ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                              ${t('Hyperion_Checkout::braintree_paypal_loading')}
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
                        ? t('Hyperion_Checkout::braintree_paypal_authorised_as', { email: current.email })
                        : t('Hyperion_Checkout::braintree_paypal_authorised')}
                </p>
                <button type="button"
                        class="text-sm text-accent hover:underline"
                        @click=${this._onChange}>
                    ${t('Hyperion_Checkout::braintree_paypal_change')}
                </button>
            </div>
        `;
    }

    /**
     * The PayPal SDK is only needed while there is nothing authorised: on the
     * first render, or once an approval is gone (changed by the shopper,
     * amount change, failed order).
     */
    protected override updated(): void {
        if (this._initQueued || !this._needsInit()) return;
        this._initQueued = true;
        queueMicrotask(() => {
            this._initQueued = false;
            if (this._needsInit()) void this._init();
        });
    }

    private _needsInit(): boolean {
        return this.isConnected && this._status === 'idle' && !isApprovalCurrent();
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        this._status = 'loading';
        this._message = null;
        try {
            const config = getBraintreePayPalConfig();
            if (!config?.clientToken) throw new Error('missing Braintree client token');
            const [client, paypalCheckout] = await Promise.all([
                getBraintreeClient(config.clientToken),
                loadBraintreeModule('paypal-checkout'),
            ]);
            void getDeviceData(config.clientToken, { paypal: true });
            if (stale()) return;
            await this._teardown();
            const checkout = await paypalCheckout.create({ client });
            if (stale()) {
                void checkout.teardown().catch(() => undefined);
                return;
            }
            this._checkout = checkout;

            const credit = getPayPalFundingConfig('credit');
            const payLater = getPayPalFundingConfig('paylater');
            const sdkOptions: Record<string, string | boolean> = {
                'components': 'buttons,funding-eligibility',
                'enable-funding': credit?.isActive ? 'credit' : 'paylater',
                'currency': getBaseCurrencyCode(),
                'commit': false,
            };
            if (config.environment === 'sandbox' && config.merchantCountry) {
                sdkOptions['buyer-country'] = config.merchantCountry;
            }
            await checkout.loadPayPalSDK(sdkOptions);
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
            // eslint-disable-next-line no-console
            console.error('[hyperion-checkout] Braintree PayPal could not be initialised', err);
            this._status = 'error';
            this._message = t('Hyperion_Checkout::braintree_paypal_init_failed');
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
            createOrder: () => {
                this._message = null;
                return checkout.createPayment(buildCreatePaymentOptions(config, this._isSaving()));
            },
            onApprove: async (data) => {
                const amount = getBaseGrandTotal();
                const savedForLater = this._isSaving();
                const payload = await checkout.tokenizePayment(data);
                approval.set({
                    nonce: payload.nonce,
                    email: payload.details.email ?? '',
                    amount,
                    savedForLater,
                });
            },
            onError: (err) => {
                // eslint-disable-next-line no-console
                console.error('[hyperion-checkout] PayPal button error', err);
                this._message = t('Hyperion_Checkout::braintree_paypal_failed');
            },
        });
        if (!button.isEligible()) return false;
        await button.render(container);
        this._buttons.push(button);
        return true;
    }

    private _isSaving(): boolean {
        const config = getBraintreePayPalConfig();
        return config !== null && isVaultEnabledFor(config.vaultCode) && this._saveForLater;
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
                // eslint-disable-next-line no-console
                console.error('[hyperion-checkout] Braintree PayPal teardown failed', err);
            }
        }
    }

    private _onSaveChange(e: CustomEvent<{ checked: boolean }>): void {
        this._saveForLater = e.detail.checked;
    }

    private _onChange = (): void => {
        approval.set(null);
    };

    private _onRetry = (): void => {
        void this._init();
    };
}

if (!customElements.get('payment-braintree-paypal')) {
    customElements.define('payment-braintree-paypal', PaymentBraintreePaypal);
}

export function registerBraintreePayPalRenderer(): void {
    registerPaymentRenderer({
        code: BRAINTREE_PAYPAL_CODE,
        component: 'payment-braintree-paypal',
        isAvailable: () => {
            const config = getBraintreePayPalConfig();
            return Boolean(config?.isActive && config.clientToken);
        },
        isReady: isApprovalCurrent,
        afterPlaceOrderFailed: () => approval.set(null),
        beforePlaceOrder: async () => {
            const config = getBraintreePayPalConfig();
            const current = approval.get();
            if (!config || !current || !isApprovalCurrent()) {
                throw new Error(t('Hyperion_Checkout::braintree_paypal_not_authorised'));
            }
            const deviceData = await getDeviceData(config.clientToken, { paypal: true });
            return {
                payment_method_nonce: current.nonce,
                ...(deviceData ? { device_data: deviceData } : {}),
                ...(isVaultEnabledFor(config.vaultCode)
                    ? { is_active_payment_token_enabler: current.savedForLater }
                    : {}),
            };
        },
    });
}

registerBraintreePayPalRenderer();

declare global {
    interface HTMLElementTagNameMap { 'payment-braintree-paypal': PaymentBraintreePaypal; }
}
