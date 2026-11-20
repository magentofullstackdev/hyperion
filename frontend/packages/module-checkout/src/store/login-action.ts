// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Inline-login action.
 *
 * Signs the shopper in through the storefront AJAX login controller, so the
 * PHP customer session starts, core merges the guest quote into the
 * customer's quote and the cookies every session-bound gateway needs are
 * set, then reloads the checkout: the bundle boots again from the server's
 * config (merged quote, items, totals, saved addresses, payment methods)
 * instead of patching a guest state that no longer matches the quote.
 * A REST customer token would do none of that (it is not a session), which
 * is why the former token-based login was replaced.
 *
 * Anti-abuse: the reCAPTCHA token of the login action travels with the
 * request, and so does the answer of the image CAPTCHA `user_login` while
 * Magento requires one. That form starts to require an answer after failed
 * attempts, so its state is read again after every refused login, and an
 * answer that was sent is spent: the field gets a new image.
 *
 * Before the reload what the shopper typed is handed over to the next
 * boot, which runs for another quote.
 */
import { loadCaptchaState } from '../api/captcha.js';
import { loginOnStorefront } from '../api/cart.js';
import { MagentoApiError } from '../api/client.js';
import { isCaptchaMessage } from '../api/error-kinds.js';
import { executeRecaptcha } from '../components/hyperion-recaptcha.js';
import { t } from '../utils/i18n.js';
import {
    captchaAnswer,
    focusCaptchaField,
    isCaptchaRequired,
    setCaptchaError,
    spendCaptchaAnswer,
} from './captcha-state.js';
import { copyDraftToHandoff } from './drafts.js';
import { getStore, type Store } from './index.js';

export interface InlineLoginDeps {
    /** Reloads the checkout page after a successful login. */
    reload: () => void;
}

const defaultDeps: InlineLoginDeps = {
    reload: () => window.location.reload(),
};

const CAPTCHA_FORM = 'user_login';

/**
 * A login request was refused or lost: bring the CAPTCHA up to date, then
 * show the message. A refusal of the CAPTCHA answer goes next to its
 * field when the form shows one, every other message to the login form.
 */
async function afterFailedRequest(store: Store, message: string, answerSent: boolean): Promise<void> {
    if (answerSent) spendCaptchaAnswer(CAPTCHA_FORM);
    await loadCaptchaState();
    if (isCaptchaMessage(message) && isCaptchaRequired(store, CAPTCHA_FORM)) {
        setCaptchaError(CAPTCHA_FORM, message);
        store.loginError.set(null);
        return;
    }
    setCaptchaError(CAPTCHA_FORM, null);
    store.loginError.set(message);
}

export async function inlineLogin(deps: InlineLoginDeps = defaultDeps): Promise<boolean> {
    const store = getStore();
    const username = store.email.get().trim();
    const password = store.password.get();
    if (!username || !password) {
        store.loginError.set(t('Hyperion_Checkout::validation_required'));
        return false;
    }
    const answer = captchaAnswer(store, CAPTCHA_FORM);
    if (isCaptchaRequired(store, CAPTCHA_FORM) && answer === '') {
        setCaptchaError(CAPTCHA_FORM, t('Hyperion_Checkout::validation_required'));
        focusCaptchaField(CAPTCHA_FORM);
        return false;
    }
    let recaptchaToken: string | null;
    try {
        recaptchaToken = await executeRecaptcha('customer_login');
    } catch (err) {
        // No request was sent: the message of the security check is all there is to show.
        const reason = err instanceof Error ? (err as { reason?: unknown }).reason : undefined;
        store.loginError.set(err instanceof Error && (reason === 'failed' || reason === 'required')
            ? err.message
            : t('Hyperion_Checkout::recaptcha_failed'));
        return false;
    }
    try {
        const result = await loginOnStorefront({ username, password }, recaptchaToken, answer || null);
        if (result.errors) {
            await afterFailedRequest(store, result.message || t('Hyperion_Checkout::login_generic_error'), answer !== '');
            return false;
        }
    } catch (err) {
        const message = err instanceof MagentoApiError
            ? err.message
            : t('Hyperion_Checkout::login_generic_error');
        await afterFailedRequest(store, message, answer !== '');
        return false;
    }
    store.password.set('');
    store.loginError.set(null);
    setCaptchaError(CAPTCHA_FORM, null);
    try {
        copyDraftToHandoff();
    } catch (err) {
        // Losing the typed fields must not keep the shopper on a page that no longer matches the session.
        console.warn('[hyperion-checkout] draft handoff', err);
    }
    deps.reload();
    return true;
}
