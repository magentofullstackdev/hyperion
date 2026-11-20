// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CAPTCHA_CHANGE_EVENT, CAPTCHA_REFRESH_ERROR_EVENT, CaptchaField } from '../captcha-field.js';

const REFRESH_URL = 'https://shop.test/captcha/refresh/';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockRefresh(...sources: string[]): ReturnType<typeof vi.spyOn> {
    const spy = vi.spyOn(globalThis, 'fetch');
    sources.forEach((imgSrc) => spy.mockResolvedValueOnce(jsonResponse({ imgSrc })));
    return spy;
}

async function mount(attributes: Record<string, string> = {}): Promise<CaptchaField> {
    const el = document.createElement('hc-captcha');
    el.setAttribute('form-id', 'user_login');
    el.setAttribute('refresh-url', REFRESH_URL);
    el.setAttribute('image-width', '200');
    el.setAttribute('image-height', '50');
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

/** Let the refresh started by the first render (or by a click) apply its answer. */
async function settle(el: CaptchaField): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
}

function image(el: CaptchaField): HTMLImageElement {
    return el.querySelector<HTMLImageElement>('img')!;
}

function input(el: CaptchaField): HTMLInputElement {
    return el.querySelector<HTMLInputElement>('input')!;
}

function reload(el: CaptchaField): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('button')!;
}

function type(el: CaptchaField, text: string): void {
    input(el).value = text;
    input(el).dispatchEvent(new Event('input', { bubbles: true }));
}

