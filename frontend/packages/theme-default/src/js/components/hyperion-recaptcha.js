// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-recaptcha -- Google reCAPTCHA for server-rendered forms.
 *
 * Rendered by the theme override of Magento_ReCaptchaFrontendUi::
 * recaptcha.phtml inside the form Magento protects (login, register,
 * forgot password, contact, newsletter, review, ...). Light DOM: the
 * hidden `g-recaptcha-response` input the backend observers read is
 * server-rendered, this element only fills it.
 *
 * Modes (attribute `type`):
 *   v3            api.js?render=<key>; a token is minted on every submit
 *                 with `grecaptcha.execute(key, { action })`.
 *   v2-invisible  explicit render of an invisible widget; the challenge
 *                 (if any) opens on submit.
 *   v2-checkbox   visible checkbox widget; submit waits for the tick.
 *
 * Submission is gated with a capturing `submit` listener on the form:
 * without a token the event is cancelled, the token is fetched, and the
 * form is re-submitted with `requestSubmit()`. That works for native
 * forms and for HTMX forms alike (HTMX listens to the same event and
 * sees the second submission only).
 */

import { LitElement, nothing } from 'lit';
import { scrollBehavior } from '../lib/reduced-motion.js';

const API_BASE = 'https://www.google.com/recaptcha/api.js';
const WARMUP_EVENTS = ['focusin', 'pointerdown', 'keydown'];
const TOKEN_SELECTOR = '[data-hyperion-recaptcha-token]';
const WIDGET_SELECTOR = '[data-hyperion-recaptcha-widget]';
const loaders = new Map();

function loadApi(url) {
    if (!loaders.has(url)) {
        loaders.set(url, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.defer = true;
            script.onload = () => {
                if (!window.grecaptcha) {
                    reject(new Error('reCAPTCHA API did not initialise'));
                    return;
                }
                window.grecaptcha.ready(() => resolve(window.grecaptcha));
            };
            script.onerror = () => reject(new Error('reCAPTCHA API failed to load'));
            document.head.appendChild(script);
        }));
    }
    return loaders.get(url);
}

export class HyperionRecaptcha extends LitElement {
    static properties = {
        siteKey: { type: String, attribute: 'site-key' },
        type: { type: String },
        action: { type: String },
        badge: { type: String },
        theme: { type: String },
        size: { type: String },
        hl: { type: String },
    };

    constructor() {
        super();
        this.siteKey = '';
        this.type = 'v3';
        this.action = 'submit';
        this.badge = 'bottomright';
        this.theme = 'light';
        this.size = 'normal';
        this.hl = '';
        this._form = null;
        this._input = null;
        this._widgetId = null;
        this._pendingResolve = null;
        this._viewportObserver = null;
        this._onSubmit = this._onSubmit.bind(this);
        this._onWarmup = this._onWarmup.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this._form = this.closest('form');
        this._input = this.querySelector(TOKEN_SELECTOR);
        if (!this._form || !this._input || !this.siteKey) return;
        this._form.addEventListener('submit', this._onSubmit, true);
        // Google's API is heavy (script, iframe, fonts) and forms such as the
        // footer newsletter sit on every page, so it is never loaded with the
        // page itself.
        if (this.type === 'v2-checkbox') {
            // The checkbox must be visible before the shopper submits: render
            // it as soon as the form scrolls near the viewport.
            this._viewportObserver = new IntersectionObserver((entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                this._stopWaiting();
                this._renderWidget().catch((err) => this._report(err));
            }, { rootMargin: '300px' });
            this._viewportObserver.observe(this);
        } else {
            // v3 / invisible: load on the first interaction with the form, so
            // the script round-trip is off the submit path and v3 still sees
            // the shopper's behaviour while the form is filled in.
            for (const type of WARMUP_EVENTS) {
                this._form.addEventListener(type, this._onWarmup, { once: true, passive: true });
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopWaiting();
        if (this._form) this._form.removeEventListener('submit', this._onSubmit, true);
    }

    _onWarmup() {
        this._stopWaiting();
        loadApi(this._apiUrl()).catch((err) => this._report(err));
    }

    _stopWaiting() {
        this._viewportObserver?.disconnect();
        this._viewportObserver = null;
        if (!this._form) return;
        for (const type of WARMUP_EVENTS) {
            this._form.removeEventListener(type, this._onWarmup);
        }
    }

    _apiUrl() {
        const params = this.type === 'v3'
            ? `render=${encodeURIComponent(this.siteKey)}`
            : 'render=explicit';
        const lang = this.hl ? `&hl=${encodeURIComponent(this.hl)}` : '';
        return `${API_BASE}?${params}${lang}`;
    }

    async _renderWidget() {
        if (this._widgetId !== null) return this._widgetId;
        const grecaptcha = await loadApi(this._apiUrl());
        const host = this.querySelector(WIDGET_SELECTOR);
        if (!host) throw new Error('reCAPTCHA widget host missing');
        this._widgetId = grecaptcha.render(host, {
            sitekey: this.siteKey,
            theme: this.theme,
            size: this.type === 'v2-invisible' ? 'invisible' : this.size,
            badge: this.badge,
            callback: (token) => {
                this._input.value = token;
                if (this._pendingResolve) {
                    const resolve = this._pendingResolve;
                    this._pendingResolve = null;
                    resolve(token);
                }
            },
            'expired-callback': () => { this._input.value = ''; },
            'error-callback': () => { this._input.value = ''; },
        });
        return this._widgetId;
    }

    async _mintToken() {
        if (this.type === 'v3') {
            const grecaptcha = await loadApi(this._apiUrl());
            return grecaptcha.execute(this.siteKey, { action: this.action });
        }
        const widgetId = await this._renderWidget();
        if (this.type === 'v2-checkbox') {
            return this._input.value || '';
        }
        return new Promise((resolve) => {
            this._pendingResolve = resolve;
            window.grecaptcha.execute(widgetId);
        });
    }

    _onSubmit(event) {
        if (this._input.value) {
            // Token present: let the submission through, then forget the
            // token so the next attempt mints a fresh one (tokens are single
            // use on the Google side).
            setTimeout(() => { this._input.value = ''; if (this._widgetId !== null && this.type !== 'v2-checkbox') window.grecaptcha?.reset(this._widgetId); }, 0);
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const submitter = event.submitter || null;
        this._mintToken().then((token) => {
            if (!token) {
                this._highlight();
                return;
            }
            this._input.value = token;
            this._form.requestSubmit(submitter);
        }).catch((err) => {
            this._report(err);
            // Do not strand the shopper: submit anyway and let the server
            // report the reCAPTCHA failure.
            this._form.requestSubmit(submitter);
        });
    }

    _highlight() {
        const host = this.querySelector(WIDGET_SELECTOR);
        if (host) {
            host.classList.add('ring-2', 'ring-error', 'rounded');
            host.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
        }
    }

    _report(err) {
        // eslint-disable-next-line no-console
        console.warn('[hyperion] reCAPTCHA', err);
    }
}

if (!customElements.get('hyperion-recaptcha')) {
    customElements.define('hyperion-recaptcha', HyperionRecaptcha);
}
