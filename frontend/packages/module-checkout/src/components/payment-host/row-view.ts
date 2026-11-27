// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The parts of a payment row that only exist once the payment host is
 * there, so they travel in its chunk: the body of the selected row (the
 * placeholder of an entry that awaits its element's `ready`, the inline
 * error with Retry, the busy line over the element, and the outlet the
 * element is put into), the title of a stored token (before the host the
 * row shows the method title), and the diagnostic lines of the methods the
 * checkout cannot render, for a store that asks for them
 * (`hyperion.debug.showUnsupportedPayments`, or `hyperion_debug_payments=1`
 * in the page URL).
 */
import { html, nothing } from 'lit';

import type { VaultTokenInfo } from '../../../extension-api.js';
import { peekCheckoutConfig } from '../../bootstrap-config.js';
import type { PaymentMethodConfig } from '../../types/payment.js';
import { t } from '../../utils/i18n.js';
import { matchEntry } from './entries.js';
import { unsupportedReason, type PaymentRow, type UnsupportedRow } from './payment-rows.js';
import { entryState, rowKeyOf, rowState } from './row-state.js';

const REASONS: Readonly<Record<string, string>> = {
    'no-renderer': 'Hyperion_Checkout::payment_unsupported_no_renderer',
    'load-failed': 'Hyperion_Checkout::payment_unsupported_load_failed',
    'timeout': 'Hyperion_Checkout::payment_unsupported_load_failed',
    'version-mismatch': 'Hyperion_Checkout::payment_unsupported_version',
    'fatal': 'Hyperion_Checkout::payment_unsupported_fatal',
};

/** The body of the selected row. Reads signals. */
export function renderRowBody(row: PaymentRow, onRetry: () => void): unknown {
    const state = rowState(rowKeyOf(row.method.code, row.token));
    const failed = state.failure !== null;
    const waiting = row.entry.awaitsReady && !state.ready && !failed;
    return html`
        <div class="relative px-3 pb-3 ${waiting ? 'min-h-[11rem]' : ''}" aria-busy=${waiting || state.busy ? 'true' : 'false'}>
            ${waiting
                ? html`<div class="absolute inset-x-3 top-0 bottom-3 rounded-control border border-subtle bg-surface-raised animate-pulse"
                            aria-hidden="true"
                            data-payment-skeleton></div>`
                : nothing}
            ${failed
                ? html`<div role="alert" class="flex items-start gap-3 rounded-md border border-danger/40 bg-danger/5 p-3" data-payment-load-error>
                          <p class="flex-1 text-sm text-error-strong">${t('Hyperion_Checkout::payment_renderer_failed')}</p>
                          <button type="button" class="text-sm text-error-strong underline" @click=${onRetry}>
                              ${t('Hyperion_Checkout::payment_retry')}
                          </button>
                      </div>`
                : nothing}
            <div data-payment-body class=${waiting || failed ? 'invisible' : ''}></div>
            ${state.busy && !waiting
                ? html`<div class="absolute inset-0 flex items-center justify-center bg-surface/70"
                            role="status"
                            aria-live="polite"
                            data-payment-busy>
                          <span class="text-sm text-muted">${state.busyLabel ?? t('Hyperion_Checkout::placing_order')}</span>
                      </div>`
                : nothing}
        </div>
    `;
}

/** The diagnostic line of a method the checkout cannot render: never selectable. */
export function renderUnsupportedRow(row: UnsupportedRow, onRetry: () => void): unknown {
    const retry = row.entry !== null && (row.reason === 'load-failed' || row.reason === 'timeout');
    const module = row.entry?.moduleUrl ?? row.entry?.builtin ?? '';
    return html`
        <div class="rounded-md border border-subtle bg-surface-raised" data-payment-unsupported=${row.method.code}>
            <div class="flex items-start gap-3 p-3 cursor-not-allowed">
                <input type="radio" name="payment_method" class="mt-0.5 h-4 w-4" disabled
                       aria-label=${row.method.title} />
                <span class="text-sm">
                    <span class="font-medium text-brand">${row.method.title}</span>
                    <span class="block text-sm text-muted">
                        ${row.method.code}: ${t(REASONS[row.reason] ?? 'Hyperion_Checkout::payment_unsupported_no_renderer')}
                    </span>
                    ${module !== '' ? html`<span class="block text-sm text-muted break-all">${module}</span>` : nothing}
                    ${retry
                        ? html`<button type="button" class="text-sm text-accent underline" @click=${onRetry}>
                                  ${t('Hyperion_Checkout::payment_retry')}
                              </button>`
                        : nothing}
                </span>
            </div>
        </div>
    `;
}