describe('<hc-captcha>', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('renders the field in the light DOM with the image box reserved', async () => {
        const fetchSpy = mockRefresh();
        const el = await mount({
            'image-src': '/media/captcha/first.png',
            required: '',
            'case-sensitive': '',
            label: 'Type the code',
            'reload-label': 'New code',
            'case-note': 'Mind the case.',
        });

        expect(el.shadowRoot).toBeNull();
        expect(image(el).getAttribute('src')).toBe('/media/captcha/first.png');
        expect(image(el).getAttribute('width')).toBe('200');
        expect(image(el).getAttribute('height')).toBe('50');
        expect(image(el).getAttribute('alt')).toBe('Type the code');
        expect(el.querySelector('label')!.textContent).toContain('Type the code');
        expect(el.querySelector('label')!.htmlFor).toBe(input(el).id);
        expect(input(el).name).toBe('captcha[user_login]');
        expect(input(el).required).toBe(true);
        expect(input(el).getAttribute('autocomplete')).toBe('off');
        expect(input(el).getAttribute('autocapitalize')).toBe('off');
        expect(input(el).getAttribute('spellcheck')).toBe('false');
        expect(reload(el).type).toBe('button');
        expect(reload(el).textContent!.trim()).toBe('New code');
        expect(el.textContent).toContain('Mind the case.');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('asks for an image when it is rendered without one, with the request core expects', async () => {
        const fetchSpy = mockRefresh('/media/captcha/fresh.png');
        const el = await mount();

        expect(image(el).hasAttribute('src')).toBe(false);
        expect(image(el).getAttribute('width')).toBe('200');
        expect(image(el).getAttribute('height')).toBe('50');
        await settle(el);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(REFRESH_URL);
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('same-origin');
        expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('XMLHttpRequest');
        expect(init.body).toBeInstanceOf(URLSearchParams);
        expect(String(init.body)).toBe('formId=user_login');
        expect(image(el).getAttribute('src')).toBe('/media/captcha/fresh.png');
    });

    it('exposes the typed value and reports every change', async () => {
        mockRefresh();
        const el = await mount({ 'image-src': '/media/captcha/first.png' });
        const changes: unknown[] = [];
        document.body.addEventListener(CAPTCHA_CHANGE_EVENT, (event) => {
            changes.push((event as CustomEvent).detail);
            expect(event.composed).toBe(true);
        });

        expect(el.value).toBe('');
        type(el, 'ab12');

        expect(el.value).toBe('ab12');
        expect(changes).toEqual([{ formId: 'user_login', value: 'ab12' }]);

        el.clear();
        expect(el.value).toBe('');
        expect(changes).toEqual([
            { formId: 'user_login', value: 'ab12' },
            { formId: 'user_login', value: '' },
        ]);

        el.clear();
        expect(changes).toHaveLength(2);
    });

    it('a refresh after a refused attempt replaces the image and empties the input', async () => {
        const fetchSpy = mockRefresh('/media/captcha/second.png');
        const el = await mount({ 'image-src': '/media/captcha/first.png' });
        type(el, 'wrong');
        const changes: unknown[] = [];
        el.addEventListener(CAPTCHA_CHANGE_EVENT, (event) => changes.push((event as CustomEvent).detail));

        await expect(el.refresh()).resolves.toBe(true);
        await el.updateComplete;

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(image(el).getAttribute('src')).toBe('/media/captcha/second.png');
        expect(el.value).toBe('');
        expect(changes).toEqual([{ formId: 'user_login', value: '' }]);
    });

    it('the Reload button asks for a new image, stays focusable and ignores clicks while one loads', async () => {
        let answer: (response: Response) => void = () => {};
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
            new Promise<Response>((resolve) => { answer = resolve; }),
        );
        const el = await mount({ 'image-src': '/media/captcha/first.png' });

        reload(el).click();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(reload(el).getAttribute('aria-disabled')).toBe('true');
        expect(reload(el).disabled).toBe(false);

        reload(el).click();
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        answer(jsonResponse({ imgSrc: '/media/captcha/second.png' }));
        await settle(el);

        expect(image(el).getAttribute('src')).toBe('/media/captcha/second.png');
        expect(reload(el).hasAttribute('aria-disabled')).toBe(false);
    });

    it('drops the answer of a refresh a newer one superseded', async () => {
        const answers: Array<(response: Response) => void> = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(
            () => new Promise<Response>((resolve) => { answers.push(resolve); }),
        );
        const el = await mount({ 'image-src': '/media/captcha/first.png' });

        const older = el.refresh();
        const newer = el.refresh();
        answers[1]!(jsonResponse({ imgSrc: '/media/captcha/newer.png' }));
        await expect(newer).resolves.toBe(true);
        answers[0]!(jsonResponse({ imgSrc: '/media/captcha/older.png' }));
        await expect(older).resolves.toBe(false);
        await el.updateComplete;

        expect(image(el).getAttribute('src')).toBe('/media/captcha/newer.png');
        expect(reload(el).hasAttribute('aria-disabled')).toBe(false);
    });

    it('keeps the image and the typed word and reports it when no new image arrives', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ message: 'error' }, 500));
        const el = await mount({ 'image-src': '/media/captcha/first.png' });
        type(el, 'ab12');
        const failures: unknown[] = [];
        document.body.addEventListener(CAPTCHA_REFRESH_ERROR_EVENT, (event) => {
            failures.push((event as CustomEvent).detail);
        });

        await expect(el.refresh()).resolves.toBe(false);

        expect(failures).toEqual([{ formId: 'user_login' }]);
        expect(image(el).getAttribute('src')).toBe('/media/captcha/first.png');
        expect(el.value).toBe('ab12');
        expect(reload(el).hasAttribute('aria-disabled')).toBe(false);
    });

    it('shows a refusal next to the input and marks it invalid until the message is cleared', async () => {
        mockRefresh();
        const el = await mount({ 'image-src': '/media/captcha/first.png' });
        expect(input(el).hasAttribute('aria-invalid')).toBe(false);

        el.error = 'Incorrect CAPTCHA';
        await el.updateComplete;

        const message = el.querySelector<HTMLElement>('[data-hyperion-captcha-error]')!;
        expect(message.textContent).toBe('Incorrect CAPTCHA');
        expect(input(el).getAttribute('aria-invalid')).toBe('true');
        expect(input(el).getAttribute('aria-describedby')).toBe(message.id);

        el.error = '';
        await el.updateComplete;

        expect(el.querySelector('[data-hyperion-captcha-error]')).toBeNull();
        expect(input(el).hasAttribute('aria-invalid')).toBe(false);
        expect(input(el).hasAttribute('aria-describedby')).toBe(false);
    });

    it('focus() goes to the input', async () => {
        mockRefresh();
        const el = await mount({ 'image-src': '/media/captcha/first.png' });

        el.focus();

        expect(document.activeElement).toBe(input(el));
    });
});
