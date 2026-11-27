// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkError } from '../../api/client.js';
import { classifyError } from '../../api/error-kinds.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import {
    recaptchaCheckboxToken,
    recaptchaConfigFor,
    resetCaptchaStateForTests,
} from '../../store/captcha-state.js';
import type { RecaptchaConfig } from '../../types/captcha.js';
import type { CheckoutConfig } from '../../types/config.js';
import { t } from '../../utils/i18n.js';
import {
    executeRecaptcha,
    mountRecaptchaCheckbox,
    RecaptchaError,
    resetRecaptchaLoaderForTests,
    unmountRecaptchaCheckbox,
    type HyperionRecaptcha,
} from '../hyperion-recaptcha.js';

type Params = Record<string, unknown>;

function scripts(): HTMLScriptElement[] {
    return Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="recaptcha/api.js"]'));
}

function configure(recaptcha?: RecaptchaConfig): void {
    setCheckoutConfig({ hyperion: recaptcha ? { recaptcha } : {} } as unknown as CheckoutConfig);
}

/** A stand-in for Google's API: widgets are numbered in render order and keep their parameters. */
function fakeApi() {
    const rendered: Array<{ host: HTMLElement; params: Params }> = [];
    const responses = new Map<number, string>();
    const api = {
        ready: (cb: () => void) => cb(),
        execute: vi.fn<(target: string | number, options?: { action: string }) => Promise<string> | void>(),
        render: vi.fn((host: HTMLElement, params: Params) => {
            rendered.push({ host, params });
            return rendered.length - 1;
        }),
        reset: vi.fn((id?: number) => { if (id !== undefined) responses.delete(id); }),
        getResponse: vi.fn((id?: number) => responses.get(id ?? -1) ?? ''),
    };
    return { api, rendered, responses };
}

