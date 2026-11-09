// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// paypal-sdk -- one script per page, never requested with the page itself.

import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import {
    loadPaypalSdk,
    resetPaypalSdk,
    whenWanted,
    whenEngaged,
    whenPageIdle,
    notify,
    drainMessages,
    readCookie,
} from '../paypal-sdk.js';
import {
    installIntersectionObserver,
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
});

describe('paypal-sdk scheduling', () => {
    let observers;
    beforeEach(() => { observers = installIntersectionObserver(); });
    afterEach(() => { observers.restore(); });

    test('whenWanted waits for the element to come near the viewport', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        let wanted = false;
        whenWanted(el).then(() => { wanted = true; });
        await Promise.resolve();
        expect(wanted).toBe(false);
        expect(observers.instances).toHaveLength(1);
        expect(observers.instances[0].options.rootMargin).toBe('200px');

        observers.instances[0].trigger(false);
        await Promise.resolve();
        expect(wanted).toBe(false);

        observers.instances[0].trigger(true);
        await Promise.resolve();
        expect(wanted).toBe(true);
        expect(observers.instances[0].disconnected).toBe(true);
    });

    test('whenWanted resolves on the first interaction', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        let wanted = false;
        whenWanted(el).then(() => { wanted = true; });
        el.dispatchEvent(new Event('pointerdown'));
        await Promise.resolve();
        expect(wanted).toBe(true);
    });

    test('a cancelled wait never resolves', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        let wanted = false;
        const waiting = whenWanted(el);
        waiting.then(() => { wanted = true; });
        waiting.cancel();
        el.dispatchEvent(new Event('pointerdown'));
        await Promise.resolve();
        expect(wanted).toBe(false);
        expect(observers.instances[0].disconnected).toBe(true);
    });

    test('whenEngaged waits for the first sign of the shopper on the document', async () => {
        const win = { scrollY: 0 };
        let engaged = false;
        whenEngaged(document, win).then(() => { engaged = true; });
        await Promise.resolve();
        expect(engaged).toBe(false);
        document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
        await Promise.resolve();
        expect(engaged).toBe(true);
    });

    test('whenEngaged resolves at once on a page that is already scrolled', async () => {
        let engaged = false;
        whenEngaged(document, { scrollY: 120 }).then(() => { engaged = true; });
        await Promise.resolve();
        expect(engaged).toBe(true);
    });

    test('whenEngaged listens once: a second event finds no listener', async () => {
        const win = { scrollY: 0 };
        const add = vi.spyOn(document, 'addEventListener');
        const remove = vi.spyOn(document, 'removeEventListener');
        const ready = whenEngaged(document, win);
        document.dispatchEvent(new Event('scroll'));
        await ready;
        expect(add).toHaveBeenCalledTimes(6);
        expect(remove).toHaveBeenCalledTimes(6);
        add.mockRestore();
        remove.mockRestore();
    });

    test('whenPageIdle waits for the load event, then for an idle slot', async () => {
        const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive');
        const idleCallbacks = [];
        window.requestIdleCallback = (callback) => { idleCallbacks.push(callback); };
        let idle = false;
        whenPageIdle().then(() => { idle = true; });
        await Promise.resolve();
        expect(idleCallbacks).toHaveLength(0);

        window.dispatchEvent(new Event('load'));
        expect(idleCallbacks).toHaveLength(1);
        expect(idle).toBe(false);

        idleCallbacks[0]();
        await Promise.resolve();
        expect(idle).toBe(true);
        readyState.mockRestore();
        delete window.requestIdleCallback;
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
