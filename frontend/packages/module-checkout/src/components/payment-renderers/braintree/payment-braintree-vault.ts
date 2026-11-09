// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Braintree vault adapters + <payment-braintree-vault>.
 *
 * `braintree_cc_vault` (and `braintree_googlepay_vault`, a card stored through
 * Google Pay, which core handles with the same component) follows core
 * `method-renderer/vault.js`:
 *   1. when the merchant enabled "CVV re-verification" for stored cards
 *      (`payment.braintree_cc_vault.cvvVerify`), a hosted CVV field is
 *      tokenized and sent to `braintree/payment/updatepaymentmethod`, which
 *      verifies the card and answers `{ success }`;
 *   2. a one-time nonce comes from `braintree/payment/getnonce`;
 *   3. the nonce goes through 3D Secure under the same rules as a new card
 *      (skipped when stored cards are verified by CVV);
 *   4. `additional_data` = `public_hash`, `payment_method_nonce` and
 *      `device_data` when the collector delivered it.
 *
 * `braintree_paypal_vault` needs no UI: the default vault flow (nonce from
 * `getnonce`) is what core's `paypal-vault.js` does.
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import { t } from '../../../utils/i18n.js';
import {
    fetchVaultNonce,
    registerVaultAdapter,
    type VaultToken,
} from '../vault-tokens.js';
import { getBraintreeClient, getDeviceData } from './client.js';
import {
    BRAINTREE_CC_VAULT_CODE,
    BRAINTREE_GOOGLEPAY_VAULT_CODE,
    BRAINTREE_PAYPAL_VAULT_CODE,
    getBraintreeCardConfig,
    getBraintreeGooglePayConfig,
    isCcVaultCvvVerifyEnabled,
} from './config.js';
import {
    HOSTED_FIELD_BOX,
    hostedFieldProbes,
    resolveHostedFieldStyles,
} from './hosted-field-styles.js';
import { loadBraintreeModule } from './sdk.js';
import { verifyThreeDSecure } from './three-d-secure.js';
import type { HostedFieldsInstance } from './types.js';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** Magento card type codes stored in the token details. */
const CARD_TYPE_NAMES: Readonly<Record<string, string>> = {
    VI: 'Visa',
    MC: 'Mastercard',
    AE: 'American Express',
    DI: 'Discover',
    JCB: 'JCB',
    DN: 'Diners Club',
    MI: 'Maestro',
    UPD: 'UnionPay',
};

let activeElement: PaymentBraintreeVault | null = null;

