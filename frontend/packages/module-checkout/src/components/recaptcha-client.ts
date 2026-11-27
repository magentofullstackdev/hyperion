// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The way the rest of the checkout reaches the reCAPTCHA client
 * (`hyperion-recaptcha.ts`), which is a chunk of its own: a store that
 * protects no action of the checkout never downloads it.
 *
 * A store that protects one has the chunk loaded before the application
 * mounts (`optional-sections.ts`, preloaded by the page on the same
 * condition), and the chunk registers itself here when it is evaluated:
 * asking for a token never waits for the network to bring the client.
 * This module never imports the chunk, so the code it shares with the
 * application stays in the application chunk.
 *
 * `executeRecaptcha()` answers `null` for an action without protection,
 * like the client itself.
 */
import { recaptchaConfigFor } from '../store/captcha-state.js';
import type { RecaptchaAction } from '../types/captcha.js';
import { t } from '../utils/i18n.js';

/**
 * Why a token could not be had: the check failed, or the shopper has to
 * tick the checkbox first. The message is written for the shopper, so the
 * error keeps the name of a plain `Error`: that is what the checkout's
 * error classification shows as it is.
 */
export class RecaptchaError extends Error {
    public readonly reason: 'failed' | 'required';

    public constructor(reason: 'failed' | 'required') {
        super(t(reason === 'required' ? 'Hyperion_Checkout::recaptcha_required' : 'Hyperion_Checkout::recaptcha_failed'));
        this.reason = reason;
    }
}

/** What the client chunk offers the rest of the checkout. */
export interface RecaptchaClient {
    executeRecaptcha: (action: RecaptchaAction) => Promise<string | null>;
    mountRecaptchaCheckbox: (action: RecaptchaAction, host: HTMLElement) => Promise<void>;
    unmountRecaptchaCheckbox: (action: RecaptchaAction, host: HTMLElement) => void;
}

let client: RecaptchaClient | null = null;

/** Called by the client chunk when it is evaluated. */
export function registerRecaptchaClient(registered: RecaptchaClient): void {
    client = registered;
}

/**
 * Mint a reCAPTCHA token for the given action. Resolves to `null` when
 * the action is not protected: callers MUST treat `null` as "nothing to
 * send". Rejects with a `RecaptchaError` whose message is translated:
 * `required` when the shopper has to tick the checkbox first, `failed`
 * for everything else (client or script not loaded, widget error, time
 * limit).
 */
export async function executeRecaptcha(action: RecaptchaAction): Promise<string | null> {
    if (recaptchaConfigFor(action) === null) return null;
    if (client === null) {
        console.warn('[hyperion-checkout] reCAPTCHA client not loaded');
        throw new RecaptchaError('failed');
    }
    return client.executeRecaptcha(action);
}

/** Render the visible checkbox of an action into `host`; rejects while the client is not loaded. */
export async function mountRecaptchaCheckbox(action: RecaptchaAction, host: HTMLElement): Promise<void> {
    if (client === null) throw new Error('reCAPTCHA client not loaded');
    await client.mountRecaptchaCheckbox(action, host);
}

/** Take the checkbox of an action out of `host`; nothing to do while the client is not loaded. */
export function unmountRecaptchaCheckbox(action: RecaptchaAction, host: HTMLElement): void {
    client?.unmountRecaptchaCheckbox(action, host);
}

export function resetRecaptchaClientForTests(): void {
    client = null;
}
