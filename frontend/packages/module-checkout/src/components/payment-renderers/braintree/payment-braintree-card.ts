// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-braintree-card> -- Braintree credit card (method `braintree`).
 *
 * Card number, expiry and CVV are Braintree Hosted Fields: iframes mounted
 * into light-DOM containers that carry the same box styling as the other
 * checkout inputs, so card data never touches this page. The SDK is loaded
 * when the element connects, that is when the shopper picks the method.
 *
 * Place Order runs `beforePlaceOrder`: validate, tokenize, 3D Secure when
 * the merchant configured it, then hand Magento the `additional_data` the
 * gateway expects: `payment_method_nonce`, `device_data` and, for customers
 * of an active vault, `is_active_payment_token_enabler`. Any failure rejects
 * with a translated message and the order is not placed.
 *
 * The "save for later" box starts unchecked: storing a card is an explicit
 * opt-in (core pre-checks it).
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

import { t } from '../../../utils/i18n.js';
import { registerPaymentRenderer } from '../registry.js';
import { getBraintreeClient, getDeviceData } from './client.js';
import {
    BRAINTREE_CODE,
    getBraintreeCardConfig,
    isVaultEnabledFor,
    type BraintreeCardConfig,
} from './config.js';
import {
    HOSTED_FIELD_BOX,
    hostedFieldProbes,
    resolveHostedFieldStyles,
} from './hosted-field-styles.js';
import { getBillingAddress } from './quote.js';
import { loadBraintreeModule } from './sdk.js';
import { verifyThreeDSecure } from './three-d-secure.js';
import type {
    BraintreeError,
    HostedFieldName,
    HostedFieldOptions,
    HostedFieldsEvent,
    HostedFieldsInstance,
} from './types.js';
import '../../ui/checkbox.js';

type Status = 'loading' | 'ready' | 'error';

interface FieldView {
    isFocused: boolean;
    showError: boolean;
}

const FIELD_LABELS: Readonly<Record<HostedFieldName, string>> = {
    number: 'Hyperion_Checkout::braintree_card_number',
    expirationDate: 'Hyperion_Checkout::braintree_card_expiry',
    cvv: 'Hyperion_Checkout::braintree_card_cvv',
};

const FIELD_ERRORS: Readonly<Record<HostedFieldName, string>> = {
    number: 'Hyperion_Checkout::braintree_card_number_invalid',
    expirationDate: 'Hyperion_Checkout::braintree_card_expiry_invalid',
    cvv: 'Hyperion_Checkout::braintree_card_cvv_invalid',
};

const TOKENIZE_ERRORS: Readonly<Record<string, string>> = {
    HOSTED_FIELDS_FIELDS_EMPTY: 'Hyperion_Checkout::braintree_card_fields_empty',
    HOSTED_FIELDS_FIELDS_INVALID: 'Hyperion_Checkout::braintree_card_fields_invalid',
    HOSTED_FIELDS_TOKENIZATION_FAIL_ON_DUPLICATE: 'Hyperion_Checkout::braintree_card_duplicate',
    HOSTED_FIELDS_TOKENIZATION_CVV_VERIFICATION_FAILED: 'Hyperion_Checkout::braintree_card_cvv_failed',
    HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR: 'Hyperion_Checkout::braintree_network_error',
};

/**
 * Core `validator.js`: a detected card brand is accepted when the merchant
 * enabled it, narrowed by the per-country list of the billing country.
 */
export function resolveAcceptedCardType(
    config: Pick<BraintreeCardConfig, 'ccTypesMapper' | 'availableCardTypes' | 'countrySpecificCardTypes'>,
    braintreeType: string,
    billingCountry: string | null
): string | null {
    const mageType = config.ccTypesMapper[braintreeType];
    if (!mageType) return null;
    const countryTypes = billingCountry ? config.countrySpecificCardTypes[billingCountry] : undefined;
    const accepted = countryTypes
        ? config.availableCardTypes.filter((type) => countryTypes.includes(type))
        : config.availableCardTypes;
    return accepted.includes(mageType) ? mageType : null;
}

let activeElement: PaymentBraintreeCard | null = null;

export class PaymentBraintreeCard extends LitElement {
    @property({ type: String }) public code = BRAINTREE_CODE;

    @state() private _status: Status = 'loading';
    @state() private _fields: Record<HostedFieldName, FieldView> = {
        number: { isFocused: false, showError: false },
        expirationDate: { isFocused: false, showError: false },
        cvv: { isFocused: false, showError: false },
    };
    @state() private _brand: { type: string; niceType: string } | null = null;
    @state() private _saveCard = false;

