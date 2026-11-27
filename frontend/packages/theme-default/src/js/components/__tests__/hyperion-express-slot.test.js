// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// hyperion-express-slot -- one host for every express button of a placement.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import '../hyperion-express-slot.js';
import { resetExtensionLoader, setExtensionLoaderForTests, registerBuiltinModule } from '../../lib/extension-loader.js';
import { installIntersectionObserver, settle } from './paypal-helpers.js';

const seen = [];

/** An express element that records what it had when it was connected. */
class RecordingButton extends HTMLElement {
    static hyperionApi = '1';

    connectedCallback() {
        seen.push({
            element: this,
            context: this.context,
            options: this.options,
            placement: this.placement,
        });
    }
}

class FutureButton extends HTMLElement {
    static hyperionApi = '2';
}

let tagCount = 0;

/** A tag no test used before, so each test defines its own element. */
function freshTag() {
    tagCount += 1;
    return `vendor-express-${tagCount}`;
}

function entry(overrides = {}) {
    return {
        id: 'vendor_express',
        tag: 'vendor-express-0',
        moduleUrl: `${location.origin}/static/Vendor_Psp/js/express.js`,
        builtin: null,
        apiVersion: '1',
        reservedHeight: 45,
        sortOrder: 10,
        options: { brand: 'PSP' },
        phrases: {},
        redirectHosts: [],
        ...overrides,
    };
}

function slotMarkup(entries, placement = 'cart') {
    const total = entries.reduce((sum, item) => sum + item.reservedHeight, 0) + 8 * (entries.length - 1);
    const boxes = entries
        .map((item) => `<div data-hyperion-express-button="${item.id}" style="min-height: ${item.reservedHeight}px"></div>`)
        .join('');
    const json = JSON.stringify(entries).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `<hyperion-express-slot class="block mt-3 space-y-2" placement="${placement}" style="min-height: ${total}px" data-hyperion-express="${json}">${boxes}</hyperion-express-slot>`;
}

/** Mount a slot and let it start (it starts in a microtask, once its boxes are parsed). */
async function mountSlot(entries, placement) {
    const holder = document.createElement('div');
    holder.innerHTML = slotMarkup(entries, placement);
    document.body.appendChild(holder);
    await Promise.resolve();
    return holder.querySelector('hyperion-express-slot');
}

function placeBox(box, inViewport) {
    box.getBoundingClientRect = () => (inViewport
        ? { top: 10, bottom: 55, height: 45, left: 0, right: 100, width: 100 }
        : { top: 5000, bottom: 5045, height: 45, left: 0, right: 100, width: 100 });
}

