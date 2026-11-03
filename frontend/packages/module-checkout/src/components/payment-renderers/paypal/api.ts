// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The two core controllers behind the smart button.
 *
 *   GET  paypal/express/getTokenData     starts the PayPal transaction for
 *        the quote (SetExpressCheckout) and answers `{ success, token }`.
 *   POST paypal/express/onAuthorization  takes the approved transaction,
 *        places the order when the review step is skipped and answers
 *        `{ success, redirectUrl }` (success page or `paypal/express/review`).
 *
 * Both are storefront controllers, not web API routes: they run on the
 * session cookie, the POST needs the form key, and a failure is reported in
 * the body (`success: false`, `error_message`) with HTTP 200.
 */
import { readFormKeyCookie } from '../../../utils/form-key.js';

export class PaypalExpressError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'PaypalExpressError';
    }
}

export interface TokenRequest {
    url: string;
    quoteId: string;
    customerId: string;
}

export interface AuthorizationRequest {
    url: string;
    token: string;
    payerId: string;
    fundingSource: string;
}

interface ControllerResponse {
    success?: boolean;
    error_message?: string;
    token?: string | false;
    redirectUrl?: string;
}

async function readResponse(response: Response): Promise<ControllerResponse> {
    if (!response.ok) throw new PaypalExpressError('');
    const body: unknown = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new PaypalExpressError('');
    const parsed = body as ControllerResponse;
    if (parsed.success !== true) {
        throw new PaypalExpressError(typeof parsed.error_message === 'string' ? parsed.error_message : '');
    }
    return parsed;
}

const HEADERS = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } as const;

export async function requestPaypalToken(request: TokenRequest): Promise<string> {
    const url = new URL(request.url, window.location.origin);
    url.searchParams.set('quote_id', request.quoteId);
    url.searchParams.set('customer_id', request.customerId);
    url.searchParams.set('form_key', readFormKeyCookie());
    url.searchParams.set('button', '0');
    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: HEADERS,
        credentials: 'same-origin',
        cache: 'no-store',
    });
    const body = await readResponse(response);
    if (typeof body.token !== 'string' || body.token === '') throw new PaypalExpressError('');
    return body.token;
}

export async function authorizePaypalPayment(request: AuthorizationRequest): Promise<string> {
    const response = await fetch(request.url, {
        method: 'POST',
        headers: HEADERS,
        credentials: 'same-origin',
        body: new URLSearchParams({
            paymentToken: request.token,
            payerId: request.payerId,
            paypalFundingSource: request.fundingSource,
            form_key: readFormKeyCookie(),
        }),
    });
    const body = await readResponse(response);
    if (typeof body.redirectUrl !== 'string' || body.redirectUrl === '') throw new PaypalExpressError('');
    return body.redirectUrl;
}
