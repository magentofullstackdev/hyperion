// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient, resetApiClientForTests } from '../../api/client.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { loadLocale, setActiveCatalogForTests } from '../../utils/i18n.js';
import {
    createCheckoutContext,
    createPaymentContext,
    createShippingContext,
    resetCheckoutContextForTests,
    toPublicError,
    type PaymentPipeline,
} from '../context.js';
import { resetScriptLoaderForTests } from '../load-script.js';

/** The page's own origin: URLs on any other origin are refused. */
const BASE = window.location.origin;

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('checkout context', () => {
    let store: Store;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        setActiveCatalogForTests({
            'Hyperion_Checkout::unexpected_error': 'Something went wrong.',
            'Hyperion_Checkout::error_session_expired': 'Your session ended.',
            'Hyperion_Checkout::place_order': 'Place Order',
        });
        setCheckoutConfig({
            storeCode: 'default',
            hyperion: { enabled: true, baseUrl: `${BASE}/`, extensionApi: '1.0-beta', cartUrl: `${BASE}/checkout/cart/` },
            checkoutUrl: `${BASE}/checkout/`,
            defaultSuccessPageUrl: `${BASE}/checkout/onepage/success/`,
            priceFormat: { pattern: '$%s', precision: 2, requiredPrecision: 2, decimalSymbol: '.', groupSymbol: ',', groupLength: 3, integerRequired: false },
            basePriceFormat: { pattern: '€%s', precision: 2, requiredPrecision: 2, decimalSymbol: ',', groupSymbol: '.', groupLength: 3, integerRequired: false },
        } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        resetFlowSelectorsForTests();
        resetCheckoutContextForTests();
        resetScriptLoaderForTests();
        fetchMock = vi.fn(() => Promise.resolve(json(200, { ok: true })));
        configureApiClient({ baseUrl: BASE, storeCode: 'default', readFormKey: () => 'FK', fetch: fetchMock as unknown as typeof fetch });
        document.cookie = 'form_key=FORMKEY1';
    });

    afterEach(() => {
        resetApiClientForTests();
        document.head.querySelectorAll('script').forEach((script) => script.remove());
        vi.restoreAllMocks();
    });

    it('declares the version of the API', () => {
        expect(createCheckoutContext().apiVersion).toBe('1.0-beta');
    });

    describe('rest()', () => {
        it('calls the REST API of the store under /rest/<store>/V1/ with the AJAX header', async () => {
            const context = createCheckoutContext();
            await expect(context.rest('carts/mine/totals')).resolves.toEqual({ ok: true });
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(`${BASE}/rest/default/V1/carts/mine/totals`);
            expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
            expect(init.credentials).toBe('same-origin');
        });

        it('sends a body as JSON', async () => {
            await createCheckoutContext().rest('/vendor/psp/session', { method: 'POST', body: { a: 1 } });
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe(`${BASE}/rest/default/V1/vendor/psp/session`);
            expect(init.method).toBe('POST');
            expect(init.body).toBe('{"a":1}');
        });

        it('refuses an absolute URL or a path that climbs out of the API', async () => {
            const context = createCheckoutContext();
            await expect(context.rest('https://evil.example/x')).rejects.toMatchObject({ kind: 'validation' });
            await expect(context.rest('//evil.example/x')).rejects.toMatchObject({ kind: 'validation' });
            await expect(context.rest('carts/../../admin')).rejects.toMatchObject({ kind: 'validation' });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('rejects with the public error of the taxonomy, never the raw body', async () => {
            fetchMock.mockResolvedValueOnce(json(401, { message: 'The consumer isn\'t authorized to access %resources.' }));
            const error = await createCheckoutContext().rest('carts/mine').catch((err: unknown) => err);
            expect(error).toMatchObject({ kind: 'unauthorized', status: 401, message: 'Your session ended.' });
        });
    });

    it('maps every kind of the taxonomy to the public list', () => {
        const kinds = (err: unknown): string => toPublicError(err).kind;
        expect(kinds(new DOMException('stop', 'AbortError'))).toBe('aborted');
        expect(kinds(new DOMException('slow', 'TimeoutError'))).toBe('timeout');
        expect(kinds(new Error(''))).toBe('server');
    });

    it('builds the cart path of a guest and of a customer', () => {
        const context = createCheckoutContext();
        store.isGuest.set(true);
        store.maskedQuoteId.set('abc123');
        expect(context.cartPath()).toBe('guest-carts/abc123');
        expect(context.cartPath('totals')).toBe('guest-carts/abc123/totals');
        store.isGuest.set(false);
        expect(context.cartPath('/payment-information')).toBe('carts/mine/payment-information');
    });

    it('posts to a storefront controller with a JSON body and the form key as a query parameter', async () => {
        await createCheckoutContext().storefront('vendorpsp/session/start', { method: 'POST', body: { id: 1 } });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BASE}/vendorpsp/session/start?form_key=FORMKEY1`);
        expect(init.method).toBe('POST');
        expect(init.body).toBe('{"id":1}');
        expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
        expect(new Headers(init.headers).get('X-Requested-With')).toBe('XMLHttpRequest');
    });

    it('sends {} for a POST without a body, and any other method value as a POST', async () => {
        const context = createCheckoutContext();
        await context.storefront('vendorpsp/session/start', { method: 'POST' });
        await context.storefront('vendorpsp/session/start', { method: 'DELETE' } as unknown as { method: 'POST' });
        for (const [url, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
            expect(url).toBe(`${BASE}/vendorpsp/session/start?form_key=FORMKEY1`);
            expect(init.method).toBe('POST');
            expect(init.body).toBe('{}');
        }
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reads a storefront controller with GET, the default, without a body or the form key', async () => {
        await createCheckoutContext().storefront('vendorpsp/session/status', { method: 'GET', body: { ignored: true } });
        await createCheckoutContext().storefront('vendorpsp/session/status');
        for (const [url, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
            expect(url).toBe(`${BASE}/vendorpsp/session/status`);
            expect(init.method).toBe('GET');
            expect(init.body).toBeUndefined();
            expect(new Headers(init.headers).has('Content-Type')).toBe(false);
        }
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('resolves an empty storefront answer with null', async () => {
        fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
        await expect(createCheckoutContext().storefront('vendorpsp/session/status')).resolves.toBeNull();
    });

    it('rejects a non-2xx storefront answer with its kind and status and a generic message, never the controller text', async () => {
        fetchMock.mockResolvedValueOnce(json(400, { message: 'Internal: SQLSTATE[42S02]' }));
        const refused = await createCheckoutContext().storefront('vendorpsp/session/start', { method: 'POST' })
            .catch((err: unknown) => err);
        expect(refused).toMatchObject({ name: 'CheckoutError', kind: 'validation', status: 400, message: 'Something went wrong.' });
        fetchMock.mockResolvedValueOnce(json(401, { message: 'Not signed in' }));
        const expired = await createCheckoutContext().storefront('vendorpsp/session/status').catch((err: unknown) => err);
        expect(expired).toMatchObject({ kind: 'unauthorized', status: 401, message: 'Something went wrong.' });
    });

    it('translates with the entry phrases first, then the store dictionary, then the checkout catalog', async () => {
        await loadLocale({ locale: 'en_US', translations: { 'Card number': 'Numero carta (store)', 'Place Order': 'Effettua ordine' } });
        const context = createCheckoutContext({ phrases: { 'Card number': 'Numero della carta', 'Pay {amount}': 'Paga {amount}' } });
        expect(context.t('Card number')).toBe('Numero della carta');
        expect(context.t('Place Order')).toBe('Effettua ordine');
        expect(context.t('Pay {amount}', { amount: '10 €' })).toBe('Paga 10 €');
        expect(context.t('Unknown phrase')).toBe('Unknown phrase');
        expect(createCheckoutContext().t('Card number')).toBe('Numero carta (store)');
    });

    it('formats prices in the display and the base currency', () => {
        const context = createCheckoutContext();
        expect(context.formatPrice(1234.5)).toBe('$1,234.50');
        expect(context.formatPrice(1234.5, 'base')).toBe('€1.234,50');
    });

    it('sanitizes HTML with the shared sanitizer', () => {
        const clean = createCheckoutContext().sanitizeHtml('<p onclick="x()">Hi<script>alert(1)</script></p>');
        expect(clean).toContain('Hi');
        expect(clean).not.toContain('onclick');
        expect(clean).not.toContain('<script');
    });

    it('never builds a URL on another origin than the base URL', () => {
        setCheckoutConfig({
            storeCode: 'default',
            hyperion: { enabled: true, baseUrl: `${BASE}/`, cartUrl: 'https://cdn.example/checkout/cart/' },
            checkoutUrl: `${BASE}/checkout/`,
            defaultSuccessPageUrl: `${BASE}/checkout/onepage/success/`,
        } as unknown as CheckoutConfig);
        expect(createCheckoutContext().urls.cart).toBe(`${BASE}/checkout/cart/`);
    });

    it('builds its URLs on the base URL', () => {
        expect(createCheckoutContext().urls).toEqual({
            base: `${BASE}/`,
            cart: `${BASE}/checkout/cart/`,
            checkout: `${BASE}/checkout/`,
            success: `${BASE}/checkout/onepage/success/`,
        });
    });

    describe('loadScript()', () => {
        it('loads a URL once, with the nonce of the page', async () => {
            const module = document.createElement('script');
            module.type = 'module';
            module.nonce = 'n0nce';
            document.head.appendChild(module);
            const context = createCheckoutContext();
            const first = context.loadScript('https://js.psp.example/sdk.js', { 'data-namespace': 'psp', onload: 'x()' });
            const second = context.loadScript('https://js.psp.example/sdk.js');
            expect(second).toBe(first);
            const scripts = document.head.querySelectorAll('script[src="https://js.psp.example/sdk.js"]');
            expect(scripts).toHaveLength(1);
            const script = scripts[0] as HTMLScriptElement;
            expect(script.nonce).toBe('n0nce');
            expect(script.getAttribute('data-namespace')).toBe('psp');
            expect(script.hasAttribute('onload')).toBe(false);
            expect(context.cspNonce).toBe('n0nce');
            script.dispatchEvent(new Event('load'));
            await expect(first).resolves.toBeUndefined();
        });

        it('forgets a failed load so a retry adds the script again', async () => {
            const context = createCheckoutContext();
            const first = context.loadScript('https://js.psp.example/broken.js');
            document.head.querySelector<HTMLScriptElement>('script[src="https://js.psp.example/broken.js"]')!
                .dispatchEvent(new Event('error'));
            await expect(first).rejects.toThrow();
            expect(document.head.querySelector('script[src="https://js.psp.example/broken.js"]')).toBeNull();
            const retry = context.loadScript('https://js.psp.example/broken.js');
            expect(retry).not.toBe(first);
            expect(document.head.querySelectorAll('script[src="https://js.psp.example/broken.js"]')).toHaveLength(1);
        });
    });

    it('hands the payment calls to the pipeline and names the shipping extension', async () => {
        const pipeline: PaymentPipeline = {
            requestCheckoutValidation: vi.fn(() => Promise.resolve(true)),
            placeOrder: vi.fn(() => Promise.resolve({ status: 'placed' as const })),
            savePaymentInformation: vi.fn(() => Promise.resolve(true)),
            refreshTotals: vi.fn(() => Promise.resolve()),
            setError: vi.fn(),
        };
        store.isGuest.set(false);
        const payment = createPaymentContext({ phrases: {} }, pipeline);
        await expect(payment.placeOrder({ additional_data: { nonce: 'n' } })).resolves.toEqual({ status: 'placed' });
        expect(pipeline.placeOrder).toHaveBeenCalledWith({ additional_data: { nonce: 'n' } });
        payment.setError('Declined');
        expect(pipeline.setError).toHaveBeenCalledWith('Declined');
        expect(payment.cartPath()).toBe('carts/mine');
        expect(Object.isFrozen(payment)).toBe(true);

        const shipping = createShippingContext({ id: 'lockers' });
        expect(shipping.extensionId).toBe('lockers');
        expect(typeof shipping.snapshot().isSettling).toBe('boolean');
    });
});
