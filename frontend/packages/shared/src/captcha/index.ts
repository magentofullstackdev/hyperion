// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * @magentofullstackdev/hyperion-shared/captcha barrel: the base class of
 * the image CAPTCHA field, from which the theme and the checkout each
 * define their own tag.
 */
export { CaptchaElement, CAPTCHA_CHANGE_EVENT, CAPTCHA_REFRESH_ERROR_EVENT } from './captcha-element.js';
export type { CaptchaChangeDetail, CaptchaClasses, CaptchaRefreshErrorDetail } from './captcha-element.js';
