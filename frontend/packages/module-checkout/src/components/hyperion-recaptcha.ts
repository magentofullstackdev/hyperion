// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-recaptcha-badge> -- single-instance reCAPTCHA host of the checkout.
 *
 * The tag is prefixed `hc-` (Hyperion checkout) on purpose: the theme
 * entry defines the form bound `<hyperion-recaptcha>` on every page, and
 * a second class cannot claim that name, so the checkout element would
 * upgrade as the theme class and render nothing.
 *
 * Reads the storefront's reCAPTCHA configuration (contributed by
 * `Magento_ReCaptchaCheckout` and `Magento_ReCaptchaUser`) from the
 * `checkoutConfig` JSON island. When no configuration is present, the
 * component renders nothing and `executeFor()` resolves to `null` --
 * the rest of the bundle stays oblivious to whether the merchant has
 * the feature enabled.
 *
 * The component lazily loads `https://www.google.com/recaptcha/api.js`
 * the first time `executeFor()` runs, then drives the v3 invisible
 * flow via `grecaptcha.execute(siteKey, { action })`. The resulting
 * token is added to the next REST call as the `X-ReCaptcha` header
 * (see `apiFetch`'s `recaptchaToken` option).
 */
import { LitElement, html, nothing } from 'lit';

import { getCheckoutConfig } from '../bootstrap-config.js';

export type RecaptchaAction = 'place_order' | 'login';

interface GreCaptcha {
    ready: (cb: () => void) => void;
    execute: (siteKey: string, options: { action: string }) => Promise<string>;
}

declare global {
    interface Window {
        grecaptcha?: GreCaptcha;
    }
}

interface RecaptchaSiteConfig {
    siteKey: string;
}

/**
 * Pull a reCAPTCHA site key out of the JSON-island payload. Magento
 * exposes the key under a few different shapes depending on which
 * ReCaptcha module is enabled -- we look for the typical ones and
 * collapse them to the bare `siteKey` string.
 */
function readSiteConfig(action: RecaptchaAction): RecaptchaSiteConfig | null {
    const cfg = getCheckoutConfig() as unknown as Record<string, unknown>;
    const candidates: readonly string[] = action === 'place_order'
        ? ['recaptcha_for_place_order', 'recaptcha_for_checkout']
        : ['recaptcha_for_user_login', 'recaptcha_for_login'];
    for (const key of candidates) {
        const entry = cfg[key];
        if (!entry || typeof entry !== 'object') continue;
        const rendering = (entry as Record<string, unknown>)['rendering'];
        if (rendering && typeof rendering === 'object') {
            const siteKey = (rendering as Record<string, unknown>)['sitekey'];
            if (typeof siteKey === 'string' && siteKey.length > 0) {
                return { siteKey };
            }
        }
    }
    return null;
}

let scriptPromise: Promise<void> | null = null;

function loadRecaptchaScript(siteKey: string): Promise<void> {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise<void>((resolve, reject) => {
        if (window.grecaptcha) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (!window.grecaptcha) {
                reject(new Error('grecaptcha did not initialize after script load'));
                return;
            }
            window.grecaptcha.ready(() => resolve());
        };
        script.onerror = () => {
            script.remove();
            reject(new Error('Failed to load reCAPTCHA script'));
        };
        document.head.appendChild(script);
    });
    // A failed load is not remembered: the next call tries again instead
    // of failing for the rest of the page's life.
    scriptPromise.catch(() => {
        scriptPromise = null;
    });
    return scriptPromise;
}

export function resetRecaptchaLoaderForTests(): void {
    scriptPromise = null;
}

/**
 * Mint a reCAPTCHA token for the given action. Returns `null` when
 * the merchant has the feature disabled -- callers MUST treat `null`
 * as "no header to send".
 */
export async function executeRecaptcha(action: RecaptchaAction): Promise<string | null> {
    const config = readSiteConfig(action);
    if (!config) return null;
    await loadRecaptchaScript(config.siteKey);
    if (!window.grecaptcha) return null;
    return window.grecaptcha.execute(config.siteKey, { action });
}

/**
 * Component is rendered for visual feedback only; reCAPTCHA v3 has
 * no visible challenge. The component renders the standard
 * Google-required attribution badge text when at least one of the
 * configured actions is active, satisfying Google's branding ToS.
 */
export class HyperionRecaptcha extends LitElement {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        const placeOrder = readSiteConfig('place_order');
        const login = readSiteConfig('login');
        if (!placeOrder && !login) return nothing;
        return html`
            <p class="text-xs text-muted">
                This site is protected by reCAPTCHA and the Google
                <a href="https://policies.google.com/privacy" rel="noopener noreferrer" target="_blank" class="underline">Privacy Policy</a>
                and
                <a href="https://policies.google.com/terms" rel="noopener noreferrer" target="_blank" class="underline">Terms of Service</a>
                apply.
            </p>
        `;
    }
}

if (!customElements.get('hc-recaptcha-badge')) {
    customElements.define('hc-recaptcha-badge', HyperionRecaptcha);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-recaptcha-badge': HyperionRecaptcha; }
}
