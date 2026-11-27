// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The newsletter opt-in: a first-party checkout extension, built only on
 * the public extension API (`extension-api.d.ts`). The server lists it in
 * the generic pool (`hyperion.extensions`) only while
 * `hyperion_checkout/newsletter/enabled` is on and the shopper may
 * subscribe (not subscribed yet; a guest only where guests may subscribe),
 * with `checked` (the box starts ticked) as an option.
 *
 * It registers `<hc-newsletter-optin>` in the `after-email` slot (one
 * checkbox) and a `paymentInformation` filter that sends
 * `paymentMethod.extension_attributes.hyperion_newsletter_subscribe: true`
 * while the box is ticked. The subscription is made by the server after the
 * order; a failure there never fails the order.
 */
import type { CheckoutContext, CheckoutExtensionApi } from '../../../extension-api.js';

export const hyperionApi = '1';

export const NEWSLETTER_OPTIN_TAG = 'hc-newsletter-optin';

/** The box is ticked; null until an element read its default. */
let subscribe: boolean | null = null;
let instances = 0;

export class NewsletterOptinElement extends HTMLElement {
    public static readonly hyperionApi = '1';

    public context!: CheckoutContext;
    public options: Readonly<Record<string, unknown>> = {};

    public connectedCallback(): void {
        if (this.childElementCount > 0) return;
        instances += 1;
        const id = `hc-newsletter-optin-${instances}`;
        subscribe ??= this.options.checked === true;

        this.className = 'hc-field';
        const label = document.createElement('label');
        label.htmlFor = id;
        label.className = 'inline-flex min-h-6 items-center gap-2 cursor-pointer select-none';

        const box = document.createElement('input');
        box.id = id;
        box.type = 'checkbox';
        box.name = 'hyperion_newsletter_subscribe';
        box.className = 'h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent';
        box.checked = subscribe;
        box.addEventListener('change', () => {
            subscribe = box.checked;
        });

        const text = document.createElement('span');
        text.className = 'text-sm text-brand';
        text.textContent = this.context ? this.context.t('Sign up for our newsletter') : 'Sign up for our newsletter';

        label.append(box, text);
        this.append(label);
    }
}

/** The payment-information body with the opt-in, while the box is ticked. */
export function withNewsletterOptin<T extends { paymentMethod: Record<string, unknown> }>(payload: T): T {
    if (subscribe !== true) return payload;
    const current = payload.paymentMethod.extension_attributes;
    const attributes = current !== null && typeof current === 'object' && !Array.isArray(current)
        ? current as Record<string, unknown>
        : {};
    payload.paymentMethod.extension_attributes = { ...attributes, hyperion_newsletter_subscribe: true };
    return payload;
}

export default function register(api: CheckoutExtensionApi): void {
    if (!customElements.get(NEWSLETTER_OPTIN_TAG)) customElements.define(NEWSLETTER_OPTIN_TAG, NewsletterOptinElement);
    api.registerSlot('after-email', NEWSLETTER_OPTIN_TAG);
    api.filter('paymentInformation', (payload) => withNewsletterOptin(payload));
}

export function resetNewsletterOptinForTests(): void {
    subscribe = null;
}
