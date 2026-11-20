// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <summary-totals> -- renders the totals rows built by `buildTotalsRows`.
 *
 * Subtotal, shipping, tax and grand total follow the store's tax display
 * settings (excl. / incl. / both, full tax summary, zero tax). A segment
 * with an unknown code is printed as it comes, so an extension total shows
 * without a code change; a negative one is printed like a discount.
 *
 * The block never changes height for the rows every quote can gain while
 * the shopper fills the form: the list reserves the space of the subtotal,
 * shipping and tax rows and the grand total sits at its bottom, so a tax
 * row that appears once the address is known fills reserved space instead
 * of pushing the grand total down. A label that does not fit is cut (the
 * full text is its `title`), it never wraps. The rows are keyed by their
 * total, so a row that appears is a new element and the rows around it,
 * the grand total first, keep theirs. The label fills the row from its
 * start and the amount keeps its own width at the end, so the label has
 * all the room the amount leaves. The shipping row that carries a text
 * instead of an amount is a row of its own, replaced as a whole when the
 * amount is known: a long text giving way to a short amount is a new
 * element, not a cell that jumps to the end of the row.
 *
 * While no shipping method is confirmed the shipping row says so and the
 * grand total is marked provisional; so is it while a change is on its way
 * to the server. The one live region of the checkout's grand total lives
 * here: it stays empty until the confirmed total changes, so the amount is
 * read once in the list and announced only when it moves.
 */
import { LitElement, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore, type Store } from '../store/index.js';
import { getPriceFormat, getCheckoutConfig } from '../bootstrap-config.js';
import { formatMoney } from '../utils/currency.js';
import { getIntlLocale, t } from '../utils/i18n.js';
import { buildTotalsRows, type TotalsLabels, type TotalsRow } from '../utils/totals-rows.js';

export interface GrandTotalView {
    /** The title of the grand total as the store names it. */
    label: string;
    /** The formatted grand total on screen (the expected one while a change is unanswered). */
    text: string;
    /** The server confirmed this amount and nothing that changes it is pending or missing. */
    settled: boolean;
}

/** The quote ships and neither the server nor the shopper's last click gives a shipping amount. */
function isShippingPending(store: Store): boolean {
    return !store.isVirtual.get()
        && store.appliedShippingMethod.get() === null
        && store.optimisticTotals.get() === null;
}

/**
 * The grand total for the places that repeat it next to the totals list
 * (the phone summary bar, the bar of the Place Order button, its label).
 * Null while the checkout has no totals.
 */
export function readGrandTotal(store: Store = getStore()): GrandTotalView | null {
    const confirmed = store.totals.get();
    const optimistic = store.optimisticTotals.get();
    const totals = optimistic ?? confirmed;
    if (!totals) return null;
    const segment = totals.total_segments.find((seg) => seg.code === 'grand_total');
    const value = segment?.value ?? totals.grand_total;
    return {
        label: segment?.title ?? '',
        text: formatMoney(value, getPriceFormat()),
        settled: optimistic === null && !store.isSettlingTotals.get() && !isShippingPending(store),
    };
}

function formatPercent(value: number): string {
    try {
        return new Intl.NumberFormat(getIntlLocale(), { style: 'percent', maximumFractionDigits: 4 }).format(value / 100);
    } catch {
        return `${value}%`;
    }
}

function totalsLabels(): TotalsLabels {
    return {
        exclTax: (title: string) => t('Hyperion_Checkout::total_excl_tax', { title }),
        inclTax: (title: string) => t('Hyperion_Checkout::total_incl_tax', { title }),
        shippingNotCalculated: t('Hyperion_Checkout::shipping_not_calculated'),
        shippingTitle: t('Hyperion_Checkout::shipping_heading'),
        percent: formatPercent,
    };
}

const ROW_CLASS: Readonly<Record<TotalsRow['kind'], string>> = {
    grand: 'mt-auto flex items-center justify-between gap-3 pt-2 border-t border-subtle text-base font-bold text-heading',
    detail: 'flex items-center justify-between gap-3 text-xs text-muted',
    regular: 'flex items-center justify-between gap-3 text-sm text-brand',
};

/**
 * One key per row: the total's code, numbered among the rows that share it
 * (one row per tax rate); a row that prints a text instead of an amount has
 * a key of its own.
 */
