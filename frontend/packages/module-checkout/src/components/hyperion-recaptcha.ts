// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Google reCAPTCHA for the checkout: `executeRecaptcha(action)` mints the
 * token of a protected action and `<hc-recaptcha-badge>` shows the
 * attribution and hosts the invisible widgets.
 *
 * The tag is prefixed `hc-` (Hyperion checkout) on purpose: the theme
 * entry defines the form bound `<hyperion-recaptcha>` on every page, and
 * a second class cannot claim that name, so the checkout element would
 * upgrade as the theme class and render nothing.
 *
 * The configuration is `checkoutConfig.hyperion.recaptcha`, one entry per
 * protected action (place order, coupon, inline login, Braintree card).
 * An action without an entry resolves to `null` and loads nothing.
 *
 * Types:
 *   v3            a token per request. `grecaptcha.execute(siteKey)` only
 *                 works when the page's script was loaded with that very
 *                 key; the page has ONE script, which another element (the
 *                 newsletter form) or another action may have loaded for
 *                 explicit rendering or for another key. In that case the
 *                 token comes from an invisible widget rendered explicitly
 *                 with the action's key.
 *   v2-invisible  one invisible widget per action; the challenge, if any,
 *                 opens when the token is asked for.
 *   v2-checkbox   a visible widget the form of the action mounts with
 *                 `mountRecaptchaCheckbox()`; the token is read when the
 *                 action runs and a missing one blocks it.
 *
 * Nothing from Google loads with the page: the script is requested by the
 * first token or the first mounted checkbox.
 */
import { LitElement, html, nothing } from 'lit';
import { SignalWatcher } from '@lit-labs/signals';

import {
    isRecaptchaConfigured,
    recaptchaConfigFor,
    setRecaptchaCheckboxToken,
} from '../store/captcha-state.js';
import type { RecaptchaAction, RecaptchaActionConfig } from '../types/captcha.js';
import { t } from '../utils/i18n.js';

export type { RecaptchaAction };

type RenderParameters = Record<string, string | ((token: string) => void) | (() => void)>;

interface GreCaptcha {
    ready: (cb: () => void) => void;
    execute: (target: string | number, options?: { action: string }) => PromiseLike<string> | void;
    render?: (container: HTMLElement, parameters: RenderParameters) => number;
    reset?: (widgetId?: number) => void;
    getResponse?: (widgetId?: number) => string;
}

declare global {
    interface Window {
        grecaptcha?: GreCaptcha;
    }
}

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

const API_URL = 'https://www.google.com/recaptcha/api.js';
const SCRIPT_SELECTOR = 'script[src*="recaptcha/api.js"]';
const SCRIPT_TIMEOUT_MS = 15000;
/** A score based token needs no shopper; a v2 challenge may take a while to solve. */
const SCORE_TOKEN_TIMEOUT_MS = 20000;
const CHALLENGE_TIMEOUT_MS = 120000;

let scriptPromise: Promise<GreCaptcha> | null = null;

function pageScripts(): HTMLScriptElement[] {
    return Array.from(document.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR));
}

/** True when a script of the page was loaded for direct use of this site key. */
function pageScriptServes(siteKey: string): boolean {
    return pageScripts().some((script) => {
        try {
            return new URL(script.src, window.location.href).searchParams.get('render') === siteKey;
        } catch {
            return false;
        }
    });
}

function scriptUrl(config: RecaptchaActionConfig): string {
    const render = config.type === 'v3' ? encodeURIComponent(config.siteKey) : 'explicit';
    const lang = config.hl ? `&hl=${encodeURIComponent(config.hl)}` : '';
    return `${API_URL}?render=${render}${lang}`;
}

/**
 * The page's reCAPTCHA API, loaded once. An API or a script another
 * element brought is used as it is, never doubled. A failed load is not
 * remembered: the next call starts over with a fresh script element.
 */
