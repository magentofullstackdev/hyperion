// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-messages -- page-level Magento messages.
 *
 * Magento_Theme's MessagePlugin moves session messages (login errors,
 * "Thanks for contacting us", "reCAPTCHA verification failed", ...) into the
 * `mage-messages` cookie so cached pages can still show them; Luma renders
 * them with a Knockout component. This element does the same job: it reads
 * the cookie, renders one alert per message, and deletes the cookie so the
 * messages show once.
 *
 * The cookie is readable and writable by any script and by sibling
 * subdomains, so its text is untrusted: it is rebuilt from core's message
 * allowlist (div span b strong i em u a[href]) before it is inserted.
 */

import { LitElement, nothing } from 'lit';
import { sanitizeMessageHtml } from '@magentofullstackdev/hyperion-shared/html';

const COOKIE = 'mage-messages';
const TONE_CLASSES = {
    success: 'border-success/40 bg-success/10 text-success-strong',
    error: 'border-error/40 bg-error/10 text-error-strong',
    warning: 'border-warning/40 bg-warning/10 text-warning-strong',
    notice: 'border-info/40 bg-info/10 text-info',
};

function readCookieMessages() {
    for (const piece of document.cookie.split(';')) {
        const trimmed = piece.trim();
        if (trimmed.indexOf(COOKIE + '=') !== 0) continue;
        try {
            const parsed = JSON.parse(decodeURIComponent(trimmed.substring(COOKIE.length + 1)));
            return Array.isArray(parsed) ? parsed : [];
        } catch (_e) {
            return [];
        }
    }
    return [];
}

function clearCookie() {
    document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export class HyperionMessages extends LitElement {
    createRenderRoot() {
        return this;
    }

    render() {
        return nothing;
    }

    connectedCallback() {
        super.connectedCallback();
        const messages = readCookieMessages();
        if (messages.length === 0) return;
        clearCookie();
        for (const message of messages) {
            if (!message || typeof message.text !== 'string') continue;
            const html = sanitizeMessageHtml(message.text);
            if (html.trim() === '') continue;
            const tone = typeof message.type === 'string' && TONE_CLASSES[message.type] ? message.type : 'notice';
            const alert = document.createElement('div');
            alert.setAttribute('role', 'alert');
            alert.setAttribute('data-tone', tone);
            alert.className = `my-3 rounded-lg border px-4 py-3 text-sm ${TONE_CLASSES[tone]}`;
            alert.innerHTML = html;
            this.appendChild(alert);
        }
        if (this.childElementCount > 0) {
            this.scrollIntoView({ block: 'nearest' });
        }
    }
}

if (!customElements.get('hyperion-messages')) {
    customElements.define('hyperion-messages', HyperionMessages);
}
