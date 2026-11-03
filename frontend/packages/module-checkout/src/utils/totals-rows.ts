// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Turns the REST totals payload into the rows <summary-totals> prints,
 * honouring the store's tax display settings (Stores > Configuration >
 * Sales > Tax > Shopping Cart Display Settings), which Magento exposes in
 * the checkout config:
 *
 *   reviewTotalsDisplayMode    subtotal: 'excluding' | 'including' | 'both'
 *   reviewShippingDisplayMode  shipping: 'excluding' | 'including' | 'both'
 *   includeTaxInGrandTotal     grand total shown excl. and incl. tax
 *   isFullTaxSummaryDisplayed  one row per applied tax rate
 *   isZeroTaxDisplayed         keep the tax row when the amount is zero
 *
 * Segments the function does not know (extension totals) pass through
 * untouched, in their original position.
 */
import type { TotalSegment, Totals } from '../types/totals.js';

export type TaxDisplayMode = 'excluding' | 'including' | 'both';

export interface TotalsDisplayConfig {
    reviewTotalsDisplayMode?: TaxDisplayMode | string;
    reviewShippingDisplayMode?: TaxDisplayMode | string;
    includeTaxInGrandTotal?: boolean;
    isFullTaxSummaryDisplayed?: boolean;
    isZeroTaxDisplayed?: boolean;
}

export interface TotalsRow {
    code: string;
    label: string;
    value: number;
    kind: 'regular' | 'detail' | 'grand';
}

export interface TotalsLabels {
    exclTax: (title: string) => string;
    inclTax: (title: string) => string;
}

interface TaxRate { percent?: string | number | null; title?: string }
interface TaxDetail { amount?: string | number; rates?: readonly TaxRate[] }

function exclInclRows(
    seg: TotalSegment,
    mode: string | undefined,
    excl: number,
    incl: number,
    labels: TotalsLabels,
): TotalsRow[] {
    if (mode === 'both') {
        return [
            { code: `${seg.code}_excl`, label: labels.exclTax(seg.title), value: excl, kind: 'regular' },
            { code: `${seg.code}_incl`, label: labels.inclTax(seg.title), value: incl, kind: 'regular' },
        ];
    }
    return [{ code: seg.code, label: seg.title, value: mode === 'including' ? incl : excl, kind: 'regular' }];
}

function taxRows(seg: TotalSegment, cfg: TotalsDisplayConfig): TotalsRow[] {
    const value = Number(seg.value);
    if (value === 0 && !cfg.isZeroTaxDisplayed) return [];
    const rows: TotalsRow[] = [];
    if (cfg.isFullTaxSummaryDisplayed) {
        const ext = seg.extension_attributes as Record<string, unknown> | undefined;
        const details = (ext?.tax_grandtotal_details ?? []) as readonly TaxDetail[];
        for (const detail of details) {
            for (const rate of detail.rates ?? []) {
                const percent = rate.percent == null ? '' : ` (${Number(rate.percent)}%)`;
                rows.push({
                    code: 'tax_rate',
                    label: `${rate.title ?? ''}${percent}`,
                    value: Number(detail.amount ?? 0),
                    kind: 'detail',
                });
            }
        }
    }
    rows.push({ code: seg.code, label: seg.title, value, kind: 'regular' });
    return rows;
}

export function buildTotalsRows(totals: Totals, cfg: TotalsDisplayConfig, labels: TotalsLabels): TotalsRow[] {
    const rows: TotalsRow[] = [];
    for (const seg of totals.total_segments) {
        switch (seg.code) {
            case 'subtotal':
                rows.push(...exclInclRows(
                    seg, cfg.reviewTotalsDisplayMode, Number(totals.subtotal), Number(totals.subtotal_incl_tax), labels,
                ));
                break;
            case 'shipping':
                rows.push(...exclInclRows(
                    seg, cfg.reviewShippingDisplayMode,
                    Number(totals.shipping_amount), Number(totals.shipping_incl_tax), labels,
                ));
                break;
            case 'tax':
                rows.push(...taxRows(seg, cfg));
                break;
            case 'grand_total': {
                const incl = Number(seg.value);
                if (cfg.includeTaxInGrandTotal) {
                    rows.push({
                        code: 'grand_total_excl',
                        label: labels.exclTax(seg.title),
                        value: incl - Number(totals.tax_amount),
                        kind: 'regular',
                    });
                    rows.push({ code: seg.code, label: labels.inclTax(seg.title), value: incl, kind: 'grand' });
                } else {
                    rows.push({ code: seg.code, label: seg.title, value: incl, kind: 'grand' });
                }
                break;
            }
            default:
                rows.push({ code: seg.code, label: seg.title, value: Number(seg.value), kind: 'regular' });
        }
    }
    return rows;
}

/** Price of a line / shipping method for a display mode ('both' shows incl. tax first). */
export function pickByMode(mode: string | undefined, excl: number, incl: number): number {
    return mode === 'excluding' ? excl : incl;
}
