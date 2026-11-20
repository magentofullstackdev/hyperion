// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-captcha -- Magento's built-in image CAPTCHA on the storefront
 * (login, registration, contact, coupon and every other form core
 * protects). Replaces core's RequireJS `captcha` widget.
 *
 * The behavior lives in the shared base class, which the checkout uses
 * under its own tag; this file supplies the theme's class names. The
 * element is light DOM, so the answer posts with the surrounding form.
 *
 * Wrapping the server-rendered field (the usual case: the markup works
 * without JavaScript and does not move when the element upgrades):
 *
 *   <hyperion-captcha form-id="user_login" refresh-url="/captcha/refresh/">
 *       <label for="captcha_user_login">...</label>
 *       <img data-hyperion-captcha-image src="..." width="200" height="50" alt="...">
 *       <button type="button" data-hyperion-captcha-reload>Reload captcha</button>
 *       <input type="text" id="captcha_user_login" data-hyperion-captcha-input
 *              name="captcha[user_login]">
 *   </hyperion-captcha>
 *
 * Empty, it renders the same field from its attributes:
 *
 *   <hyperion-captcha form-id="user_login" refresh-url="/captcha/refresh/"
 *                     image-width="200" image-height="50" required
 *                     label="..." reload-label="..." case-note="..."></hyperion-captcha>
 *
 * Attributes: form-id, refresh-url, image-src, image-width, image-height,
 * case-sensitive, required, name, label, reload-label, case-note, error.
 * API: `value`, `refresh()`, `clear()`, `focus()`.
 * Events: `hyperion:captcha-change` ({ formId, value }) and
 * `hyperion:captcha-refresh-error` ({ formId }), both bubbling.
 * The base class documents each of them.
 */

import { CaptchaElement } from '@magentofullstackdev/hyperion-shared/captcha';

export class HyperionCaptcha extends CaptchaElement {
    static classes = {
        root: 'space-y-2',
        label: 'block text-sm font-medium text-secondary',
        requiredMark: 'text-error',
        row: 'flex flex-wrap items-center gap-3',
        image: 'rounded border border-subtle bg-surface-raised',
        reload: 'text-sm font-medium text-primary hover:text-primary-hover underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded aria-disabled:opacity-60 aria-disabled:cursor-wait',
        input: 'w-full px-4 py-2.5 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm',
        caseNote: 'text-xs text-muted',
        error: 'text-sm text-error',
    };
}

if (!customElements.get('hyperion-captcha')) {
    customElements.define('hyperion-captcha', HyperionCaptcha);
}