    private _hostedFields: HostedFieldsInstance | null = null;
    private _generation = 0;
    private _pending: Promise<Record<string, unknown>> | null = null;

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
        const config = getBraintreeCardConfig();
        const vaultEnabled = config !== null && isVaultEnabledFor(config.ccVaultCode);
        return html`
            <div class="space-y-3">
                ${hostedFieldProbes()}
                ${this._status === 'error' ? this._renderInitError() : nothing}
                ${this._status === 'loading'
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${t('Hyperion_Checkout::braintree_card_loading')}
                      </p>`
                    : nothing}
                <div class="space-y-3 ${this._status === 'error' ? 'hidden' : ''}">
                    ${this._renderField('number')}
                    <div class="grid grid-cols-2 gap-3">
                        ${this._renderField('expirationDate')}
                        ${config?.useCvv ? this._renderField('cvv') : nothing}
                    </div>
                    ${vaultEnabled
                        ? html`<hc-checkbox
                                  name="braintree_save_card"
                                  label=${t('Hyperion_Checkout::braintree_save_card')}
                                  .checked=${this._saveCard}
                                  @value-change=${this._onSaveCardChange}
                              ></hc-checkbox>`
                        : nothing}
                </div>
            </div>
        `;
    }

    private _renderInitError(): unknown {
        return html`
            <div role="alert"
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3">
                <p class="flex-1 text-sm text-danger">${t('Hyperion_Checkout::braintree_init_failed')}</p>
                <button type="button"
                        class="text-xs text-danger hover:underline"
                        @click=${this._onRetry}>
                    ${t('Hyperion_Checkout::braintree_retry')}
                </button>
            </div>
        `;
    }

    private _renderField(name: HostedFieldName): unknown {
        const view = this._fields[name];
        const rejectedBrand = name === 'number' && this._brand !== null && !this._isBrandAccepted();
        const invalid = view.showError || rejectedBrand;
        const labelId = `hc-bt-${name}-label`;
        const errorId = `hc-bt-${name}-err`;
        const message = rejectedBrand
            ? t('Hyperion_Checkout::braintree_card_type_not_accepted', { type: this._brand?.niceType ?? '' })
            : t(FIELD_ERRORS[name]);
        return html`
            <div>
                <div class="flex items-center justify-between gap-2">
                    <label id=${labelId}
                           class="block text-sm font-medium text-brand"
                           @click=${() => this._hostedFields?.focus(name)}>
                        ${t(FIELD_LABELS[name])}
                        <span aria-hidden="true" class="text-danger">*</span>
                    </label>
                    ${name === 'number' && this._brand
                        ? html`<span class="text-xs font-medium text-muted" data-card-brand>${this._brand.niceType}</span>`
                        : nothing}
                </div>
                <div data-hosted-field=${name}
                     role="group"
                     aria-labelledby=${labelId}
                     aria-describedby=${invalid ? errorId : ''}
                     class="${HOSTED_FIELD_BOX} ${invalid ? 'border-danger' : 'border-subtle'} ${view.isFocused ? 'ring-2 ring-accent' : ''}"></div>
                ${invalid
                    ? html`<p id=${errorId} class="mt-1 text-sm text-danger">${message}</p>`
                    : nothing}
            </div>
        `;
    }

    private async _init(): Promise<void> {
        const generation = ++this._generation;
        const stale = (): boolean => generation !== this._generation || !this.isConnected;
        this._status = 'loading';
        try {
            const config = getBraintreeCardConfig();
            if (!config?.clientToken) throw new Error('missing Braintree client token');
            const [client, hostedFields] = await Promise.all([
                getBraintreeClient(config.clientToken),
                loadBraintreeModule('hosted-fields'),
            ]);
            void getDeviceData(config.clientToken);
            if (stale()) return;
            await this._teardown();
            const instance = await hostedFields.create({
                client,
                fields: this._fieldOptions(config),
                styles: resolveHostedFieldStyles(this),
            });
            if (stale()) {
                void instance.teardown().catch(() => undefined);
                return;
            }
            instance.on('validityChange', (event) => this._onValidityChange(event));
            instance.on('cardTypeChange', (event) => this._onCardTypeChange(event));
            instance.on('focus', (event) => this._patchField(event.emittedBy, { isFocused: true }));
            instance.on('blur', (event) => this._onBlur(event));
            this._hostedFields = instance;
            this._status = 'ready';
        } catch (err) {
            if (stale()) return;
            // eslint-disable-next-line no-console
            console.error('[hyperion-checkout] Braintree hosted fields could not be initialised', err);
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
            // eslint-disable-next-line no-console
            console.error('[hyperion-checkout] Braintree hosted fields teardown failed', err);
        }
    }

    private _fieldOptions(config: BraintreeCardConfig): Partial<Record<HostedFieldName, HostedFieldOptions>> {
        const container = (name: HostedFieldName): HTMLElement => {
            const el = this.querySelector<HTMLElement>(`[data-hosted-field="${name}"]`);
            if (!el) throw new Error(`hosted field container "${name}" is missing`);
            return el;
        };
        const fields: Partial<Record<HostedFieldName, HostedFieldOptions>> = {
            number: { container: container('number'), placeholder: '4111 1111 1111 1111' },
            expirationDate: {
                container: container('expirationDate'),
                placeholder: t('Hyperion_Checkout::braintree_card_expiry_placeholder'),
            },
        };
        if (config.useCvv) fields.cvv = { container: container('cvv'), placeholder: '123' };
        return fields;
    }

    private _patchField(name: HostedFieldName, patch: Partial<FieldView>): void {
        this._fields = { ...this._fields, [name]: { ...this._fields[name], ...patch } };
    }

    private _onValidityChange(event: HostedFieldsEvent): void {
        const fieldState = event.fields[event.emittedBy];
        if (!fieldState) return;
        this._patchField(event.emittedBy, {
            showError: !fieldState.isValid && !fieldState.isPotentiallyValid,
        });
    }

    private _onBlur(event: HostedFieldsEvent): void {
        const fieldState = event.fields[event.emittedBy];
        this._patchField(event.emittedBy, {
            isFocused: false,
            ...(fieldState ? { showError: !fieldState.isValid && !fieldState.isEmpty } : {}),
        });
    }

    private _onCardTypeChange(event: HostedFieldsEvent): void {
        const card = event.cards.length === 1 ? event.cards[0] : undefined;
        this._brand = card ? { type: card.type, niceType: card.niceType } : null;
    }

    private _isBrandAccepted(): boolean {
        const config = getBraintreeCardConfig();
        if (!config || !this._brand) return true;
        return resolveAcceptedCardType(
            config,
            this._brand.type,
            getBillingAddress()?.country_id ?? null
        ) !== null;
    }

    private _onSaveCardChange(e: CustomEvent<{ checked: boolean }>): void {
        this._saveCard = e.detail.checked;
    }

    private _onRetry = (): void => {
        void this._init();
    };

    /** One tokenization at a time: a second Place Order click joins the first. */
    public collectPaymentData(): Promise<Record<string, unknown>> {
        if (!this._pending) {
            this._pending = this._collect().finally(() => {
                this._pending = null;
            });
        }
        return this._pending;
    }

    private async _collect(): Promise<Record<string, unknown>> {
        const config = getBraintreeCardConfig();
        const instance = this._hostedFields;
        if (!config || !instance || this._status !== 'ready') {
            throw new Error(t('Hyperion_Checkout::braintree_not_ready'));
        }
        if (!this._isBrandAccepted()) {
            throw new Error(t('Hyperion_Checkout::braintree_card_type_not_accepted', {
                type: this._brand?.niceType ?? '',
            }));
        }

        let payload;
        try {
            payload = await instance.tokenize({});
        } catch (err) {
            throw new Error(this._explainTokenizeError(err as BraintreeError));
        }

        const vaultEnabled = isVaultEnabledFor(config.ccVaultCode);
        const nonce = await verifyThreeDSecure({
            authorization: config.clientToken,
            nonce: payload.nonce,
            bin: payload.details.bin ?? '',
            storedCard: false,
            savingCard: vaultEnabled && this._saveCard,
        });
        const deviceData = await getDeviceData(config.clientToken);

        return {
            payment_method_nonce: nonce,
            ...(deviceData ? { device_data: deviceData } : {}),
            ...(vaultEnabled ? { is_active_payment_token_enabler: this._saveCard } : {}),
        };
    }

    private _explainTokenizeError(err: BraintreeError): string {
        // eslint-disable-next-line no-console
        console.error('[hyperion-checkout] Braintree tokenization failed', err);
        const code = err?.code ?? '';
        const useCvv = getBraintreeCardConfig()?.useCvv ?? false;
        const names: HostedFieldName[] = useCvv
            ? ['number', 'expirationDate', 'cvv']
            : ['number', 'expirationDate'];
        if (code === 'HOSTED_FIELDS_FIELDS_EMPTY') {
            for (const name of names) this._patchField(name, { showError: true });
        }
        if (code === 'HOSTED_FIELDS_FIELDS_INVALID') {
            const invalid = err.details?.invalidFieldKeys ?? [];
            for (const name of names) {
                if (invalid.includes(name)) this._patchField(name, { showError: true });
            }
        }
        return t(TOKENIZE_ERRORS[code] ?? 'Hyperion_Checkout::braintree_tokenize_failed');
    }
}

if (!customElements.get('payment-braintree-card')) {
    customElements.define('payment-braintree-card', PaymentBraintreeCard);
}

export function registerBraintreeCardRenderer(): void {
    registerPaymentRenderer({
        code: BRAINTREE_CODE,
        component: 'payment-braintree-card',
        isAvailable: () => {
            const config = getBraintreeCardConfig();
            return Boolean(config?.isActive && config.clientToken);
        },
        beforePlaceOrder: async () => {
            if (!activeElement) throw new Error(t('Hyperion_Checkout::braintree_not_ready'));
            return activeElement.collectPaymentData();
        },
    });
}

registerBraintreeCardRenderer();

declare global {
    interface HTMLElementTagNameMap { 'payment-braintree-card': PaymentBraintreeCard; }
}
