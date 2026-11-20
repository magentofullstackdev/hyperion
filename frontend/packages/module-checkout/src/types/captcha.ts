// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Anti-abuse types: Google reCAPTCHA per protected action and Magento's
 * image CAPTCHA per form, as `checkoutConfig.hyperion.recaptcha` and
 * `checkoutConfig.hyperion.captcha` carry them and as the store keeps them.
 */

/** The reCAPTCHA forms of Magento the checkout can meet. */
export type RecaptchaAction = 'place_order' | 'coupon_code' | 'customer_login' | 'braintree';

export type RecaptchaType = 'v3' | 'v2-invisible' | 'v2-checkbox';

/** One protected action; the keys beyond `type` and `siteKey` are the widget options of the store configuration. */
export interface RecaptchaActionConfig {
    type: RecaptchaType;
    siteKey: string;
    badge?: string;
    theme?: string;
    size?: string;
    /** Language code of the widget. */
    hl?: string;
}

/** Keyed by action; an action without protection has no entry. */
export type RecaptchaConfig = Readonly<Partial<Record<RecaptchaAction, RecaptchaActionConfig>>>;

/** The image CAPTCHA forms of Magento the checkout can meet. */
export type CaptchaFormId = 'user_login' | 'sales_rule_coupon_request' | 'payment_processing_request';

export interface CaptchaFormState {
    isRequired: boolean;
    isCaseSensitive: boolean;
    imageHeight: number;
    imageWidth: number;
    /** What the shopper typed; never part of the configuration. */
    value?: string;
}

export type CaptchaStateMap = Readonly<Partial<Record<CaptchaFormId, CaptchaFormState>>>;

export interface CaptchaConfig {
    /** Storefront URL that answers a new image for a form. */
    refreshUrl: string;
    /** Storefront URL that answers which forms require an answer right now. */
    sectionUrl: string;
    forms: CaptchaStateMap;
}
