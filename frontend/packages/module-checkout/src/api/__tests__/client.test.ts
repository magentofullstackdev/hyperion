// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import {
    apiFetch,
    configureApiClient,
    isAbortError,
    MagentoApiError,
    resetApiClientForTests,
    NetworkError,
    RequestTimeoutError,
} from '../client.js';

interface FetchCall { input: string; init: RequestInit | undefined; }

function mockFetch(responses: readonly (Response | Error)[]): {
    mock: typeof fetch;
    calls: FetchCall[];
} {
    const calls: FetchCall[] = [];
    let i = 0;
    const mock: typeof fetch = ((input: string, init?: RequestInit) => {
        calls.push({ input, init });
        const next = responses[i++];
        if (next instanceof Error) return Promise.reject(next);
        if (next) return Promise.resolve(next);
        throw new Error(`mockFetch exhausted at call ${i}`);
    }) as typeof fetch;
    return { mock, calls };
}

function configure(mock: typeof fetch): void {
    configureApiClient({
        baseUrl: 'https://example.com',
        storeCode: 'en',
        readFormKey: () => '',
        readCustomerToken: () => null,
        fetch: mock,
    });
}

function okJson(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function errJson(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('apiFetch', () => {
    beforeEach(() => { resetApiClientForTests(); });

    it('throws when called before configureApiClient()', async () => {
        await expect(apiFetch('carts/mine')).rejects.toThrow(/before configureApiClient/);
    });

    it('prefixes baseUrl + storeCode + V1 and parses JSON', async () => {
        const { mock, calls } = mockFetch([okJson({ ok: true })]);
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => 'k',
            readCustomerToken: () => null,
            fetch: mock,
        });
        const res = await apiFetch<{ ok: boolean }>('carts/mine');
        expect(res).toEqual({ ok: true });
        expect(calls[0]?.input).toBe('https://example.com/rest/en/V1/carts/mine');
    });

    it('attaches Bearer token when customer auth + token available', async () => {
        const { mock, calls } = mockFetch([okJson({})]);
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => '',
            readCustomerToken: () => 'TOK',
            fetch: mock,
        });
        await apiFetch('carts/mine', { auth: 'customer' });
        const init = calls[0]!.init!;
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer TOK');
    });

    it('omits Authorization header when customer auth + no token (session cookie path)', async () => {
        const { mock, calls } = mockFetch([okJson({})]);
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => '',
            readCustomerToken: () => null,
            fetch: mock,
        });
        await apiFetch('carts/mine', { auth: 'customer' });
        const init = calls[0]!.init!;
        expect(new Headers(init.headers).has('Authorization')).toBe(false);
        expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    });

    it('throws MagentoApiError on 4xx with Magento error body', async () => {
        const { mock } = mockFetch([
            errJson(400, { message: 'Bad request', parameters: { email: 'x' } }),
        ]);
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => '',
            readCustomerToken: () => null,
            fetch: mock,
        });
        await expect(apiFetch('boom'))
            .rejects.toMatchObject({
                name: 'MagentoApiError',
                httpStatus: 400,
                message: 'Bad request',
            });
    });

    it('retries GET once on transport failure then succeeds', async () => {
        const { mock, calls } = mockFetch([
            new TypeError('offline'),
            okJson({ ok: 1 }),
        ]);
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => '',
            readCustomerToken: () => null,
            fetch: mock,
        });
        vi.useFakeTimers();
        const promise = apiFetch<{ ok: 1 }>('retry-me');
        await vi.advanceTimersByTimeAsync(1000);
        const out = await promise;
        vi.useRealTimers();
        expect(out).toEqual({ ok: 1 });
        expect(calls.length).toBe(2);
    });

    it('rethrows an abort as AbortError, never as NetworkError, and does not retry it', async () => {
        const abort = new DOMException('The operation was aborted.', 'AbortError');
        const calls: FetchCall[] = [];
        const mock: typeof fetch = ((input: string, init?: RequestInit) => {
            calls.push({ input, init });
            return Promise.reject(abort);
        }) as typeof fetch;
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => 'k',
            readCustomerToken: () => null,
            fetch: mock,
        });
        const controller = new AbortController();

        await expect(apiFetch('carts/mine', { signal: controller.signal })).rejects.toBe(abort);
        expect(calls).toHaveLength(1);
    });

    it('an HTML error page becomes the translated unavailable message, never the page', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const page = '<html><head><title>503 Service Temporarily Unavailable</title></head><body><h1>503</h1></body></html>';
        const { mock } = mockFetch([
            new Response(page, { status: 503, headers: { 'Content-Type': 'text/html' } }),
        ]);
        configure(mock);

        const error = await apiFetch<never>('carts/mine/shipping-information', { method: 'POST', body: {} })
            .catch((err: unknown) => err as MagentoApiError);

        expect(error).toBeInstanceOf(MagentoApiError);
        expect(error.httpStatus).toBe(503);
        expect(error.message).toBe('The store is temporarily unavailable. Please try again in a moment.');
        expect(error.message).not.toContain('<');
        vi.restoreAllMocks();
    });

    it('a 429 with a JSON message keeps the message of the server', async () => {
        const { mock } = mockFetch([errJson(429, { message: 'Too many requests from this address.' })]);
        configure(mock);

        await expect(apiFetch('carts/mine')).rejects.toMatchObject({
            httpStatus: 429,
            message: 'Too many requests from this address.',
        });
    });

    it('a 403 challenge page and a plain text 429 get the message of their status', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { mock } = mockFetch([
            new Response('<html>Access denied</html>', { status: 403 }),
            new Response('rate limited', { status: 429 }),
        ]);
        configure(mock);

        await expect(apiFetch('a', { retry: false })).rejects.toMatchObject({
            httpStatus: 403,
            message: 'Your request was blocked. Please reload the page and try again.',
        });
        await expect(apiFetch('b', { retry: false })).rejects.toMatchObject({
            httpStatus: 429,
            message: 'Too many requests. Please wait a moment and try again.',
        });
        vi.restoreAllMocks();
    });

    it('a successful answer that is not JSON is an error, not data', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { mock } = mockFetch([new Response('<html>Sign in to the network</html>', { status: 200 })]);
        configure(mock);

        await expect(apiFetch('carts/mine', { retry: false })).rejects.toMatchObject({
            name: 'MagentoApiError',
            message: 'Something went wrong. Please try again.',
        });
        vi.restoreAllMocks();
    });

    describe('time limit', () => {
        /** A fetch that never answers and rejects with the signal's reason once it is aborted, like the browser. */
        function hangingFetch(): { mock: typeof fetch; calls: FetchCall[] } {
            const calls: FetchCall[] = [];
            const mock: typeof fetch = ((input: string, init?: RequestInit) => {
                calls.push({ input, init });
                return new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
                });
            }) as typeof fetch;
            return { mock, calls };
        }

        beforeEach(() => { vi.useFakeTimers(); });
        afterEach(() => { vi.useRealTimers(); });

        it('a request without an answer is aborted at the limit and reported as RequestTimeoutError, not retried', async () => {
            const { mock, calls } = hangingFetch();
            configure(mock);

            const outcome = apiFetch('guest-carts/abc/payment-information', { method: 'POST', body: {}, timeoutMs: 60000 })
                .catch((err: unknown) => err);
            await vi.advanceTimersByTimeAsync(59999);
            expect(calls[0]?.init?.signal?.aborted).toBe(false);
            await vi.advanceTimersByTimeAsync(1);

            const error = await outcome;
            expect(error).toBeInstanceOf(RequestTimeoutError);
            expect(error).toBeInstanceOf(NetworkError);
            expect(isAbortError(error)).toBe(false);
            expect(calls[0]?.init?.signal?.aborted).toBe(true);
            expect(calls).toHaveLength(1);
        });

        it('an answer inside the limit is returned and the limit is disarmed', async () => {
            const { mock } = mockFetch([okJson(77)]);
            configure(mock);

            await expect(apiFetch<number>('carts/mine/payment-information', { method: 'POST', body: {}, timeoutMs: 60000 }))
                .resolves.toBe(77);
            expect(vi.getTimerCount()).toBe(0);
        });

        it('the caller canceling a request with a limit is still an abort, never a timeout', async () => {
            const { mock } = hangingFetch();
            configure(mock);
            const controller = new AbortController();

            const outcome = apiFetch('carts/mine', { signal: controller.signal, timeoutMs: 15000, retry: false })
                .catch((err: unknown) => err);
            controller.abort();

            const error = await outcome;
            expect(isAbortError(error)).toBe(true);
            expect(error).not.toBeInstanceOf(NetworkError);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    it('never retries mutations', async () => {
        const { mock, calls } = mockFetch([new TypeError('offline')]);
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => '',
            readCustomerToken: () => null,
            fetch: mock,
        });
        await expect(
            apiFetch('boom', { method: 'POST', body: {} })
        ).rejects.toThrow(NetworkError);
        expect(calls.length).toBe(1);
    });
});
