// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The parts of the checkout only some stores show, each a chunk of its
 * own: the gift options, the terms to accept, the image CAPTCHA field and
 * the reCAPTCHA client (`hyperion-recaptcha.ts`, with the attribution line
 * and the checkbox widget). A store that uses none of them never
 * downloads them.
 *
 * `loadOptionalSections()` runs before the mount and the mount waits for
 * it, so a section a store does use is defined when the application
 * renders for the first time and takes its place in that frame. The page
 * preloads the same chunks from the head (`Block\Checkout::getPreloadUrls()`),
 * by the store's own switches, so no chunk is discovered late.
 *
 * This module belongs to the application chunk (`checkout-app.ts`
 * re-exports it, the bootstrap calls it from there): the imports below are
 * made from that chunk, so the code the sections share with the
 * application (Lit, the form controls) is already loaded wherever they
 * load and stays in the application chunk instead of becoming a chunk of
 * its own.
 *
 * A switch that is on while its section has nothing to show (no gift form
 * for the items, only automatic agreements) loads a chunk that renders
 * nothing: the condition here is the store's switch, the section decides
 * the rest. The CAPTCHA field is loaded here only when a form requires an
 * answer from the start; a form that requires one later loads it then
 * (`anti-abuse-field.ts`). The reCAPTCHA client is loaded when at least
 * one action is protected (`hyperion.recaptcha`, absent otherwise).
 *
 * With a payment method already selected, the payment host and the module
 * of that method's renderer are part of the same wait
 * (`paymentHostBeforeMount()`), so the selected row shows its body in the
 * first frame.
 */
import { isRecaptchaConfigured } from '../store/captcha-state.js';
import type { CheckoutConfig } from '../types/config.js';
import { loadOrderOverlays } from './order-overlays.js';
import { paymentHostBeforeMount } from './payment-host/host.js';
import './payment-host/importer.js';

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
    // Read from the page's configuration, which the bootstrap installed first.
    if (isRecaptchaConfigured()) {
        loads.push(import('./hyperion-recaptcha.js'));
    }
    // The renderer of the fields the store declares: defined before the
    // first render, so the forms show them from the first frame.
    if ((config.hyperion?.addressFields?.length ?? 0) > 0) {
        loads.push(import('./address-fields.js'));
    }
    loads.push(paymentHostBeforeMount());
    // Outside the wait (`order-overlays.ts`).
    loadOrderOverlays();
    return Promise.all(loads);
}
