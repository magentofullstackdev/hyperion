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
    ORDER_TIMEOUT_MS,
    READ_TIMEOUT_MS,
    RequestTimeoutError,
    RETRY_DELAYS_MS,
    storefrontPostJson,
    WRITE_TIMEOUT_MS,
} from '../client.js';
import { classifyError } from '../error-kinds.js';

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
            fetch: mock,
        });
        const res = await apiFetch<{ ok: boolean }>('carts/mine');
        expect(res).toEqual({ ok: true });
        expect(calls[0]?.input).toBe('https://example.com/rest/en/V1/carts/mine');
    });

    it('authenticates a customer by the session cookie: no Authorization header, the AJAX marker set', async () => {
        const { mock, calls } = mockFetch([okJson({})]);
        configure(mock);
        await apiFetch('carts/mine', { auth: 'customer' });
        const init = calls[0]!.init!;
        expect(new Headers(init.headers).has('Authorization')).toBe(false);
        expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(init.credentials).toBe('same-origin');
    });

    it('throws MagentoApiError on 4xx with Magento error body', async () => {
        const { mock } = mockFetch([
            errJson(400, { message: 'Bad request', parameters: { email: 'x' } }),
        ]);
        configureApiClient({
            baseUrl: 'https://example.com',
            storeCode: 'en',
            readFormKey: () => '',
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
            fetch: mock,
        });
        const controller = new AbortController();

        await expect(apiFetch('carts/mine', { signal: controller.signal })).rejects.toBe(abort);
        expect(calls).toHaveLength(1);
    });

    it('an HTML error page becomes the translated unavailable message, never the page', async () => {
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
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
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const { mock } = mockFetch([
            new Response('<html>Access denied</html>', { status: 403 }),
            new Response('rate limited', { status: 429 }),
        ]);
        configure(mock);

        await expect(apiFetch('a', { retry: false })).rejects.toMatchObject({
            httpStatus: 403,
            message: 'Your request was blocked. Reload the page or contact us.',
        });
        await expect(apiFetch('b', { retry: false })).rejects.toMatchObject({
            httpStatus: 429,
            message: 'Too many requests. Please wait a moment.',
        });
        vi.restoreAllMocks();
    });

    it('a successful answer that is not JSON is an error, not data', async () => {
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
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
            fetch: mock,
        });
        await expect(
            apiFetch('boom', { method: 'POST', body: {} })
        ).rejects.toThrow(NetworkError);
        expect(calls.length).toBe(1);
    });
});

/** A fetch that never answers and rejects with the signal's reason once it is aborted, like the browser. */
function hangingFetch(): { mock: typeof fetch; calls: FetchCall[] } {
    const calls: FetchCall[] = [];
    const mock: typeof fetch = ((input: string, init?: RequestInit) => {
        calls.push({ input, init });
        return new Promise((_resolve, reject) => {
            if (init?.signal?.aborted) reject(init.signal.reason as Error);
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
        });
    }) as typeof fetch;
    return { mock, calls };
}

function htmlPage(status: number): Response {
    return new Response('<html><body><h1>Gateway</h1></body></html>', { status, headers: { 'Content-Type': 'text/html' } });
}

const GUEST_ORDER = 'guest-carts/abc/payment-information';
const CUSTOMER_ORDER = 'carts/mine/payment-information';

