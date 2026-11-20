// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The parts of the checkout only some stores show, each a chunk of its
 * own: the gift options, the terms to accept and the image CAPTCHA field.
 * A store that uses none of them never downloads them.
 *
 * `loadOptionalSections()` runs next to the import of `<checkout-app>` and
 * the mount waits for both, so a section a store does use is defined when
 * the application renders for the first time and takes its place in that
 * frame. The page preloads the same chunks from the head
 * (`Block\Checkout::getPreloadUrls()`), by the store's own switches.
 *
 * A switch that is on while its section has nothing to show (no gift form
 * for the items, only automatic agreements) loads a chunk that renders
 * nothing: the condition here is the store's switch, the section decides
 * the rest. The CAPTCHA field is loaded here only when a form requires an
 * answer from the start; a form that requires one later loads it then
 * (`anti-abuse-field.ts`).
 */
import type { CheckoutConfig } from '../types/config.js';

export function loadOptionalSections(config: CheckoutConfig): Promise<unknown> {
    const loads: Array<Promise<unknown>> = [];
    if (config.isOrderLevelGiftOptionsEnabled === true || config.isItemLevelGiftOptionsEnabled === true) {
        loads.push(import('./checkout-gift-message.js'));
    }
    const agreements = config.checkoutAgreements;
    if (agreements?.isEnabled && (agreements.agreements?.length ?? 0) > 0) {
        loads.push(import('./checkout-agreements.js'));
    }
    const captchaForms = Object.values(config.hyperion?.captcha?.forms ?? {});
    if (captchaForms.some((form) => form?.isRequired === true)) {
        loads.push(import('./captcha-field.js'));
    }
    return Promise.all(loads);
}