function keyRows(rows: readonly TotalsRow[]): Array<{ key: string; row: TotalsRow }> {
    const seen = new Map<string, number>();
    return rows.map((row) => {
        const count = seen.get(row.code) ?? 0;
        seen.set(row.code, count + 1);
        const base = row.text === undefined ? row.code : `${row.code}:text`;
        return { key: count === 0 ? base : `${base}:${count}`, row };
    });
}

export class SummaryTotals extends SignalWatcher(LitElement) {
    /** The confirmed grand total the list showed last; null before the first one. */
    private _seenGrand: string | null = null;

    /** What the live region says: the confirmed grand total after it changed. */
    private _announcement = '';

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const confirmed = store.totals.get();
        // The totals expected from a change the server has not answered
        // yet are shown at once; the grand total is marked provisional
        // while the quote settles.
        const totals = store.optimisticTotals.get() ?? confirmed;
        if (!totals) return null;
        const settling = store.isSettlingTotals.get();
        const isVirtual = store.isVirtual.get();
        const cfg = getCheckoutConfig();
        const fmt = getPriceFormat();
        const labels = totalsLabels();
        const options = { shippingPending: isShippingPending(store), totalsSort: cfg.hyperion?.totalsSort };
        const rows = buildTotalsRows(totals, cfg, labels, options);

        // Only a total the server confirmed is announced.
        const announced = confirmed === null || confirmed === totals
            ? rows
            : buildTotalsRows(confirmed, cfg, labels, options);
        const grandRow = confirmed === null ? undefined : announced.find((r) => r.kind === 'grand');
        this._trackAnnouncement(
            grandRow ? `${grandRow.label} ${formatMoney(grandRow.value, fmt)}` : null
        );

        const baseNotice = this._baseChargeNotice(totals.base_currency_code, totals.quote_currency_code, totals.base_grand_total);

        return html`
            <dl class="flex flex-col gap-1.5 ${isVirtual ? 'min-h-[5.3125rem]' : 'min-h-[6.9375rem]'}"
                data-hyperion-totals>
                ${repeat(keyRows(rows), (entry) => entry.key, ({ row }) => {
                    const provisional = row.kind === 'grand' && (settling || row.provisional === true);
                    return html`
                        <div class="${ROW_CLASS[row.kind]} ${row.tone === 'discount' ? 'text-success' : ''}"
                             data-total=${row.code}
                             ?data-provisional=${provisional}
                             aria-busy=${row.kind === 'grand' && settling ? 'true' : nothing}>
                            <dt class="min-w-0 flex-1 truncate" title=${row.label}>${row.label}</dt>
                            <dd class="shrink-0 whitespace-nowrap text-right ${row.text !== undefined ? 'text-muted' : ''}">
                                ${row.text ?? formatMoney(row.value, fmt)}
                            </dd>
                        </div>
                    `;
                })}
            </dl>
            ${baseNotice !== null
                ? html`<p class="mt-1 text-xs text-muted text-right" data-base-charge-notice>${baseNotice}</p>`
                : nothing}
            <div role="status"
                 aria-live="polite"
                 class="sr-only"
                 data-hyperion-grand-total-live>${this._announcement}</div>
        `;
    }

    /** The first confirmed total is only remembered; a later, different one is announced. */
    private _trackAnnouncement(grandLabel: string | null): void {
        if (grandLabel === null || grandLabel === this._seenGrand) return;
        if (this._seenGrand !== null) this._announcement = grandLabel;
        this._seenGrand = grandLabel;
    }

    /** The amount a card is charged when the store bills in another currency than it displays. */
    private _baseChargeNotice(base: unknown, quote: unknown, amount: unknown): string | null {
        if (typeof base !== 'string' || typeof quote !== 'string' || base === '' || quote === '' || base === quote) {
            return null;
        }
        const format = getCheckoutConfig().basePriceFormat ?? getPriceFormat();
        return t('Hyperion_Checkout::base_charge_notice', { amount: formatMoney(amount as number | string, format) });
    }
}

if (!customElements.get('summary-totals')) {
    customElements.define('summary-totals', SummaryTotals);
}

declare global {
    interface HTMLElementTagNameMap { 'summary-totals': SummaryTotals; }
}
