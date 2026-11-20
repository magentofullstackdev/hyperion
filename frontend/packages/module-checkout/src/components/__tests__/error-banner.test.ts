// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { reportFailure } from '../../store/section-status.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../error-banner.js';
import type { ErrorBanner } from '../error-banner.js';

describe('<error-banner>', () => {
    let store: Store;
    let el: ErrorBanner;
    let input: HTMLInputElement;

    async function rendered(): Promise<void> {
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        await el.updateComplete;
    }

    const banner = (): HTMLElement | null => el.querySelector<HTMLElement>('[data-error-banner]');

    beforeEach(async () => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        input = document.createElement('input');
        document.body.appendChild(input);
        el = document.createElement('error-banner');
        document.body.appendChild(el);
        await el.updateComplete;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('renders nothing while there is no message', () => {
        expect(banner()).toBeNull();
    });

    it('announces the message as an alert and leaves the focus in the field the shopper is typing in', async () => {
        input.focus();

        store.globalError.set('The payment was declined.');
        await rendered();

        expect(banner()?.getAttribute('role')).toBe('alert');
        expect(banner()?.textContent).toContain('The payment was declined.');
        expect(document.activeElement).toBe(input);
        // One way of being announced: an alert that cannot be focused.
        expect(banner()?.hasAttribute('tabindex')).toBe(false);
        expect(banner()?.hasAttribute('aria-live')).toBe(false);
    });

    it('a second message does not take the focus either', async () => {
        store.globalError.set('First');
        await rendered();
        input.focus();

        store.globalError.set('Second');
        await rendered();

        expect(banner()?.textContent).toContain('Second');
        expect(document.activeElement).toBe(input);
    });

    it('Dismiss removes the message', async () => {
        store.globalError.set('The payment was declined.');
        await rendered();

        banner()?.querySelector('button')?.click();
        await rendered();

        expect(store.globalError.get()).toBeNull();
        expect(banner()).toBeNull();
    });

    it('shows the minimum order notice by itself, with nothing to dismiss', async () => {
        store.minimumOrderError.set('Minimum order amount is 50.');
        await rendered();

        expect(banner()?.textContent).toContain('Minimum order amount is 50.');
        expect(banner()?.querySelector('button')).toBeNull();
    });

    it('does not repeat the failure of a section', async () => {
        reportFailure('shipping-methods', { kind: 'network', message: 'We could not reach the store. Please try again.' }, { source: 'background' });
        await rendered();

        expect(banner()).toBeNull();
    });
});
