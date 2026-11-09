// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { LitElement, html } from 'lit';
import { property } from 'lit/decorators.js';

import type { CartItem } from '../types/quote.js';
import { getCheckoutConfig, getPriceFormat } from '../bootstrap-config.js';
import { formatMoney } from '../utils/currency.js';
import { t } from '../utils/i18n.js';
import { htmlToText } from '../utils/sanitize-html.js';
import { pickByMode } from '../utils/totals-rows.js';
import { parseWeeeLines } from '../utils/weee.js';

export class SummaryItem extends LitElement {
    @property({ type: Object }) public item!: CartItem;

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const it = this.item;
        const cfg = getCheckoutConfig();
        const thumb = it.thumbnail ?? this._imageFromConfig(cfg, String(it.item_id)) ?? '';
        const options = this._parseOptions(it.options);
        const weee = cfg.isWeeeEnabled ? parseWeeeLines(it, cfg.reviewItemPriceDisplayMode === 'including') : [];
        return html`
            <li class="flex gap-3 py-2">
                ${thumb
                    ? html`<img src=${thumb} alt="" class="h-16 w-16 rounded border border-subtle object-cover bg-surface-raised" loading="lazy">`
                    : html`<div class="h-16 w-16 rounded border border-subtle bg-surface-raised"></div>`}
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-brand truncate">${it.name}</p>
                    ${options.length > 0
                        ? html`<ul class="text-xs text-muted space-y-0.5 mt-0.5">
                                ${options.map((o) => html`
                                    <li><span>${o.label}:</span> <span>${o.value}</span></li>
                                `)}
                            </ul>`
                        : null}
                    ${weee.length > 0
                        ? html`<ul class="text-xs text-muted mt-0.5" data-hyperion-fpt>
                                ${weee.map((w) => html`
                                    <li>${w.title}: ${formatMoney(w.rowAmount, getPriceFormat())}</li>
                                `)}
                            </ul>`
                        : null}
                    <p class="text-xs text-muted mt-1">${t('Hyperion_Checkout::qty_label')} ${String(it.qty)}</p>
                </div>
                <div class="text-sm font-semibold text-brand whitespace-nowrap">
                    ${formatMoney(this._rowTotal(it, cfg), getPriceFormat())}
                </div>
            </li>
        `;
    }

    /** Row total per `reviewItemPriceDisplayMode` ('both' shows the incl. tax amount). */
    private _rowTotal(it: CartItem, cfg: { reviewItemPriceDisplayMode?: string }): number {
        const excl = Number(it.row_total);
        const incl = Number(it.row_total_incl_tax ?? it.row_total);
        return pickByMode(cfg.reviewItemPriceDisplayMode, excl, incl);
    }

    private _parseOptions(raw: CartItem['options']): readonly { label: string; value: string }[] {
        if (!raw) return [];
        let list: readonly { label: string; value: string }[];
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                list = Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        } else {
            list = raw;
        }
        return list.map((o) => ({ label: String(o.label ?? ''), value: htmlToText(String(o.value ?? '')) }));
    }

    private _imageFromConfig(cfg: unknown, itemId: string): string | null {
        const o = cfg as Record<string, unknown>;
        const images = o['imageData'];
        if (!images || typeof images !== 'object') return null;
        const entry = (images as Record<string, unknown>)[itemId];
        if (!entry || typeof entry !== 'object') return null;
        const src = (entry as Record<string, unknown>)['src'];
        return typeof src === 'string' ? src : null;
    }
}

if (!customElements.get('summary-item')) {
    customElements.define('summary-item', SummaryItem);
}

declare global {
    interface HTMLElementTagNameMap { 'summary-item': SummaryItem; }
}
