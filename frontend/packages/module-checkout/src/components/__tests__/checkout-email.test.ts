// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isEmailAvailable } = vi.hoisted(() => ({
    isEmailAvailable: vi.fn<(req: { customerEmail: string }) => Promise<boolean>>(),
}));
vi.mock('../../api/cart.js', () => ({ isEmailAvailable }));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { resetCaptchaStateForTests, setCaptchaError } from '../../store/captcha-state.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-email.js';
import type { CheckoutEmail } from '../checkout-email.js';

const TYPING_PAUSE_MS = 800;

interface Deferred {
    resolve: (available: boolean) => void;
    reject: (error: unknown) => void;
}

/** Make the next availability request wait for the test to answer it. */
function deferNextAnswer(): Deferred {
    let resolve!: (available: boolean) => void;
    let reject!: (error: unknown) => void;
    isEmailAvailable.mockImplementationOnce(
        () => new Promise<boolean>((res, rej) => { resolve = res; reject = rej; })
    );
    return { resolve: (available) => resolve(available), reject: (error) => reject(error) };
}

function installConfig(guestCheckoutLoginEnabled?: boolean): void {
    const base = guestFixture as unknown as CheckoutConfig;
    setCheckoutConfig({
        ...base,
        hyperion: {
            ...base.hyperion,
            ...(guestCheckoutLoginEnabled === undefined ? {} : { guestCheckoutLoginEnabled }),
        },
    });
}

