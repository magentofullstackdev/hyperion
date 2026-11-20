// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../session-expired-dialog.js';
import type { SessionExpiredDialog } from '../session-expired-dialog.js';

describe('<hc-session-expired>', () => {
    let store: Store;
    let el: SessionExpiredDialog;

    async function rendered(): Promise<void> {
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        await el.updateComplete;
    }

    const dialog = (): HTMLDialogElement | null => el.querySelector<HTMLDialogElement>('dialog[data-session-expired]');

    function configure(hyperion: Record<string, unknown>): void {
        setCheckoutConfig({ hyperion: { checkoutVersion: '2.0.0', enabled: true, ...hyperion } } as unknown as CheckoutConfig);
    }

    beforeEach(async () => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        configure({ loginUrl: 'https://shop.test/customer/account/login/referer/abc/' });
        store = createStore();
        setStoreForTests(store);
        el = document.createElement('hc-session-expired');
        document.body.appendChild(el);
        await el.updateComplete;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('renders nothing while the session is alive', () => {
        expect(el.children.length).toBe(0);
    });

    it('opens with the message and the link to the sign in page that returns to the checkout', async () => {
        store.sessionExpired.set(true);
        await rendered();

        expect(dialog()?.hasAttribute('open')).toBe(true);
        expect(dialog()?.textContent).toContain('Your session has expired. Sign in again to continue. What you entered has been kept.');
        const link = dialog()?.querySelector<HTMLAnchorElement>('[data-session-expired-login]');
        expect(link?.textContent?.trim()).toBe('Sign in again');
        expect(link?.getAttribute('href')).toBe('https://shop.test/customer/account/login/referer/abc/');
        expect(dialog()?.getAttribute('aria-labelledby')).toBe('hc-session-expired-message');
        expect(dialog()?.querySelector('[data-session-expired-order]')).toBeNull();
    });

    it('cannot be dismissed with Escape', async () => {
        store.sessionExpired.set(true);
        await rendered();

        const cancel = new Event('cancel', { cancelable: true });
        dialog()?.dispatchEvent(cancel);

        expect(cancel.defaultPrevented).toBe(true);
    });

    it('says that the outcome of the order is not known when an order request was under way', async () => {
        store.orderOutcome.set('unknown');
        store.sessionExpired.set(true);
        await rendered();

        expect(dialog()?.querySelector('[data-session-expired-order]')?.textContent)
            .toContain('We could not confirm whether your order was placed. Please do not pay again yet.');
    });

    it('falls back to the plain sign in page of the store when the configuration names none', async () => {
        configure({ baseUrl: 'https://shop.test/en' });
        store.sessionExpired.set(true);
        await rendered();

        expect(dialog()?.querySelector('[data-session-expired-login]')?.getAttribute('href'))
            .toBe('https://shop.test/en/customer/account/login/');
    });
});