/**
 * The methods the server lists that the shopper does not see for lack of a
 * working renderer, with the reason. Called with the server's list as it
 * came, before the offer filters it: a method its gateway also marks as not
 * presentable (`payment.<code>.isVisible`) is still named, as the command
 * line report and the admin message name it.
 */
export function unsupportedRows(methods: readonly PaymentMethodConfig[]): UnsupportedRow[] {
    const out: UnsupportedRow[] = [];
    for (const method of methods) {
        const reason = unsupportedReason(method.code);
        if (reason !== null) out.push({ method, reason, entry: matchEntry(method.code) });
    }
    return out;
}

/** Whether the page asks for the diagnostic rows of unsupported methods. */
export function showsUnsupportedPayments(): boolean {
    if (peekCheckoutConfig()?.hyperion?.debug?.showUnsupportedPayments === true) return true;
    try {
        return new URLSearchParams(window.location.search).get('hyperion_debug_payments') === '1';
    } catch {
        return false;
    }
}

const CARD_TYPE_NAMES: Readonly<Record<string, string>> = {
    VI: 'Visa',
    MC: 'Mastercard',
    AE: 'American Express',
    DI: 'Discover',
    JCB: 'JCB',
    DN: 'Diners Club',
    MI: 'Maestro',
    UPD: 'UnionPay',
};

function detail(token: VaultTokenInfo, key: string): string {
    const value = token.details[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/**
 * The title of a token row: what the element class of its entry says
 * (`describeToken()`), else a line built from the token details (a card's
 * brand, last four and expiry, a PayPal account's email), else the method
 * title.
 */
export function tokenTitle(row: PaymentRow): string {
    const token = row.token;
    if (token === null) return row.method.title;
    const described = entryState(row.entry.id).describeToken?.(token) ?? null;
    if (typeof described === 'string' && described.trim() !== '') return described;
    const last4 = detail(token, 'maskedCC');
    if (last4 === '') {
        const email = detail(token, 'payerEmail');
        return email === '' ? row.method.title : t('Hyperion_Checkout::vault_paypal_label', { email });
    }
    const type = detail(token, 'type');
    return t('Hyperion_Checkout::vault_card_label', {
        type: CARD_TYPE_NAMES[type] ?? type,
        last4,
        expiry: detail(token, 'expirationDate'),
    });
}

/** The visible name of a form control: its label without the required marker, else its aria-label. */
function labelOf(field: HTMLElement): string {
    const labels = (field as HTMLInputElement).labels;
    const text = labels && labels.length > 0 ? labels[0]?.textContent ?? '' : field.getAttribute('aria-label') ?? '';
    return text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

/** The invalid controls an early press of Place Order found, by id and label. */
export function invalidFieldsOf(fields: readonly HTMLElement[]): Array<{ id: string; label: string }> {
    return fields.flatMap((field) => {
        const label = labelOf(field);
        return field.id !== '' && label !== '' ? [{ id: field.id, label }] : [];
    });
}

/** The error summary under the Place Order hint: the fields still invalid, as links that focus them. */
export function renderErrorSummary(invalid: ReadonlyArray<{ id: string; label: string }>): unknown {
    const open = invalid.filter(({ id }) => document.getElementById(id)?.getAttribute('aria-invalid') === 'true');
    if (open.length === 0) return nothing;
    const focus = (e: Event, id: string): void => {
        e.preventDefault();
        document.getElementById(id)?.focus();
    };
    return html`<ul class="mt-1 list-disc pl-5 text-sm" data-place-order-errors>
        ${open.map(({ id, label }) => html`<li>
            <a class="text-error-strong underline" href=${`#${id}`} @click=${(e: Event) => focus(e, id)}>${label}</a>
        </li>`)}
    </ul>`;
}

/** The line that replaces Place Order once the order exists, with a link to the success page. */
export function renderOrderPlaced(successUrl: string): unknown {
    return html`<p class="text-sm text-muted" role="status" aria-live="polite" data-order-placed>
        ${t('Hyperion_Checkout::order_placed_redirecting')}
        <a class="text-accent hover:underline" href=${successUrl}>${t('Hyperion_Checkout::order_placed_continue')}</a>
    </p>`;
}

/** Name the offered methods no renderer can show, once per list. */
let reportedHidden = '';
export function reportHidden(codes: readonly string[]): void {
    const key = codes.join(',');
    if (codes.length === 0 || key === reportedHidden) return;
    reportedHidden = key;
    console.error(`[hyperion-checkout] no payment method can be shown: no renderer serves ${key}`);
}