async function flush(): Promise<void> {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('<checkout-email> availability check', () => {
    let store: Store;
    let el: CheckoutEmail;

    function input(): Element {
        const field = el.querySelector('hc-text-input[name="email"]');
        if (!field) throw new Error('email field not rendered');
        return field;
    }

    function type(value: string): void {
        input().dispatchEvent(new CustomEvent('value-change', { detail: { value, name: 'email' }, bubbles: true }));
    }

    function blur(value: string = store.email.get()): void {
        input().dispatchEvent(new CustomEvent('value-blur', { detail: { value, name: 'email' }, bubbles: true }));
    }

    async function mount(): Promise<void> {
        el = document.createElement('checkout-email');
        document.body.appendChild(el);
        await el.updateComplete;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        isEmailAvailable.mockReset();
        isEmailAvailable.mockResolvedValue(true);
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        installConfig();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
        setCheckoutConfig(null as unknown as CheckoutConfig);
    });

    it('asks after a pause in the typing, not on every keystroke', async () => {
        await mount();
        type('roni@example.co');
        vi.advanceTimersByTime(TYPING_PAUSE_MS - 1);
        type('roni@example.com');
        vi.advanceTimersByTime(TYPING_PAUSE_MS - 1);
        expect(isEmailAvailable).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(isEmailAvailable).toHaveBeenCalledTimes(1);
        expect(isEmailAvailable).toHaveBeenCalledWith({ customerEmail: 'roni@example.com' }, { signal: expect.any(AbortSignal) });
    });

    it('asks at once when the field loses the focus, and reveals the sign in block for a customer', async () => {
        isEmailAvailable.mockResolvedValue(false);
        await mount();
        type('roni@example.com');
        blur();
        expect(isEmailAvailable).toHaveBeenCalledTimes(1);

        await flush();
        expect(store.emailExists.get()).toBe(true);
        await el.updateComplete;
        // The notice arrives in the reserved line; the password form waits for the shopper.
        expect(el.querySelector('[data-hyperion-login-slot] [data-hyperion-login-open]')).not.toBeNull();
        expect(el.querySelector('hc-text-input[name="password"]')).toBeNull();

        // The pause that was waiting when the focus left asks nothing more.
        vi.advanceTimersByTime(TYPING_PAUSE_MS * 2);
        expect(isEmailAvailable).toHaveBeenCalledTimes(1);
    });

    it('asks once per distinct value that loses the focus', async () => {
        await mount();
        type('roni@example.com');
        blur();
        await flush();
        blur();
        blur();
        expect(isEmailAvailable).toHaveBeenCalledTimes(1);

        type('veronica@example.com');
        blur();
        await flush();
        blur();
        expect(isEmailAvailable).toHaveBeenCalledTimes(2);
        expect(isEmailAvailable).toHaveBeenLastCalledWith({ customerEmail: 'veronica@example.com' }, { signal: expect.any(AbortSignal) });
    });

    it('asks again for a value the shopper returns to', async () => {
        isEmailAvailable.mockResolvedValue(false);
        await mount();
        type('roni@example.com');
        blur();
        await flush();
        type('roni@example.co');
        expect(store.emailExists.get()).toBe(false);
        type('roni@example.com');
        blur();
        await flush();
        expect(isEmailAvailable).toHaveBeenCalledTimes(2);
        expect(store.emailExists.get()).toBe(true);
    });

    it('never asks for a value without the email shape', async () => {
        await mount();
        type('roni@example');
        blur();
        vi.advanceTimersByTime(TYPING_PAUSE_MS * 2);
        type('');
        blur();
        vi.advanceTimersByTime(TYPING_PAUSE_MS * 2);
        expect(isEmailAvailable).not.toHaveBeenCalled();
    });

    it('drops the waiting check when the value loses the email shape', async () => {
        await mount();
        type('roni@example.com');
        type('roni@example.');
        vi.advanceTimersByTime(TYPING_PAUSE_MS * 2);
        expect(isEmailAvailable).not.toHaveBeenCalled();
    });

    it('never asks when guests cannot sign in from the checkout', async () => {
        installConfig(false);
        await mount();
        type('roni@example.com');
        vi.advanceTimersByTime(TYPING_PAUSE_MS * 2);
        blur();
        await flush();
        expect(isEmailAvailable).not.toHaveBeenCalled();
        expect(store.emailExists.get()).toBe(false);
    });

    it('asks when the configuration says guests can sign in, and when it does not say', async () => {
        installConfig(true);
        await mount();
        type('roni@example.com');
        blur();
        expect(isEmailAvailable).toHaveBeenCalledTimes(1);

        document.body.innerHTML = '';
        isEmailAvailable.mockClear();
        store = createStore();
        setStoreForTests(store);
        installConfig();
        await mount();
        type('roni@example.com');
        blur();
        expect(isEmailAvailable).toHaveBeenCalledTimes(1);
    });

    it('forgets the answer as soon as the value changes', async () => {
        isEmailAvailable.mockResolvedValue(false);
        await mount();
        type('roni@example.com');
        blur();
        await flush();
        expect(store.emailExists.get()).toBe(true);

        type('roni@example.co');
        expect(store.emailExists.get()).toBe(false);
        await el.updateComplete;
        expect(el.querySelector('hc-text-input[name="password"]')).toBeNull();
    });

    it('drops a late answer for a value that is no longer in the field', async () => {
        const older = deferNextAnswer();
        const newer = deferNextAnswer();
        await mount();
        type('roni@example.com');
        blur();
        type('veronica@example.com');
        blur();
        expect(isEmailAvailable).toHaveBeenCalledTimes(2);

        newer.resolve(true);
        await flush();
        expect(store.emailExists.get()).toBe(false);

        older.resolve(false);
        await flush();
        expect(store.emailExists.get()).toBe(false);
    });

    it('drops an answer when the field value changed without an edit of the field', async () => {
        const pending = deferNextAnswer();
        await mount();
        type('roni@example.com');
        blur();
        store.email.set('veronica@example.com');

        pending.resolve(false);
        await flush();
        expect(store.emailExists.get()).toBe(false);
    });

    it('drops the answer of a check that the next edit replaced, before any new check starts', async () => {
        const pending = deferNextAnswer();
        await mount();
        type('roni@example.com');
        blur();
        type('roni@example.co');

        pending.resolve(false);
        await flush();
        expect(store.emailExists.get()).toBe(false);
    });

    it('keeps the checking note for the running check when an older one ends', async () => {
        const older = deferNextAnswer();
        const newer = deferNextAnswer();
        await mount();
        type('roni@example.com');
        blur();
        type('veronica@example.com');
        blur();

        older.resolve(true);
        await flush();
        await el.updateComplete;
        expect(el.textContent).toContain(enUS['Hyperion_Checkout::checking_email']);

        newer.resolve(true);
        await flush();
        await el.updateComplete;
        expect(el.textContent).not.toContain(enUS['Hyperion_Checkout::checking_email']);
    });

    it('lets the same value be asked again after a failed request', async () => {
        const failing = deferNextAnswer();
        await mount();
        type('roni@example.com');
        blur();
        failing.reject(new Error('offline'));
        await flush();
        expect(store.emailExists.get()).toBe(false);

        blur();
        expect(isEmailAvailable).toHaveBeenCalledTimes(2);
    });

    it('asks nothing after the element left the page', async () => {
        await mount();
        type('roni@example.com');
        el.remove();
        vi.advanceTimersByTime(TYPING_PAUSE_MS * 2);
        expect(isEmailAvailable).not.toHaveBeenCalled();
    });
});

