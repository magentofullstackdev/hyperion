// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// form-key -- cookie provider, hidden input injection and data-post forms.

import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import {
    buildDataPostForm,
    ensureFormKey,
    injectFormKeyInputs,
    isSameOriginPostForm,
    parseDataPost,
    readFormKeyCookie,
    submitDataPost,
    writeFormKeyCookie,
} from '../form-key.js';

function clearFormKeyCookie() {
    document.cookie = 'form_key=; max-age=0; path=/';
}

describe('form_key cookie', () => {
    beforeEach(clearFormKeyCookie);
    afterEach(() => {
        clearFormKeyCookie();
        document.body.innerHTML = '';
    });

    test('ensureFormKey mints a 16 character key and stores it in the cookie', () => {
        expect(readFormKeyCookie()).toBeNull();
        const key = ensureFormKey();
        expect(key).toMatch(/^[0-9A-Za-z]{16}$/);
        expect(readFormKeyCookie()).toBe(key);
        expect(ensureFormKey()).toBe(key);
    });

    test('writeFormKeyCookie is read back by readFormKeyCookie', () => {
        writeFormKeyCookie('abcdefghijklmnop');
        expect(readFormKeyCookie()).toBe('abcdefghijklmnop');
    });

    test('ensureFormKey syncs existing inputs and injects missing ones', () => {
        writeFormKeyCookie('LIVEKEY000000000');
        document.body.innerHTML = `
            <form id="a" method="post" action="/customer/account/loginPost/">
                <input name="form_key" value="stale">
            </form>
            <form id="b" method="post" action="/customer/account/confirmation/"></form>
            <form id="c" method="POST"></form>
            <form id="d" method="get" action="/catalogsearch/result/"></form>
            <form id="e" method="post" action="https://www.paypal.com/cgi-bin/webscr"></form>
        `;
        ensureFormKey();
        expect(document.querySelector('#a input[name="form_key"]').value).toBe('LIVEKEY000000000');
        expect(document.querySelectorAll('#a input[name="form_key"]').length).toBe(1);
        const injected = document.querySelector('#b input[name="form_key"]');
        expect(injected).not.toBeNull();
        expect(injected.type).toBe('hidden');
        expect(injected.value).toBe('LIVEKEY000000000');
        expect(document.querySelector('#c input[name="form_key"]').value).toBe('LIVEKEY000000000');
        expect(document.querySelector('#d input[name="form_key"]')).toBeNull();
        expect(document.querySelector('#e input[name="form_key"]')).toBeNull();
    });

    test('injectFormKeyInputs is idempotent and scoped to the given root', () => {
        document.body.innerHTML = `
            <div id="swapped"><form method="post"></form></div>
            <form id="outside" method="post"></form>
        `;
        const root = document.getElementById('swapped');
        expect(injectFormKeyInputs(root, 'k1')).toBe(1);
        expect(injectFormKeyInputs(root, 'k1')).toBe(0);
        expect(document.querySelector('#outside input[name="form_key"]')).toBeNull();
    });

    test('isSameOriginPostForm', () => {
        const make = (method, action) => {
            const form = document.createElement('form');
            if (method) form.setAttribute('method', method);
            if (action !== undefined) form.setAttribute('action', action);
            return form;
        };
        expect(isSameOriginPostForm(make('post', '/x'))).toBe(true);
        expect(isSameOriginPostForm(make('post', ''))).toBe(true);
        expect(isSameOriginPostForm(make('post'))).toBe(true);
        expect(isSameOriginPostForm(make('post', location.origin + '/y'))).toBe(true);
        expect(isSameOriginPostForm(make('post', 'https://example.org/y'))).toBe(false);
        expect(isSameOriginPostForm(make('get', '/x'))).toBe(false);
        expect(isSameOriginPostForm(make(null, '/x'))).toBe(false);
        expect(isSameOriginPostForm(document.createElement('div'))).toBe(false);
    });
});

describe('data-post', () => {
    beforeEach(() => {
        writeFormKeyCookie('LIVEKEY000000000');
        ensureFormKey();
    });
    afterEach(() => {
        clearFormKeyCookie();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    test('parseDataPost accepts the PostHelper shape only', () => {
        expect(parseDataPost('{"action":"https://shop.test/sales/order/reorder/","data":{"order_id":"7","uenc":"aHR0"}}'))
            .toEqual({ action: 'https://shop.test/sales/order/reorder/', data: { order_id: '7', uenc: 'aHR0' }, files: undefined });
        expect(parseDataPost('{"action":"/x"}')).toEqual({ action: '/x', data: {}, files: undefined });
        expect(parseDataPost('')).toBeNull();
        expect(parseDataPost(null)).toBeNull();
        expect(parseDataPost('not json')).toBeNull();
        expect(parseDataPost('{"data":{}}')).toBeNull();
    });

    test('buildDataPostForm posts every data entry plus the form key', () => {
        const form = buildDataPostForm({ action: '/sales/order/reorder/', data: { order_id: 7, uenc: 'aHR0' } }, 'KEY');
        expect(form.method).toBe('post');
        expect(form.getAttribute('action')).toBe('/sales/order/reorder/');
        expect(form.hidden).toBe(true);
        const entries = Array.from(form.querySelectorAll('input')).map((i) => [i.name, i.value, i.type]);
        expect(entries).toEqual([
            ['order_id', '7', 'hidden'],
            ['uenc', 'aHR0', 'hidden'],
            ['form_key', 'KEY', 'hidden'],
        ]);
    });

    test('submitDataPost appends the form to the body and submits it', async () => {
        const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
        const ok = await submitDataPost({ action: '/sales/order/reorder/', data: { order_id: '7' } });
        expect(ok).toBe(true);
        expect(submit).toHaveBeenCalledTimes(1);
        const form = document.body.querySelector('form');
        expect(form.querySelector('input[name="form_key"]').value).toBe('LIVEKEY000000000');
        expect(form.querySelector('input[name="order_id"]').value).toBe('7');
    });

    test('a confirmation payload asks first and submits only on yes', async () => {
        const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
        const params = {
            action: '/customer/address/delete/',
            data: { id: '3', confirmation: true, confirmationMessage: 'Delete this address?' },
        };
        const no = vi.fn(() => Promise.resolve(false));
        expect(await submitDataPost(params, no)).toBe(false);
        expect(no).toHaveBeenCalledWith('Delete this address?');
        expect(submit).not.toHaveBeenCalled();

        const yes = vi.fn(() => true);
        expect(await submitDataPost(params, yes)).toBe(true);
        expect(submit).toHaveBeenCalledTimes(1);
        expect(document.body.querySelector('form input[name="confirmation"]').value).toBe('true');
    });
});
