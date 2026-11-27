// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../api/cart.js', () => ({
    loginOnStorefront: vi.fn(),
}));
vi.mock('../../api/captcha.js', () => ({
    loadCaptchaState: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../components/recaptcha-client.js', () => ({
    executeRecaptcha: vi.fn().mockResolvedValue('rc-token'),
}));
vi.mock('../drafts.js', () => ({
    copyDraftToHandoff: vi.fn(),
}));

import * as cartApi from '../../api/cart.js';
import { loadCaptchaState } from '../../api/captcha.js';
import { MagentoApiError } from '../../api/client.js';
import { executeRecaptcha } from '../../components/recaptcha-client.js';
import { t } from '../../utils/i18n.js';
import {
    attachCaptchaField,
    captchaError,
    resetCaptchaStateForTests,
    seedCaptchaState,
    setCaptchaAnswer,
} from '../captcha-state.js';
import { copyDraftToHandoff } from '../drafts.js';
import { createStore, setStoreForTests, type Store } from '../index.js';
import { inlineLogin } from '../login-action.js';

const api = vi.mocked(cartApi);

const LOGIN_FORM = { isRequired: true, isCaseSensitive: false, imageHeight: 50, imageWidth: 200 };

describe('inline login', () => {
    let store: Store;
    let reload: Mock<() => void>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(executeRecaptcha).mockResolvedValue('rc-token');
        vi.mocked(loadCaptchaState).mockResolvedValue(true);
        resetCaptchaStateForTests();
        store = createStore();
        setStoreForTests(store);
        store.email.set('roni_cost@example.com');
        store.password.set('secret');
        reload = vi.fn<() => void>();
    });

    it('signs in through the storefront AJAX login and reloads the checkout', async () => {
        api.loginOnStorefront.mockResolvedValue({ errors: false, message: 'Login successful.' });

        expect(await inlineLogin({ reload })).toBe(true);

        expect(executeRecaptcha).toHaveBeenCalledWith('customer_login');
        expect(api.loginOnStorefront).toHaveBeenCalledWith(
            { username: 'roni_cost@example.com', password: 'secret' },
            'rc-token',
            null
        );
        expect(reload).toHaveBeenCalledTimes(1);
        expect(store.password.get()).toBe('');
        expect(store.loginError.get()).toBeNull();
        // The state is not patched client-side: the reload boots from the merged quote.
        expect(store.isGuest.get()).toBe(true);
        expect(loadCaptchaState).not.toHaveBeenCalled();
    });

    it('hands the typed fields over to the next boot before the reload', async () => {
        api.loginOnStorefront.mockResolvedValue({ errors: false, message: 'Login successful.' });
        const order: string[] = [];
        vi.mocked(copyDraftToHandoff).mockImplementation(() => { order.push('handoff'); });
        reload.mockImplementation(() => { order.push('reload'); });

        await inlineLogin({ reload });

        expect(order).toEqual(['handoff', 'reload']);
    });

    it('reloads even when the handoff cannot be written', async () => {
        api.loginOnStorefront.mockResolvedValue({ errors: false, message: 'Login successful.' });
        vi.mocked(copyDraftToHandoff).mockImplementation(() => { throw new Error('storage is full'); });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(await inlineLogin({ reload })).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('never hands anything over after a refused login', async () => {
        api.loginOnStorefront.mockResolvedValue({ errors: true, message: 'Invalid login or password.' });

        await inlineLogin({ reload });

        expect(copyDraftToHandoff).not.toHaveBeenCalled();
    });

    it('shows the controller message when the credentials are refused and reads the CAPTCHA state again', async () => {
        api.loginOnStorefront.mockResolvedValue({ errors: true, message: 'Invalid login or password.' });

        expect(await inlineLogin({ reload })).toBe(false);
        expect(store.loginError.get()).toBe('Invalid login or password.');
        expect(loadCaptchaState).toHaveBeenCalledTimes(1);
        expect(reload).not.toHaveBeenCalled();
    });

    it('shows the HTTP error message, reads the CAPTCHA state again and never reloads on a failed request', async () => {
        api.loginOnStorefront.mockRejectedValue(new MagentoApiError(400, '400', 'Bad request'));

        expect(await inlineLogin({ reload })).toBe(false);
        expect(store.loginError.get()).toBe('Bad request');
        expect(loadCaptchaState).toHaveBeenCalledTimes(1);
        expect(reload).not.toHaveBeenCalled();
    });

    it('refuses to call the server without credentials', async () => {
        store.password.set('');
        expect(await inlineLogin({ reload })).toBe(false);
        expect(api.loginOnStorefront).not.toHaveBeenCalled();
    });

    it('shows the message of a failed security check and sends nothing', async () => {
        const failure = Object.assign(new Error('Please confirm you are not a robot.'), { reason: 'required' });
        vi.mocked(executeRecaptcha).mockRejectedValue(failure);

        expect(await inlineLogin({ reload })).toBe(false);
        expect(store.loginError.get()).toBe('Please confirm you are not a robot.');
        expect(api.loginOnStorefront).not.toHaveBeenCalled();
        expect(loadCaptchaState).not.toHaveBeenCalled();
    });

    describe('with the image CAPTCHA of the login form', () => {
        let refresh: Mock<() => Promise<boolean>>;
        let focus: Mock<() => void>;

        beforeEach(() => {
            seedCaptchaState({ user_login: LOGIN_FORM });
            refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
            focus = vi.fn<() => void>();
            attachCaptchaField('user_login', { refresh, focus });
        });

        it('sends the typed answer as the captcha string of the login body', async () => {
            setCaptchaAnswer('user_login', ' aaaa ');
            api.loginOnStorefront.mockResolvedValue({ errors: false, message: 'Login successful.' });

            expect(await inlineLogin({ reload })).toBe(true);

            expect(api.loginOnStorefront).toHaveBeenCalledWith(
                { username: 'roni_cost@example.com', password: 'secret' },
                'rc-token',
                'aaaa'
            );
        });

        it('asks for the answer before anything is sent', async () => {
            expect(await inlineLogin({ reload })).toBe(false);

            expect(captchaError('user_login')).toBe(t('Hyperion_Checkout::validation_required'));
            expect(focus).toHaveBeenCalledTimes(1);
            expect(executeRecaptcha).not.toHaveBeenCalled();
            expect(api.loginOnStorefront).not.toHaveBeenCalled();
        });

        it('puts a refused answer next to the field, forgets it and asks for a new image', async () => {
            setCaptchaAnswer('user_login', 'bbbb');
            api.loginOnStorefront.mockResolvedValue({ errors: true, message: 'Incorrect CAPTCHA' });

            expect(await inlineLogin({ reload })).toBe(false);

            expect(captchaError('user_login')).toBe('Incorrect CAPTCHA');
            expect(store.loginError.get()).toBeNull();
            expect(store.captcha.get().user_login?.value).toBe('');
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(loadCaptchaState).toHaveBeenCalledTimes(1);
        });

        it('asks for a new image after wrong credentials too: the word was spent by the check', async () => {
            setCaptchaAnswer('user_login', 'aaaa');
            api.loginOnStorefront.mockResolvedValue({ errors: true, message: 'Invalid login or password.' });

            await inlineLogin({ reload });

            expect(refresh).toHaveBeenCalledTimes(1);
            expect(store.loginError.get()).toBe('Invalid login or password.');
            expect(captchaError('user_login')).toBeNull();
        });
    });

    it('shows a CAPTCHA refusal in the login form while the form shows no field', async () => {
        vi.mocked(loadCaptchaState).mockResolvedValue(false);
        api.loginOnStorefront.mockResolvedValue({ errors: true, message: 'Incorrect CAPTCHA' });

        await inlineLogin({ reload });

        expect(store.loginError.get()).toBe('Incorrect CAPTCHA');
        expect(captchaError('user_login')).toBeNull();
    });
});
