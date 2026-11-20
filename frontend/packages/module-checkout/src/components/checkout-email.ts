// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-email>: email field with an asynchronous availability check.
 *
 * When the email belongs to an existing customer, `isEmailAvailable()`
 * answers false and a one-line notice with a "Sign in" control appears in
 * a line that is reserved under the field (present whenever guests may
 * sign in here, so the answer, which arrives on its own time, moves
 * nothing). The password form opens below that line on the shopper's
 * click. Submitting it emits a `login-request` event for the inline login
 * action to handle; the form is busy until that action reports a failure
 * (a success reloads the page): `loginError` for a refused login, which
 * also empties the password, or the error of the login form's CAPTCHA,
 * which leaves the password alone.
 *
 * The email is validated when the field loses the focus; while typing an
 * error that no longer applies is only taken away.
 *
 * The availability is asked when the field loses the focus or after a
 * pause in the typing, only for a value with the email shape, once per
 * value, and never when guests cannot sign in from the checkout. A new
 * check replaces the running one, and an answer for a value that is no
 * longer in the field is dropped.
 *
 * When the user is already logged-in at page load, the checkout-app
 * renders the customer's email read-only instead of this component,
 * so this code path only runs for guests.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { peekCheckoutConfig } from '../bootstrap-config.js';
import { getStore } from '../store/index.js';
import { captchaError, setCaptchaError } from '../store/captcha-state.js';
import { isEmailAvailable } from '../api/cart.js';
import { debounce } from '../utils/debounce.js';
import { email as emailValidator } from '../validation/rules.js';
import { t } from '../utils/i18n.js';
import { resolveSameOriginUrl } from '../utils/safe-redirect.js';
import './section-status.js';
import './anti-abuse-field.js';
import './ui/text-input.js';
import './ui/button.js';

/** How long the field stays untouched before the availability of its value is asked. */
const AVAILABILITY_TYPING_DELAY_MS = 800;

/**
 * Whether a guest may sign in from the email step. With the option off the
 * endpoint answers "available" for every address, so asking tells nothing.
 * A configuration without the key counts as on.
 */
function isAvailabilityCheckEnabled(): boolean {
    return peekCheckoutConfig()?.hyperion?.guestCheckoutLoginEnabled !== false;
}

/** The "Forgot your password?" target: Hyperion's key, else core's, same origin only. */
function forgotPasswordUrl(): string | null {
    const cfg = peekCheckoutConfig();
    const raw = cfg?.hyperion?.forgotPasswordUrl || cfg?.forgotPasswordUrl || '';
    return raw === '' ? null : resolveSameOriginUrl(raw);
}

const LOGIN_FORM_ID = 'hc-login-form';

/** The form id of Magento's CAPTCHA on the login. */
const CAPTCHA_FORM = 'user_login';

export class CheckoutEmail extends SignalWatcher(LitElement) {
    @state() private accessor _checking = false;

    /** The shopper opened the password form of the account found for the email. */
    @state() private accessor _loginOpen = false;

    /** A login was requested and has not reported a failure yet. */
    @state() private accessor _loginBusy = false;

    /** The running availability request; a new check or a changed value aborts it. */
    private _request: AbortController | null = null;

    /** The value the last check was started for: the same value is never asked twice in a row. */
    private _requestedValue: string | null = null;

    private _checkAfterTyping = debounce((value: string) => {
        this._checkAvailability(value);
    }, AVAILABILITY_TYPING_DELAY_MS);

    public override connectedCallback(): void {
        super.connectedCallback();
        this.classList.add('hc-host');
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._dropPendingCheck();
        this._loginBusy = false;
    }

    /**
     * The login action answers a failure by setting `loginError` or the
     * CAPTCHA error of the login form (the submit emptied both): the form
     * is usable again, without the password when it was the login that was
     * refused. The store is written after the update, never inside it.
     */
    protected override updated(): void {
        if (!this._loginBusy) return;
        const refused = getStore().loginError.get() !== null;
        if (refused || captchaError(CAPTCHA_FORM) !== null) {
            queueMicrotask(() => this._endFailedLogin(refused));
        }
    }

