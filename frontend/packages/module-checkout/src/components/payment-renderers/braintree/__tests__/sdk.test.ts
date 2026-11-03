// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    BRAINTREE_SDK_VERSION,
    BraintreeSdkLoadError,
    braintreeScriptUrl,
    loadBraintreeModule,
    loadScriptOnce,
    setScriptLoaderForTests,
} from '../sdk.js';

const CLIENT_URL = `https://js.braintreegateway.com/web/${BRAINTREE_SDK_VERSION}/js/client.min.js`;

describe('Braintree SDK loader', () => {
    afterEach(() => {
        setScriptLoaderForTests(null);
        delete window.braintree;
        document.head.querySelectorAll('script').forEach((el) => el.remove());
    });

    it('builds every script URL from the single pinned version', () => {
        expect(braintreeScriptUrl('client')).toBe(CLIENT_URL);
        for (const name of ['hosted-fields', 'data-collector', 'three-d-secure', 'paypal-checkout'] as const) {
            expect(braintreeScriptUrl(name)).toBe(
                `https://js.braintreegateway.com/web/${BRAINTREE_SDK_VERSION}/js/${name}.min.js`
            );
        }
    });

    it('requests a script once and shares the promise between callers', async () => {
        const create = vi.fn();
        const loader = vi.fn(async () => { window.braintree = { client: { create } }; });
        setScriptLoaderForTests(loader);

        const [first, second] = await Promise.all([
            loadBraintreeModule('client'),
            loadBraintreeModule('client'),
        ]);
        const third = await loadBraintreeModule('client');

        expect(loader).toHaveBeenCalledTimes(1);
        expect(loader).toHaveBeenCalledWith(CLIENT_URL);
        expect(first.create).toBe(create);
        expect(second).toBe(first);
        expect(third).toBe(first);
    });

    it('rejects when the script fails and retries on the next call', async () => {
        const loader = vi.fn()
            .mockRejectedValueOnce(new BraintreeSdkLoadError(CLIENT_URL))
            .mockImplementationOnce(async () => { window.braintree = { client: { create: vi.fn() } }; });
        setScriptLoaderForTests(loader);

        await expect(loadBraintreeModule('client')).rejects.toBeInstanceOf(BraintreeSdkLoadError);
        await expect(loadBraintreeModule('client')).resolves.toBeDefined();
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('rejects when the script loaded but did not register its module', async () => {
        setScriptLoaderForTests(vi.fn().mockResolvedValue(undefined));
        await expect(loadBraintreeModule('hosted-fields')).rejects.toBeInstanceOf(BraintreeSdkLoadError);
    });

    it('injects an async script tag and settles on its load event', async () => {
        const pending = loadScriptOnce(CLIENT_URL);
        const tag = document.head.querySelector<HTMLScriptElement>(`script[src="${CLIENT_URL}"]`);
        expect(tag).not.toBeNull();
        expect(tag?.async).toBe(true);
        tag?.dispatchEvent(new Event('load'));
        await expect(pending).resolves.toBeUndefined();
        expect(loadScriptOnce(CLIENT_URL)).toBe(pending);
        expect(document.head.querySelectorAll(`script[src="${CLIENT_URL}"]`)).toHaveLength(1);
    });

    it('removes the tag and rejects on a script error', async () => {
        const pending = loadScriptOnce(CLIENT_URL);
        document.head.querySelector(`script[src="${CLIENT_URL}"]`)?.dispatchEvent(new Event('error'));
        await expect(pending).rejects.toBeInstanceOf(BraintreeSdkLoadError);
        expect(document.head.querySelector(`script[src="${CLIENT_URL}"]`)).toBeNull();
    });
});
