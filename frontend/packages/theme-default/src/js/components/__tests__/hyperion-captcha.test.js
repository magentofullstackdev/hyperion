// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-captcha -- drives the server-rendered image CAPTCHA field it
// wraps (new image on Reload, single use word) and renders the field
// itself when it is empty.

import { afterEach, describe, test, expect, vi } from 'vitest';
import '../hyperion-captcha.js';
import { mount } from './helpers.js';

const REFRESH_URL = 'https://shop.test/captcha/refresh/';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serverMarkup({ src = '/media/captcha/first.png' } = {}) {
    return `
        <div class="space-y-2">
            <label for="captcha_user_login">Please type the letters and numbers below</label>
            <div>
                <img ${src ? `src="${src}"` : ''} width="200" height="50" alt="Please type the letters and numbers below"
                     data-hyperion-captcha-image>
                <button type="button" data-hyperion-captcha-reload>Reload captcha</button>
            </div>
            <input type="text" id="captcha_user_login" name="captcha[user_login]" required
                   data-hyperion-captcha-input>
            <p>Attention: Captcha is case sensitive.</p>
        </div>
    `;
}

function wrapped(options) {
    const el = document.createElement('hyperion-captcha');
    el.setAttribute('form-id', 'user_login');
    el.setAttribute('refresh-url', REFRESH_URL);
    el.innerHTML = serverMarkup(options);
    return el;
}

async function settle(el) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
}

describe('hyperion-captcha', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('adopts the server markup without adding or moving anything', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const el = wrapped();
        const before = el.innerHTML;

        await mount(el);

        expect(el.shadowRoot).toBeNull();
        expect(el.querySelectorAll('img')).toHaveLength(1);
        expect(el.querySelectorAll('input')).toHaveLength(1);
        expect(el.querySelectorAll('button')).toHaveLength(1);
        expect(el.innerHTML.replace(/<!--.*?-->/g, '').trim()).toBe(before.trim());
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test('the answer stays a field of the surrounding form', async () => {
        vi.spyOn(globalThis, 'fetch');
        const form = document.createElement('form');
        const el = wrapped();
        form.appendChild(el);
        document.body.appendChild(form);
        await el.updateComplete;

        el.querySelector('input').value = 'ab12';

        expect(el.value).toBe('ab12');
        expect(new FormData(form).get('captcha[user_login]')).toBe('ab12');
    });

    test('Reload posts the form id to the refresh URL, swaps the image and empties the input', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ imgSrc: '/media/captcha/second.png' }));
        const el = await mount(wrapped());
        const input = el.querySelector('input');
        input.value = 'wrong';
        const changes = [];
        document.body.addEventListener('hyperion:captcha-change', (event) => changes.push(event.detail));

        el.querySelector('[data-hyperion-captcha-reload]').click();
        expect(el.querySelector('[data-hyperion-captcha-reload]').getAttribute('aria-disabled')).toBe('true');
        await settle(el);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe(REFRESH_URL);
        expect(init.method).toBe('POST');
        expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
        expect(String(init.body)).toBe('formId=user_login');
        expect(el.querySelector('img').getAttribute('src')).toBe('/media/captcha/second.png');
        expect(input.value).toBe('');
        expect(changes).toEqual([{ formId: 'user_login', value: '' }]);
        expect(el.querySelector('[data-hyperion-captcha-reload]').hasAttribute('aria-disabled')).toBe(false);
    });

    test('typing reports the value', async () => {
        vi.spyOn(globalThis, 'fetch');
        const el = await mount(wrapped());
        const changes = [];
        el.addEventListener('hyperion:captcha-change', (event) => changes.push(event.detail));

        el.querySelector('input').value = 'ab12';
        el.querySelector('input').dispatchEvent(new Event('input', { bubbles: true }));

        expect(changes).toEqual([{ formId: 'user_login', value: 'ab12' }]);
    });

    test('an adopted image without a source is loaded at once', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ imgSrc: '/media/captcha/fresh.png' }));
        const el = await mount(wrapped({ src: '' }));
        await settle(el);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(el.querySelector('img').getAttribute('src')).toBe('/media/captcha/fresh.png');
    });

    test('a failed reload keeps the image and the typed word', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
        const el = await mount(wrapped());
        el.querySelector('input').value = 'ab12';
        const failures = [];
        el.addEventListener('hyperion:captcha-refresh-error', (event) => failures.push(event.detail));

        await expect(el.refresh()).resolves.toBe(false);

        expect(failures).toEqual([{ formId: 'user_login' }]);
        expect(el.querySelector('img').getAttribute('src')).toBe('/media/captcha/first.png');
        expect(el.value).toBe('ab12');
    });

    test('the error attribute adds one message after the adopted input and removes its marks when cleared', async () => {
        vi.spyOn(globalThis, 'fetch');
        const el = await mount(wrapped());
        const input = el.querySelector('input');

        el.setAttribute('error', 'Incorrect CAPTCHA');
        await el.updateComplete;

        const message = el.querySelector('[data-hyperion-captcha-error]');
        expect(message.textContent).toBe('Incorrect CAPTCHA');
        expect(input.nextElementSibling).toBe(message);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe(message.id);

        el.setAttribute('error', 'Please provide CAPTCHA code and try again');
        await el.updateComplete;
        expect(el.querySelectorAll('[data-hyperion-captcha-error]')).toHaveLength(1);
        expect(message.textContent).toBe('Please provide CAPTCHA code and try again');

        el.setAttribute('error', '');
        await el.updateComplete;
        expect(message.hidden).toBe(true);
        expect(input.hasAttribute('aria-invalid')).toBe(false);
        expect(input.hasAttribute('aria-describedby')).toBe(false);
    });

    test('empty, it renders the field from its attributes with the image box reserved', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const el = document.createElement('hyperion-captcha');
        el.setAttribute('form-id', 'sales_rule_coupon_request');
        el.setAttribute('refresh-url', REFRESH_URL);
        el.setAttribute('image-src', '/media/captcha/first.png');
        el.setAttribute('image-width', '200');
        el.setAttribute('image-height', '50');
        el.setAttribute('label', 'Type the code');
        el.setAttribute('reload-label', 'New code');
        el.setAttribute('required', '');
        await mount(el);

        const image = el.querySelector('img');
        const input = el.querySelector('input');
        expect(image.getAttribute('width')).toBe('200');
        expect(image.getAttribute('height')).toBe('50');
        expect(image.getAttribute('alt')).toBe('Type the code');
        expect(input.name).toBe('captcha[sales_rule_coupon_request]');
        expect(input.required).toBe(true);
        expect(el.querySelector('label').htmlFor).toBe(input.id);
        expect(el.querySelector('button').textContent.trim()).toBe('New code');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