function loadApi(config: RecaptchaActionConfig): Promise<GreCaptcha> {
    if (scriptPromise) return scriptPromise;
    const promise = new Promise<GreCaptcha>((resolve, reject) => {
        const whenReady = (): void => {
            const api = window.grecaptcha;
            if (!api) {
                reject(new Error('reCAPTCHA API did not initialize'));
                return;
            }
            api.ready(() => resolve(api));
        };
        if (window.grecaptcha) {
            whenReady();
            return;
        }
        const foreign = pageScripts()[0] ?? null;
        const script = foreign ?? document.createElement('script');
        const giveUp = (reason: string): void => {
            clearTimeout(timer);
            if (foreign === null) script.remove();
            reject(new Error(reason));
        };
        const timer = setTimeout(() => giveUp('reCAPTCHA API timed out'), SCRIPT_TIMEOUT_MS);
        script.addEventListener('load', () => {
            clearTimeout(timer);
            if (!window.grecaptcha && foreign === null) script.remove();
            whenReady();
        }, { once: true });
        script.addEventListener('error', () => giveUp('reCAPTCHA API failed to load'), { once: true });
        if (foreign === null) {
            script.src = scriptUrl(config);
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
    });
    scriptPromise = promise;
    promise.catch(() => {
        if (scriptPromise === promise) scriptPromise = null;
    });
    return promise;
}

// -- Invisible widgets (v2 invisible, and v3 without a script of its own) -------

interface PendingToken {
    resolve: (token: string) => void;
    reject: (reason: Error) => void;
}

interface InvisibleWidget {
    id: number;
    host: HTMLElement;
    pending: PendingToken | null;
    /** The tokens of one widget are minted one after the other. */
    queue: Promise<unknown>;
}

const invisibleWidgets = new Map<RecaptchaAction, InvisibleWidget>();

/** Where the invisible widgets live: inside the badge element, which outlives every form. */
function widgetContainer(): HTMLElement {
    const owner: HTMLElement = document.querySelector<HTMLElement>('hc-recaptcha-badge') ?? document.body;
    let container = owner.querySelector<HTMLElement>(':scope > [data-hc-recaptcha-widgets]');
    if (container === null) {
        container = document.createElement('div');
        container.setAttribute('data-hc-recaptcha-widgets', '');
        owner.appendChild(container);
    }
    return container;
}

function invisibleWidget(api: GreCaptcha, action: RecaptchaAction, config: RecaptchaActionConfig): InvisibleWidget {
    const existing = invisibleWidgets.get(action);
    if (existing && existing.host.isConnected) return existing;
    if (!api.render) throw new Error('reCAPTCHA API cannot render widgets');
    const host = document.createElement('div');
    host.setAttribute('data-hc-recaptcha-widget', action);
    widgetContainer().appendChild(host);
    const widget: InvisibleWidget = { id: -1, host, pending: null, queue: Promise.resolve() };
    const parameters: RenderParameters = {
        sitekey: config.siteKey,
        size: 'invisible',
        badge: config.badge || 'inline',
        callback: (token: string) => widget.pending?.resolve(token),
        'error-callback': () => widget.pending?.reject(new Error('reCAPTCHA widget reported an error')),
    };
    if (config.theme) parameters['theme'] = config.theme;
    if (config.hl) parameters['hl'] = config.hl;
    // A score based key takes its action from the widget.
    if (config.type === 'v3') parameters['action'] = action;
    widget.id = api.render(host, parameters);
    invisibleWidgets.set(action, widget);
    return widget;
}

function mintThroughWidget(api: GreCaptcha, action: RecaptchaAction, config: RecaptchaActionConfig): Promise<string> {
    const widget = invisibleWidget(api, action, config);
    const run = (): Promise<string> => new Promise<string>((resolve, reject) => {
        const timeoutMs = config.type === 'v3' ? SCORE_TOKEN_TIMEOUT_MS : CHALLENGE_TIMEOUT_MS;
        const timer = setTimeout(() => settle(() => reject(new Error('reCAPTCHA token timed out'))), timeoutMs);
        const settle = (finish: () => void): void => {
            if (widget.pending !== pending) return;
            widget.pending = null;
            clearTimeout(timer);
            // A widget answers once per execution: make it ready for the next token.
            try { api.reset?.(widget.id); } catch { /* the token outcome stands */ }
            finish();
        };
        const pending: PendingToken = {
            resolve: (token) => settle(() => (token ? resolve(token) : reject(new Error('reCAPTCHA returned no token')))),
            reject: (reason) => settle(() => reject(reason)),
        };
        widget.pending = pending;
        try {
            // The token arrives through the widget callback; a rejection of
            // the returned promise is the only thing read from it.
            const answer = api.execute(widget.id);
            if (answer && typeof answer.then === 'function') {
                answer.then(undefined, (reason: unknown) => pending.reject(reason instanceof Error ? reason : new Error(String(reason))));
            }
        } catch (err) {
            pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
    const next = widget.queue.then(run, run);
    widget.queue = next.catch(() => undefined);
    return next;
}

async function mintScoreToken(api: GreCaptcha, action: RecaptchaAction, config: RecaptchaActionConfig): Promise<string> {
    if (pageScriptServes(config.siteKey)) {
        try {
            const token = await api.execute(config.siteKey, { action });
            if (token) return token;
        } catch (err) {
            // Another script took the API over since: the widget path still works.
            if (!api.render) throw err;
        }
    }
    return mintThroughWidget(api, action, config);
}

// -- Checkbox widgets ----------------------------------------------------------

interface CheckboxWidget {
    id: number;
    host: HTMLElement;
}

const checkboxHosts = new Map<RecaptchaAction, HTMLElement>();
const checkboxWidgets = new Map<RecaptchaAction, CheckboxWidget>();

/**
 * Render the checkbox widget of an action into `host` (an empty element
 * of the action's form with the widget's height reserved). Loads Google's
 * script when the page does not have it yet; rejects when that fails, and
 * the next token request tries again. Does nothing for an action of
 * another type.
 */
export async function mountRecaptchaCheckbox(action: RecaptchaAction, host: HTMLElement): Promise<void> {
    const config = recaptchaConfigFor(action);
    if (config === null || config.type !== 'v2-checkbox') return;
    checkboxHosts.set(action, host);
    if (checkboxWidgets.get(action)?.host === host) return;
    const api = await loadApi(config);
    // The form closed, or another call rendered the widget, while the script loaded.
    if (checkboxHosts.get(action) !== host || !host.isConnected) return;
    if (checkboxWidgets.get(action)?.host === host) return;
    if (!api.render) throw new Error('reCAPTCHA API cannot render widgets');
    const clear = (): void => setRecaptchaCheckboxToken(action, '');
    const parameters: RenderParameters = {
        sitekey: config.siteKey,
        size: config.size === 'compact' ? 'compact' : 'normal',
        callback: (token: string) => setRecaptchaCheckboxToken(action, token),
        'expired-callback': clear,
        'error-callback': clear,
    };
    if (config.theme) parameters['theme'] = config.theme;
    if (config.hl) parameters['hl'] = config.hl;
    checkboxWidgets.set(action, { id: api.render(host, parameters), host });
}

/** The form of the action went away with its widget. */
export function unmountRecaptchaCheckbox(action: RecaptchaAction, host: HTMLElement): void {
    if (checkboxHosts.get(action) !== host) return;
    checkboxHosts.delete(action);
    checkboxWidgets.delete(action);
    setRecaptchaCheckboxToken(action, '');
}

function focusCheckbox(host: HTMLElement): void {
    const frame = host.querySelector<HTMLElement>('iframe');
    if (frame) {
        frame.focus({ preventScroll: false });
        return;
    }
    if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '-1');
    host.focus();
}

async function readCheckboxToken(action: RecaptchaAction, config: RecaptchaActionConfig): Promise<string> {
    const host = checkboxHosts.get(action);
    if (!host) throw new Error('reCAPTCHA checkbox has no place in the page');
    if (!checkboxWidgets.has(action)) await mountRecaptchaCheckbox(action, host);
    const api = await loadApi(config);
    const widget = checkboxWidgets.get(action);
    if (!widget) throw new Error('reCAPTCHA checkbox was not rendered');
    const token = api.getResponse?.(widget.id) ?? '';
    if (!token) {
        setRecaptchaCheckboxToken(action, '');
        focusCheckbox(widget.host);
        throw new RecaptchaError('required');
    }
    // A token is single use: the shopper ticks again for another attempt.
    api.reset?.(widget.id);
    setRecaptchaCheckboxToken(action, '');
    return token;
}

/**
 * Mint a reCAPTCHA token for the given action. Resolves to `null` when
 * the action is not protected: callers MUST treat `null` as "nothing to
 * send". Rejects with a `RecaptchaError` whose message is translated:
 * `required` when the shopper has to tick the checkbox first, `failed`
 * for everything else (script blocked, widget error, time limit).
 */
export async function executeRecaptcha(action: RecaptchaAction): Promise<string | null> {
    const config = recaptchaConfigFor(action);
    if (config === null) return null;
    try {
        if (config.type === 'v2-checkbox') return await readCheckboxToken(action, config);
        const api = await loadApi(config);
        if (config.type === 'v3') return await mintScoreToken(api, action, config);
        return await mintThroughWidget(api, action, config);
    } catch (err) {
        if (err instanceof RecaptchaError) throw err;
        console.warn('[hyperion-checkout] reCAPTCHA', err);
        throw new RecaptchaError('failed');
    }
}

export function resetRecaptchaLoaderForTests(): void {
    scriptPromise = null;
    invisibleWidgets.clear();
    checkboxHosts.clear();
    checkboxWidgets.clear();
}

const PRIVACY_URL = 'https://policies.google.com/privacy';
const TERMS_URL = 'https://policies.google.com/terms';

/**
 * Google's attribution, required wherever its badge may be hidden, and the
 * home of the invisible widgets. Renders nothing when no action of the
 * checkout is protected.
 */
export class HyperionRecaptcha extends SignalWatcher(LitElement) {
    public override createRenderRoot(): HTMLElement { return this; }

    public override render(): unknown {
        if (!isRecaptchaConfigured()) return nothing;
        // The sentence is one phrase with the two links as placeholders,
        // so a translation can put them where its grammar wants them.
        const parts = t('Hyperion_Checkout::recaptcha_badge').split(/(\{privacy\}|\{terms\})/);
        return html`
            <p class="text-xs text-muted">${parts.map((part) => {
                if (part === '{privacy}') {
                    return html`<a href=${PRIVACY_URL} rel="noopener noreferrer" target="_blank" class="underline">${t('Hyperion_Checkout::recaptcha_privacy_policy')}</a>`;
                }
                if (part === '{terms}') {
                    return html`<a href=${TERMS_URL} rel="noopener noreferrer" target="_blank" class="underline">${t('Hyperion_Checkout::recaptcha_terms_of_service')}</a>`;
                }
                return part;
            })}</p>
        `;
    }
}

if (!customElements.get('hc-recaptcha-badge')) {
    customElements.define('hc-recaptcha-badge', HyperionRecaptcha);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-recaptcha-badge': HyperionRecaptcha; }
}
