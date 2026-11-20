// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * `<hc-captcha>`: Magento's image CAPTCHA inside the checkout (inline
 * login, coupon, Place Order). The behavior is the shared base class the
 * storefront theme also uses; the checkout defines its own tag from it
 * because the theme entry registers the `hyperion-` one on the same page,
 * and supplies the class names of the checkout's own Tailwind build.
 *
 *   <hc-captcha form-id="user_login" refresh-url=${refreshUrl}
 *               image-width="200" image-height="50" required
 *               label=${t('...')} reload-label=${t('...')} case-note=${t('...')}
 *               error=${message}
 *               @hyperion:captcha-change=${onChange}></hc-captcha>
 *
 * Without `image-src` the element asks for an image as soon as it is
 * rendered. The host reads `value` (or the change event's
 * `{ formId, value }`) and calls `refresh()` after every refused attempt:
 * a word is single use.
 */
import { CaptchaElement, type CaptchaClasses } from '@magentofullstackdev/hyperion-shared/captcha';

export { CAPTCHA_CHANGE_EVENT, CAPTCHA_REFRESH_ERROR_EVENT } from '@magentofullstackdev/hyperion-shared/captcha';
export type { CaptchaChangeDetail, CaptchaRefreshErrorDetail } from '@magentofullstackdev/hyperion-shared/captcha';

export class CaptchaField extends CaptchaElement {
    public static override classes: CaptchaClasses = {
        root: 'block',
        label: 'block text-sm font-medium text-brand',
        requiredMark: 'text-danger',
        row: 'mt-1 flex flex-wrap items-center gap-3',
        image: 'block rounded border border-subtle bg-surface',
        reload: 'rounded text-sm font-medium text-accent underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent aria-disabled:cursor-wait aria-disabled:opacity-60',
        input: 'mt-2 block w-full rounded-md border border-subtle bg-surface px-3 py-2 text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent',
        caseNote: 'mt-1 text-xs text-muted',
        error: 'mt-1 text-sm text-danger',
    };
}

if (!customElements.get('hc-captcha')) {
    customElements.define('hc-captcha', CaptchaField);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-captcha': CaptchaField; }
}