describe('default time limits', () => {
    beforeEach(() => {
        resetApiClientForTests();
        vi.useFakeTimers();
    });
    afterEach(() => { vi.useRealTimers(); });

    async function measure(path: string, options: Parameters<typeof apiFetch>[1] = {}): Promise<number> {
        const { mock, calls } = hangingFetch();
        configure(mock);
        const outcome = apiFetch(path, { ...options, retry: false }).catch((err: unknown) => err);
        let waited = 0;
        while (!calls[0]?.init?.signal?.aborted && waited < 120000) {
            await vi.advanceTimersByTimeAsync(1000);
            waited += 1000;
        }
        expect(await outcome).toBeInstanceOf(RequestTimeoutError);
        return waited;
    }

    it('has the documented values', () => {
        expect([READ_TIMEOUT_MS, WRITE_TIMEOUT_MS, ORDER_TIMEOUT_MS]).toEqual([15000, 20000, 60000]);
    });

    it('a read gives up after 15 s', async () => {
        expect(await measure('carts/mine/totals')).toBe(15000);
    });

    it('an estimate and the email lookup are reads although they are POSTs', async () => {
        expect(await measure('guest-carts/abc/estimate-shipping-methods', { method: 'POST', body: {} })).toBe(15000);
        expect(await measure('carts/mine/estimate-shipping-methods-by-address-id', { method: 'POST', body: {} })).toBe(15000);
        expect(await measure('carts/mine/totals-information', { method: 'POST', body: {} })).toBe(15000);
        expect(await measure('customers/isEmailAvailable', { method: 'POST', body: {} })).toBe(15000);
    });

    it('a write gives up after 20 s', async () => {
        expect(await measure('carts/mine/shipping-information', { method: 'POST', body: {} })).toBe(20000);
        expect(await measure('carts/mine/set-payment-information', { method: 'POST', body: {} })).toBe(20000);
        expect(await measure('carts/mine/coupons', { method: 'DELETE' })).toBe(20000);
    });

    it('the order request gives up after 60 s', async () => {
        expect(await measure(GUEST_ORDER, { method: 'POST', body: {} })).toBe(60000);
        expect(await measure(CUSTOMER_ORDER, { method: 'POST', body: {} })).toBe(60000);
    });

    it('an explicit limit wins', async () => {
        expect(await measure('carts/mine', { timeoutMs: 10000 })).toBe(10000);
    });

    it('a timeout is the timeout kind', async () => {
        const { mock } = hangingFetch();
        configure(mock);
        const outcome = apiFetch('carts/mine/shipping-information', { method: 'POST', body: {} }).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
        const error = await outcome;
        expect(error).toBeInstanceOf(RequestTimeoutError);
        expect((error as RequestTimeoutError).kind).toBe('timeout');
        expect(classifyError(error, { path: 'carts/mine/shipping-information', method: 'POST' }).kind).toBe('timeout');
    });

    it.each([['AbortSignal.any()', false], ['the forwarding controller', true]])(
        'the limit and the signal of the caller both end the request through %s',
        async (_label, withoutAny) => {
            const holder = AbortSignal as unknown as { any?: ((signals: AbortSignal[]) => AbortSignal) | undefined };
            const original = holder.any;
            expect(typeof original).toBe('function');
            const combine = vi.fn((signals: AbortSignal[]) => original!.call(AbortSignal, signals));
            holder.any = withoutAny ? undefined : combine;
            try {
                const first = hangingFetch();
                configure(first.mock);
                const controller = new AbortController();
                const canceled = apiFetch('carts/mine', { signal: controller.signal }).catch((err: unknown) => err);
                controller.abort();
                const abort = await canceled;
                expect(isAbortError(abort)).toBe(true);
                expect(first.calls[0]?.init?.signal?.aborted).toBe(true);
                expect(vi.getTimerCount()).toBe(0);

                const second = hangingFetch();
                configure(second.mock);
                const timed = apiFetch('carts/mine', { signal: new AbortController().signal, retry: false })
                    .catch((err: unknown) => err);
                await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
                expect(await timed).toBeInstanceOf(RequestTimeoutError);
                expect(second.calls[0]?.init?.signal?.aborted).toBe(true);

                const third = hangingFetch();
                configure(third.mock);
                const already = new AbortController();
                already.abort();
                expect(isAbortError(await apiFetch('carts/mine', { signal: already.signal }).catch((err: unknown) => err))).toBe(true);
                expect(combine).toHaveBeenCalledTimes(withoutAny ? 0 : 3);
            } finally {
                holder.any = original;
            }
        }
    );
});

