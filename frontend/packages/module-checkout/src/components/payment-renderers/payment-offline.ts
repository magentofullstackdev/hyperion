// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-offline> -- offline-method renderer.
 *
 * Covers `checkmo`, `banktransfer`, `cashondelivery`, `free`, and
 * adds a required PO Number input for `purchaseorder`.
 *
 * The merchant's instructions come from `checkoutConfig.payment.instructions[code]`
 * (bank transfer, cash on delivery) and pass through the allowlist
 * sanitizer before rendering. A check shows who it is payable to
 * (`payment.checkmo.payableTo`, bound as text: the server does not escape
 * it) and where to send it (`payment.checkmo.mailingAddress`, line breaks
 * as markup, sanitized).
 *
 * The purchase order number is required: the renderer is not ready while
 * it is empty, and the field shows why after a blur or an early press of
 * Place Order.
 */
import { LitElement, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getCheckoutConfig } from '../../bootstrap-config.js';
import { sanitiseHtml } from '../../utils/sanitize-html.js';
import { t } from '../../utils/i18n.js';
import { getStore } from '../../store/index.js';
import { validationRequests } from '../../store/validation-request.js';
import { registerPaymentRenderer } from './registry.js';
import '../ui/text-input.js';

const PURCHASE_ORDER_CODE = 'purchaseorder';

/** The purchase order number as typed so far, trimmed. */
function readPoNumber(): string {
    return String(getStore().paymentMethodData.get()[PURCHASE_ORDER_CODE]?.['po_number'] ?? '').trim();
}

function paymentConfig(): Readonly<Record<string, Record<string, unknown>>> {
    return getCheckoutConfig().payment ?? {};
}

function stringOf(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export class PaymentOffline extends SignalWatcher(LitElement) {
    @property({ type: String }) public code = '';

    @state() private _poTouched = false;

    private _validationBaseline = 0;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this._validationBaseline = validationRequests.get();
    }

    public override render(): unknown {
        const instructions = sanitiseHtml(stringOf(paymentConfig()['instructions']?.[this.code]));
        return html`
            <div class="space-y-3">
                ${instructions
                    ? html`<div class="text-sm text-muted"
                                data-payment-instructions
                                .innerHTML=${instructions}></div>`
                    : nothing}
                ${this.code === 'checkmo' ? this._renderCheckDetails() : nothing}
                ${this.code === PURCHASE_ORDER_CODE ? this._renderPoInput() : nothing}
            </div>
        `;
    }

    private _renderCheckDetails(): unknown {
        const check = paymentConfig()['checkmo'] ?? {};
        const payableTo = stringOf(check['payableTo']).trim();
        const mailingAddress = sanitiseHtml(stringOf(check['mailingAddress']));
        if (payableTo === '' && mailingAddress.trim() === '') return nothing;
        return html`
            <dl class="text-sm text-muted space-y-2" data-payment-check-details>
                ${payableTo !== ''
                    ? html`<div>
                              <dt class="font-medium text-brand">${t('Hyperion_Checkout::checkmo_payable_to')}</dt>
                              <dd data-payment-check-payable-to>${payableTo}</dd>
                          </div>`
                    : nothing}
                ${mailingAddress.trim() !== ''
                    ? html`<div>
                              <dt class="font-medium text-brand">${t('Hyperion_Checkout::checkmo_send_to')}</dt>
                              <dd data-payment-check-send-to .innerHTML=${mailingAddress}></dd>
                          </div>`
                    : nothing}
            </dl>
        `;
    }

    private _renderPoInput(): unknown {
        const store = getStore();
        const data = store.paymentMethodData.get()[PURCHASE_ORDER_CODE] ?? {};
        const poNumber = stringOf(data['po_number']);
        const reveal = this._poTouched || validationRequests.get() > this._validationBaseline;
        const error = reveal && poNumber.trim() === '' ? t('Hyperion_Checkout::po_number_required') : '';
        return html`
            <hc-text-input
                label=${t('Hyperion_Checkout::po_number_label')}
                name="po_number"
                .value=${poNumber}
                .required=${true}
                .error=${error}
                @value-change=${this._onPoChange}
                @value-blur=${this._onPoBlur}
            ></hc-text-input>
        `;
    }

    private _onPoChange(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        const current = store.paymentMethodData.get();
        store.paymentMethodData.set({
            ...current,
            [PURCHASE_ORDER_CODE]: { ...(current[PURCHASE_ORDER_CODE] ?? {}), po_number: e.detail.value },
        });
    }

    private _onPoBlur(): void {
        this._poTouched = true;
    }
}

if (!customElements.get('payment-offline')) {
    customElements.define('payment-offline', PaymentOffline);
}

// Self-register for the four safe offline methods. purchaseorder is
// registered even though it's not in the safe-for-generic set: its
// renderer requires a PO number, so the registry hit is required.
export function registerOfflineRenderers(): void {
    for (const code of ['checkmo', 'banktransfer', 'cashondelivery', 'free', PURCHASE_ORDER_CODE]) {
        registerPaymentRenderer({
            code,
            component: 'payment-offline',
            ...(code === PURCHASE_ORDER_CODE
                ? {
                    // Reads the store signal, so Place Order follows the typing.
                    isReady: () => readPoNumber() !== '',
                    notReadyMessage: () => t('Hyperion_Checkout::po_number_required'),
                    beforePlaceOrder: async () => {
                        const poNumber = readPoNumber();
                        if (poNumber === '') {
                            throw new Error(t('Hyperion_Checkout::po_number_required'));
                        }
                        return { po_number: poNumber };
                    },
                }
                : {}),
        });
    }
}

registerOfflineRenderers();

declare global {
    interface HTMLElementTagNameMap { 'payment-offline': PaymentOffline; }
}
