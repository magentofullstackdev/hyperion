// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <payment-vault> -- body of a selected stored-token row.
 *
 * The row itself (brand, last four, expiry) is drawn by
 * `<payment-method-row>` from the adapter's label. This element only hosts
 * what the provider's adapter wants under the row, for example the Braintree
 * CVV re-check; most tokens need nothing.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getSelectedVaultToken, getVaultAdapter } from './vault-tokens.js';

export class PaymentVault extends SignalWatcher(LitElement) {
    @property({ type: String }) public code = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const token = getSelectedVaultToken(this.code);
        const body = token ? getVaultAdapter(this.code)?.renderBody?.(token) : null;
        return body ? keyed(token?.publicHash, html`${body}`) : nothing;
    }
}

if (!customElements.get('payment-vault')) {
    customElements.define('payment-vault', PaymentVault);
}

declare global {
    interface HTMLElementTagNameMap { 'payment-vault': PaymentVault; }
}
