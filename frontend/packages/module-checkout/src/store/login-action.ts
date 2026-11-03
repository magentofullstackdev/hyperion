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
 */
import { loginOnStorefront } from '../api/cart.js';
import { MagentoApiError } from '../api/client.js';
import { getStore } from './index.js';
import { t } from '../utils/i18n.js';
import { executeRecaptcha } from '../components/hyperion-recaptcha.js';

export interface InlineLoginDeps {
    /** Reloads the checkout page after a successful login. */
    reload: () => void;
}

const defaultDeps: InlineLoginDeps = {
    reload: () => window.location.reload(),
};

export async function inlineLogin(deps: InlineLoginDeps = defaultDeps): Promise<boolean> {
    const store = getStore();
    const username = store.email.get().trim();
    const password = store.password.get();
    if (!username || !password) {
        store.loginError.set(t('Hyperion_Checkout::validation_required'));
        return false;
    }
    try {
        const recaptchaToken = await executeRecaptcha('login');
        const result = await loginOnStorefront({ username, password }, recaptchaToken);
        if (result.errors) {
            store.loginError.set(result.message || t('Hyperion_Checkout::login_generic_error'));
            return false;
        }
        store.password.set('');
        store.loginError.set(null);
        deps.reload();
        return true;
    } catch (err) {
        const message = err instanceof MagentoApiError
            ? err.message
            : t('Hyperion_Checkout::login_generic_error');
        store.loginError.set(message);
        return false;
    }
}
