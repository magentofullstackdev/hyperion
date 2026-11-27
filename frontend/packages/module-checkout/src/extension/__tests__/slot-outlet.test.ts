// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { resetCheckoutContextForTests } from '../context.js';
import { registerSlotElement, resetSlotsForTests } from '../slots.js';
import '../slot-outlet.js';

let tagIndex = 0;
function freshTag(): string {
    tagIndex += 1;
    return `vendor-slot-${tagIndex}`;
}

/** An element class that records what it held when it was connected. */
function defineRecorder(tag: string, hyperionApi = '1'): Array<Record<string, unknown>> {
    const connected: Array<Record<string, unknown>> = [];
    class Recorder extends HTMLElement {
        public static hyperionApi = hyperionApi;
        public connectedCallback(): void {
            const self = this as unknown as Record<string, unknown>;
            connected.push({ context: self.context, options: self.options, slot: this.slot });
        }
    }
    customElements.define(tag, Recorder);
    return connected;
}

async function flush(): Promise<void> {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function configure(extensions: unknown[]): void {
    setCheckoutConfig({ storeCode: 'default', hyperion: { enabled: true, extensions } } as unknown as CheckoutConfig);
}

describe('<hc-slot-outlet>', () => {
    beforeEach(() => {
        setStoreForTests(createStore());
        resetFlowSelectorsForTests();
        resetCheckoutContextForTests();
        resetSlotsForTests();
        document.body.innerHTML = '';
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('is hidden, empty and takes no space on a checkout without extensions', async () => {
        configure([]);
        const outlet = document.createElement('hc-slot-outlet');
        outlet.setAttribute('name', 'after-email');
        document.body.appendChild(outlet);
        registerSlotElement({ slot: 'after-email', tag: freshTag(), sortOrder: 0, owner: 'x', options: {}, phrases: {}, internal: false });
        await flush();
        expect(outlet.hidden).toBe(true);
        expect(outlet.childElementCount).toBe(0);
        expect(outlet.className).toBe('');
    });

    it('renders the registered elements in order, with their properties set before they connect', async () => {
        configure([{ name: 'vendor_vat_check' }]);
        const outlet = document.createElement('hc-slot-outlet');
        outlet.setAttribute('name', 'after-email');
        document.body.appendChild(outlet);
        await flush();
        expect(outlet.hidden).toBe(true);

        const late = freshTag();
        const early = freshTag();
        const lateConnected = defineRecorder(late);
        defineRecorder(early);
        registerSlotElement({ slot: 'after-email', tag: late, sortOrder: 20, owner: 'vat', options: { a: 1 }, phrases: {}, internal: false });
        const removeEarly = registerSlotElement({ slot: 'after-email', tag: early, sortOrder: 10, owner: 'vat', options: {}, phrases: {}, internal: false });
        await vi.waitFor(() => expect(outlet.childElementCount).toBe(2));

        expect(outlet.hidden).toBe(false);
        expect(outlet.classList.contains('block')).toBe(true);
        expect([...outlet.children].map((child) => child.localName)).toEqual([early, late]);
        expect(lateConnected).toHaveLength(1);
        expect(lateConnected[0]?.options).toEqual({ a: 1 });
        expect(lateConnected[0]?.slot).toBe('after-email');
        expect(typeof (lateConnected[0]?.context as { snapshot?: unknown }).snapshot).toBe('function');

        removeEarly();
        await vi.waitFor(() => expect(outlet.childElementCount).toBe(1));
        expect([...outlet.children].map((child) => child.localName)).toEqual([late]);
        expect(lateConnected).toHaveLength(1);
    });

    it('renders no element for a tag written for another major', async () => {
        configure([{ name: 'vendor_vat_check' }]);
        const outlet = document.createElement('hc-slot-outlet');
        outlet.setAttribute('name', 'before-place-order');
        document.body.appendChild(outlet);
        const tag = freshTag();
        const valid = freshTag();
        defineRecorder(tag, '2');
        defineRecorder(valid);
        registerSlotElement({ slot: 'before-place-order', tag, sortOrder: 0, owner: 'vat', options: {}, phrases: {}, internal: false });
        registerSlotElement({ slot: 'before-place-order', tag: valid, sortOrder: 1, owner: 'vat', options: {}, phrases: {}, internal: false });
        await vi.waitFor(() => expect(outlet.childElementCount).toBe(1));
        expect(outlet.firstElementChild?.localName).toBe(valid);
    });
});