describe('retry table', () => {
    beforeEach(() => {
        resetApiClientForTests();
        vi.useFakeTimers();
    });
    afterEach(() => { vi.useRealTimers(); });

    const offline = (): TypeError => new TypeError('Failed to fetch');

    it('is the documented table', () => {
        expect(RETRY_DELAYS_MS).toEqual({
            network: { read: [1000, 3000], 'idempotent-write': [1000] },
            timeout: { read: [1000, 3000], 'idempotent-write': [1000] },
            unavailable: { read: [2000] },
        });
    });

    it('a read is retried twice after a transport failure, 1 s then 3 s later', async () => {
        const { mock, calls } = mockFetch([offline(), offline(), okJson({ ok: 1 })]);
        configure(mock);

        const promise = apiFetch<{ ok: 1 }>('carts/mine/totals');
        await vi.advanceTimersByTimeAsync(999);
        expect(calls).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(calls).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(2999);
        expect(calls).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);

        await expect(promise).resolves.toEqual({ ok: 1 });
        expect(calls).toHaveLength(3);
    });

    it('a read that fails three times reports the failure', async () => {
        const { mock, calls } = mockFetch([offline(), offline(), offline()]);
        configure(mock);

        const outcome = apiFetch('carts/mine/totals').catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(4000);

        expect(await outcome).toBeInstanceOf(NetworkError);
        expect(calls).toHaveLength(3);
    });

    it('a read that timed out is retried like a transport failure', async () => {
        const calls: FetchCall[] = [];
        const mock: typeof fetch = ((input: string, init?: RequestInit) => {
            calls.push({ input, init });
            if (calls.length > 1) return Promise.resolve(okJson(5));
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
            });
        }) as typeof fetch;
        configure(mock);

        const promise = apiFetch<number>('carts/mine/totals');
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1000);

        await expect(promise).resolves.toBe(5);
        expect(calls).toHaveLength(2);
    });

    it('an idempotent write is retried once', async () => {
        const { mock, calls } = mockFetch([offline(), offline()]);
        configure(mock);

        const outcome = apiFetch('carts/mine/shipping-information', { method: 'POST', body: {}, idempotent: true })
            .catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(10000);

        expect(await outcome).toBeInstanceOf(NetworkError);
        expect(calls).toHaveLength(2);
    });

    it('an idempotent write succeeds on its retry', async () => {
        const { mock, calls } = mockFetch([offline(), okJson(true)]);
        configure(mock);

        const promise = apiFetch<boolean>('carts/mine/coupons', { method: 'DELETE', idempotent: true });
        await vi.advanceTimersByTimeAsync(1000);

        await expect(promise).resolves.toBe(true);
        expect(calls).toHaveLength(2);
    });

    it('a write that is not idempotent is never retried, whatever the failure', async () => {
        const { mock, calls } = mockFetch([offline(), htmlPage(503)]);
        configure(mock);

        const first = apiFetch('carts/mine/coupons/SAVE10', { method: 'PUT' }).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(10000);
        expect(await first).toBeInstanceOf(NetworkError);
        expect(calls).toHaveLength(1);

        const second = apiFetch('carts/mine/gift-message', { method: 'POST', body: {} }).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(10000);
        expect(await second).toBeInstanceOf(MagentoApiError);
        expect(calls).toHaveLength(2);
    });

    it.each([[GUEST_ORDER], [CUSTOMER_ORDER]])('the order request %s is never retried, even when a caller marks it', async (path) => {
        const failures = [offline(), htmlPage(502), offline(), offline()];
        const { mock, calls } = mockFetch(failures);
        configure(mock);
        const variants: Parameters<typeof apiFetch>[1][] = [
            { method: 'POST', body: {} },
            { method: 'POST', body: {} },
            { method: 'POST', body: {}, idempotent: true },
            { method: 'POST', body: {}, retry: true },
        ];

        for (const [index, options] of variants.entries()) {
            const outcome = apiFetch(path, options).catch((err: unknown) => err);
            await vi.advanceTimersByTimeAsync(10000);
            const error = await outcome;
            expect(calls).toHaveLength(index + 1);
            expect(classifyError(error, { path, method: 'POST' }).kind).toBe('order-unknown');
        }
    });

    it('an order request that times out is sent once', async () => {
        const { mock, calls } = hangingFetch();
        configure(mock);

        const outcome = apiFetch(GUEST_ORDER, { method: 'POST', body: {} }).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(ORDER_TIMEOUT_MS + 30000);

        expect(await outcome).toBeInstanceOf(RequestTimeoutError);
        expect(calls).toHaveLength(1);
    });

    it('a read is retried once, 2 s later, after a 502, 503 or 504', async () => {
        for (const status of [502, 503, 504]) {
            const { mock, calls } = mockFetch([htmlPage(status), htmlPage(status)]);
            configure(mock);

            const outcome = apiFetch('carts/mine/totals').catch((err: unknown) => err);
            await vi.advanceTimersByTimeAsync(1999);
            expect(calls).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(1);

            expect(await outcome).toMatchObject({ httpStatus: status, kind: 'unavailable' });
            expect(calls).toHaveLength(2);
        }
    });

    it('a 500, a refusal, an expired session and a rate limit are reported at once', async () => {
        const answers = [
            errJson(500, { message: 'Internal Error.' }),
            errJson(400, { message: 'Invalid value.' }),
            errJson(401, { message: 'No.' }),
            new Response('slow down', { status: 429, headers: { 'Retry-After': '1' } }),
        ];
        const { mock, calls } = mockFetch(answers);
        configure(mock);

        const kinds: unknown[] = [];
        for (let i = 0; i < answers.length; i += 1) {
            const outcome = apiFetch('carts/mine/totals').catch((err: unknown) => err);
            await vi.advanceTimersByTimeAsync(10000);
            kinds.push(((await outcome) as MagentoApiError).kind);
            expect(calls).toHaveLength(i + 1);
        }
        expect(kinds).toEqual(['unavailable', 'validation', 'session-expired', 'rate-limited']);
    });

    it('nothing is retried while the browser is offline', async () => {
        const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const { mock, calls } = mockFetch([offline()]);
        configure(mock);

        const outcome = apiFetch('carts/mine/totals').catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(10000);

        expect(await outcome).toMatchObject({ name: 'NetworkError', kind: 'offline' });
        expect(calls).toHaveLength(1);
        onLine.mockRestore();
    });

    it('retry false wins over the table', async () => {
        const { mock, calls } = mockFetch([offline()]);
        configure(mock);

        const outcome = apiFetch('carts/mine', { retry: false }).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(10000);

        expect(await outcome).toBeInstanceOf(NetworkError);
        expect(calls).toHaveLength(1);
    });

    it('the caller canceling during the wait ends it with the abort and sends nothing more', async () => {
        const { mock, calls } = mockFetch([offline(), okJson(1)]);
        configure(mock);
        const controller = new AbortController();

        const outcome = apiFetch('carts/mine/totals', { signal: controller.signal }).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(500);
        controller.abort();
        const error = await outcome;
        await vi.advanceTimersByTimeAsync(10000);

        expect(isAbortError(error)).toBe(true);
        expect(calls).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('answers', () => {
    beforeEach(() => { resetApiClientForTests(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('sends the headers of the caller next to its own', async () => {
        const { mock, calls } = mockFetch([okJson(true)]);
        configure(mock);

        await apiFetch('carts/mine/coupons/SAVE10', {
            method: 'PUT',
            headers: { 'X-Captcha': 'h4ck3', Accept: 'text/html' },
            recaptchaToken: 'tok',
        });

        const headers = new Headers(calls[0]!.init!.headers);
        expect(headers.get('X-Captcha')).toBe('h4ck3');
        expect(headers.get('X-ReCaptcha')).toBe('tok');
        expect(headers.get('Accept')).toBe('application/json');
        expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    });

    it('marks a body that is not JSON and reads Retry-After', async () => {
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const { mock } = mockFetch([
            new Response('<html>busy</html>', { status: 429, headers: { 'Retry-After': '7', 'Content-Type': 'text/html' } }),
        ]);
        configure(mock);

        const error = await apiFetch('carts/mine').catch((err: unknown) => err as MagentoApiError);

        expect(error).toMatchObject({ httpStatus: 429, nonJsonBody: true, retryAfterMs: 7000, kind: 'rate-limited' });
        expect(classifyError(error, { path: 'carts/mine', method: 'GET' }).message).toBe('Too many requests. Please wait 7 seconds.');
    });

    it('an error answer in another format is not JSON even when its text parses', async () => {
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const { mock } = mockFetch([new Response('503', { status: 503, headers: { 'Content-Type': 'text/plain' } })]);
        configure(mock);

        const error = await apiFetch('carts/mine', { retry: false }).catch((err: unknown) => err as MagentoApiError);

        expect(error).toMatchObject({ httpStatus: 503, nonJsonBody: true, kind: 'unavailable' });
    });

    it('sets the kind from the request: a missing quote, an order without an answer', async () => {
        const { mock } = mockFetch([
            errJson(404, { message: 'No such entity with %fieldName = %fieldValue', parameters: { fieldName: 'cartId', fieldValue: 7 } }),
            errJson(500, { message: 'Internal Error.' }),
        ]);
        configure(mock);

        await expect(apiFetch('guest-carts/abc/shipping-information', { method: 'POST', body: {} }))
            .rejects.toMatchObject({ kind: 'quote-gone', message: 'No such entity with cartId = 7' });
        await expect(apiFetch(GUEST_ORDER, { method: 'POST', body: {} }))
            .rejects.toMatchObject({ kind: 'order-unknown', httpStatus: 500 });
    });
});

describe('storefrontPostJson', () => {
    beforeEach(() => { resetApiClientForTests(); });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('posts JSON to the storefront path with the query and the AJAX headers', async () => {
        const { mock, calls } = mockFetch([okJson({ errors: false, message: 'ok' })]);
        configure(mock);

        const answer = await storefrontPostJson('customer/ajax/login', { username: 'a' }, { token: 't' }, { headers: { 'X-Captcha': 'abc' } });

        expect(answer).toEqual({ errors: false, message: 'ok' });
        expect(calls[0]?.input).toBe('https://example.com/customer/ajax/login?token=t');
        const headers = new Headers(calls[0]!.init!.headers);
        expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(headers.get('X-Captcha')).toBe('abc');
        expect(calls[0]?.init?.body).toBe('{"username":"a"}');
    });

    it('gives up after the write limit with the timeout kind, and is not retried', async () => {
        vi.useFakeTimers();
        const { mock, calls } = hangingFetch();
        configure(mock);

        const outcome = storefrontPostJson('customer/ajax/login', {}).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS - 1);
        expect(calls[0]?.init?.signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        const error = await outcome;
        await vi.advanceTimersByTimeAsync(10000);

        expect(error).toBeInstanceOf(RequestTimeoutError);
        expect((error as RequestTimeoutError).kind).toBe('timeout');
        expect(calls).toHaveLength(1);
    });

    it('honors its own limit and the signal of the caller', async () => {
        vi.useFakeTimers();
        const first = hangingFetch();
        configure(first.mock);
        const short = storefrontPostJson('customer/ajax/login', {}, undefined, { timeoutMs: 3000 }).catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(3000);
        expect(await short).toBeInstanceOf(RequestTimeoutError);

        const second = hangingFetch();
        configure(second.mock);
        const controller = new AbortController();
        const canceled = storefrontPostJson('customer/ajax/login', {}, undefined, { signal: controller.signal })
            .catch((err: unknown) => err);
        controller.abort();
        expect(isAbortError(await canceled)).toBe(true);
    });

    it('classifies its failures like a REST call', async () => {
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const { mock, calls } = mockFetch([
            htmlPage(503),
            new Response('<html>denied</html>', { status: 403 }),
            new TypeError('Failed to fetch'),
        ]);
        configure(mock);

        await expect(storefrontPostJson('customer/ajax/login', {}))
            .rejects.toMatchObject({ name: 'MagentoApiError', kind: 'unavailable', nonJsonBody: true });
        await expect(storefrontPostJson('customer/ajax/login', {}))
            .rejects.toMatchObject({ kind: 'blocked' });
        await expect(storefrontPostJson('customer/ajax/login', {}))
            .rejects.toMatchObject({ name: 'NetworkError', kind: 'network' });
        expect(calls).toHaveLength(3);
    });
});
