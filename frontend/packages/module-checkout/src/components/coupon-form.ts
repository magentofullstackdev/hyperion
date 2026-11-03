// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { t } from '../utils/i18n.js';
import './ui/text-input.js';
import './ui/button.js';

export class CouponForm extends SignalWatcher(LitElement) {
    @state() private accessor _draft = '';
    @state() private accessor _open = false;
    @state() private accessor _busy = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const applied = store.appliedCoupon.get();
        const error = store.couponError.get();

        if (applied) {
            return html`
                <div class="rounded-md border border-accent/30 bg-accent/5 p-3">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="text-sm font-medium text-brand">
                                ${t('Hyperion_Checkout::coupon_applied')}
                            </p>
                            <p class="text-xs text-muted">
                                <code>${applied}</code>
                            </p>
                        </div>
                        <hc-button variant="ghost"
                                   .label=${t('Hyperion_Checkout::coupon_remove')}
                                   .loading=${this._busy}
                                   @click=${this._remove}></hc-button>
                    </div>
                </div>
            `;
        }

        if (!this._open) {
            return html`
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        @click=${() => { this._open = true; }}>
                    ${t('Hyperion_Checkout::coupon_have_code')}
                </button>
            `;
        }

        return html`
            <div class="space-y-2">
                <hc-text-input
                    label=${t('Hyperion_Checkout::coupon_code_label')}
                    name="coupon_code"
                    .value=${this._draft}
                    .error=${error ?? ''}
                    @value-change=${(e: CustomEvent<{ value: string }>) => { this._draft = e.detail.value; }}
                ></hc-text-input>
                <div class="flex gap-2">
                    <hc-button variant="primary"
                               .label=${t('Hyperion_Checkout::coupon_apply')}
                               .disabled=${this._draft.trim().length === 0}
                               .loading=${this._busy}
                               @click=${this._apply}></hc-button>
                    <hc-button variant="ghost"
                               .label=${t('Hyperion_Checkout::cancel')}
                               @click=${() => { this._open = false; this._draft = ''; }}></hc-button>
                </div>
            </div>
        `;
    }

    private _apply = async (): Promise<void> => {
        this._busy = true;
        try {
            const ok = await flowActions().applyCoupon(this._draft.trim());
            if (ok) {
                this._draft = '';
                this._open = false;
            }
        } finally {
            this._busy = false;
        }
    };

    private _remove = async (): Promise<void> => {
        this._busy = true;
        try { await flowActions().removeCoupon(); }
        finally { this._busy = false; }
    };
}

if (!customElements.get('coupon-form')) {
    customElements.define('coupon-form', CouponForm);
}

declare global {
    interface HTMLElementTagNameMap { 'coupon-form': CouponForm; }
}
