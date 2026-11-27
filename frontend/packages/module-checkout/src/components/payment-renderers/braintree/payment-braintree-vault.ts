// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-braintree-vault> -- a stored Braintree token, one element per
 * token row (`braintree_cc_vault`, `braintree_googlepay_vault`,
 * `braintree_paypal_vault`).
 *
 * `braintree_cc_vault` follows core `method-renderer/vault.js`:
 *   1. when the merchant enabled "CVV re-verification" for stored cards
 *      (`payment.braintree_cc_vault.cvvVerify`), a hosted CVV field is
 *      tokenized and sent to `braintree/payment/updatepaymentmethod`, which
 *      verifies the card and answers `{ success }`. The URL is the token's
 *      `updatePaymentUrl` when the provider emits one, otherwise it is
 *      derived from the nonce URL, which sits next to it;
 *   2. a one-time nonce comes from `braintree/payment/getnonce`;
 *   3. the nonce goes through 3D Secure under the same rules as a new card
 *      (skipped when stored cards are verified by CVV);
 *   4. `additional_data` = `public_hash`, `payment_method_nonce` and
 *      `device_data` when the collector delivered it.
 *
 * `braintree_googlepay_vault` (a card stored through Google Pay) takes steps
 * 2 to 4 only: core `method-renderer/googlepay-vault.js` has no CVV field and
 * goes from the nonce straight to the order, and a wallet card has no CVV
 * the shopper could type.
 *
 * `braintree_paypal_vault` needs no UI: a nonce from `getnonce`, as core's
 * `paypal-vault.js` does.
 *
 * Core checks no reCAPTCHA form on an order paid with a stored Braintree
 * token.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import type { PaymentContext, PaymentData, PaymentMethodInfo } from '../../../../extension-api.js';