describe('hyperion-express-slot', () => {
    let observers;
    let importer;

    beforeEach(() => {
        seen.length = 0;
        resetExtensionLoader();
        observers = installIntersectionObserver();
        importer = vi.fn(async () => {});
        setExtensionLoaderForTests({ importer: (url) => importer(url), origins: [location.origin] });
        document.body.innerHTML = '<div id="hyperion-notification" data-hyperion-notification hidden></div>';
    });

    afterEach(() => {
        observers.restore();
        resetExtensionLoader();
        vi.restoreAllMocks();
    });

    test('registers the custom element tag', () => {
        expect(customElements.get('hyperion-express-slot')).toBeTypeOf('function');
    });

    test('loads nothing before the box nears the viewport', async () => {
        const tag = freshTag();
        await mountSlot([entry({ tag })]);
        await settle();
        expect(importer).not.toHaveBeenCalled();
        observers.instances[0].trigger(false);
        await settle();
        expect(importer).not.toHaveBeenCalled();
    });

    test('gives the element its context, options and placement before connecting it', async () => {
        const tag = freshTag();
        importer = vi.fn(async () => customElements.define(tag, class extends RecordingButton {}));
        const slot = await mountSlot([entry({ tag })], 'minicart');
        observers.triggerAll(true);
        await settle();

        expect(importer).toHaveBeenCalledWith(`${location.origin}/static/Vendor_Psp/js/express.js`);
        expect(seen).toHaveLength(1);
        expect(seen[0].placement).toBe('minicart');
        expect(seen[0].options).toEqual({ brand: 'PSP' });
        expect(Object.isFrozen(seen[0].options)).toBe(true);
        expect(seen[0].context.apiVersion).toBe('1.0-beta');
        expect(typeof seen[0].context.whenEngaged).toBe('function');
        expect(slot.querySelector('[data-hyperion-express-button="vendor_express"]').firstElementChild).toBe(seen[0].element);
    });

    test('creates the buttons in their own boxes, in order', async () => {
        const first = freshTag();
        const second = freshTag();
        importer = vi.fn(async (url) => {
            const tag = url.includes('first') ? first : second;
            customElements.define(tag, class extends RecordingButton {});
        });
        const slot = await mountSlot([
            entry({ id: 'one', tag: first, moduleUrl: `${location.origin}/static/first.js` }),
            entry({ id: 'two', tag: second, moduleUrl: `${location.origin}/static/second.js`, reservedHeight: 104 }),
        ]);
        observers.triggerAll(true);
        await settle();

        expect(slot.style.minHeight).toBe('157px');
        expect(slot.querySelector('[data-hyperion-express-button="one"]').firstElementChild.localName).toBe(first);
        expect(slot.querySelector('[data-hyperion-express-button="two"]').firstElementChild.localName).toBe(second);
    });

    test('refuses a module on another origin and a reserved tag', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const slot = await mountSlot([
            entry({ id: 'evil', tag: freshTag(), moduleUrl: 'https://cdn.evil.example/express.js' }),
            entry({ id: 'theme', tag: 'hyperion-fake-button', moduleUrl: `${location.origin}/static/x.js` }),
        ]);
        slot.querySelectorAll('[data-hyperion-express-button]').forEach((box) => placeBox(box, false));
        observers.triggerAll(true);
        await settle();

        expect(importer).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
        expect(slot.querySelector('[data-hyperion-express-button="evil"]').hidden).toBe(true);
        expect(slot.querySelector('[data-hyperion-express-button="theme"]').hidden).toBe(true);
        expect(slot.style.display).toBe('none');
    });

    test('an element written for another API major is not used', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const tag = freshTag();
        importer = vi.fn(async () => customElements.define(tag, class extends FutureButton {}));
        const slot = await mountSlot([entry({ tag })]);
        placeBox(slot.querySelector('[data-hyperion-express-button]'), false);
        observers.triggerAll(true);
        await settle();

        expect(slot.querySelector(tag)).toBeNull();
        expect(slot.querySelector('[data-hyperion-express-button]').hidden).toBe(true);
    });

    test('a first-party builtin is loaded through the theme map', async () => {
        const tag = 'hyperion-fake-builtin';
        const load = vi.fn(async () => {
            if (!customElements.get(tag)) customElements.define(tag, class extends RecordingButton {});
        });
        registerBuiltinModule('hyperion-fake-builtin', load);
        await mountSlot([entry({ tag, moduleUrl: null, builtin: 'hyperion-fake-builtin' })]);
        observers.triggerAll(true);
        await settle();

        expect(load).toHaveBeenCalledTimes(1);
        expect(importer).not.toHaveBeenCalled();
        expect(seen).toHaveLength(1);
    });

    describe('events of the element', () => {
        async function mounted(extra = {}) {
            const tag = freshTag();
            importer = vi.fn(async () => customElements.define(tag, class extends RecordingButton {}));
            const slot = await mountSlot([entry({ tag, ...extra })]);
            const box = slot.querySelector('[data-hyperion-express-button]');
            observers.triggerAll(true);
            await settle();
            return { slot, box, element: seen[0].element };
        }

        test('ready marks the box', async () => {
            const { box, element } = await mounted();
            element.dispatchEvent(new CustomEvent('hyperion-express:ready', { bubbles: true, composed: true }));
            expect(box.hasAttribute('data-hyperion-express-ready')).toBe(true);
        });

        test('error shows its message as text in the toast', async () => {
            const { element } = await mounted();
            element.dispatchEvent(new CustomEvent('hyperion-express:error', {
                bubbles: true,
                detail: { message: '<img src=x onerror="void 0">Card declined' },
            }));
            const toast = document.querySelector('#hyperion-notification');
            expect(toast.hidden).toBe(false);
            expect(toast.textContent).toBe('Card declined');
            expect(toast.querySelector('img')).toBeNull();
        });

        test('an event from another element is ignored', async () => {
            const { box } = await mounted();
            const stranger = document.createElement('span');
            box.appendChild(stranger);
            stranger.dispatchEvent(new CustomEvent('hyperion-express:ready', { bubbles: true }));
            expect(box.hasAttribute('data-hyperion-express-ready')).toBe(false);
        });

        test('unavailable out of the viewport collapses the box at once', async () => {
            const { slot, box, element } = await mounted();
            placeBox(box, false);
            element.dispatchEvent(new CustomEvent('hyperion-express:unavailable', { bubbles: true }));
            expect(box.hidden).toBe(true);
            expect(slot.style.display).toBe('none');
        });

        test('unavailable in the viewport waits until the box has left it', async () => {
            const { slot, box, element } = await mounted();
            placeBox(box, true);
            element.dispatchEvent(new CustomEvent('hyperion-express:unavailable', { bubbles: true }));
            expect(box.hidden).toBe(false);
            expect(slot.style.display).toBe('');

            const collapse = observers.instances[observers.instances.length - 1];
            collapse.trigger(true);
            expect(box.hidden).toBe(false);
            collapse.trigger(false);
            expect(box.hidden).toBe(true);
            expect(slot.style.display).toBe('none');
        });
    });

    test('a collapsed box gives its height back while the others keep theirs', async () => {
        const first = freshTag();
        importer = vi.fn(async (url) => {
            if (url.includes('first')) customElements.define(first, class extends RecordingButton {});
            else throw new Error('network');
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const slot = await mountSlot([
            entry({ id: 'one', tag: first, moduleUrl: `${location.origin}/static/first.js` }),
            entry({ id: 'two', tag: freshTag(), moduleUrl: `${location.origin}/static/second.js`, reservedHeight: 104 }),
        ]);
        slot.querySelectorAll('[data-hyperion-express-button]').forEach((box) => placeBox(box, false));
        observers.triggerAll(true);
        await settle();

        expect(slot.querySelector('[data-hyperion-express-button="two"]').hidden).toBe(true);
        expect(slot.style.minHeight).toBe('45px');
        expect(slot.style.display).toBe('');
    });

    test('a slot swapped in by htmx starts again with new elements', async () => {
        const tag = freshTag();
        importer = vi.fn(async () => customElements.define(tag, class extends RecordingButton {}));
        const first = await mountSlot([entry({ tag })]);
        observers.triggerAll(true);
        await settle();
        const oldContext = seen[0].context;
        let resolvedAfterRemoval = false;
        oldContext.whenWanted().then(() => { resolvedAfterRemoval = true; });

        first.parentElement.innerHTML = slotMarkup([entry({ tag })]);
        await Promise.resolve();
        observers.triggerAll(true);
        await settle();

        expect(seen).toHaveLength(2);
        expect(seen[1].element).not.toBe(seen[0].element);
        expect(seen[1].context).not.toBe(oldContext);
        expect(resolvedAfterRemoval).toBe(false);
        expect(importer).toHaveBeenCalledTimes(1);
    });
});
