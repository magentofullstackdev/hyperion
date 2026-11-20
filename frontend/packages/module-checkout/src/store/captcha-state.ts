// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Anti-abuse state of the checkout.
 *
 * Image CAPTCHA: which of Magento's forms require an answer and what the
 * shopper typed live in `store.captcha` per form id; the message of a
 * refused answer and the rendered field of a form are kept here, next to
 * it. A form the store does not list yet is read from the configuration.
 *
 * reCAPTCHA: the configuration of a protected action and the token of a
 * ticked checkbox widget. The widgets themselves belong to
 * `components/hyperion-recaptcha.ts`; the gate and the hint only need to
 * know whether a token is there, which is what this module answers.
 */
import { Signal } from 'signal-polyfill';

import { peekCheckoutConfig } from '../bootstrap-config.js';
import type {
    CaptchaFormId,
    CaptchaFormState,
    CaptchaStateMap,
    RecaptchaAction,
    RecaptchaActionConfig,
} from '../types/captcha.js';
import { getStore, type Store } from './index.js';

export type { CaptchaFormId, CaptchaFormState, CaptchaStateMap };

export const CAPTCHA_FORM_IDS: readonly CaptchaFormId[] = [
    'user_login',
    'sales_rule_coupon_request',
    'payment_processing_request',
];

export const RECAPTCHA_ACTIONS: readonly RecaptchaAction[] = [
    'place_order',
    'coupon_code',
    'customer_login',
    'braintree',
];

/** What the checkout needs from a rendered CAPTCHA field. */
export interface CaptchaFieldHandle {
    refresh: () => Promise<boolean>;
    focus: () => void;
}

type CaptchaErrors = Readonly<Partial<Record<CaptchaFormId, string>>>;
type CheckboxTokens = Readonly<Partial<Record<RecaptchaAction, string>>>;

const captchaErrors = new Signal.State<CaptchaErrors>({});
const checkboxTokens = new Signal.State<CheckboxTokens>({});
const fields = new Map<CaptchaFormId, CaptchaFieldHandle>();

/** Put the forms of the configuration into the store; forms it does not list stay absent. */
export function seedCaptchaState(forms: CaptchaStateMap | undefined): void {
    getStore().captcha.set({ ...(forms ?? {}) });
}

/** The state of a form: the store's, else the configuration's, else null (the form does not exist). */
export function captchaForm(store: Store, formId: CaptchaFormId): CaptchaFormState | null {
    return store.captcha.get()[formId]
        ?? peekCheckoutConfig()?.hyperion?.captcha?.forms?.[formId]
        ?? null;
}

export function isCaptchaRequired(store: Store, formId: CaptchaFormId): boolean {
    return captchaForm(store, formId)?.isRequired === true;
}

/** The answer to send for a form: what was typed while the form requires one, empty otherwise. */
export function captchaAnswer(store: Store, formId: CaptchaFormId): string {
    const form = captchaForm(store, formId);
    return form?.isRequired === true ? (form.value ?? '').trim() : '';
}

function writeForm(store: Store, formId: CaptchaFormId, next: CaptchaFormState): void {
    store.captcha.set({ ...store.captcha.get(), [formId]: next });
}

/** Keep what the shopper typed for a form. */
export function setCaptchaAnswer(formId: CaptchaFormId, value: string): void {
    const store = getStore();
    const form = captchaForm(store, formId);
    if (form === null || (form.value ?? '') === value) return;
    writeForm(store, formId, { ...form, value });
}

/**
 * Apply which forms require an answer right now. A form that stopped
 * requiring one loses its typed answer and its message.
 */
export function applyCaptchaRequirements(required: Readonly<Partial<Record<CaptchaFormId, boolean>>>): void {
    const store = getStore();
    for (const formId of CAPTCHA_FORM_IDS) {
        const isRequired = required[formId];
        if (isRequired === undefined) continue;
        const form = captchaForm(store, formId);
        if (form === null) {
            writeForm(store, formId, { isRequired, isCaseSensitive: false, imageHeight: 50, imageWidth: 200 });
            continue;
        }
        if (form.isRequired === isRequired && store.captcha.get()[formId] !== undefined) continue;
        if (isRequired) {
            writeForm(store, formId, { ...form, isRequired });
        } else {
            const { value: _typed, ...rest } = form;
            writeForm(store, formId, { ...rest, isRequired });
            setCaptchaError(formId, null);
        }
    }
}

/** The message of the last refused answer of a form; null when there is none. */
export function captchaError(formId: CaptchaFormId): string | null {
    return captchaErrors.get()[formId] ?? null;
}

export function setCaptchaError(formId: CaptchaFormId, message: string | null): void {
    const current = captchaErrors.get();
    if ((current[formId] ?? null) === message) return;
    const { [formId]: _previous, ...rest } = current;
    captchaErrors.set(message === null ? rest : { ...rest, [formId]: message });
}

/** Register the rendered field of a form; the returned function takes it back. */
export function attachCaptchaField(formId: CaptchaFormId, field: CaptchaFieldHandle): () => void {
    fields.set(formId, field);
    return () => {
        if (fields.get(formId) === field) fields.delete(formId);
    };
}

export function focusCaptchaField(formId: CaptchaFormId): void {
    fields.get(formId)?.focus();
}

/**
 * An answer that reached Magento is spent whatever the verdict was (the
 * word is cleared by the check itself): forget it and ask for a new image.
 */
export function spendCaptchaAnswer(formId: CaptchaFormId): void {
    setCaptchaAnswer(formId, '');
    void fields.get(formId)?.refresh();
}

/** The reCAPTCHA configuration of an action; null when the action is not protected. */
export function recaptchaConfigFor(action: RecaptchaAction): RecaptchaActionConfig | null {
    const entry = peekCheckoutConfig()?.hyperion?.recaptcha?.[action];
    if (!entry || typeof entry.siteKey !== 'string' || entry.siteKey === '') return null;
    return entry;
}

/** True when at least one action of the checkout is protected by reCAPTCHA. */
export function isRecaptchaConfigured(): boolean {
    return RECAPTCHA_ACTIONS.some((action) => recaptchaConfigFor(action) !== null);
}

/** The token of the ticked checkbox widget of an action; empty while it is not ticked. */
export function recaptchaCheckboxToken(action: RecaptchaAction): string {
    return checkboxTokens.get()[action] ?? '';
}

export function setRecaptchaCheckboxToken(action: RecaptchaAction, token: string): void {
    const current = checkboxTokens.get();
    if ((current[action] ?? '') === token) return;
    const { [action]: _previous, ...rest } = current;
    checkboxTokens.set(token === '' ? rest : { ...rest, [action]: token });
}

/** True when the action shows a checkbox widget that is not ticked. */
export function isRecaptchaCheckboxMissing(action: RecaptchaAction): boolean {
    return recaptchaConfigFor(action)?.type === 'v2-checkbox' && recaptchaCheckboxToken(action) === '';
}

export function resetCaptchaStateForTests(): void {
    captchaErrors.set({});
    checkboxTokens.set({});
    fields.clear();
}