import { firstPartyOf, type FirstPartyServices } from '../first-party.js';
import { getBraintreeClient, getDeviceData } from './client.js';
import {
    BRAINTREE_CC_VAULT_CODE,
    BRAINTREE_PAYPAL_VAULT_CODE,
    getBraintreeCardConfig,
    getBraintreeGooglePayConfig,
    isCcVaultCvvVerifyEnabled,
} from './config.js';
import { HOSTED_FIELD_BOX, resolveHostedFieldStyles } from './hosted-field-styles.js';
import { loadBraintreeModule } from './sdk.js';
import { verifyThreeDSecure } from './three-d-secure.js';
import type { HostedFieldsInstance } from './types.js';
import { fetchVaultNonce, type StoredToken } from './vault-nonce.js';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export class PaymentBraintreeVault extends LitElement {
    public static readonly hyperionApi = '1';

    /** Core checks no reCAPTCHA form on an order paid with a stored Braintree token. */
    public static hyperionRecaptchaAction(): null {
        return null;
    }

    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: PaymentMethodInfo;
    public config: Readonly<Record<string, unknown>> = {};
    public token: StoredToken | null = null;

    @state() private _status: Status = 'idle';
    @state() private _cvvInvalid = false;
    @state() private _cvvFocused = false;

    private _hostedFields: HostedFieldsInstance | null = null;
    private _generation = 0;

    public override createRenderRoot(): HTMLElement { return this; }

    private get _services(): FirstPartyServices {
        const services = firstPartyOf(this.context);
        if (services === null) throw new Error('the Braintree vault renderer needs the first-party context');
        return services;
    }

    private _cvvVerify(): boolean {
        return this.method.code === BRAINTREE_CC_VAULT_CODE && isCcVaultCvvVerifyEnabled(this._services.config());
    }

    public override connectedCallback(): void {
        super.connectedCallback();
        this.dispatchEvent(new CustomEvent('hyperion-payment:ready', { bubbles: true, composed: true, detail: {} }));
        void this.updateComplete.then(() => this._init());
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._generation++;
        void this._teardown();
    }

    public override render(): unknown {
        if (!this._cvvVerify()) return nothing;
        return html`
            <div class="w-48">
                ${this._status === 'error'
                    ? html`<p role="alert" class="text-sm text-danger">
                          ${this.context.t('The secure payment form could not be loaded. Try again or choose another payment method.')}
                      </p>`
                    : nothing}
                <label id="hc-bt-vault-cvv-label"
                       class="block text-sm font-medium text-brand"
                       @click=${() => this._hostedFields?.focus('cvv')}>
                    ${this.context.t('Security code (CVV)')}
                    <span aria-hidden="true" class="text-danger">*</span>
                </label>
                <div data-hosted-field="cvv"
                     role="group"
                     aria-labelledby="hc-bt-vault-cvv-label"
                     class="${HOSTED_FIELD_BOX} ${this._cvvInvalid ? 'border-danger' : 'border-subtle'} ${this._cvvFocused ? 'ring-2 ring-accent' : ''}"></div>
                ${this._cvvInvalid
                    ? html`<p class="mt-1 text-sm text-danger">
                          ${this.context.t('Enter a valid security code.')}
                      </p>`
                    : nothing}
            </div>
        `;
    }

    /** The client token for the stored card: the card method's, else Google Pay's. */
    private _authorization(): string {
        const config = this._services.config();
        return getBraintreeCardConfig(config)?.clientToken || getBraintreeGooglePayConfig(config)?.clientToken || '';
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        if (this.method.code === BRAINTREE_PAYPAL_VAULT_CODE) return;
        const authorization = getBraintreeCardConfig(this._services.config())?.clientToken;
        if (!authorization) return;
        void getDeviceData(this.context, authorization);
        if (!this._cvvVerify()) return;

        this._status = 'loading';
        try {
            const [client, hostedFields] = await Promise.all([
                getBraintreeClient(this.context, authorization),
                loadBraintreeModule(this.context, 'hosted-fields'),
            ]);
            if (stale()) return;
            const container = this.querySelector<HTMLElement>('[data-hosted-field="cvv"]');
            if (!container) throw new Error('CVV container is missing');
            const instance = await hostedFields.create({
                client,
                fields: { cvv: { container, placeholder: '123' } },
                styles: resolveHostedFieldStyles(this.context),
            });
            if (stale()) {
                void instance.teardown().catch(() => undefined);
                return;
            }
            instance.on('validityChange', (event) => {
                const field = event.fields.cvv;
                if (field) this._cvvInvalid = !field.isValid && !field.isPotentiallyValid;
            });
            instance.on('focus', () => { this._cvvFocused = true; });
            instance.on('blur', () => { this._cvvFocused = false; });
            this._hostedFields = instance;
            this._status = 'ready';
        } catch (err) {
            if (stale()) return;
            console.error('[hyperion-checkout] Braintree CVV field could not be initialized', err);
            this._status = 'error';
        }
    }

    private async _teardown(): Promise<void> {
        const instance = this._hostedFields;
        this._hostedFields = null;
        if (!instance) return;
        try {
            await instance.teardown();
        } catch (err) {
            console.error('[hyperion-checkout] Braintree CVV field teardown failed', err);
        }
    }

    /** Tokenize the CVV and let Magento verify the stored card with it. */
    public async verifyCvv(token: StoredToken): Promise<void> {
        const instance = this._hostedFields;
        const target = token.updatePaymentUrl
            ?? token.nonceUrl?.replace(/\/getnonce/i, '/updatepaymentmethod')
            ?? null;
        if (!instance || this._status !== 'ready' || target === null) {
            throw new Error(this.context.t('The payment form is still loading. Please wait a moment and try again.'));
        }
        let cvvNonce: string;
        try {
            cvvNonce = (await instance.tokenize({})).nonce;
        } catch (err) {
            console.error('[hyperion-checkout] Braintree CVV tokenization failed', err);
            this._cvvInvalid = true;
            throw new Error(this.context.t('Enter a valid security code.'), { cause: err });
        }
        const failure = new Error(this.context.t('The security code could not be verified. Check it and try again.'));
        const url = new URL(target, window.location.href);
        if (url.origin !== window.location.origin) throw failure;
        url.searchParams.set('nonce', cvvNonce);
        url.searchParams.set('public_hash', token.publicHash);
        let body: { success?: unknown } | null;
        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            });
            body = response.ok ? await response.json() as { success?: unknown } : null;
        } catch {
            throw failure;
        }
        if (body?.success !== true) throw failure;
    }

    /** Nonce, 3D Secure and device data of a stored card: the part both card vaults share. */
    private async _storedCardPaymentData(token: StoredToken): Promise<Record<string, unknown>> {
        // A Google Pay card stored without the card method active still needs a client token for 3D Secure.
        const authorization = this._authorization();
        const { nonce, bin } = await fetchVaultNonce(this.context, token);
        const verifiedNonce = authorization
            ? await verifyThreeDSecure(this.context, { authorization, nonce, bin, storedCard: true, savingCard: false })
            : nonce;
        const deviceData = authorization ? await getDeviceData(this.context, authorization) : null;
        return {
            public_hash: token.publicHash,
            payment_method_nonce: verifiedNonce,
            ...(deviceData ? { device_data: deviceData } : {}),
        };
    }

    public async getPaymentData(): Promise<PaymentData> {
        const token = this.token;
        if (!token) throw new Error(this.context.t('Select one of your stored payment methods.'));
        if (this.method.code === BRAINTREE_PAYPAL_VAULT_CODE) {
            const { nonce } = await fetchVaultNonce(this.context, token);
            return { additional_data: { public_hash: token.publicHash, payment_method_nonce: nonce } };
        }
        if (this._cvvVerify()) await this.verifyCvv(token);
        return { additional_data: await this._storedCardPaymentData(token) };
    }
}

if (!customElements.get('hc-payment-braintree-vault')) {
    customElements.define('hc-payment-braintree-vault', PaymentBraintreeVault);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-braintree-vault': PaymentBraintreeVault; }
}
