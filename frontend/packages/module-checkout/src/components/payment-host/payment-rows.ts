// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The rows of the payment list, built from the offered methods and the
 * renderer entries.
 *
 * A method gets a row when an entry renders it and that entry's module did
 * not fail; its row is retired when its element gave up (`fatal`). A
 * method of an eager entry whose module is still on its way gets a row
 * that holds its place (not selectable yet); once the module is there,
 * `canMakePayment()` of its element class may hide it. Every other method
 * is unsupported: it is not shown to the shopper, and it is listed for the
 * diagnostic rows of a store that asks for them
 * (`hyperion.debug.showUnsupportedPayments`, or `hyperion_debug_payments=1`
 * in the page URL).
 *
 * Stored payment tokens (Magento_Vault):
 *   - the vault METHOD (`braintree_cc_vault`, ...) is a regular entry of the
 *     available payment methods, for guests too;
 *   - the TOKENS of the logged-in customer sit in `checkoutConfig.payment.vault`
 *     (`Magento\Vault\Model\Ui\TokensConfigProvider`), one entry per token
 *     keyed `<vault code>_<n>`, each with `config.code`, `config.publicHash`,
 *     `config.details` and provider extras such as `config.nonceUrl` and
 *     `config.updatePaymentUrl`;
 *   - `checkoutConfig.vault` lists every active vault method code.
 * The checkout shows one row per token, ahead of the other methods like the
 * vault group of the core checkout, and none for the bare vault method. The
 * selected row is `selectedPaymentMethod = <vault code>` plus the token
 * picked for that code, so the order carries the real method code.
 */
import type { VaultTokenInfo } from '../../../extension-api.js';
import { peekCheckoutConfig } from '../../bootstrap-config.js';
import type { PaymentMethodConfig } from '../../types/payment.js';
import { matchEntry, type PaymentEntry } from './entries.js';
import { entryState, rowKeyOf, rowState, selectedTokens, type EntryLoadState } from './row-state.js';

export interface VaultToken extends VaultTokenInfo {
    /** Key under `checkoutConfig.payment.vault`, e.g. `braintree_cc_vault_0`. */
    readonly key: string;
    /** Vault method code sent as `paymentMethod.method`. */
    readonly code: string;
    readonly nonceUrl: string | null;
    /** Controller that re-verifies the stored card, when the provider names one. */
    readonly updatePaymentUrl: string | null;
}

export type UnsupportedReason = 'no-renderer' | 'load-failed' | 'timeout' | 'version-mismatch' | 'fatal';

export interface PaymentRow {
    method: PaymentMethodConfig;
    token: VaultToken | null;
    entry: PaymentEntry;
    /** The module of the entry is on its way: the row holds its place and cannot be selected yet. */
    pending: boolean;
}

export interface UnsupportedRow {
    method: PaymentMethodConfig;
    reason: UnsupportedReason;
    entry: PaymentEntry | null;
}

const FAILED_LOADS: ReadonlySet<EntryLoadState> = new Set(['load-failed', 'timeout', 'version-mismatch']);

/** True for every active vault method code, with or without tokens. */
export function isVaultMethod(code: string): boolean {
    const vault = peekCheckoutConfig()?.['vault'];
    if (vault && typeof vault === 'object' && !Array.isArray(vault) && code in vault) return true;
    return getVaultTokens().some((token) => token.code === code);
}

export function getVaultTokens(code?: string): VaultToken[] {
    const raw = peekCheckoutConfig()?.payment?.['vault'];
    if (!raw || typeof raw !== 'object') return [];
    const tokens: VaultToken[] = [];
    for (const [key, entry] of Object.entries(raw)) {
        const config = (entry as { config?: Record<string, unknown> } | null)?.config;
        if (!config || typeof config !== 'object') continue;
        const tokenCode = typeof config['code'] === 'string' ? config['code'] : '';
        const publicHash = typeof config['publicHash'] === 'string' ? config['publicHash'] : '';
        if (!tokenCode || !publicHash) continue;
        if (code !== undefined && tokenCode !== code) continue;
        const details = config['details'];
        tokens.push(Object.freeze({
            key,
            code: tokenCode,
            publicHash,
            paymentMethodCode: tokenCode,
            nonceUrl: typeof config['nonceUrl'] === 'string' ? config['nonceUrl'] : null,
            updatePaymentUrl: typeof config['updatePaymentUrl'] === 'string' && config['updatePaymentUrl'] !== ''
                ? config['updatePaymentUrl']
                : null,
            details: Object.freeze(details && typeof details === 'object' ? { ...(details as Record<string, unknown>) } : {}),
        }));
    }
    return tokens;
}

/** Why the method cannot be shown, null when it can (or will once its module is there). */
export function unsupportedReason(code: string, rowKey: string = code): UnsupportedReason | null {
    const entry = matchEntry(code);
    if (entry === null) return 'no-renderer';
    const load = entryState(entry.id).load;
    if (FAILED_LOADS.has(load)) return load as UnsupportedReason;
    if (rowState(rowKey).fatal) return 'fatal';
    return null;
}

/** The entry of the method is eager and its module is not there yet. */
function isPending(entry: PaymentEntry): boolean {
    return entry.eager && entryState(entry.id).load !== 'ready';
}

/** `canMakePayment()` of the entry's class said no for the method. */
function isUnavailable(entry: PaymentEntry, code: string): boolean {
    return entryState(entry.id).usable[code] === false;
}

/**
 * The token of the selected row. When the vault method is selected without
 * a chosen token, the first one counts as selected, so the highlighted row
 * and the token that gets charged can never disagree. Null while the
 * method's module is not there.
 */
export function getSelectedVaultToken(code: string): VaultToken | null {
    const entry = matchEntry(code);
    if (entry === null || isPending(entry) || unsupportedReason(code) !== null) return null;
    const tokens = getVaultTokens(code).filter((token) => unsupportedReason(code, token.publicHash) === null);
    const chosen = selectedTokens.get()[code];
    return tokens.find((token) => token.publicHash === chosen) ?? tokens[0] ?? null;
}

export function selectVaultToken(code: string, publicHash: string): void {
    selectedTokens.set({ ...selectedTokens.get(), [code]: publicHash });
}

/** The key of the row of the selected method (its token's hash for a vault method). */
export function selectedRowKey(code: string | null): string | null {
    if (code === null) return null;
    if (!isVaultMethod(code)) return code;
    const token = getSelectedVaultToken(code);
    return token === null ? null : rowKeyOf(code, token);
}

/** Rows of the payment step: tokens first, then the methods; unsupported methods are left out. */
export function buildPaymentRows(methods: readonly PaymentMethodConfig[]): PaymentRow[] {
    const tokenRows: PaymentRow[] = [];
    const methodRows: PaymentRow[] = [];
    for (const method of methods) {
        if (unsupportedReason(method.code) !== null) continue;
        const entry = matchEntry(method.code) as PaymentEntry;
        if (isUnavailable(entry, method.code)) continue;
        const pending = isPending(entry);
        if (isVaultMethod(method.code)) {
            for (const token of getVaultTokens(method.code)) {
                if (unsupportedReason(method.code, token.publicHash) !== null) continue;
                tokenRows.push({ method, token, entry, pending });
            }
            continue;
        }
        methodRows.push({ method, token: null, entry, pending });
    }
    return [...tokenRows, ...methodRows];
}
