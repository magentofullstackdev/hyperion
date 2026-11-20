// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { MAGE_MESSAGES_COOKIE } from '../../../../utils/mage-messages.js';
import { PaypalExpressError, authorizePaypalPayment, requestPaypalToken } from '../api.js';

const TOKEN_URL = `${window.location.origin}/paypal/express/getTokenData/`;
const AUTHORIZE_URL = `${window.location.origin}/paypal/express/onAuthorization/`;

const TOKEN_REQUEST = { url: TOKEN_URL, quoteId: '42', customerId: '7' };
const AUTHORIZATION_REQUEST = { url: AUTHORIZE_URL, token: 'EC-TOKEN', payerId: 'PAYER', fundingSource: 'paypal' };

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function queueMessage(type: string, text: string): void {
    const value = encodeURIComponent(JSON.stringify([{ type, text }])).replace(/%20/g, '+');
    document.cookie = `${MAGE_MESSAGES_COOKIE}=${value}; path=/`;
}

function expireCookie(name: string): void {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

describe('PayPal Express controllers', () => {
    let fetchMock: Mock;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        document.cookie = 'form_key=form-key-fixture; path=/';
    });

    afterEach(() => {
        expireCookie(MAGE_MESSAGES_COOKIE);
        expireCookie('form_key');
        vi.unstubAllGlobals();
    });

    describe('token request', () => {
        it('is a POST with a form body, like the core smart button', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, token: 'EC-TOKEN' }));

            await expect(requestPaypalToken(TOKEN_REQUEST)).resolves.toBe('EC-TOKEN');

            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(TOKEN_URL);
            expect(init.method).toBe('POST');
            expect(init.credentials).toBe('same-origin');
            expect(init.headers).toMatchObject({ 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' });
            expect(init.body).toBeInstanceOf(URLSearchParams);
            expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
                quote_id: '42',
                customer_id: '7',
                form_key: 'form-key-fixture',
                button: '0',
            });
        });

        it('leaves the message cookie alone on success', async () => {
            queueMessage('success', 'Unrelated message for the next page.');
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, token: 'EC-TOKEN' }));

            await requestPaypalToken(TOKEN_REQUEST);

            expect(document.cookie).toContain(MAGE_MESSAGES_COOKIE);
        });

        it('rejects with the reason of the body and drains the queued message', async () => {
            queueMessage('error', 'We can\'t initialize Express Checkout.');
            fetchMock.mockResolvedValueOnce(
                jsonResponse({ success: false, error_message: 'PayPal gateway has rejected request.' })
            );

            const failure = await requestPaypalToken(TOKEN_REQUEST).catch((err: unknown) => err);

            expect(failure).toBeInstanceOf(PaypalExpressError);
            expect((failure as Error).message).toBe('PayPal gateway has rejected request.');
            expect(document.cookie).not.toContain(MAGE_MESSAGES_COOKIE);
        });

        it('uses the queued message as the reason when the body gives none', async () => {
            queueMessage('error', 'We can\'t initialize Express Checkout.');
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }));

            await expect(requestPaypalToken(TOKEN_REQUEST)).rejects.toThrow('We can\'t initialize Express Checkout.');
            expect(document.cookie).not.toContain(MAGE_MESSAGES_COOKIE);
        });

        it('drains the queued message of an HTTP error and of an answer without a token', async () => {
            queueMessage('error', 'Session expired.');
            fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
            await expect(requestPaypalToken(TOKEN_REQUEST)).rejects.toThrow('Session expired.');
            expect(document.cookie).not.toContain(MAGE_MESSAGES_COOKIE);

            queueMessage('error', 'No token.');
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, token: false }));
            await expect(requestPaypalToken(TOKEN_REQUEST)).rejects.toThrow('No token.');
            expect(document.cookie).not.toContain(MAGE_MESSAGES_COOKIE);
        });

        it('rejects with an empty reason when nothing explains the failure', async () => {
            fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
            const failure = await requestPaypalToken(TOKEN_REQUEST).catch((err: unknown) => err);
            expect(failure).toBeInstanceOf(PaypalExpressError);
            expect((failure as Error).message).toBe('');
        });
    });

    describe('authorization', () => {
        it('posts the approval and resolves with the redirect URL', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, redirectUrl: '/checkout/onepage/success/' }));

            await expect(authorizePaypalPayment(AUTHORIZATION_REQUEST)).resolves.toBe('/checkout/onepage/success/');

            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(AUTHORIZE_URL);
            expect(init.method).toBe('POST');
            expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
                paymentToken: 'EC-TOKEN',
                payerId: 'PAYER',
                paypalFundingSource: 'paypal',
                form_key: 'form-key-fixture',
            });
        });

        it('drains the queued message when the authorization fails', async () => {
            queueMessage('error', 'We can\'t place the order.');
            fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, error_message: '' }));

            await expect(authorizePaypalPayment(AUTHORIZATION_REQUEST)).rejects.toThrow('We can\'t place the order.');
            expect(document.cookie).not.toContain(MAGE_MESSAGES_COOKIE);
        });
    });
});
