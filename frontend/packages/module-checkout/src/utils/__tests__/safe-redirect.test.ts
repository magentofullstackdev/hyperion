// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, it, expect, vi } from 'vitest';

vi.mock('../navigate.js', () => ({ navigateTo: vi.fn() }));

import { navigateAfterOrder, resolveAllowedUrl } from '../after-order.js';
import { navigateTo } from '../navigate.js';
import { decideRedirectTarget, resolveSameOriginUrl } from '../safe-redirect.js';

const FALLBACK = '/checkout/onepage/success';
// Whatever origin the jsdom harness runs on -- derive at runtime so the
// tests don't need a specific harness URL.
const ORIGIN = window.location.origin;

describe('decideRedirectTarget', () => {
    it('passes through a same-origin absolute URL', () => {
        expect(decideRedirectTarget(`${ORIGIN}/checkout/onepage/success`))
            .toBe(`${ORIGIN}/checkout/onepage/success`);
    });

    it('passes through a same-origin path', () => {
        expect(decideRedirectTarget('/checkout/onepage/success'))
            .toBe(`${ORIGIN}/checkout/onepage/success`);
    });

    it('falls back when the target is cross-origin', () => {
        expect(decideRedirectTarget('https://evil.com/phish')).toBe(FALLBACK);
    });

    it('falls back on a scheme-relative URL pointing off-origin', () => {
        expect(decideRedirectTarget('//evil.com/phish')).toBe(FALLBACK);
    });

    it('falls back on a javascript: URL', () => {
        expect(decideRedirectTarget('javascript:alert(1)')).toBe(FALLBACK);
    });

    it('falls back on a data: URL', () => {
        expect(decideRedirectTarget('data:text/html,<script>alert(1)</script>'))
            .toBe(FALLBACK);
    });

    it('falls back on malformed input', () => {
        expect(decideRedirectTarget('https://[bad-host', '/elsewhere'))
            .toBe('/elsewhere');
    });

    it('honors the fallback override', () => {
        expect(decideRedirectTarget('https://evil.com/x', '/cart')).toBe('/cart');
    });
});

describe('resolveAllowedUrl', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts a same-origin URL, absolute or relative', () => {
        expect(resolveAllowedUrl('/psp/redirect')).toBe(`${ORIGIN}/psp/redirect`);
        expect(resolveAllowedUrl(`${ORIGIN}/psp/redirect?x=1`)).toBe(`${ORIGIN}/psp/redirect?x=1`);
    });

    it('accepts https on a listed host, whatever its case', () => {
        expect(resolveAllowedUrl('https://Pay.Vendor-Psp.example/start?id=1', ['pay.vendor-psp.example']))
            .toBe('https://pay.vendor-psp.example/start?id=1');
    });

    it('refuses another host, plain http on a listed host, credentials and other schemes, and logs the host', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(resolveAllowedUrl('https://evil.example/', ['pay.vendor-psp.example'])).toBeNull();
        expect(error.mock.calls[0]?.[0]).toContain('evil.example');
        expect(resolveAllowedUrl('http://pay.vendor-psp.example/', ['pay.vendor-psp.example'])).toBeNull();
        expect(resolveAllowedUrl('https://user:pass@pay.vendor-psp.example/', ['pay.vendor-psp.example'])).toBeNull();
        expect(resolveAllowedUrl('javascript:alert(1)', ['pay.vendor-psp.example'])).toBeNull();
        expect(resolveAllowedUrl(42)).toBeNull();
        expect(resolveAllowedUrl('')).toBeNull();
    });

    it('a same-origin check alone answers null for any other origin', () => {
        expect(resolveSameOriginUrl('https://pay.vendor-psp.example/')).toBeNull();
    });
});

describe('navigateAfterOrder', () => {
    const SUCCESS = `${ORIGIN}/checkout/onepage/success/`;
    const ENTRY = { redirectHosts: ['pay.vendor-psp.example'] };

    afterEach(() => {
        vi.mocked(navigateTo).mockClear();
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('continues on the success page without an answer or with success', () => {
        navigateAfterOrder(undefined, ENTRY, SUCCESS);
        navigateAfterOrder({ action: 'success' }, ENTRY, SUCCESS);
        expect(vi.mocked(navigateTo).mock.calls).toEqual([[SUCCESS], [SUCCESS]]);
    });

    it('follows a redirect under the host rule and falls back to the success page otherwise', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        navigateAfterOrder({ action: 'redirect', url: 'https://pay.vendor-psp.example/3ds' }, ENTRY, SUCCESS);
        navigateAfterOrder({ action: 'redirect', url: 'https://evil.example/' }, ENTRY, SUCCESS);
        expect(vi.mocked(navigateTo).mock.calls).toEqual([['https://pay.vendor-psp.example/3ds'], [SUCCESS]]);
    });

    it('posts a form built with DOM calls to an allowed host', () => {
        const submitted: HTMLFormElement[] = [];
        vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(function (this: HTMLFormElement) {
            submitted.push(this);
        });
        navigateAfterOrder({
            action: 'post',
            url: 'https://pay.vendor-psp.example/post',
            fields: { PaReq: 'abc<"', MD: '42' },
        }, ENTRY, SUCCESS);

        expect(submitted).toHaveLength(1);
        const form = submitted[0]!;
        expect(form.method).toBe('post');
        expect(form.action).toBe('https://pay.vendor-psp.example/post');
        const inputs = Array.from(form.querySelectorAll('input'));
        expect(inputs.map((input) => [input.type, input.name, input.value])).toEqual([
            ['hidden', 'PaReq', 'abc<"'],
            ['hidden', 'MD', '42'],
        ]);
        expect(navigateTo).not.toHaveBeenCalled();
    });

    it('a post to a host the entry does not list continues on the success page', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        navigateAfterOrder({ action: 'post', url: 'https://evil.example/post', fields: {} }, ENTRY, SUCCESS);
        expect(navigateTo).toHaveBeenCalledWith(SUCCESS);
        expect(document.querySelector('form')).toBeNull();
    });

    it('an unknown action continues on the success page and is logged', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        navigateAfterOrder({ action: 'teleport' } as never, ENTRY, SUCCESS);
        expect(navigateTo).toHaveBeenCalledWith(SUCCESS);
        expect(error).toHaveBeenCalled();
    });

    it('a cross-origin success URL from the server falls back to the canonical path', () => {
        navigateAfterOrder(undefined, null, 'https://evil.example/success');
        expect(navigateTo).toHaveBeenCalledWith(FALLBACK);
    });
});
