// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Turns the REST totals payload into the rows <summary-totals> prints,
 * honoring the store's tax display settings (Stores > Configuration >
 * Sales > Tax > Shopping Cart Display Settings), which Magento exposes in
 * the checkout config:
 *
 *   reviewTotalsDisplayMode    subtotal: 'excluding' | 'including' | 'both'
 *   reviewShippingDisplayMode  shipping: 'excluding' | 'including' | 'both'
 *   includeTaxInGrandTotal     grand total shown excl. and incl. tax
 *   isFullTaxSummaryDisplayed  one row per applied tax detail
 *   isZeroTaxDisplayed         keep the tax row when the amount is zero
 *
 * Order: the rule of the cart page (`Model\Cart\TotalRowPool`), so both
 * pages list the same codes in the same order. The payload lists the
 * totals as the quote collected them; each takes the position the store's
 * totals sort order gives its code (`TotalsRowsOptions.totalsSort`). A
 * code that setting does not list stays behind the total collected before
 * it and never moves past the grand total; without the setting the order
 * of the payload stands, the grand total last. A segment the function does
 * not know (an extension total) is skipped when it carries no value or
 * zero and gets the discount tone when its value is negative.
 *
 * While no shipping method is confirmed on a quote that ships, the
 * shipping row says so instead of showing an amount and the grand total is
 * marked provisional.
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
    /** A negative amount of a total without a renderer of its own: printed like a discount. */
    tone?: 'discount';
    /** Printed instead of the amount (a shipping cost that is not known yet). */
    text?: string;
    /** The amount misses a part that is not known yet. */
    provisional?: boolean;
}

export interface TotalsLabels {
    exclTax: (title: string) => string;
    inclTax: (title: string) => string;
    /** Text of the shipping row while no method is confirmed. */
    shippingNotCalculated?: string;
    /** Title of the shipping row when the payload has no shipping segment yet. */
    shippingTitle?: string;
    /** A tax rate for the reader (`22` -> `22%`). */
    percent?: (value: number) => string;
}

export interface TotalsRowsOptions {
    /** The quote ships and the server has not confirmed a shipping method (nor is one expected). */
    shippingPending?: boolean;
    /** The store's totals sort order: total code to position (`checkoutConfig.hyperion.totalsSort`). */
    totalsSort?: Readonly<Record<string, unknown>> | readonly unknown[] | null | undefined;
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

function pendingShippingRow(title: string, labels: TotalsLabels): TotalsRow {
    const row: TotalsRow = { code: 'shipping', label: title, value: 0, kind: 'regular' };
    if (labels.shippingNotCalculated !== undefined) row.text = labels.shippingNotCalculated;
    return row;
}

function rateLabel(rate: TaxRate, labels: TotalsLabels): string {
    const title = rate.title ?? '';
    if (rate.percent == null || !Number.isFinite(Number(rate.percent))) return title;
    const percent = labels.percent ? labels.percent(Number(rate.percent)) : `${Number(rate.percent)}%`;
    return title === '' ? percent : `${title} (${percent})`;
}

function taxRows(seg: TotalSegment, cfg: TotalsDisplayConfig, labels: TotalsLabels): TotalsRow[] {
    const value = Number(seg.value);
    if (value === 0 && !cfg.isZeroTaxDisplayed) return [];
    const rows: TotalsRow[] = [];
    if (cfg.isFullTaxSummaryDisplayed) {
        const ext = seg.extension_attributes as Record<string, unknown> | undefined;
        const details = (ext?.tax_grandtotal_details ?? []) as readonly TaxDetail[];
        // One amount per detail: the rates of a detail (a compound tax)
        // share it, so their titles are joined on one row.
        for (const detail of details) {
            rows.push({
                code: 'tax_rate',
                label: (detail.rates ?? []).map((rate) => rateLabel(rate, labels)).filter((l) => l !== '').join(', '),
                value: Number(detail.amount ?? 0),
                kind: 'detail',
            });
        }
    }
    rows.push({ code: seg.code, label: seg.title, value, kind: 'regular' });
    return rows;
}

const GRAND_TOTAL = 'grand_total';

/** Totals that only feed other totals: the cart never lists them, so they never anchor the code after them. */
const STRUCTURAL_CODES: readonly string[] = ['tax_subtotal', 'tax_shipping', 'weee', 'msrp'];

/** The configured position of a code; undefined when the setting does not list it with a number. */
function configuredPosition(sort: TotalsRowsOptions['totalsSort'], code: string): number | undefined {
    if (sort === null || sort === undefined || Array.isArray(sort) || !Object.hasOwn(sort, code)) return undefined;
    const raw = (sort as Readonly<Record<string, unknown>>)[code];
    if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) return undefined;
    const position = Number(raw);
    return Number.isFinite(position) ? position : undefined;
}