describe('<checkout-email> form', () => {
    let store: Store;
    let el: CheckoutEmail;

    function emailField(): HTMLElement & { hint: string; error: string } {
        return el.querySelector('hc-text-input[name="email"]') as HTMLElement & { hint: string; error: string };
    }

    function type(value: string): void {
        emailField().dispatchEvent(new CustomEvent('value-change', { detail: { value, name: 'email' }, bubbles: true }));
    }

    function blur(value: string = store.email.get()): void {
        emailField().dispatchEvent(new CustomEvent('value-blur', { detail: { value, name: 'email' }, bubbles: true }));
    }

    async function settle(): Promise<void> {
        for (let i = 0; i < 4; i += 1) {
            await flush();
            await el.updateComplete;
            await Promise.all(
                Array.from(el.querySelectorAll('hc-text-input, hc-button'))
                    .map((child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete)
            );
        }
    }

    async function mount(): Promise<void> {
        el = document.createElement('checkout-email');
        document.body.appendChild(el);
        await settle();
    }

    /** A customer email whose account was found, with the password form opened. */
    async function openLogin(): Promise<HTMLFormElement> {
        isEmailAvailable.mockResolvedValue(false);
        await mount();
        type('roni@example.com');
        blur();
        await settle();
        (el.querySelector('[data-hyperion-login-open]') as HTMLButtonElement).click();
        await settle();
        return el.querySelector('form[data-hyperion-login-form]') as HTMLFormElement;
    }

    beforeEach(() => {
        isEmailAvailable.mockReset();
        isEmailAvailable.mockResolvedValue(true);
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        installConfig();
        store = createStore();
        setStoreForTests(store);
        resetCaptchaStateForTests();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    it('raises no error while typing, validates on blur, and typing a valid value clears the error', async () => {
        await mount();
        type('roni@');
        expect(store.fieldErrors.get()['email']).toBeUndefined();

        blur();
        expect(store.fieldErrors.get()['email']).toBe('Please enter a valid email address.');

        type('roni@exam');
        expect(store.fieldErrors.get()['email']).toBe('Please enter a valid email address.');

        type('roni@example.com');
        expect(store.fieldErrors.get()['email']).toBeUndefined();
    });

    it('shows the availability check in the message line of the field', async () => {
        const answer = deferNextAnswer();
        await mount();
        type('roni@example.com');
        blur();
        await el.updateComplete;
        expect(emailField().hint).toBe('Checking\u2026');
        expect(el.querySelectorAll('.hc-field-message').length).toBe(1);

        answer.resolve(true);
        await settle();
        expect(emailField().hint).toBe('');
    });

    it('reserves the login line only when guests may sign in here', async () => {
        await mount();
        const slot = el.querySelector('[data-hyperion-login-slot]');
        expect(slot).not.toBeNull();
        expect(slot?.textContent?.trim()).toBe('');

        document.body.innerHTML = '';
        installConfig(false);
        store.emailExists.set(true);
        await mount();
        expect(el.querySelector('[data-hyperion-login-slot]')).toBeNull();
        expect(el.querySelector('form')).toBeNull();
    });

    it('opens the password form on the click, as a form with the fields in order and the captcha position', async () => {
        const form = await openLogin();
        expect(form).not.toBeNull();
        expect(form.id).toBe(el.querySelector('[data-hyperion-login-open]')?.getAttribute('aria-controls'));
        expect(el.querySelector('[data-hyperion-login-open]')?.getAttribute('aria-expanded')).toBe('true');
        const password = form.querySelector('input[name="password"]') as HTMLInputElement;
        expect(password.getAttribute('autocomplete')).toBe('current-password');
        const captcha = form.querySelector('[data-hyperion-login-captcha]')!;
        const submit = form.querySelector('hc-button[variant="primary"] button') as HTMLButtonElement;
        expect(submit.type).toBe('submit');
        expect(password.compareDocumentPosition(captcha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(captcha.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const ids = Array.from(el.querySelectorAll('[id]')).map((node) => node.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('submitting the form requests one login, is busy until it fails, then empties the password', async () => {
        const form = await openLogin();
        const requests: Event[] = [];
        el.addEventListener('login-request', (e) => requests.push(e));
        store.password.set('wrong');
        await settle();

        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
        expect(submitEvent.defaultPrevented).toBe(true);
        expect(requests.length).toBe(1);
        await settle();
        const submit = form.querySelector('hc-button[variant="primary"] button') as HTMLButtonElement;
        expect(submit.disabled).toBe(true);
        expect(form.getAttribute('aria-busy')).toBe('true');

        // A second submit while the login runs is ignored.
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(requests.length).toBe(1);

        store.loginError.set('Sign-in failed.');
        await settle();
        expect(store.password.get()).toBe('');
        expect(submit.disabled).toBe(false);
        expect(form.getAttribute('aria-busy')).toBe('false');
        expect((form.querySelector('hc-text-input[name="password"]') as HTMLElement & { error: string }).error).toBe('Sign-in failed.');

        // The same refusal again still ends the next attempt.
        store.password.set('wrong again');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(requests.length).toBe(2);
        expect(store.loginError.get()).toBeNull();
        store.loginError.set('Sign-in failed.');
        await settle();
        expect(store.password.get()).toBe('');
        expect(submit.disabled).toBe(false);
    });

    it('a refused CAPTCHA ends the busy state and leaves the password alone', async () => {
        const form = await openLogin();
        store.password.set('right');
        await settle();
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await settle();
        const submit = form.querySelector('hc-button[variant="primary"] button') as HTMLButtonElement;
        expect(submit.disabled).toBe(true);

        setCaptchaError('user_login', 'Incorrect CAPTCHA');
        await settle();
        expect(submit.disabled).toBe(false);
        expect(store.password.get()).toBe('right');

        // The next attempt starts without the old CAPTCHA error, so the same refusal ends it again.
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await settle();
        expect(submit.disabled).toBe(true);
        setCaptchaError('user_login', 'Incorrect CAPTCHA');
        await settle();
        expect(submit.disabled).toBe(false);
    });

    it('links to the password reset page of the store, same origin only', async () => {
        const base = guestFixture as unknown as CheckoutConfig;
        setCheckoutConfig({ ...base, hyperion: { ...base.hyperion, forgotPasswordUrl: `${window.location.origin}/customer/account/forgotpassword/` } });
        let form = await openLogin();
        const link = form.querySelector('[data-hyperion-forgot-password]') as HTMLAnchorElement;
        expect(link.textContent?.trim()).toBe('Forgot your password?');
        expect(link.getAttribute('href')).toContain('/customer/account/forgotpassword/');

        document.body.innerHTML = '';
        store.emailExists.set(false);
        store.email.set('');
        setCheckoutConfig({ ...base, forgotPasswordUrl: '', hyperion: { ...base.hyperion, forgotPasswordUrl: 'https://elsewhere.example/reset' } } as CheckoutConfig);
        form = await openLogin();
        expect(form.querySelector('[data-hyperion-forgot-password]')).toBeNull();
    });

    it('another email closes the form and forgets the password and the error', async () => {
        await openLogin();
        store.password.set('secret');
        store.loginError.set('Sign-in failed.');
        type('other@example.com');
        await settle();
        expect(el.querySelector('form')).toBeNull();
        expect(store.password.get()).toBe('');
        expect(store.loginError.get()).toBeNull();
    });

    it('takes the placeholder from the catalog', async () => {
        await mount();
        expect(el.querySelector('input[name="email"]')?.getAttribute('placeholder')).toBe('you@example.com');
        expect(el.querySelector('input[name="email"]')?.getAttribute('spellcheck')).toBe('false');
    });
});