function detail(token: VaultToken, key: string): string {
    const value = token.details[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export class PaymentBraintreeVault extends LitElement {
    @property({ attribute: false }) public token: VaultToken | null = null;

    @state() private _status: Status = 'idle';
    @state() private _cvvInvalid = false;
    @state() private _cvvFocused = false;

    private _hostedFields: HostedFieldsInstance | null = null;
    private _generation = 0;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        activeElement = this;
        void this.updateComplete.then(() => this._init());
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        if (activeElement === this) activeElement = null;
        this._generation++;
        void this._teardown();
    }

    public override render(): unknown {
        if (!isCcVaultCvvVerifyEnabled()) return nothing;
        return html`
            <div class="w-48">
                ${hostedFieldProbes()}
                ${this._status === 'error'
                    ? html`<p role="alert" class="text-sm text-danger">
                          ${t('Hyperion_Checkout::braintree_init_failed')}
                      </p>`
                    : nothing}
                <label id="hc-bt-vault-cvv-label"
                       class="block text-sm font-medium text-brand"
                       @click=${() => this._hostedFields?.focus('cvv')}>
                    ${t('Hyperion_Checkout::braintree_card_cvv')}
                    <span aria-hidden="true" class="text-danger">*</span>
                </label>
                <div data-hosted-field="cvv"
                     role="group"
                     aria-labelledby="hc-bt-vault-cvv-label"
                     class="${HOSTED_FIELD_BOX} ${this._cvvInvalid ? 'border-danger' : 'border-subtle'} ${this._cvvFocused ? 'ring-2 ring-accent' : ''}"></div>
                ${this._cvvInvalid
                    ? html`<p class="mt-1 text-sm text-danger">
                          ${t('Hyperion_Checkout::braintree_card_cvv_invalid')}
                      </p>`
                    : nothing}
            </div>
        `;
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        const authorization = getBraintreeCardConfig()?.clientToken;
        if (!authorization) return;
        void getDeviceData(authorization);
        if (!isCcVaultCvvVerifyEnabled()) return;

        this._status = 'loading';
        try {
            const [client, hostedFields] = await Promise.all([
                getBraintreeClient(authorization),
                loadBraintreeModule('hosted-fields'),
            ]);
            if (stale()) return;
            const container = this.querySelector<HTMLElement>('[data-hosted-field="cvv"]');
            if (!container) throw new Error('CVV container is missing');
            const instance = await hostedFields.create({
                client,
                fields: { cvv: { container, placeholder: '123' } },
                styles: resolveHostedFieldStyles(this),
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
    public async verifyCvv(token: VaultToken): Promise<void> {
        const instance = this._hostedFields;
        if (!instance || this._status !== 'ready' || !token.nonceUrl) {
            throw new Error(t('Hyperion_Checkout::braintree_not_ready'));
        }
        let cvvNonce: string;
        try {
            cvvNonce = (await instance.tokenize({})).nonce;
        } catch (err) {
            console.error('[hyperion-checkout] Braintree CVV tokenization failed', err);
            this._cvvInvalid = true;
            throw new Error(t('Hyperion_Checkout::braintree_card_cvv_invalid'), { cause: err });
        }
        const failure = new Error(t('Hyperion_Checkout::braintree_card_cvv_failed'));
        const url = new URL(token.nonceUrl.replace(/\/getnonce/i, '/updatepaymentmethod'), window.location.href);
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
}

if (!customElements.get('payment-braintree-vault')) {
    customElements.define('payment-braintree-vault', PaymentBraintreeVault);
}

export async function braintreeCcVaultBeforePlaceOrder(token: VaultToken): Promise<Record<string, unknown>> {
    // A Google Pay card stored without the card method active still needs a client token for 3D Secure.
    const authorization = getBraintreeCardConfig()?.clientToken || getBraintreeGooglePayConfig()?.clientToken || '';
    if (isCcVaultCvvVerifyEnabled()) {
        if (!activeElement) throw new Error(t('Hyperion_Checkout::braintree_not_ready'));
        await activeElement.verifyCvv(token);
    }
    const { nonce, bin } = await fetchVaultNonce(token);
    const verifiedNonce = authorization
        ? await verifyThreeDSecure({ authorization, nonce, bin, storedCard: true, savingCard: false })
        : nonce;
    const deviceData = authorization ? await getDeviceData(authorization) : null;
    return {
        public_hash: token.publicHash,
        payment_method_nonce: verifiedNonce,
        ...(deviceData ? { device_data: deviceData } : {}),
    };
}

export function registerBraintreeVaultAdapters(): void {
    registerVaultAdapter({
        code: BRAINTREE_CC_VAULT_CODE,
        label: (token) => t('Hyperion_Checkout::vault_card_label', {
            type: CARD_TYPE_NAMES[detail(token, 'type')] ?? detail(token, 'type'),
            last4: detail(token, 'maskedCC'),
            expiry: detail(token, 'expirationDate'),
        }),
        renderBody: (token) => html`<payment-braintree-vault .token=${token}></payment-braintree-vault>`,
        beforePlaceOrder: braintreeCcVaultBeforePlaceOrder,
    });
    registerVaultAdapter({
        code: BRAINTREE_GOOGLEPAY_VAULT_CODE,
        label: (token) => t('Hyperion_Checkout::vault_card_label', {
            type: CARD_TYPE_NAMES[detail(token, 'type')] ?? detail(token, 'type'),
            last4: detail(token, 'maskedCC'),
            expiry: detail(token, 'expirationDate'),
        }),
        renderBody: (token) => html`<payment-braintree-vault .token=${token}></payment-braintree-vault>`,
        beforePlaceOrder: braintreeCcVaultBeforePlaceOrder,
    });
    registerVaultAdapter({
        code: BRAINTREE_PAYPAL_VAULT_CODE,
        label: (token) => t('Hyperion_Checkout::vault_paypal_label', {
            email: detail(token, 'payerEmail'),
        }),
    });
}

registerBraintreeVaultAdapters();

declare global {
    interface HTMLElementTagNameMap { 'payment-braintree-vault': PaymentBraintreeVault; }
}
