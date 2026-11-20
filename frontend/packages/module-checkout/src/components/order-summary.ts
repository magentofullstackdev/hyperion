// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <order-summary> -- the items, the totals and the coupon form.
 *
 * As the rail of the wide layout it is a card that is always open. With
 * `collapsible` (the narrow layout, where it is the first block of the
 * checkout) it is a `<details>` whose bar shows the number of items and
 * the grand total at all times and opens to the same content.
 *
 * The checkout renders one instance at a time, so the ids, the coupon form
 * and the live region of the grand total (inside <summary-totals>) exist
 * once. The total in the bar is part of the bar's name, not a live region.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { t, tn } from '../utils/i18n.js';
import { readGrandTotal } from './summary-totals.js';
import './summary-item.js';
import './summary-totals.js';
import './coupon-form.js';

/** How many thumbnails load with the page instead of lazily. */
const EAGER_THUMBNAILS = 3;

export class OrderSummary extends SignalWatcher(LitElement) {
    @property({ type: Boolean, reflect: true }) public collapsible = false;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        return this.collapsible ? this._renderCollapsible() : html`
            <div class="rounded-card border border-subtle bg-surface-raised">
                ${this._renderContent()}
            </div>
        `;
    }

    private _renderCollapsible(): unknown {
        const store = getStore();
        const count = store.items.get().reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        const total = readGrandTotal(store);
        return html`
            <details class="group rounded-card border border-subtle bg-surface-raised">
                <summary class="flex h-[3.375rem] cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
                         data-hyperion-summary-bar>
                    <span class="flex min-w-0 items-center gap-2 text-sm font-medium text-brand">
                        <svg class="h-4 w-4 shrink-0 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                        <span class="truncate">${tn('Hyperion_Checkout::summary_items', count)}</span>
                    </span>
                    <span class="shrink-0 text-base font-bold text-heading" data-hyperion-summary-bar-total>
                        ${total?.text ?? nothing}
                    </span>
                </summary>
                <div class="border-t border-subtle">
                    ${this._renderContent()}
                </div>
            </details>
        `;
    }

    private _renderContent(): unknown {
        const items = getStore().items.get();
        const cfg = getCheckoutConfig();
        const cartUrl = cfg.hyperion?.cartUrl || cfg.cartUrl;
        return html`
            <section aria-labelledby="hc-summary-heading" class="p-4 space-y-3">
                <div class="flex items-baseline justify-between gap-3">
                    <h2 id="hc-summary-heading" class="text-lg font-bold text-heading tracking-tight">
                        ${t('Hyperion_Checkout::summary_heading')}
                    </h2>
                    ${cartUrl
                        ? html`<a href=${cartUrl}
                                  class="shrink-0 text-sm font-medium text-accent hover:underline"
                                  data-hyperion-edit-cart>${t('Hyperion_Checkout::summary_edit_cart')}</a>`
                        : nothing}
                </div>
                <div role="list" class="divide-y divide-subtle">
                    ${items.map((it, index) => html`
                        <summary-item class="block" .item=${it} .eager=${index < EAGER_THUMBNAILS}></summary-item>
                    `)}
                </div>
                <div class="border-t border-subtle pt-3">
                    <summary-totals></summary-totals>
                </div>
                <coupon-form class="block"></coupon-form>
                <hc-section-status section="coupon"></hc-section-status>
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
