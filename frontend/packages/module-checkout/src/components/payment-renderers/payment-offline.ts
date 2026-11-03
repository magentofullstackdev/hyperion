// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-offline> -- offline-method renderer.
 *
 * Covers `checkmo`, `banktransfer`, `cashondelivery`, `free`, and
 * adds a required PO Number input for `purchaseorder`.
 *
 * Instructions from `checkoutConfig.payment[code].instructions` are
 * sanitised through the allowlist sanitiser before rendering.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import { getCheckoutConfig } from '../../bootstrap-config.js';
import { sanitiseHtml } from '../../utils/sanitize-html.js';
import { t } from '../../utils/i18n.js';
import { getStore } from '../../store/index.js';
import { registerPaymentRenderer } from './registry.js';
import '../ui/text-input.js';

export class PaymentOffline extends LitElement {
    @property({ type: String }) public code = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const cfg = getCheckoutConfig() as unknown as Record<string, unknown>;
        const methodCfg = (cfg['payment'] as Record<string, Record<string, unknown>> | undefined)?.[this.code];
        const instructions = methodCfg && typeof methodCfg['instructions'] === 'string'
            ? sanitiseHtml(methodCfg['instructions'])
            : '';
        const isPO = this.code === 'purchaseorder';
        return html`
            <div class="space-y-3">
                ${instructions
                    ? html`<div class="text-sm text-muted"
                                .innerHTML=${instructions}></div>`
                    : nothing}
                ${isPO ? this._renderPoInput() : nothing}
            </div>
        `;
    }

    private _renderPoInput(): unknown {
        const store = getStore();
        const data = store.paymentMethodData.get()['purchaseorder'] ?? {};
        const poNumber = (data['po_number'] as string) ?? '';
        return html`
            <hc-text-input
                label=${t('Hyperion_Checkout::po_number_label')}
                name="po_number"
                .value=${poNumber}
                .required=${true}
                @value-change=${this._onPoChange}
            ></hc-text-input>
        `;
    }

    private _onPoChange(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        const current = store.paymentMethodData.get();
        store.paymentMethodData.set({
            ...current,
            purchaseorder: { ...(current['purchaseorder'] ?? {}), po_number: e.detail.value },
        });
    }
}

if (!customElements.get('payment-offline')) {
    customElements.define('payment-offline', PaymentOffline);
}

// Self-register for the four safe offline methods. purchaseorder is
// registered even though it's not in the safe-for-generic set -- its
// renderer requires a PO number, so the registry hit is required.
for (const code of ['checkmo', 'banktransfer', 'cashondelivery', 'free', 'purchaseorder']) {
    registerPaymentRenderer({
        code,
        component: 'payment-offline',
        ...(code === 'purchaseorder'
            ? {
                beforePlaceOrder: async () => {
                    const store = getStore();
                    const data = store.paymentMethodData.get()['purchaseorder'] ?? {};
                    return { po_number: (data['po_number'] as string) ?? '' };
                },
            }
            : {}),
    });
}

declare global {
    interface HTMLElementTagNameMap { 'payment-offline': PaymentOffline; }
}
