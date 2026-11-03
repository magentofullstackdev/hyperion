// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-agreements> -- Terms & Conditions checkboxes.
 *
 * Renders one checkbox per manual-mode agreement from
 * `checkoutConfig.checkoutAgreements`. Auto-mode agreements are
 * server-side accepted and never reach the UI.
 *
 * The component reads the gate state through the existing store
 * (`acceptedAgreements`) and mutates it via `acceptAgreement` /
 * `revokeAgreement` actions. The `agreementsAccepted` selector +
 * `canPlaceOrder` selector handle Place-Order gating; this component
 * is a pure renderer.
 *
 * Admin-authored `content` is run through `sanitiseHtml()` before
 * being assigned to `.innerHTML` (matching `<payment-offline>`'s
 * pattern for admin-authored rich text).
 */
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { sanitiseHtml } from '../utils/sanitize-html.js';
import { t } from '../utils/i18n.js';
import type { AgreementEntry } from '../types/config.js';
import { AGREEMENT_MODE_MANUAL } from '../types/config.js';

export class CheckoutAgreements extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const cfg = getCheckoutConfig().checkoutAgreements;
        if (!cfg || !cfg.isEnabled || !cfg.agreements) return nothing;
        const manual = cfg.agreements.filter((a) => a.mode === AGREEMENT_MODE_MANUAL);
        if (manual.length === 0) return nothing;

        const accepted = new Set(getStore().acceptedAgreements.get());

        return html`
            <fieldset class="space-y-3 pt-3 border-t border-subtle"
                      aria-labelledby="hc-agreements-heading">
                <legend id="hc-agreements-heading" class="sr-only">
                    ${t('Hyperion_Checkout::agreements_heading')}
                </legend>
                ${manual.map((a) => this._renderRow(a, accepted.has(a.agreementId)))}
            </fieldset>
        `;
    }

    private _renderRow(agreement: AgreementEntry, isAccepted: boolean): unknown {
        const id = `hc-agreement-${agreement.agreementId}`;
        const labelId = `${id}-label`;
        const descId = `${id}-desc`;
        const labelText = agreement.checkboxText || agreement.name || '';
        return html`
            <div class="space-y-2">
                <label for=${id} id=${labelId}
                       class="flex items-start gap-2 cursor-pointer text-sm text-brand">
                    <input
                        id=${id}
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                        .checked=${isAccepted}
                        aria-describedby=${descId}
                        @change=${(e: Event) => this._onToggle(agreement.agreementId, e)}
                    />
                    <span>${labelText}</span>
                </label>
                ${agreement.content
                    ? html`<div id=${descId}
                                class="text-xs text-muted pl-6 max-h-40 overflow-auto rounded border border-subtle bg-surface p-2"
                                .innerHTML=${sanitiseHtml(agreement.content)}></div>`
                    : nothing}
            </div>
        `;
    }

    private _onToggle(agreementId: number, e: Event): void {
        const checked = (e.target as HTMLInputElement).checked;
        const slot = getStore().acceptedAgreements;
        const current = slot.get();
        if (checked) {
            if (!current.includes(agreementId)) slot.set([...current, agreementId]);
        } else {
            slot.set(current.filter((id) => id !== agreementId));
        }
    }
}

if (!customElements.get('checkout-agreements')) {
    customElements.define('checkout-agreements', CheckoutAgreements);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-agreements': CheckoutAgreements; }
}
