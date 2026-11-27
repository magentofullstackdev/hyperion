// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// engagement -- nothing third party loads before the shopper is there.

import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { whenWanted, whenEngaged, whenPageIdle } from '../engagement.js';
import { installIntersectionObserver } from '../../components/__tests__/paypal-helpers.js';

describe('engagement policy', () => {
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

    test('a canceled wait never resolves', async () => {
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

    test('whenEngaged resolves when assistive technology only moves the focus', async () => {
        const win = { scrollY: 0 };
        let engaged = false;
        whenEngaged(document, win).then(() => { engaged = true; });
        const link = document.createElement('a');
        link.href = '#';
        document.body.appendChild(link);
        link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        await Promise.resolve();
        expect(engaged).toBe(true);
        link.remove();
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
        expect(add).toHaveBeenCalledTimes(7);
        expect(remove).toHaveBeenCalledTimes(7);
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

