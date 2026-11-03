// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-email> -- email field with async availability check.
 *
 * When the user types an email that belongs to an existing customer,
 * `isEmailAvailable()` returns false and we reveal an inline password
 * input. The component emits a `login-request` event for
 * the inline-login action to handle.
 *
 * When the user is already logged-in at page load, the checkout-app
 * renders the customer's email read-only instead of this component,
 * so this code path only runs for guests.
 */
import { LitElement, html } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { isEmailAvailable } from '../api/cart.js';
import { debounce } from '../utils/debounce.js';
import { email as emailValidator } from '../validation/rules.js';
import { t } from '../utils/i18n.js';
import './ui/text-input.js';
import './ui/button.js';

export class CheckoutEmail extends SignalWatcher(LitElement) {
    @state() private accessor _checking = false;

    private _checkAvailability = debounce((value: string) => {
        if (emailValidator(value) !== null) {
            this._checking = false;
            return;
        }
        this._checking = true;
        void isEmailAvailable({ customerEmail: value })
            .then((available) => {
                const store = getStore();
                // Magento returns `true` when the email is free to create.
                // We flip the semantic to "emailExists" for clarity.
                store.emailExists.set(!available);
            })
            .catch(() => {
                // Non-fatal: the user can still proceed as guest.
            })
            .finally(() => { this._checking = false; });
    }, 500);

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const emailValue = store.email.get();
        const emailExists = store.emailExists.get();
        const loginError = store.loginError.get();
        const fieldErrors = store.fieldErrors.get();
        const fieldError = fieldErrors['email'] ?? '';

        return html`
            <div class="space-y-3">
                <hc-text-input
                    label=${t('Hyperion_Checkout::email_label')}
                    name="email"
                    type="email"
                    autocomplete="email"
                    inputmode="email"
                    .value=${emailValue}
                    .required=${true}
                    .error=${fieldError}
                    placeholder="you@example.com"
                    @value-change=${this._onEmailInput}
                    @value-blur=${this._onEmailBlur}
                ></hc-text-input>
                ${this._checking
                    ? html`<p class="text-xs text-muted">${t('Hyperion_Checkout::checking_email')}</p>`
                    : null}
                ${emailExists === true
                    ? this._renderPasswordBlock(loginError)
                    : null}
            </div>
        `;
    }

    private _renderPasswordBlock(loginError: string | null): unknown {
        const store = getStore();
        return html`
            <div class="rounded-md border border-subtle bg-surface-raised p-3 space-y-2"
                 role="region"
                 aria-label=${t('Hyperion_Checkout::login_aria_label')}>
                <p class="text-sm text-brand">
                    ${t('Hyperion_Checkout::email_existing_account')}
                </p>
                <hc-text-input
                    label=${t('Hyperion_Checkout::password_label')}
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    .value=${store.password.get()}
                    .required=${true}
                    .error=${loginError ?? ''}
                    @value-change=${this._onPasswordInput}
                ></hc-text-input>
                <div class="flex gap-2">
                    <hc-button variant="primary"
                               .label=${t('Hyperion_Checkout::login_button')}
                               @click=${this._onLoginClick}></hc-button>
                    <hc-button variant="ghost"
                               .label=${t('Hyperion_Checkout::continue_as_guest')}
                               @click=${this._onContinueAsGuestClick}></hc-button>
                </div>
            </div>
        `;
    }

    private _onEmailInput(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        store.email.set(e.detail.value);
        const err = emailValidator(e.detail.value);
        const errors = { ...store.fieldErrors.get() };
        if (err) {
            errors['email'] = t(err);
        } else {
            delete errors['email'];
        }
        store.fieldErrors.set(errors);
        this._checkAvailability(e.detail.value);
    }

    private _onEmailBlur(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        const err = emailValidator(e.detail.value);
        if (err) {
            const errors = { ...store.fieldErrors.get() };
            errors['email'] = t(err);
            store.fieldErrors.set(errors);
        }
    }

    private _onPasswordInput(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        store.password.set(e.detail.value);
        if (store.loginError.get()) store.loginError.set(null);
    }

    private _onLoginClick(): void {
        this.dispatchEvent(new CustomEvent('login-request', {
            bubbles: true,
            composed: true,
        }));
    }

    private _onContinueAsGuestClick(): void {
        const store = getStore();
        store.emailExists.set(false);
        store.password.set('');
        store.loginError.set(null);
    }
}

if (!customElements.get('checkout-email')) {
    customElements.define('checkout-email', CheckoutEmail);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-email': CheckoutEmail; }
}
