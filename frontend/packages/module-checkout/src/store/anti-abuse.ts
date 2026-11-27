// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The proof that a request of the checkout comes from a person: the
 * reCAPTCHA token of the action and the image CAPTCHA answer of the form
 * Magento checks for that request.
 *
 *   order           POST payment-information: `X-ReCaptcha` for the action
 *                   the selected payment method names (place order unless
 *                   its renderer says otherwise, none when it says null)
 *                   and `X-Captcha` for `payment_processing_request`.
 *   payment-method  POST set-payment-information: `X-Captcha` only; core
 *                   never checks a reCAPTCHA token there.
 *   coupon          PUT coupons/<code>: `X-ReCaptcha` for the coupon action
 *                   and `X-Captcha` for `sales_rule_coupon_request`.
 *
 * `sendWithAntiAbuse()` wraps the request so the aftermath is handled in
 * one place: Magento clears the CAPTCHA word whenever it checks an answer,
 * so an answer that traveled is spent whatever the verdict was, and a
 * refusal may be the moment a form starts to require one.
 */
import { loadCaptchaState } from '../api/captcha.js';
import { isAbortError } from '../api/client.js';
import { classifyError } from '../api/error-kinds.js';
import { executeRecaptcha } from '../components/recaptcha-client.js';
import { selectedRecaptchaAction } from '../components/payment-host/host.js';
import type { CaptchaFormId, RecaptchaAction } from '../types/captcha.js';
import {
    captchaAnswer,
    isCaptchaRequired,
    isRecaptchaCheckboxMissing,
    setCaptchaError,
    spendCaptchaAnswer,
} from './captcha-state.js';
import type { Store } from './index.js';

export type AntiAbusePurpose = 'order' | 'payment-method' | 'coupon';

export interface AntiAbuseOptions {
    purpose: AntiAbusePurpose;
}

/** What a request carries; an absent member means there is nothing to send for it. */
export interface AntiAbuseProof {
    /** The same proof as request headers. */
    headers: Record<string, string>;
    recaptchaToken?: string;
    captcha?: string;
}

/** What keeps the order back on the anti-abuse side. */
export type AntiAbuseBlocker = 'captcha' | 'recaptcha';

const CAPTCHA_FORM: Readonly<Record<AntiAbusePurpose, CaptchaFormId>> = {
    order: 'payment_processing_request',
    'payment-method': 'payment_processing_request',
    coupon: 'sales_rule_coupon_request',
};

const REQUEST_OF: Readonly<Record<AntiAbusePurpose, { path: string; method: string }>> = {
    order: { path: 'payment-information', method: 'POST' },
    'payment-method': { path: 'set-payment-information', method: 'POST' },
    coupon: { path: 'coupons', method: 'PUT' },
};

/**
 * The reCAPTCHA action that protects the order of the selected payment
 * method: what the element class of its renderer entry names
 * (`payment-host/host.ts`), the place order form by default; null sends no
 * token.
 */
export function orderRecaptchaAction(store: Store): RecaptchaAction | null {
    return selectedRecaptchaAction(store.selectedPaymentMethod.get());
}

function recaptchaActionOf(store: Store, purpose: AntiAbusePurpose): RecaptchaAction | null {
    if (purpose === 'order') return orderRecaptchaAction(store);
    return purpose === 'coupon' ? 'coupon_code' : null;
}

/** Collect the proof for a request; mints a fresh reCAPTCHA token on every call. */
export async function antiAbuseProof(store: Store, options: AntiAbuseOptions): Promise<AntiAbuseProof> {
    const proof: AntiAbuseProof = { headers: {} };
    const action = recaptchaActionOf(store, options.purpose);
    const token = action === null ? null : await executeRecaptcha(action);
    if (token) {
        proof.recaptchaToken = token;
        proof.headers['X-ReCaptcha'] = token;
    }
    const answer = captchaAnswer(store, CAPTCHA_FORM[options.purpose]);
    if (answer !== '') {
        proof.captcha = answer;
        proof.headers['X-Captcha'] = answer;
    }
    return proof;
}

/**
 * Send a request with its proof. A rejection of `send` is passed on
 * untouched after the CAPTCHA side was brought up to date; a proof that
 * cannot be had (reCAPTCHA failed, checkbox not ticked) rejects before
 * anything is sent, with a translated message.
 */
export async function sendWithAntiAbuse<T>(
    store: Store,
    purpose: AntiAbusePurpose,
    send: (proof: AntiAbuseProof) => Promise<T>
): Promise<T> {
    const formId = CAPTCHA_FORM[purpose];
    const proof = await antiAbuseProof(store, { purpose });
    // The saving limiter of set-payment-information keeps a word of its
    // own: the answer of the order form is not spent by that request.
    const tracked = purpose !== 'payment-method';
    let result: T;
    try {
        result = await send(proof);
    } catch (err) {
        if (tracked && !isAbortError(err)) {
            const failure = classifyError(err, REQUEST_OF[purpose]);
            if (proof.captcha !== undefined) spendCaptchaAnswer(formId);
            setCaptchaError(formId, failure.kind === 'captcha' ? failure.message : null);
            void loadCaptchaState();
        }
        throw err;
    }
    if (tracked) {
        setCaptchaError(formId, null);
        // The order leaves the page; a coupon form stays and needs a new word.
        if (proof.captcha !== undefined && purpose === 'coupon') {
            spendCaptchaAnswer(formId);
            void loadCaptchaState();
        }
    }
    return result;
}

/**
 * What the shopper still has to supply before the order may be sent: the
 * answer of the image CAPTCHA, then the tick of a visible reCAPTCHA
 * checkbox. Null when nothing is missing.
 */
export function antiAbuseBlocker(store: Store): AntiAbuseBlocker | null {
    if (isCaptchaRequired(store, 'payment_processing_request')
        && captchaAnswer(store, 'payment_processing_request') === '') {
        return 'captcha';
    }
    const action = orderRecaptchaAction(store);
    return action !== null && isRecaptchaCheckboxMissing(action) ? 'recaptcha' : null;
}
