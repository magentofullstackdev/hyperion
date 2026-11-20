// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The security checks a shopper has to complete inside a form of the
 * checkout, as self-contained elements that only need to be placed:
 *
 *   <hc-login-captcha>   under the password field of the inline login
 *   <hc-coupon-captcha>  inside the coupon form
 *   <hc-order-captcha>   above Place Order
 *
 * Each renders the image CAPTCHA of its form while Magento requires an
 * answer there, and the visible reCAPTCHA checkbox of its action when the
 * action is configured with that type. With neither it renders nothing.
 * The typed answer goes to `store.captcha`; the requests read it from
 * there, and a refused answer comes back as the field's error.
 *
 * The image CAPTCHA element is a chunk of its own, loaded the first time a
 * form requires an answer: most checkouts never show one. A form that
 * requires it when the page loads has it defined before the application
 * mounts (`optional-sections.ts`); a form that starts to require it later
 * (after refused attempts) shows the field as soon as the chunk arrived.
 *
 * The checkbox widget loads Google's script, which never loads with the
 * page: it is mounted at the shopper's first interaction with the page,
 * at once when that already happened. Its box keeps the widget's height
 * from the first render, so nothing moves when the widget arrives. A
 * widget cannot be rendered twice into one element, so the box is a new
 * element whenever the action changes (another payment method).
 */
