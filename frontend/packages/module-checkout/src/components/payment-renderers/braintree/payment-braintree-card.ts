// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-payment-braintree-card> -- Braintree credit card (method `braintree`).
 *
 * Card number, expiry and CVV are Braintree Hosted Fields: iframes mounted
 * into light-DOM containers that carry the same box styling as the other
 * checkout inputs, so card data never touches this page. The SDK is loaded
 * when the element connects, that is when the shopper picks the method.
 *
 * The element reports `ready` once the fields are mounted (or could not be:
 * then it shows its own error with a retry), so the checkout shows a
 * placeholder of the same height until then.
 *
 * Place Order asks `getPaymentData()`: validate, tokenize, 3D Secure when
 * the merchant configured it (reported as busy, so a challenge may take its
 * time), then hand Magento the `additional_data` the gateway expects:
 * `payment_method_nonce`, `device_data` and, for customers of an active
 * vault, `is_active_payment_token_enabler`. Any failure rejects with a
 * translated message and the order is not placed.
 *
 * The "save for later" box starts unchecked: storing a card is an explicit
 * opt-in (core pre-checks it).
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

import type {
    PaymentContext,
    PaymentData,
    PaymentMethodInfo,
    VaultTokenInfo,
} from '../../../../extension-api.js';
import type { RecaptchaAction } from '../../../types/captcha.js';
import type { CheckoutConfig } from '../../../types/config.js';
import { firstPartyOf, type FirstPartyServices } from '../first-party.js';
import { getBraintreeClient, getDeviceData } from './client.js';
import {
    BRAINTREE_CODE,
    getBraintreeCardConfig,
    isVaultEnabledFor,
    type BraintreeCardConfig,
} from './config.js';
import { HOSTED_FIELD_BOX, resolveHostedFieldStyles } from './hosted-field-styles.js';
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
    number: 'Card number',
    expirationDate: 'Expiry date',
    cvv: 'Security code (CVV)',
};

const FIELD_ERRORS: Readonly<Record<HostedFieldName, string>> = {
    number: 'Enter a valid card number.',
    expirationDate: 'Enter a valid expiry date.',
    cvv: 'Enter a valid security code.',
};

const TOKENIZE_ERRORS: Readonly<Record<string, string>> = {
    HOSTED_FIELDS_FIELDS_EMPTY: 'Enter your card details to continue.',
    HOSTED_FIELDS_FIELDS_INVALID: 'Some card details are not valid. Check the highlighted fields.',
    HOSTED_FIELDS_TOKENIZATION_FAIL_ON_DUPLICATE: 'This card is already stored in your account. Pick it from your stored cards or use another one.',
    HOSTED_FIELDS_TOKENIZATION_CVV_VERIFICATION_FAILED: 'The security code could not be verified. Check it and try again.',
    HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR: 'The payment service could not be reached. Check your connection and try again.',
};

const TOKENIZE_FAILED = 'Your card could not be processed. Check the details or use another card.';
const NOT_READY = 'The payment form is still loading. Please wait a moment and try again.';
const NOT_ACCEPTED = '{type} cards are not accepted. Please use another card.';

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

export class PaymentBraintreeCard extends LitElement {
    public static readonly hyperionApi = '1';

    /** Hidden without a client token, like core's renderer. */
    public static canMakePayment(args: { config: Readonly<Record<string, unknown>> }): boolean {
        const config = getBraintreeCardConfig({ payment: { [BRAINTREE_CODE]: { ...args.config } } });
        return Boolean(config?.isActive && config.clientToken);
    }

    /** Core checks a card order against the Braintree reCAPTCHA form when one is configured. */
    public static hyperionRecaptchaAction(config: CheckoutConfig): RecaptchaAction {
        return config.hyperion?.recaptcha?.braintree ? 'braintree' : 'place_order';
    }

    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: PaymentMethodInfo;
    public config: Readonly<Record<string, unknown>> = {};
    public token: VaultTokenInfo | null = null;

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

    private get _services(): FirstPartyServices {
        const services = firstPartyOf(this.context);
        if (services === null) throw new Error('the Braintree card renderer needs the first-party context');
        return services;
    }

    private _config(): BraintreeCardConfig | null {
        return getBraintreeCardConfig(this._services.config());
    }

    private _emit(name: string, detail: Record<string, unknown> = {}): void {
        this.dispatchEvent(new CustomEvent(`hyperion-payment:${name}`, { bubbles: true, composed: true, detail }));
    }

    public override connectedCallback(): void {
        super.connectedCallback();
        void this.updateComplete.then(() => this._init());
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._generation++;
        void this._teardown();
    }

