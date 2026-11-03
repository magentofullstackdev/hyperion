// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hyperion-gtag> -- Google Analytics 4 and Google Ads without RequireJS.
 *
 * Rendered on every page by Magentofullstackdev_HyperionCore::html/gtag.phtml
 * while `google/gtag/*` is configured. It owns `window.dataLayer` /
 * `window.gtag` from the moment it upgrades, so every event is queued
 * even before gtag.js arrives, and loads gtag.js lazily: after the first
 * interaction (pointer, key, scroll) or when the browser is idle. With
 * `consent-required` (cookie restriction mode) the script waits until the
 * `user_allowed_save_cookie` cookie names `website-id`, i.e. until the
 * cookie notice's `hyperion:cookie-consent` event; events keep queueing
 * locally meanwhile and are sent then.
 *
 * Events come from the page as elements carrying
 * `data-hyperion-gtag-event="NAME"` and `data-hyperion-gtag-payload` (the
 * JSON params) for view_item, view_item_list, begin_checkout and purchase,
 * and from HTMX responses swapped into `#hyperion-gtag-events`
 * (add_to_cart). Attributes rather than JSON `<script>` blocks because
 * htmx strips script elements from swapped content while
 * `allowScriptTags` is off. Each record is pushed once. A
 * `purchase` also sends the Google Ads `conversion` when `ads-id` and
 * `ads-label` are set.
 *
 * Attributes: measurement-id (G-...), ads-id (AW-...), ads-label,
 * website-id, consent-required.
 */
import { nothing } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';

export const EVENT_SELECTOR = '[data-hyperion-gtag-event][data-hyperion-gtag-payload]';
export const CONSENT_COOKIE = 'user_allowed_save_cookie';
const PROCESSED = 'data-hyperion-gtag-processed';
const IDLE_DELAY = 4000;
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

export function readConsentCookie(name = CONSENT_COOKIE) {
    for (const piece of document.cookie.split(';')) {
        const trimmed = piece.trim();
        if (trimmed.startsWith(name + '=')) {
            try {
                return JSON.parse(decodeURIComponent(trimmed.slice(name.length + 1)));
            } catch {
                return null;
            }
        }
    }
    return null;
}

export class HyperionGtag extends HyperionLightElement {
    static properties = {
        measurementId: { type: String, attribute: 'measurement-id' },
        adsId: { type: String, attribute: 'ads-id' },
        adsLabel: { type: String, attribute: 'ads-label' },
        websiteId: { type: String, attribute: 'website-id' },
        consentRequired: { type: Boolean, attribute: 'consent-required' },
    };

    constructor() {
        super();
        this.measurementId = '';
        this.adsId = '';
        this.adsLabel = '';
        this.websiteId = '';
        this.consentRequired = false;
        this.loaded = false;
        this._armed = false;
        this._onSwap = () => this.processEvents();
        this._onInteraction = () => this.load();
        this._onConsent = () => this.load();
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        this.hidden = true;
        this.initDataLayer();
        this.processEvents();
        document.body.addEventListener('htmx:afterSettle', this._onSwap);
        document.body.addEventListener('htmx:oobAfterSwap', this._onSwap);
        document.addEventListener('hyperion:cookie-consent', this._onConsent);
        this.arm();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.body.removeEventListener('htmx:afterSettle', this._onSwap);
        document.body.removeEventListener('htmx:oobAfterSwap', this._onSwap);
        document.removeEventListener('hyperion:cookie-consent', this._onConsent);
        this.disarm();
    }

    /** `window.gtag` queues into the dataLayer exactly like Google's snippet. */
    initDataLayer() {
        window.dataLayer = window.dataLayer || [];
        if (typeof window.gtag !== 'function') {
            window.gtag = function gtag() {
                window.dataLayer.push(arguments);
            };
        }
        if (this._configured) return;
        this._configured = true;
        window.gtag('js', new Date());
        if (this.measurementId) window.gtag('config', this.measurementId, { anonymize_ip: true });
        if (this.adsId) window.gtag('config', this.adsId);
    }

    /** Whether the visitor allowed cookies for this website (always true without the restriction mode). */
    hasConsent() {
        if (!this.consentRequired) return true;
        const accepted = readConsentCookie();
        return !!(accepted && this.websiteId && Number(accepted[this.websiteId]) === 1);
    }

    arm() {
        if (this._armed || this.loaded) return;
        this._armed = true;
        for (const name of INTERACTION_EVENTS) {
            window.addEventListener(name, this._onInteraction, { once: true, passive: true });
        }
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, IDLE_DELAY));
        this._idleHandle = idle(() => this.load(), { timeout: IDLE_DELAY });
    }

    disarm() {
        this._armed = false;
        for (const name of INTERACTION_EVENTS) {
            window.removeEventListener(name, this._onInteraction);
        }
    }

    /** Inject gtag.js once, only with consent. Returns whether the script is (now) present. */
    load() {
        if (this.loaded) return true;
        if (!this.hasConsent()) return false;
        const id = this.measurementId || this.adsId;
        if (!id) return false;
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
        script.setAttribute('data-hyperion-gtag-script', '');
        document.head.appendChild(script);
        this.loaded = true;
        this.disarm();
        return true;
    }

    /** Push every unprocessed event record of the page. */
    processEvents(root = document) {
        const blocks = root.querySelectorAll(EVENT_SELECTOR + ':not([' + PROCESSED + '])');
        let pushed = 0;
        for (const block of blocks) {
            block.setAttribute(PROCESSED, '');
            const name = block.getAttribute('data-hyperion-gtag-event');
            let payload;
            try {
                payload = JSON.parse(block.getAttribute('data-hyperion-gtag-payload') || '{}');
            } catch {
                continue;
            }
            if (!name || !payload || typeof payload !== 'object') continue;
            this.send(name, payload);
            pushed++;
        }
        return pushed;
    }

    send(name, payload) {
        window.gtag('event', name, payload);
        if (name === 'purchase' && this.adsId && this.adsLabel) {
            window.gtag('event', 'conversion', {
                send_to: this.adsId + '/' + this.adsLabel,
                value: payload.value,
                currency: payload.currency,
                transaction_id: payload.transaction_id,
            });
        }
    }
}

if (!customElements.get('hyperion-gtag')) {
    customElements.define('hyperion-gtag', HyperionGtag);
}
