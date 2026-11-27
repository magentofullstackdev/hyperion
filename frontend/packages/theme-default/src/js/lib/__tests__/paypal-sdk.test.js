// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// paypal-sdk -- one script per page, never requested with the page itself.

import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import {
    loadPaypalSdk,
    resetPaypalSdk,
    loadScript,
    resetScripts,
    cspNonce,
    whenWanted,
    notify,
    drainMessages,
    readCookie,
} from '../paypal-sdk.js';
import { whenWanted as engagementWhenWanted } from '../engagement.js';
import {
    interceptSdkScripts,
    sdkScripts,
    finishSdkLoad,
} from '../../components/__tests__/paypal-helpers.js';

const URL_A = 'https://www.paypal.com/sdk/js?client-id=a&components=messages%2Cbuttons';

describe('paypal-sdk loader', () => {
    let scripts;
    beforeEach(() => {
        resetPaypalSdk();
        scripts = interceptSdkScripts();
    });
    afterEach(() => {
        resetPaypalSdk();
        scripts.restore();
        delete window.paypal;
        vi.restoreAllMocks();
    });

    test('appends one script with the data attributes and resolves with window.paypal', async () => {
        const promise = loadPaypalSdk(URL_A, {
            'data-partner-attribution-id': 'Magento_2_Community',
            'data-csp-nonce': 'abc',
            onload: 'alert(1)',
            'data-empty': '',
        });
        const [script] = sdkScripts();
        expect(sdkScripts()).toHaveLength(1);
        expect(script.getAttribute('src')).toBe(URL_A);
        expect(script.getAttribute('data-partner-attribution-id')).toBe('Magento_2_Community');
        expect(script.getAttribute('data-csp-nonce')).toBe('abc');
        expect(script.hasAttribute('onload')).toBe(false);
        expect(script.hasAttribute('data-empty')).toBe(false);

        const paypal = finishSdkLoad();
        await expect(promise).resolves.toBe(paypal);
    });

    test('shares the script between callers, also when the URL differs', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const first = loadPaypalSdk(URL_A);
        const second = loadPaypalSdk(URL_A);
        const third = loadPaypalSdk(URL_A + '&locale=it_IT');
        expect(sdkScripts()).toHaveLength(1);
        const paypal = finishSdkLoad();
        await expect(Promise.all([first, second, third])).resolves.toEqual([paypal, paypal, paypal]);
    });

    test('rejects without a URL and can retry after a network failure', async () => {
        await expect(loadPaypalSdk('')).rejects.toThrow();
        const failed = loadPaypalSdk(URL_A);
        sdkScripts()[0].onerror();
        await expect(failed).rejects.toThrow('failed to load');
        expect(sdkScripts()).toHaveLength(0);

        const retry = loadPaypalSdk(URL_A);
        expect(sdkScripts()).toHaveLength(1);
        const paypal = finishSdkLoad();
        await expect(retry).resolves.toBe(paypal);
    });

    test('can retry after a script that loaded without defining the SDK', async () => {
        const failed = loadPaypalSdk(URL_A);
        const first = sdkScripts()[0];
        first.onload();
        await expect(failed).rejects.toThrow('did not initialize');
        expect(sdkScripts()).toHaveLength(0);

        const retry = loadPaypalSdk(URL_A + '&locale=it_IT');
        expect(retry).not.toBe(failed);
        expect(sdkScripts()).toHaveLength(1);
        expect(sdkScripts()[0]).not.toBe(first);
        expect(sdkScripts()[0].getAttribute('src')).toBe(URL_A + '&locale=it_IT');
        const paypal = finishSdkLoad();
        await expect(retry).resolves.toBe(paypal);
    });
});

describe('paypal-sdk generic script loader', () => {
    let appended;
    let append;
    beforeEach(() => {
        resetScripts();
        appended = [];
        append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
            appended.push(node);
            return node;
        });
    });
    afterEach(() => {
        append.mockRestore();
        resetScripts();
        document.head.querySelectorAll('script[nonce]').forEach((script) => script.remove());
    });

    test('loads a URL once and shares the promise', async () => {
        const first = loadScript('https://pay.example/sdk.js', { 'data-client': 'x', onload: 'alert(1)', crossorigin: 'anonymous' });
        const second = loadScript('https://pay.example/sdk.js');
        expect(first).toBe(second);
        expect(appended).toHaveLength(1);
        const [script] = appended;
        expect(script.getAttribute('src')).toBe('https://pay.example/sdk.js');
        expect(script.getAttribute('data-client')).toBe('x');
        expect(script.getAttribute('crossorigin')).toBe('anonymous');
        expect(script.hasAttribute('onload')).toBe(false);
        script.onload();
        await expect(first).resolves.toBeUndefined();
    });

    test('forgets a failed load so the next call requests it again', async () => {
        const failed = loadScript('https://pay.example/sdk.js');
        appended[0].onerror();
        await expect(failed).rejects.toThrow('failed to load');
        const retry = loadScript('https://pay.example/sdk.js');
        expect(retry).not.toBe(failed);
        expect(appended).toHaveLength(2);
    });

    test('rejects without a URL', async () => {
        await expect(loadScript('')).rejects.toThrow();
        expect(appended).toHaveLength(0);
    });

    test('gives the script the CSP nonce of the page', () => {
        append.mockRestore();
        const holder = document.createElement('script');
        holder.setAttribute('type', 'text/plain');
        holder.setAttribute('nonce', 'N0NCE');
        document.head.appendChild(holder);
        expect(cspNonce()).toBe('N0NCE');
        append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
            appended.push(node);
            return node;
        });
        loadScript('https://pay.example/nonce.js');
        expect(appended[0].nonce || appended[0].getAttribute('nonce')).toBe('N0NCE');
    });

    test('keeps exporting the loading policy for the PayPal components', () => {
        expect(whenWanted).toBe(engagementWhenWanted);
    });
});

describe('paypal-sdk feedback', () => {
    test('notify fills and reveals the toast as text', () => {
        document.body.innerHTML = '<div id="hyperion-notification" data-hyperion-notification hidden></div>';
        notify('<b>No</b> way', 'warning');
        const toast = document.querySelector('#hyperion-notification');
        expect(toast.hidden).toBe(false);
        expect(toast.getAttribute('data-tone')).toBe('warning');
        expect(toast.getAttribute('role')).toBe('status');
        expect(toast.querySelector('b')).toBeNull();
        expect(toast.textContent).toBe('<b>No</b> way');

        notify('Broken');
        expect(toast.getAttribute('role')).toBe('alert');
        expect(toast.getAttribute('data-tone')).toBe('error');
    });

    test('drainMessages returns the cookie messages as text and deletes the cookie', () => {
        const payload = [{ type: 'success', text: 'Express Checkout has been <b>canceled</b>.' }, { type: 'error', text: '' }];
        document.cookie = `mage-messages=${encodeURIComponent(JSON.stringify(payload))}; path=/`;
        expect(drainMessages()).toEqual([{ type: 'success', text: 'Express Checkout has been canceled.' }]);
        expect(readCookie('mage-messages')).toBe('');
        expect(drainMessages()).toEqual([]);
    });

    test('drainMessages drops markup that is not text', () => {
        const payload = [{ type: 'error', text: 'Declined<img src="x" onerror="void 0"><style>p{}</style>' }];
        document.cookie = `mage-messages=${encodeURIComponent(JSON.stringify(payload))}; path=/`;
        expect(drainMessages()).toEqual([{ type: 'error', text: 'Declined' }]);
    });
});