/** The segments in print order (see the file header). */
function orderSegments(segments: readonly TotalSegment[], sort: TotalsRowsOptions['totalsSort']): TotalSegment[] {
    const grandTotal = configuredPosition(sort, GRAND_TOTAL);
    const beforeGrandTotal = grandTotal === undefined ? Number.MAX_VALUE : grandTotal - 0.5;
    let previous = -Number.MAX_VALUE;
    const placed = segments.map((segment, index) => {
        const configured = configuredPosition(sort, segment.code);
        let position: number;
        if (configured !== undefined) {
            position = configured;
            if (!STRUCTURAL_CODES.includes(segment.code)) previous = configured;
        } else {
            position = segment.code === GRAND_TOTAL ? Infinity : Math.min(previous, beforeGrandTotal);
        }
        return { segment, position, index };
    });
    // Codes that share a position keep the order of the payload.
    placed.sort((a, b) => (a.position === b.position ? a.index - b.index : a.position < b.position ? -1 : 1));
    return placed.map((entry) => entry.segment);
}

export function buildTotalsRows(
    totals: Totals,
    cfg: TotalsDisplayConfig,
    labels: TotalsLabels,
    options: TotalsRowsOptions = {},
): TotalsRow[] {
    const rows: TotalsRow[] = [];
    const shippingPending = options.shippingPending === true;
    const segments = orderSegments(totals.total_segments, options.totalsSort);
    const hasShippingSegment = segments.some((seg) => seg.code === 'shipping');
    for (const seg of segments) {
        switch (seg.code) {
            case 'subtotal':
                rows.push(...exclInclRows(
                    seg, cfg.reviewTotalsDisplayMode, Number(totals.subtotal), Number(totals.subtotal_incl_tax), labels,
                ));
                // The row keeps its place while the payload has no
                // shipping segment yet.
                if (shippingPending && !hasShippingSegment) {
                    rows.push(pendingShippingRow(labels.shippingTitle ?? '', labels));
                }
                break;
            case 'shipping':
                if (shippingPending) {
                    rows.push(pendingShippingRow(seg.title || (labels.shippingTitle ?? ''), labels));
                } else if (seg.value !== null && seg.value !== undefined) {
                    rows.push(...exclInclRows(
                        seg, cfg.reviewShippingDisplayMode,
                        Number(totals.shipping_amount), Number(totals.shipping_incl_tax), labels,
                    ));
                }
                break;
            case 'tax':
                rows.push(...taxRows(seg, cfg, labels));
                break;
            case 'grand_total': {
                const incl = Number(seg.value);
                const grand: TotalsRow = { code: seg.code, label: seg.title, value: incl, kind: 'grand' };
                if (shippingPending) grand.provisional = true;
                if (cfg.includeTaxInGrandTotal) {
                    rows.push({
                        code: 'grand_total_excl',
                        label: labels.exclTax(seg.title),
                        value: incl - Number(totals.tax_amount),
                        kind: 'regular',
                    });
                    grand.label = labels.inclTax(seg.title);
                }
                rows.push(grand);
                break;
            }
            default: {
                if (seg.value === null || seg.value === undefined) break;
                const value = Number(seg.value);
                // Like the cart page: a total that adds nothing is not listed.
                if (!Number.isFinite(value) || value === 0) break;
                const row: TotalsRow = { code: seg.code, label: seg.title, value, kind: 'regular' };
                if (value < 0) row.tone = 'discount';
                rows.push(row);
            }
        }
    }
    return rows;
}

/** Price of a line / shipping method for a display mode ('both' shows incl. tax first). */
export function pickByMode(mode: string | undefined, excl: number, incl: number): number {
    return mode === 'excluding' ? excl : incl;
}