import { LitElement, html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { SignalWatcher } from '@lit-labs/signals';
import { Signal } from 'signal-polyfill';

import { peekCheckoutConfig } from '../bootstrap-config.js';
import {
    attachCaptchaField,
    captchaError,
    captchaForm,
    recaptchaConfigFor,
    setCaptchaAnswer,
    setCaptchaError,
} from '../store/captcha-state.js';
import { getStore } from '../store/index.js';
import type { CaptchaFormId, RecaptchaAction } from '../types/captcha.js';
import { t } from '../utils/i18n.js';
import { orderRecaptchaAction } from '../store/anti-abuse.js';
import type { CaptchaChangeDetail, CaptchaField } from './captcha-field.js';
import { mountRecaptchaCheckbox, unmountRecaptchaCheckbox } from './hyperion-recaptcha.js';

/** Set once the chunk of `<hc-captcha>` arrived, so the fields that wait for it render again. */
const captchaFieldLoaded = new Signal.State(false);
let captchaFieldLoad: Promise<void> | null = null;

/** `<hc-captcha>` is defined: by the page before the mount, or by `loadCaptchaField()`. */
function isCaptchaFieldDefined(): boolean {
    return captchaFieldLoaded.get() || customElements.get('hc-captcha') !== undefined;
}

function loadCaptchaField(): void {
    captchaFieldLoad ??= import('./captcha-field.js')
        .then(() => { captchaFieldLoaded.set(true); })
        .catch((err: unknown) => {
            // The next render of a field that needs it asks again.
            captchaFieldLoad = null;
            console.error('[hyperion-checkout] the CAPTCHA field failed to load', err);
        });
}

// Not `focusin`: the checkout moves the focus by itself (the password field), which is no interaction.
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

let interacted = false;
const waiting = new Set<() => void>();

/** Listen from the start: a form that opens later must know the shopper was already there. */
function watchFirstInteraction(): void {
    for (const type of INTERACTION_EVENTS) {
        document.addEventListener(type, onFirstInteraction, { capture: true, passive: true });
    }
}

function onFirstInteraction(): void {
    interacted = true;
    for (const type of INTERACTION_EVENTS) document.removeEventListener(type, onFirstInteraction, true);
    const callbacks = Array.from(waiting);
    waiting.clear();
    callbacks.forEach((callback) => callback());
}

/** Run `callback` once the shopper has interacted with the page; the returned function cancels it. */
function afterFirstInteraction(callback: () => void): () => void {
    if (interacted) {
        callback();
        return () => undefined;
    }
    waiting.add(callback);
    return () => { waiting.delete(callback); };
}

export function resetInteractionForTests(): void {
    interacted = false;
    waiting.clear();
    for (const type of INTERACTION_EVENTS) document.removeEventListener(type, onFirstInteraction, true);
    watchFirstInteraction();
}

watchFirstInteraction();

export abstract class AntiAbuseField extends SignalWatcher(LitElement) {
    /** The image CAPTCHA form of this place. */
    protected abstract readonly formId: CaptchaFormId;

    /** The reCAPTCHA action of this place right now; null for none. */
    protected abstract recaptchaAction(): RecaptchaAction | null;

    private _detachField: (() => void) | null = null;
    private _attachedField: CaptchaField | null = null;
    private _cancelMount: (() => void) | null = null;
    private _mounted: { action: RecaptchaAction; host: HTMLElement } | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._releaseField();
        this._releaseCheckbox();
    }

    public override render(): unknown {
        const form = captchaForm(getStore(), this.formId);
        const refreshUrl = peekCheckoutConfig()?.hyperion?.captcha?.refreshUrl ?? '';
        const action = this._checkboxAction();
        if (form?.isRequired !== true && action === null) return nothing;
        // The field is only rendered as a defined element: its methods are called right after.
        const showField = form?.isRequired === true && isCaptchaFieldDefined();
        if (form?.isRequired === true && !showField) loadCaptchaField();
        return html`
            <div class="space-y-3">
                ${form !== null && showField ? html`
                    <hc-captcha form-id=${this.formId}
                                refresh-url=${refreshUrl}
                                image-width=${form.imageWidth}
                                image-height=${form.imageHeight}
                                ?case-sensitive=${form.isCaseSensitive}
                                required
                                label=${t('Hyperion_Checkout::captcha_label')}
                                reload-label=${t('Hyperion_Checkout::captcha_reload')}
                                case-note=${t('Hyperion_Checkout::captcha_case_note')}
                                error=${captchaError(this.formId) ?? ''}
                                @hyperion:captcha-change=${this._onAnswer}></hc-captcha>
                ` : nothing}
                ${action !== null ? keyed(action, html`
                    <div class="min-h-[78px]" data-hc-recaptcha-checkbox=${action}></div>
                `) : nothing}
            </div>
        `;
    }

    protected override updated(): void {
        this._syncField();
        this._syncCheckbox();
    }

    /** The action whose visible checkbox belongs here; null when the action has another type or none. */
    private _checkboxAction(): RecaptchaAction | null {
        const action = this.recaptchaAction();
        return action !== null && recaptchaConfigFor(action)?.type === 'v2-checkbox' ? action : null;
    }

    private _onAnswer = (event: Event): void => {
        const { detail } = event as CustomEvent<CaptchaChangeDetail>;
        setCaptchaAnswer(this.formId, detail.value);
        if (detail.value !== '') setCaptchaError(this.formId, null);
    };

    private _syncField(): void {
        const field = this.querySelector<CaptchaField>('hc-captcha');
        if (field === this._attachedField) return;
        this._releaseField();
        if (field === null) return;
        this._attachedField = field;
        this._detachField = attachCaptchaField(this.formId, {
            refresh: () => field.refresh(),
            focus: () => field.focus(),
        });
    }

    private _releaseField(): void {
        this._detachField?.();
        this._detachField = null;
        this._attachedField = null;
    }

    private _syncCheckbox(): void {
        const host = this.querySelector<HTMLElement>('[data-hc-recaptcha-checkbox]');
        const action = host === null ? null : this._checkboxAction();
        if (this._mounted !== null && (this._mounted.host !== host || this._mounted.action !== action)) {
            this._releaseCheckbox();
        }
        if (host === null || action === null || this._mounted !== null) return;
        this._mounted = { action, host };
        this._cancelMount = afterFirstInteraction(() => {
            this._cancelMount = null;
            // A failed load is tried again when the token is asked for.
            mountRecaptchaCheckbox(action, host).catch((err: unknown) => {
                console.warn('[hyperion-checkout] reCAPTCHA', err);
            });
        });
    }

    private _releaseCheckbox(): void {
        this._cancelMount?.();
        this._cancelMount = null;
        if (this._mounted === null) return;
        unmountRecaptchaCheckbox(this._mounted.action, this._mounted.host);
        this._mounted = null;
    }
}

export class LoginCaptcha extends AntiAbuseField {
    protected readonly formId = 'user_login' as const;
    protected recaptchaAction(): RecaptchaAction | null { return 'customer_login'; }
}

export class CouponCaptcha extends AntiAbuseField {
    protected readonly formId = 'sales_rule_coupon_request' as const;
    protected recaptchaAction(): RecaptchaAction | null { return 'coupon_code'; }
}

export class OrderCaptcha extends AntiAbuseField {
    protected readonly formId = 'payment_processing_request' as const;
    /** The action follows the selected payment method. */
    protected recaptchaAction(): RecaptchaAction | null { return orderRecaptchaAction(getStore()); }
}

if (!customElements.get('hc-login-captcha')) customElements.define('hc-login-captcha', LoginCaptcha);
if (!customElements.get('hc-coupon-captcha')) customElements.define('hc-coupon-captcha', CouponCaptcha);
if (!customElements.get('hc-order-captcha')) customElements.define('hc-order-captcha', OrderCaptcha);

declare global {
    interface HTMLElementTagNameMap {
        'hc-login-captcha': LoginCaptcha;
        'hc-coupon-captcha': CouponCaptcha;
        'hc-order-captcha': OrderCaptcha;
    }
}
