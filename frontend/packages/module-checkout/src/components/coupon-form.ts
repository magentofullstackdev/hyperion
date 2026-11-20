// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import {
    captchaAnswer,
    captchaError,
    focusCaptchaField,
    isCaptchaRequired,
    setCaptchaError,
} from '../store/captcha-state.js';
import { couponDraft } from '../store/drafts.js';
import { getStore } from '../store/index.js';
import { flowActions } from '../store/flow-actions.js';
import { t } from '../utils/i18n.js';
import './anti-abuse-field.js';
import './ui/text-input.js';
import './ui/button.js';

const CAPTCHA_FORM = 'sales_rule_coupon_request';

/**
 * The code being typed lives in `couponDraft`, outside the element: it
 * survives a reload with the other drafts and a summary that is rendered
 * again in another layout.
 */
export class CouponForm extends SignalWatcher(LitElement) {
    @state() private accessor _open = false;
    @state() private accessor _busy = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        // A code typed and not sent yet comes back in its open form.
        if (couponDraft.get().trim() !== '') this._open = true;
    }

    public override render(): unknown {
        const store = getStore();
        const draft = couponDraft.get();
        const applied = store.appliedCoupon.get();
        // A refused CAPTCHA answer is shown next to its own field.
        const error = captchaError(CAPTCHA_FORM) === null ? store.couponError.get() : null;

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
                    .value=${draft}
                    .error=${error ?? ''}
                    @value-change=${(e: CustomEvent<{ value: string }>) => { couponDraft.set(e.detail.value); }}
                ></hc-text-input>
                <hc-coupon-captcha></hc-coupon-captcha>
                <div class="flex gap-2">
                    <hc-button variant="primary"
                               .label=${t('Hyperion_Checkout::coupon_apply')}
                               .disabled=${draft.trim().length === 0}
                               .loading=${this._busy}
                               @click=${this._apply}></hc-button>
                    <hc-button variant="ghost"
                               .label=${t('Hyperion_Checkout::cancel')}
                               @click=${() => { this._open = false; couponDraft.set(''); }}></hc-button>
                </div>
            </div>
        `;
    }

    private _apply = async (): Promise<void> => {
        const store = getStore();
        if (isCaptchaRequired(store, CAPTCHA_FORM) && captchaAnswer(store, CAPTCHA_FORM) === '') {
            setCaptchaError(CAPTCHA_FORM, t('Hyperion_Checkout::validation_required'));
            focusCaptchaField(CAPTCHA_FORM);
            return;
        }
        this._busy = true;
        try {
            const ok = await flowActions().applyCoupon(couponDraft.get().trim());
            if (ok) {
                couponDraft.set('');
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