    private _endFailedLogin(refused: boolean): void {
        if (!this._loginBusy) return;
        this._loginBusy = false;
        // A CAPTCHA that was missed says nothing about the password, and its field takes the focus itself.
        if (!refused) return;
        getStore().password.set('');
        void this.updateComplete.then(() => {
            this.querySelector<HTMLInputElement>('input[name="password"]')?.focus({ preventScroll: true });
        });
    }

    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const store = getStore();
        const emailValue = store.email.get();
        const emailExists = store.emailExists.get();
        const loginError = store.loginError.get();
        // Read here so that a CAPTCHA refusal renders again and `updated()` ends the busy state.
        void captchaError(CAPTCHA_FORM);
        const fieldErrors = store.fieldErrors.get();
        const fieldError = fieldErrors['email'] ?? '';

        const loginEnabled = isAvailabilityCheckEnabled();
        const accountFound = loginEnabled && emailExists === true;

        return html`
            <div data-hyperion-email-step>
                <hc-text-input
                    label=${t('Hyperion_Checkout::email_label')}
                    name="email"
                    type="email"
                    id-prefix="hc-contact"
                    autocomplete="email"
                    inputmode="email"
                    capitalize="none"
                    enter-hint="next"
                    .noSpellcheck=${true}
                    .value=${emailValue}
                    .required=${true}
                    .error=${fieldError}
                    .hint=${this._checking ? t('Hyperion_Checkout::checking_email') : ''}
                    placeholder=${t('Hyperion_Checkout::email_placeholder')}
                    @value-change=${this._onEmailInput}
                    @value-blur=${this._onEmailBlur}
                ></hc-text-input>
                ${loginEnabled
                    ? html`
                          <p class="hc-reserved-line text-brand" aria-live="polite" data-hyperion-login-slot>
                              ${accountFound
                                  ? html`
                                        <span>${t('Hyperion_Checkout::email_account_found')}</span>
                                        <button type="button"
                                                class="font-medium text-accent underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-accent"
                                                aria-expanded=${this._loginOpen ? 'true' : 'false'}
                                                aria-controls=${LOGIN_FORM_ID}
                                                data-hyperion-login-open
                                                @click=${this._onLoginToggle}>
                                            ${t('Hyperion_Checkout::login_open')}
                                        </button>
                                    `
                                  : nothing}
                          </p>
                      `
                    : nothing}
                ${accountFound && this._loginOpen ? this._renderPasswordForm(loginError) : nothing}
                <hc-section-status section="contact"></hc-section-status>
            </div>
        `;
    }

    /**
     * The inline login. Children, in order: the notice, the password field,
     * the `[data-hyperion-login-captcha]` position (where a challenge of the
     * login form belongs: after the password, before the buttons), the
     * buttons with the "Forgot your password?" link.
     */
    private _renderPasswordForm(loginError: string | null): unknown {
        const store = getStore();
        const forgotUrl = forgotPasswordUrl();
        return html`
            <form id=${LOGIN_FORM_ID}
                  class="mt-3 rounded-lg border border-subtle bg-surface-raised p-3"
                  aria-label=${t('Hyperion_Checkout::login_aria_label')}
                  aria-busy=${this._loginBusy ? 'true' : 'false'}
                  novalidate
                  data-hyperion-login-form
                  @submit=${this._onLoginSubmit}>
                <p class="mb-3 text-sm text-brand">
                    ${t('Hyperion_Checkout::email_existing_account')}
                </p>
                <hc-text-input
                    label=${t('Hyperion_Checkout::password_label')}
                    name="password"
                    type="password"
                    id-prefix="hc-login"
                    autocomplete="current-password"
                    enter-hint="go"
                    .value=${store.password.get()}
                    .required=${true}
                    .error=${loginError ?? ''}
                    @value-change=${this._onPasswordInput}
                ></hc-text-input>
                <div data-hyperion-login-captcha><hc-login-captcha></hc-login-captcha></div>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                    <hc-button variant="primary"
                               type="submit"
                               .label=${t('Hyperion_Checkout::login_button')}
                               .loading=${this._loginBusy}></hc-button>
                    <hc-button variant="ghost"
                               .label=${t('Hyperion_Checkout::continue_as_guest')}
                               .disabled=${this._loginBusy}
                               @click=${this._onContinueAsGuestClick}></hc-button>
                    ${forgotUrl !== null
                        ? html`<a href=${forgotUrl}
                                  class="ml-auto text-sm font-medium text-accent hover:underline"
                                  data-hyperion-forgot-password>${t('Hyperion_Checkout::forgot_password')}</a>`
                        : nothing}
                </div>
            </form>
        `;
    }

    private _onLoginToggle(): void {
        this._loginOpen = !this._loginOpen;
        if (!this._loginOpen) return;
        void this.updateComplete.then(() => {
            this.querySelector<HTMLInputElement>('input[name="password"]')?.focus({ preventScroll: true });
        });
    }

    private _onEmailInput(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        const changed = store.email.get() !== e.detail.value;
        store.email.set(e.detail.value);
        const err = emailValidator(e.detail.value);
        // Typing never raises an error (the blur does); it only takes away one that no longer applies.
        if (err === null && store.fieldErrors.get()['email'] !== undefined) {
            const errors = { ...store.fieldErrors.get() };
            delete errors['email'];
            store.fieldErrors.set(errors);
        }
        if (changed) this._onEmailValueChanged(e.detail.value, err === null);
    }

    /**
     * What is known about the previous value says nothing about the new
     * one: the answer is forgotten, a running or waiting check is dropped
     * and a new one waits for the typing to pause.
     */
    private _onEmailValueChanged(value: string, hasEmailShape: boolean): void {
        this._dropPendingCheck();
        const store = getStore();
        store.emailExists.set(false);
        // The login form belonged to the previous address.
        this._loginOpen = false;
        if (store.password.get() !== '') store.password.set('');
        if (store.loginError.get() !== null) store.loginError.set(null);
        if (hasEmailShape && isAvailabilityCheckEnabled()) this._checkAfterTyping(value);
    }

    private _dropPendingCheck(): void {
        this._checkAfterTyping.cancel();
        this._request?.abort();
        this._request = null;
        this._requestedValue = null;
        this._checking = false;
    }

    /**
     * Ask whether `value` belongs to a customer. Nothing is sent for a
     * value without the email shape, for a value that is no longer the
     * field value, or for the value the last check was already started
     * for. An answer counts only while its request is the current one and
     * its value is still the field value.
     */
    private _checkAvailability(value: string): void {
        if (!isAvailabilityCheckEnabled()) return;
        if (emailValidator(value) !== null) return;
        const store = getStore();
        if (store.email.get() !== value || this._requestedValue === value) return;

        this._request?.abort();
        const request = new AbortController();
        this._request = request;
        this._requestedValue = value;
        this._checking = true;
        void isEmailAvailable({ customerEmail: value }, { signal: request.signal })
            .then((available) => {
                if (request.signal.aborted || store.email.get() !== value) return;
                // Magento answers true when no customer owns the address.
                store.emailExists.set(!available);
            })
            .catch(() => {
                // Not fatal: the shopper continues as a guest. The value may be asked again.
                if (this._request === request) this._requestedValue = null;
            })
            .finally(() => {
                if (this._request !== request) return;
                this._request = null;
                this._checking = false;
            });
    }

    private _onEmailBlur(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        const err = emailValidator(e.detail.value);
        if (err) {
            const errors = { ...store.fieldErrors.get() };
            errors['email'] = t(err);
            store.fieldErrors.set(errors);
        }
        this._checkAfterTyping.cancel();
        this._checkAvailability(e.detail.value);
    }

    private _onPasswordInput(e: CustomEvent<{ value: string }>): void {
        const store = getStore();
        store.password.set(e.detail.value);
        if (store.loginError.get()) store.loginError.set(null);
    }

    private _onLoginSubmit(e: Event): void {
        e.preventDefault();
        if (this._loginBusy) return;
        this._loginBusy = true;
        // Emptied first, so the failure of this attempt is a change even when its text repeats.
        getStore().loginError.set(null);
        setCaptchaError(CAPTCHA_FORM, null);
        this.dispatchEvent(new CustomEvent('login-request', {
            bubbles: true,
            composed: true,
        }));
    }

    private _onContinueAsGuestClick(): void {
        const store = getStore();
        this._loginOpen = false;
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
