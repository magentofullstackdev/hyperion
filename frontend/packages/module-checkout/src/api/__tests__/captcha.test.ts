// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import {
    captchaAnswer,
    captchaError,
    captchaForm,
    isCaptchaRequired,
    resetCaptchaStateForTests,
    seedCaptchaState,
    setCaptchaAnswer,
    setCaptchaError,
} from '../../store/captcha-state.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { loadCaptchaState, resetCaptchaLoaderForTests } from '../captcha.js';

const OFF = { isRequired: false, isCaseSensitive: true, imageHeight: 60, imageWidth: 230 };

function configure(sectionUrl: string): void {
    setCheckoutConfig({
        hyperion: {
            captcha: {
                refreshUrl: `${window.location.origin}/captcha/refresh/`,
                sectionUrl,
                forms: { user_login: OFF, sales_rule_coupon_request: OFF, payment_processing_request: OFF },
            },
        },
    } as unknown as CheckoutConfig);
}

function answer(body: unknown, ok = true): Response {
    return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('image CAPTCHA state', () => {
    let store: Store;
    let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

    beforeEach(() => {
        resetCaptchaStateForTests();
        resetCaptchaLoaderForTests();
        configure(`${window.location.origin}/customer/section/load/?sections=captcha`);
        store = createStore();
        setStoreForTests(store);
        fetchMock = vi.fn<typeof fetch>();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => vi.unstubAllGlobals());

    it('reads a form from the configuration until the store has it', () => {
        expect(captchaForm(store, 'user_login')).toEqual(OFF);
        expect(isCaptchaRequired(store, 'user_login')).toBe(false);

        seedCaptchaState({ user_login: { ...OFF, isRequired: true } });
        expect(isCaptchaRequired(store, 'user_login')).toBe(true);
    });

    it('asks the section of the storefront, as an AJAX request with the session cookie', async () => {
        fetchMock.mockResolvedValue(answer({ captcha: { user_login: { isRequired: true, timestamp: 1 } } }));

        expect(await loadCaptchaState()).toBe(true);

        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe(`${window.location.origin}/customer/section/load/?sections=captcha`);
        expect(init).toMatchObject({
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
    });

    it('a form that became required keeps the image settings of the configuration', async () => {
        fetchMock.mockResolvedValue(answer({
            captcha: {
                user_login: { isRequired: true, timestamp: 1 },
                sales_rule_coupon_request: { isRequired: false, timestamp: 1 },
            },
        }));

        await loadCaptchaState();

        expect(store.captcha.get().user_login).toEqual({ ...OFF, isRequired: true });
        expect(isCaptchaRequired(store, 'sales_rule_coupon_request')).toBe(false);
        expect(isCaptchaRequired(store, 'payment_processing_request')).toBe(false);
    });

    it('a form that stopped requiring an answer loses the typed one and its message', async () => {
        seedCaptchaState({ user_login: { ...OFF, isRequired: true } });
        setCaptchaAnswer('user_login', 'aaaa');
        setCaptchaError('user_login', 'Incorrect CAPTCHA');
        expect(captchaAnswer(store, 'user_login')).toBe('aaaa');
        fetchMock.mockResolvedValue(answer({ captcha: { user_login: { isRequired: false, timestamp: 2 } } }));

        await loadCaptchaState();

        expect(store.captcha.get().user_login).toEqual(OFF);
        expect(captchaError('user_login')).toBeNull();
    });

    it('keeps the typed answer of a form that is still required', async () => {
        seedCaptchaState({ user_login: { ...OFF, isRequired: true } });
        setCaptchaAnswer('user_login', 'aaaa');
        fetchMock.mockResolvedValue(answer({ captcha: { user_login: { isRequired: true, timestamp: 2 } } }));

        await loadCaptchaState();

        expect(captchaAnswer(store, 'user_login')).toBe('aaaa');
    });

    it.each([
        ['a failed request', () => Promise.reject(new TypeError('Failed to fetch'))],
        ['an error status', () => Promise.resolve(answer({}, false))],
        ['a body without the section', () => Promise.resolve(answer({ cart: {} }))],
        ['a body that is not JSON', () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('bad')) } as unknown as Response)],
    ])('%s leaves the forms as they were and never rejects', async (_name, respond) => {
        seedCaptchaState({ user_login: { ...OFF, isRequired: true } });
        fetchMock.mockImplementation(respond);

        expect(await loadCaptchaState()).toBe(false);
        expect(isCaptchaRequired(store, 'user_login')).toBe(true);
    });

    it('never sends the session to another origin', async () => {
        configure('https://elsewhere.example/customer/section/load/?sections=captcha');

        expect(await loadCaptchaState()).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does nothing without a configuration', async () => {
        setCheckoutConfig({} as unknown as CheckoutConfig);

        expect(await loadCaptchaState()).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an older answer that arrives after a newer one is dropped', async () => {
        let releaseFirst: (res: Response) => void = () => undefined;
        fetchMock
            .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseFirst = resolve; }))
            .mockResolvedValueOnce(answer({ captcha: { user_login: { isRequired: true, timestamp: 2 } } }));

        const first = loadCaptchaState();
        expect(await loadCaptchaState()).toBe(true);
        releaseFirst(answer({ captcha: { user_login: { isRequired: false, timestamp: 1 } } }));

        expect(await first).toBe(false);
        expect(isCaptchaRequired(store, 'user_login')).toBe(true);
    });
});
