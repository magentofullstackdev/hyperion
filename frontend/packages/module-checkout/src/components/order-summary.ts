// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <order-summary> -- sticky right rail on desktop, collapsible at the
 * top on mobile.
 */
import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { t } from '../utils/i18n.js';
import './summary-item.js';
import './summary-totals.js';
import './coupon-form.js';

export class OrderSummary extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const items = store.items.get();
        return html`
            <section aria-labelledby="hc-summary-heading"
                     class="rounded-md border border-subtle bg-surface-raised p-4 space-y-3">
                <h2 id="hc-summary-heading" class="text-lg font-semibold text-brand">
                    ${t('Hyperion_Checkout::summary_heading')}
                </h2>
                <ul class="divide-y divide-subtle">
                    ${items.map((it) => html`<summary-item .item=${it}></summary-item>`)}
                </ul>
                <div class="border-t border-subtle pt-3">
                    <summary-totals></summary-totals>
                </div>
                <coupon-form></coupon-form>
            </section>
        `;
    }
}

if (!customElements.get('order-summary')) {
    customElements.define('order-summary', OrderSummary);
}

declare global {
    interface HTMLElementTagNameMap { 'order-summary': OrderSummary; }
}
