// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../api/cart.js', () => ({
    loginOnStorefront: vi.fn(),
}));
vi.mock('../../components/hyperion-recaptcha.js', () => ({
    executeRecaptcha: vi.fn().mockResolvedValue('rc-token'),
}));

import * as cartApi from '../../api/cart.js';
import { MagentoApiError } from '../../api/client.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { inlineLogin } from '../login-action.js';

const api = vi.mocked(cartApi);

describe('inline login', () => {
    let store: Store;
    let reload: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        store = createStore();
        setStoreForTests(store);
        store.email.set('roni_cost@example.com');
        store.password.set('secret');
        reload = vi.fn();
    });

    it('signs in through the storefront AJAX login and reloads the checkout', async () => {
        api.loginOnStorefront.mockResolvedValue({ errors: false, message: 'Login successful.' });

        expect(await inlineLogin({ reload })).toBe(true);

        expect(api.loginOnStorefront).toHaveBeenCalledWith(
            { username: 'roni_cost@example.com', password: 'secret' },
            'rc-token'
        );
        expect(reload).toHaveBeenCalledTimes(1);
        expect(store.password.get()).toBe('');
        expect(store.loginError.get()).toBeNull();
        // The state is not patched client-side: the reload boots from the merged quote.
        expect(store.isGuest.get()).toBe(true);
        expect(store.customerToken.get()).toBeNull();
    });

    it('shows the controller message when the credentials are refused', async () => {
        api.loginOnStorefront.mockResolvedValue({ errors: true, message: 'Invalid login or password.' });

        expect(await inlineLogin({ reload })).toBe(false);
        expect(store.loginError.get()).toBe('Invalid login or password.');
        expect(reload).not.toHaveBeenCalled();
    });

    it('shows the HTTP error message and never reloads on a failed request', async () => {
        api.loginOnStorefront.mockRejectedValue(new MagentoApiError(400, '400', 'Bad request'));

        expect(await inlineLogin({ reload })).toBe(false);
        expect(store.loginError.get()).toBe('Bad request');
        expect(reload).not.toHaveBeenCalled();
    });

    it('refuses to call the server without credentials', async () => {
        store.password.set('');
        expect(await inlineLogin({ reload })).toBe(false);
        expect(api.loginOnStorefront).not.toHaveBeenCalled();
    });
});
