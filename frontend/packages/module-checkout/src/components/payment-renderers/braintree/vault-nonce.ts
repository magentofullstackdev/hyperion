// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * A one-time nonce for a stored token (Magento_Vault), from the provider's
 * same-origin controller. Braintree's `braintree/payment/getnonce` is a GET
 * action that reads `public_hash` and the customer session; it needs no
 * form key. It answers `{ paymentMethodNonce, details }` or HTTP 400 with
 * `{ message }`.
 */
import type { CheckoutContext, VaultTokenInfo } from '../../../../extension-api.js';

/** A stored token as the host hands it: the public fields plus the provider's URLs. */
export interface StoredToken extends VaultTokenInfo {
    readonly nonceUrl?: string | null;
    /** Controller that re-verifies the stored card, when the provider names one. */
    readonly updatePaymentUrl?: string | null;
}

export interface VaultNonce {
    nonce: string;
    bin: string;
}

export async function fetchVaultNonce(context: Pick<CheckoutContext, 't'>, token: StoredToken): Promise<VaultNonce> {
    const failure = (message?: unknown): Error => new Error(
        typeof message === 'string' && message
            ? message
            : context.t('Your stored payment method could not be used. Please choose another payment method.')
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
