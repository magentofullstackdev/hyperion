// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    apiFetch,
    configureApiClient,
    resetApiClientForTests,
    NetworkError,
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
