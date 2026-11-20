// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The two core controllers behind the smart button.
 *
 *   POST paypal/express/getTokenData     starts the PayPal transaction for
 *        the quote (SetExpressCheckout) and answers `{ success, token }`.
 *   POST paypal/express/onAuthorization  takes the approved transaction,
 *        places the order when the review step is skipped and answers
 *        `{ success, redirectUrl }` (success page or `paypal/express/review`).
 *
 * Both are storefront controllers, not web API routes: they run on the
 * session cookie, take a form body with the form key, and report a failure
 * in the body (`success: false`, `error_message`) with HTTP 200.
 *
 * A failing controller also queues its message for the next page in the
 * `mage-messages` cookie. Every failed answer drains that cookie, so the
 * message is shown once, here, and the text serves as the reason when the
 * body gave none.
 */
import { readFormKeyCookie } from '../../../utils/form-key.js';
import { drainMageMessages, firstMessageText } from '../../../utils/mage-messages.js';

export class PaypalExpressError extends Error {
    /**
     * The request reached no controller that could answer for it (a
     * gateway or server error status): what it asked for may still have
     * happened.
     */
    public readonly unanswered: boolean;

    public constructor(message: string, unanswered = false) {
        super(message);
        this.name = 'PaypalExpressError';
        this.unanswered = unanswered;
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

/** The error of an answered request that failed; takes the queued messages with it. */
function controllerFailure(message = '', unanswered = false): PaypalExpressError {
    const queued = firstMessageText(drainMageMessages());
    return new PaypalExpressError(message || queued, unanswered);
}

async function readResponse(response: Response): Promise<ControllerResponse> {
    if (!response.ok) throw controllerFailure('', response.status >= 500);
    const body: unknown = await response.json().catch(() => null);
    if (!body || typeof body !== 'object') throw controllerFailure();
    const parsed = body as ControllerResponse;
    if (parsed.success !== true) {
        throw controllerFailure(typeof parsed.error_message === 'string' ? parsed.error_message : '');
    }
    return parsed;
}

const HEADERS = { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } as const;

export async function requestPaypalToken(request: TokenRequest): Promise<string> {
    const response = await fetch(request.url, {
        method: 'POST',
        headers: HEADERS,
        credentials: 'same-origin',
        body: new URLSearchParams({
            quote_id: request.quoteId,
            customer_id: request.customerId,
            form_key: readFormKeyCookie(),
            // 0: the request comes from the checkout, not from a shortcut button.
            button: '0',
        }),
    });
    const body = await readResponse(response);
    if (typeof body.token !== 'string' || body.token === '') throw controllerFailure();
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
    if (typeof body.redirectUrl !== 'string' || body.redirectUrl === '') throw controllerFailure();
    return body.redirectUrl;
}
