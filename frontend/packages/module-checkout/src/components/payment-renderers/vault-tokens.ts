// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Stored payment tokens (Magento_Vault).
 *
 * How core exposes them:
 *   - the vault METHOD (`braintree_cc_vault`, ...) is a regular entry of the
 *     available payment methods (REST `payment_methods`), for guests too;
 *   - the TOKENS of the logged-in customer sit in `checkoutConfig.payment.vault`
 *     (`Magento\Vault\Model\Ui\TokensConfigProvider`), one entry per token
 *     keyed `<vault code>_<n>`, each with `config.code`, `config.publicHash`,
 *     `config.details` and provider extras such as `config.nonceUrl`;
 *   - `checkoutConfig.vault` lists every active vault method code.
 *
 * The checkout shows one selectable row per token and none for the bare
 * vault method. The selected row is `selectedPaymentMethod = <vault code>`
 * plus `paymentMethodData[<vault code>].public_hash`, so the order POST
 * carries the real method code and `placeOrder()` needs no vault knowledge.
 *
 * A provider plugs in through `registerVaultAdapter()`: a label for the row
 * and, when the default "fetch a nonce from `nonceUrl`" flow is not enough,
 * its own `beforePlaceOrder` and row body.
 */
import { getCheckoutConfig } from '../../bootstrap-config.js';
import { getStore } from '../../store/index.js';
import type { PaymentMethodConfig } from '../../types/payment.js';
import { t } from '../../utils/i18n.js';
import { getPaymentRenderer, registerPaymentRenderer } from './registry.js';

export interface VaultToken {
    /** Key under `checkoutConfig.payment.vault`, e.g. `braintree_cc_vault_0`. */
    key: string;
    /** Vault method code sent as `paymentMethod.method`. */
    code: string;
    publicHash: string;
    nonceUrl: string | null;
    details: Readonly<Record<string, unknown>>;
}

export interface VaultNonce {
    nonce: string;
    bin: string;
}

export interface VaultAdapter {
    code: string;
    label: (token: VaultToken) => string;
    /** Optional body rendered under the selected row (a lit template). */
    renderBody?: (token: VaultToken) => unknown;
    /** Defaults to `defaultVaultBeforePlaceOrder`. */
    beforePlaceOrder?: (token: VaultToken) => Promise<Record<string, unknown>>;
}

const adapters = new Map<string, VaultAdapter>();

export function registerVaultAdapter(adapter: VaultAdapter): void {
    adapters.set(adapter.code, adapter);
    registerPaymentRenderer({
        code: adapter.code,
        component: 'payment-vault',
        beforePlaceOrder: async () => {
            const token = getSelectedVaultToken(adapter.code);
            if (!token) throw new Error(t('Hyperion_Checkout::vault_no_token_selected'));
            return (adapter.beforePlaceOrder ?? defaultVaultBeforePlaceOrder)(token);
        },
    });
}

export function getVaultAdapter(code: string): VaultAdapter | null {
    return adapters.get(code) ?? null;
}

/** True for every active vault method code, with or without tokens. */
export function isVaultMethod(code: string): boolean {
    const vault = getCheckoutConfig()['vault'];
    if (vault && typeof vault === 'object' && code in vault) return true;
    return getVaultTokens().some((token) => token.code === code);
}

export function getVaultTokens(code?: string): VaultToken[] {
    const raw = getCheckoutConfig().payment?.['vault'];
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
        tokens.push({
            key,
            code: tokenCode,
            publicHash,
            nonceUrl: typeof config['nonceUrl'] === 'string' ? config['nonceUrl'] : null,
            details: details && typeof details === 'object' ? details as Record<string, unknown> : {},
        });
    }
    return tokens;
}

/** Tokens the checkout can actually pay with: their provider registered an adapter. */
export function getPayableVaultTokens(code: string): VaultToken[] {
    return adapters.has(code) ? getVaultTokens(code) : [];
}

/**
 * The token of the selected row. When the vault method is selected without a
 * chosen token, the first one counts as selected, so the highlighted row and
 * the token that gets charged can never disagree.
 */
export function getSelectedVaultToken(code: string): VaultToken | null {
    const tokens = getPayableVaultTokens(code);
    const chosen = getStore().paymentMethodData.get()[code]?.['public_hash'];
    return tokens.find((token) => token.publicHash === chosen) ?? tokens[0] ?? null;
}

export interface PaymentRow {
    method: PaymentMethodConfig;
    token: VaultToken | null;
}

/**
 * Rows of the payment step. Stored tokens come first, like the vault group
 * of the core checkout. A vault method without payable tokens (guests,
 * customers with no stored card, providers without an adapter) and a method
 * whose renderer reports `isAvailable() === false` get no row.
 */
export function buildPaymentRows(methods: readonly PaymentMethodConfig[]): PaymentRow[] {
    const tokenRows: PaymentRow[] = [];
    const methodRows: PaymentRow[] = [];
    for (const method of methods) {
        if (isVaultMethod(method.code)) {
            for (const token of getPayableVaultTokens(method.code)) tokenRows.push({ method, token });
            continue;
        }
        const isAvailable = getPaymentRenderer(method.code)?.isAvailable;
        if (isAvailable && !isAvailable(method)) continue;
        methodRows.push({ method, token: null });
    }
    return [...tokenRows, ...methodRows];
}

export function selectVaultToken(code: string, publicHash: string): void {
    const store = getStore();
    store.paymentMethodData.set({
        ...store.paymentMethodData.get(),
        [code]: { public_hash: publicHash },
    });
    store.selectedPaymentMethod.set(code);
}

/**
 * Ask the provider's same-origin controller for a one-time nonce of a stored
 * token. Braintree's `braintree/payment/getnonce` is a GET action that reads
 * `public_hash` and the customer session; it needs no form key. It answers
 * `{ paymentMethodNonce, details }` or HTTP 400 with `{ message }`.
 */
export async function fetchVaultNonce(token: VaultToken): Promise<VaultNonce> {
    const failure = (message?: unknown): Error => new Error(
        typeof message === 'string' && message ? message : t('Hyperion_Checkout::vault_nonce_failed')
    );
    if (!token.nonceUrl) throw failure();
    const url = new URL(token.nonceUrl, window.location.href);
    if (url.origin !== window.location.origin) throw failure();
    url.searchParams.set('public_hash', token.publicHash);

    let response: Response;
    let body: Record<string, unknown> | null;
    try {
        response = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        body = await response.json().catch(() => null) as Record<string, unknown> | null;
    } catch {
        throw failure();
    }
    const nonce = body?.['paymentMethodNonce'];
    if (!response.ok || typeof nonce !== 'string' || !nonce) throw failure(body?.['message']);
    const details = body?.['details'];
    const bin = details && typeof details === 'object' ? (details as Record<string, unknown>)['bin'] : '';
    return { nonce, bin: typeof bin === 'string' ? bin : '' };
}

export async function defaultVaultBeforePlaceOrder(token: VaultToken): Promise<Record<string, unknown>> {
    const { nonce } = await fetchVaultNonce(token);
    return { public_hash: token.publicHash, payment_method_nonce: nonce };
}

export function clearVaultAdaptersForTests(): void {
    adapters.clear();
}
