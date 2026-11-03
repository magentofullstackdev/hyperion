// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <summary-totals> -- renders the totals rows built by `buildTotalsRows`.
 *
 * Subtotal, shipping, tax and grand total follow the store's tax display
 * settings (excl. / incl. / both, full tax summary, zero tax). Unknown
 * segment codes are rendered as-is so extensions
 * propagate without further code change. `grand_total` gets an
 * emphasised row with a top border.
 */
import { LitElement, html } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getPriceFormat, getCheckoutConfig } from '../bootstrap-config.js';
import { formatMoney } from '../utils/currency.js';
import { t } from '../utils/i18n.js';
import { buildTotalsRows } from '../utils/totals-rows.js';

export class SummaryTotals extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const totals = store.totals.get();
        if (!totals) return null;
        const fmt = getPriceFormat();
        const rows = buildTotalsRows(totals, getCheckoutConfig(), {
            exclTax: (title) => t('Hyperion_Checkout::total_excl_tax', { title }),
            inclTax: (title) => t('Hyperion_Checkout::total_incl_tax', { title }),
        });

        const grandRow = rows.find((r) => r.kind === 'grand');
        const grandLabel = grandRow ? `${grandRow.label} ${formatMoney(grandRow.value, fmt)}` : '';

        return html`
            <dl class="space-y-1.5">
                ${rows.map((row) => {
                    const rowClass = {
                        grand: 'flex items-center justify-between pt-2 mt-2 border-t border-subtle text-base font-bold text-brand',
                        detail: 'flex items-center justify-between text-xs text-muted',
                        regular: 'flex items-center justify-between text-sm text-brand',
                    }[row.kind];
                    return html`
                        <div class=${rowClass} data-total=${row.code}>
                            <dt>${row.label}</dt>
                            <dd>${formatMoney(row.value, fmt)}</dd>
                        </div>
                    `;
                })}
            </dl>
            <div role="status"
                 aria-live="polite"
                 class="sr-only">
                ${grandLabel}
            </div>
        `;
    }
}

if (!customElements.get('summary-totals')) {
    customElements.define('summary-totals', SummaryTotals);
}

declare global {
    interface HTMLElementTagNameMap { 'summary-totals': SummaryTotals; }
}