    public override render(): unknown {
        const config = this._config();
        const vaultEnabled = config !== null && isVaultEnabledFor(this._services.config(), config.ccVaultCode);
        return html`
            <div class="space-y-3">
                ${this._status === 'error' ? this._renderInitError() : nothing}
                ${this._status === 'loading'
                    ? html`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${this.context.t('Loading the secure card form...')}
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
                                  label=${this.context.t('Save this card for future purchases')}
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
                <p class="flex-1 text-sm text-error-strong">${this.context.t('The secure payment form could not be loaded. Try again or choose another payment method.')}</p>
                <button type="button"
                        class="text-xs text-error-strong hover:underline"
                        @click=${this._onRetry}>
                    ${this.context.t('Try again')}
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
            ? this.context.t(NOT_ACCEPTED, { type: this._brand?.niceType ?? '' })
            : this.context.t(FIELD_ERRORS[name]);
        return html`
            <div>
                <div class="flex items-center justify-between gap-2">
                    <label id=${labelId}
                           class="block text-sm font-medium text-brand"
                           @click=${() => this._hostedFields?.focus(name)}>
                        ${this.context.t(FIELD_LABELS[name])}
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
            const config = this._config();
            if (!config?.clientToken) throw new Error('missing Braintree client token');
            const [client, hostedFields] = await Promise.all([
                getBraintreeClient(this.context, config.clientToken),
                loadBraintreeModule(this.context, 'hosted-fields'),
            ]);
            void getDeviceData(this.context, config.clientToken);
            if (stale()) return;
            await this._teardown();
            const instance = await hostedFields.create({
                client,
                fields: this._fieldOptions(config),
                styles: resolveHostedFieldStyles(this.context),
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
            this._emit('ready');
        } catch (err) {
            if (stale()) return;
            console.error('[hyperion-checkout] Braintree hosted fields could not be initialized', err);
            this._status = 'error';
            // Shown with its own error and retry instead of the placeholder.
            this._emit('ready');
        }
    }

    private async _teardown(): Promise<void> {
        const instance = this._hostedFields;
        this._hostedFields = null;
        if (!instance) return;
        try {
            await instance.teardown();
        } catch (err) {
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
                placeholder: this.context.t('MM/YY'),
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
        const config = this._config();
        if (!config || !this._brand) return true;
        return resolveAcceptedCardType(
            config,
            this._brand.type,
            this._services.quote().billingAddress?.country_id ?? null
        ) !== null;
    }

    private _onSaveCardChange(e: CustomEvent<{ checked: boolean }>): void {
        this._saveCard = e.detail.checked;
    }

    private _onRetry = (): void => {
        void this._init();
    };

    /** Place Order: the nonce and what goes with it, as `additional_data`. */
    public async getPaymentData(): Promise<PaymentData> {
        return { additional_data: await this.collectPaymentData() };
    }

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
        const config = this._config();
        const instance = this._hostedFields;
        if (!config || !instance || this._status !== 'ready') {
            throw new Error(this.context.t(NOT_READY));
        }
        if (!this._isBrandAccepted()) {
            throw new Error(this.context.t(NOT_ACCEPTED, {
                type: this._brand?.niceType ?? '',
            }));
        }

        let payload;
        try {
            payload = await instance.tokenize({});
        } catch (err) {
            throw new Error(this._explainTokenizeError(err as BraintreeError), { cause: err });
        }

        const vaultEnabled = isVaultEnabledFor(this._services.config(), config.ccVaultCode);
        // A 3-D Secure challenge waits for the shopper: the checkout is told it is still at work.
        this._emit('busy', { busy: true });
        let nonce: string;
        try {
            nonce = await verifyThreeDSecure(this.context, {
                authorization: config.clientToken,
                nonce: payload.nonce,
                bin: payload.details.bin ?? '',
                storedCard: false,
                savingCard: vaultEnabled && this._saveCard,
            });
        } finally {
            this._emit('busy', { busy: false });
        }
        const deviceData = await getDeviceData(this.context, config.clientToken);

        return {
            payment_method_nonce: nonce,
            ...(deviceData ? { device_data: deviceData } : {}),
            ...(vaultEnabled ? { is_active_payment_token_enabler: this._saveCard } : {}),
        };
    }

    private _explainTokenizeError(err: BraintreeError): string {
        console.error('[hyperion-checkout] Braintree tokenization failed', err);
        const code = err?.code ?? '';
        const useCvv = this._config()?.useCvv ?? false;
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
        return this.context.t(TOKENIZE_ERRORS[code] ?? TOKENIZE_FAILED);
    }
}

if (!customElements.get('hc-payment-braintree-card')) {
    customElements.define('hc-payment-braintree-card', PaymentBraintreeCard);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-payment-braintree-card': PaymentBraintreeCard; }
}
