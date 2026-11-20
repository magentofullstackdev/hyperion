// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Which image CAPTCHA forms require an answer right now.
 *
 *   GET customer/section/load?sections=captcha  -- storefront controller, not REST
 *
 * The answer is `{ captcha: { <formId>: { isRequired, timestamp } } }`
 * (`Magento\Captcha\CustomerData\Captcha`). A form starts to require an
 * answer after failed attempts, so the state is read again after every
 * refusal instead of being trusted from the page load.
 */
import { peekCheckoutConfig } from '../bootstrap-config.js';
import { applyCaptchaRequirements, CAPTCHA_FORM_IDS } from '../store/captcha-state.js';
import type { CaptchaFormId } from '../types/captcha.js';

/** How long the read may take before it is given up. */
export const CAPTCHA_STATE_TIMEOUT_MS = 10000;

let generation = 0;

/** The section URL of the configuration when it is on the page's own origin, null otherwise. */
function sectionUrl(): string | null {
    const configured = peekCheckoutConfig()?.hyperion?.captcha?.sectionUrl;
    if (typeof configured !== 'string' || configured === '') return null;
    try {
        const url = new URL(configured, window.location.href);
        return url.origin === window.location.origin ? url.toString() : null;
    } catch {
        return null;
    }
}

function requirementsOf(body: unknown): Partial<Record<CaptchaFormId, boolean>> | null {
    if (typeof body !== 'object' || body === null) return null;
    const section = (body as Record<string, unknown>)['captcha'];
    if (typeof section !== 'object' || section === null) return null;
    const required: Partial<Record<CaptchaFormId, boolean>> = {};
    for (const formId of CAPTCHA_FORM_IDS) {
        const entry = (section as Record<string, unknown>)[formId];
        if (typeof entry !== 'object' || entry === null) continue;
        required[formId] = (entry as Record<string, unknown>)['isRequired'] === true;
    }
    return required;
}

/**
 * Read the state and apply it to the store. Resolves true when it was
 * applied, false when there is no section URL, the read failed or a newer
 * read superseded it. Never rejects: the forms keep the state they had.
 */
export async function loadCaptchaState(): Promise<boolean> {
    const url = sectionUrl();
    if (url === null) return false;
    const mine = ++generation;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPTCHA_STATE_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            signal: controller.signal,
        });
        if (!res.ok) return false;
        const required = requirementsOf(await res.json());
        if (required === null || mine !== generation) return false;
        applyCaptchaRequirements(required);
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export function resetCaptchaLoaderForTests(): void {
    generation = 0;
}