async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('checkout reCAPTCHA', () => {
    beforeEach(() => {
        resetRecaptchaLoaderForTests();
        resetCaptchaStateForTests();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        scripts().forEach((script) => script.remove());
        document.body.innerHTML = '';
        delete window.grecaptcha;
        resetRecaptchaLoaderForTests();
        resetCaptchaStateForTests();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('configuration', () => {
        it('reads one entry per action from hyperion.recaptcha and nothing else', () => {
            configure({
                place_order: { type: 'v3', siteKey: 'key-order', size: 'invisible' },
                coupon_code: { type: 'v2-invisible', siteKey: 'key-coupon' },
                customer_login: { type: 'v2-checkbox', siteKey: 'key-login' },
            });

            expect(recaptchaConfigFor('place_order')?.type).toBe('v3');
            expect(recaptchaConfigFor('coupon_code')?.siteKey).toBe('key-coupon');
            expect(recaptchaConfigFor('customer_login')?.type).toBe('v2-checkbox');
            expect(recaptchaConfigFor('braintree')).toBeNull();
        });

        it('ignores the keys of other providers', () => {
            setCheckoutConfig({
                recaptcha_for_place_order: { rendering: { sitekey: 'site-key-fixture' } },
            } as unknown as CheckoutConfig);

            expect(recaptchaConfigFor('place_order')).toBeNull();
        });

        it('resolves to null without loading anything when the action is not protected', async () => {
            configure({ place_order: { type: 'v3', siteKey: 'key-order' } });

            await expect(executeRecaptcha('coupon_code')).resolves.toBeNull();
            expect(scripts()).toHaveLength(0);
        });
    });

    describe('v3', () => {
        beforeEach(() => configure({ place_order: { type: 'v3', siteKey: 'key-order', hl: 'it' } }));

        it('loads the script for the site key and executes the action', async () => {
            const { api } = fakeApi();
            api.execute.mockResolvedValue('token-fixture');

            const pending = executeRecaptcha('place_order');
            expect(scripts()).toHaveLength(1);
            expect(scripts()[0]!.src).toBe('https://www.google.com/recaptcha/api.js?render=key-order&hl=it');
            window.grecaptcha = api;
            scripts()[0]!.dispatchEvent(new Event('load'));

            await expect(pending).resolves.toBe('token-fixture');
            expect(api.execute).toHaveBeenCalledWith('key-order', { action: 'place_order' });
            expect(api.render).not.toHaveBeenCalled();
        });

        it('a failed load rejects with the translated message and is not remembered', async () => {
            const first = executeRecaptcha('place_order');
            scripts()[0]!.dispatchEvent(new Event('error'));

            await expect(first).rejects.toThrow(t('Hyperion_Checkout::recaptcha_failed'));
            expect(scripts()).toHaveLength(0);

            const { api } = fakeApi();
            api.execute.mockResolvedValue('token-fixture');
            const second = executeRecaptcha('place_order');
            expect(scripts()).toHaveLength(1);
            window.grecaptcha = api;
            scripts()[0]!.dispatchEvent(new Event('load'));

            await expect(second).resolves.toBe('token-fixture');
        });

        it('a script that loads without the API is dropped so the next call can load it again', async () => {
            const first = executeRecaptcha('place_order');
            scripts()[0]!.dispatchEvent(new Event('load'));

            await expect(first).rejects.toMatchObject({ reason: 'failed' });
            expect(scripts()).toHaveLength(0);

            const { api } = fakeApi();
            api.execute.mockResolvedValue('second-token');
            const second = executeRecaptcha('place_order');
            window.grecaptcha = api;
            scripts()[0]!.dispatchEvent(new Event('load'));

            await expect(second).resolves.toBe('second-token');
        });

        it('loads the script deferred, with the CSP nonce of the page', async () => {
            const own = document.createElement('script');
            own.type = 'module';
            own.setAttribute('nonce', 'page-nonce');
            document.body.appendChild(own);
            try {
                void executeRecaptcha('place_order').catch(() => undefined);
                expect(scripts()[0]!.nonce).toBe('page-nonce');
                expect(scripts()[0]!.defer).toBe(true);
                expect(scripts()[0]!.async).toBe(true);
            } finally {
                own.remove();
            }
        });

        it('a script that does not answer in time is dropped so the next call loads it again', async () => {
            vi.useFakeTimers();
            try {
                const first = executeRecaptcha('place_order');
                const settled = expect(first).rejects.toMatchObject({ reason: 'failed' });
                await vi.advanceTimersByTimeAsync(15001);
                await settled;
                expect(scripts()).toHaveLength(0);

                const { api } = fakeApi();
                api.execute.mockResolvedValue('after-timeout');
                const second = executeRecaptcha('place_order');
                expect(scripts()).toHaveLength(1);
                window.grecaptcha = api;
                scripts()[0]!.dispatchEvent(new Event('load'));
                await expect(second).resolves.toBe('after-timeout');
            } finally {
                vi.useRealTimers();
            }
        });

        it('requests the script once for every later token', async () => {
            const { api } = fakeApi();
            api.execute.mockResolvedValue('token-fixture');
            const first = executeRecaptcha('place_order');
            window.grecaptcha = api;
            scripts()[0]!.dispatchEvent(new Event('load'));
            await first;

            await executeRecaptcha('place_order');

            expect(scripts()).toHaveLength(1);
            expect(api.execute).toHaveBeenCalledTimes(2);
        });

        it('mints through an explicitly rendered widget when another element loaded the API for explicit rendering', async () => {
            const foreign = document.createElement('script');
            foreign.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
            document.head.appendChild(foreign);
            const { api, rendered } = fakeApi();
            api.execute.mockImplementation((target) => {
                if (typeof target === 'string') return Promise.reject(new Error('Invalid site key or not loaded in api.js'));
                queueMicrotask(() => (rendered[target]!.params['callback'] as (token: string) => void)('widget-token'));
                return undefined;
            });
            window.grecaptcha = api;
            document.body.appendChild(document.createElement('hc-recaptcha-badge'));

            await expect(executeRecaptcha('place_order')).resolves.toBe('widget-token');

            expect(scripts()).toHaveLength(1);
            expect(api.execute).toHaveBeenCalledTimes(1);
            expect(api.execute).toHaveBeenCalledWith(0);
            expect(rendered[0]!.params).toMatchObject({ sitekey: 'key-order', size: 'invisible', action: 'place_order' });
            expect(rendered[0]!.host.closest('hc-recaptcha-badge')).not.toBeNull();
            expect(api.reset).toHaveBeenCalledWith(0);
        });

        it('mints through a widget when the page script was loaded for another site key', async () => {
            const foreign = document.createElement('script');
            foreign.src = 'https://www.google.com/recaptcha/api.js?render=another-key';
            document.head.appendChild(foreign);
            const { api, rendered } = fakeApi();
            api.execute.mockImplementation((target) => {
                queueMicrotask(() => (rendered[target as number]!.params['callback'] as (token: string) => void)('widget-token'));
            });
            window.grecaptcha = api;

            await expect(executeRecaptcha('place_order')).resolves.toBe('widget-token');
            expect(api.execute).toHaveBeenCalledWith(0);
        });

        it('waits for a script another element is still loading instead of adding a second one', async () => {
            const foreign = document.createElement('script');
            foreign.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
            document.head.appendChild(foreign);
            const { api, rendered } = fakeApi();
            api.execute.mockImplementation((target) => {
                queueMicrotask(() => (rendered[target as number]!.params['callback'] as (token: string) => void)('late-token'));
            });

            const pending = executeRecaptcha('place_order');
            expect(scripts()).toHaveLength(1);
            window.grecaptcha = api;
            foreign.dispatchEvent(new Event('load'));

            await expect(pending).resolves.toBe('late-token');
            expect(scripts()).toHaveLength(1);
        });
    });

    describe('v2 invisible', () => {
        beforeEach(() => configure({
            coupon_code: { type: 'v2-invisible', siteKey: 'key-coupon', badge: 'bottomright' },
            customer_login: { type: 'v2-invisible', siteKey: 'key-login' },
        }));

        function answering(api: ReturnType<typeof fakeApi>['api'], rendered: ReturnType<typeof fakeApi>['rendered']): void {
            api.execute.mockImplementation((target) => {
                const id = target as number;
                queueMicrotask(() => (rendered[id]!.params['callback'] as (token: string) => void)(`token-${id}-${api.execute.mock.calls.length}`));
            });
        }

        it('loads the explicit script, renders one widget per action and resets it after each token', async () => {
            const { api, rendered } = fakeApi();
            answering(api, rendered);
            const pending = executeRecaptcha('coupon_code');
            expect(scripts()[0]!.src).toBe('https://www.google.com/recaptcha/api.js?render=explicit');
            window.grecaptcha = api;
            scripts()[0]!.dispatchEvent(new Event('load'));

            await expect(pending).resolves.toBe('token-0-1');
            await expect(executeRecaptcha('coupon_code')).resolves.toBe('token-0-2');
            await expect(executeRecaptcha('customer_login')).resolves.toBe('token-1-3');

            expect(api.render).toHaveBeenCalledTimes(2);
            expect(rendered[0]!.params).toMatchObject({ sitekey: 'key-coupon', size: 'invisible', badge: 'bottomright' });
            expect(rendered[0]!.params).not.toHaveProperty('action');
            expect(rendered[1]!.params).toMatchObject({ sitekey: 'key-login', badge: 'inline' });
            expect(api.reset).toHaveBeenCalledTimes(3);
            expect(scripts()).toHaveLength(1);
        });

        it('a widget error rejects with the translated message', async () => {
            const { api, rendered } = fakeApi();
            api.execute.mockImplementation((target) => {
                queueMicrotask(() => (rendered[target as number]!.params['error-callback'] as () => void)());
            });
            window.grecaptcha = api;

            await expect(executeRecaptcha('coupon_code')).rejects.toThrow(t('Hyperion_Checkout::recaptcha_failed'));
        });

        it('a challenge nobody completes is given up', async () => {
            vi.useFakeTimers();
            const { api } = fakeApi();
            window.grecaptcha = api;

            const pending = executeRecaptcha('coupon_code');
            const outcome = expect(pending).rejects.toMatchObject({ reason: 'failed' });
            await vi.advanceTimersByTimeAsync(120000);

            await outcome;
            expect(api.reset).toHaveBeenCalledWith(0);
        });
    });

    describe('v2 checkbox', () => {
        let host: HTMLElement;

        beforeEach(() => {
            configure({ place_order: { type: 'v2-checkbox', siteKey: 'key-order', theme: 'dark', size: 'compact' } });
            host = document.createElement('div');
            document.body.appendChild(host);
        });

        it('renders a visible widget into the host of the form and keeps its token', async () => {
            const { api, rendered } = fakeApi();
            window.grecaptcha = api;

            await mountRecaptchaCheckbox('place_order', host);

            expect(rendered[0]!.host).toBe(host);
            expect(rendered[0]!.params).toMatchObject({ sitekey: 'key-order', size: 'compact', theme: 'dark' });
            expect(recaptchaCheckboxToken('place_order')).toBe('');

            (rendered[0]!.params['callback'] as (token: string) => void)('ticked');
            expect(recaptchaCheckboxToken('place_order')).toBe('ticked');

            (rendered[0]!.params['expired-callback'] as () => void)();
            expect(recaptchaCheckboxToken('place_order')).toBe('');
        });

        it('a missing token blocks with the translated message and focuses the widget', async () => {
            const { api } = fakeApi();
            window.grecaptcha = api;
            await mountRecaptchaCheckbox('place_order', host);

            await expect(executeRecaptcha('place_order')).rejects.toMatchObject({
                reason: 'required',
                message: t('Hyperion_Checkout::recaptcha_required'),
            });
            expect(document.activeElement).toBe(host);
            expect(api.reset).not.toHaveBeenCalled();
        });

        it('hands the token over once and resets the widget', async () => {
            const { api, rendered, responses } = fakeApi();
            window.grecaptcha = api;
            await mountRecaptchaCheckbox('place_order', host);
            responses.set(0, 'ticked');
            (rendered[0]!.params['callback'] as (token: string) => void)('ticked');

            await expect(executeRecaptcha('place_order')).resolves.toBe('ticked');

            expect(api.reset).toHaveBeenCalledWith(0);
            expect(recaptchaCheckboxToken('place_order')).toBe('');
            await expect(executeRecaptcha('place_order')).rejects.toMatchObject({ reason: 'required' });
        });

        it('a blocked script fails the mount, and the token request loads it again', async () => {
            const mount = mountRecaptchaCheckbox('place_order', host);
            scripts()[0]!.dispatchEvent(new Event('error'));
            await expect(mount).rejects.toThrow();

            const { api } = fakeApi();
            const pending = executeRecaptcha('place_order');
            await settle();
            window.grecaptcha = api;
            scripts()[0]!.dispatchEvent(new Event('load'));

            await expect(pending).rejects.toMatchObject({ reason: 'required' });
            expect(api.render).toHaveBeenCalledTimes(1);
        });

        it('fails when the form of the action is not on the page', async () => {
            window.grecaptcha = fakeApi().api;

            await expect(executeRecaptcha('place_order')).rejects.toMatchObject({ reason: 'failed' });
        });

        it('forgets the widget and its token when the form goes away', async () => {
            const { api, rendered } = fakeApi();
            window.grecaptcha = api;
            await mountRecaptchaCheckbox('place_order', host);
            (rendered[0]!.params['callback'] as (token: string) => void)('ticked');

            unmountRecaptchaCheckbox('place_order', host);

            expect(recaptchaCheckboxToken('place_order')).toBe('');
        });
    });

    describe('how a failure reads to the checkout', () => {
        it.each(['failed', 'required'] as const)(
            'a "%s" error keeps its translated message and is never taken for a lost answer',
            (reason) => {
                const error = new RecaptchaError(reason);

                for (const ctx of [
                    { path: 'guest-carts/masked-1/payment-information', method: 'POST' },
                    { path: 'carts/mine/coupons/SAVE10', method: 'PUT' },
                ]) {
                    const failure = classifyError(error, ctx);
                    expect(failure.message).toBe(error.message);
                    expect(['order-unknown', 'network', 'timeout', 'offline', 'session-expired', 'quote-gone']).not.toContain(failure.kind);
                }
                expect(error).not.toBeInstanceOf(NetworkError);
            }
        );
    });

    describe('<hc-recaptcha-badge>', () => {
        async function badge(): Promise<HyperionRecaptcha> {
            const el = document.createElement('hc-recaptcha-badge');
            document.body.appendChild(el);
            await el.updateComplete;
            return el;
        }

        it('renders nothing and loads nothing when no action is protected', async () => {
            configure();

            const el = await badge();

            expect(el.querySelector('p')).toBeNull();
            expect(scripts()).toHaveLength(0);
        });

        it.each(['place_order', 'coupon_code', 'customer_login', 'braintree'] as const)(
            'shows the attribution with both links when only %s is protected',
            async (action) => {
                configure({ [action]: { type: 'v3', siteKey: 'key' } });

                const el = await badge();

                const links = Array.from(el.querySelectorAll('a'));
                expect(links.map((a) => a.getAttribute('href'))).toEqual([
                    'https://policies.google.com/privacy',
                    'https://policies.google.com/terms',
                ]);
                expect(el.querySelector('p')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
                    'This site is protected by reCAPTCHA and the Google Privacy Policy and Terms of Service apply.'
                );
                expect(scripts()).toHaveLength(0);
            }
        );
    });
});
