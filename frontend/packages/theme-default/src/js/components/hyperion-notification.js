// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * hyperion-notification -- dismissable toast with auto-hide timer.
 *
 * Wraps the server-rendered notification payload used by the HTMX add-to-
 * cart / wishlist / compare response fragments. Responsibilities:
 *
 *   * Render a close button (Shadow DOM) alongside a `<slot>` for the
 *     server-emitted `<p>` message content. Clicking the button hides the
 *     host element by adding the `hidden` attribute.
 *   * Start an auto-hide timer on connect when the host carries an
 *     `auto-close` millisecond value (default 6s); the timer clears if
 *     the element is removed from the DOM or explicitly dismissed, and
 *     it pauses while the pointer or the keyboard focus is on the toast
 *     (WCAG 2.2.1: a way to extend a time limit), resuming with the
 *     remaining time when both leave.
 *   * Keep the layout contract of the pre-existing plain `<div>` -- the
 *     host still carries `id="hyperion-notification"` and all the
 *     positioning / background utility classes the server sets, so HTMX
 *     can swap it with `hx-swap="outerHTML"` without extra glue.
 *
 * Attributes:
 * - `auto-close` -- integer ms before auto-dismissal; `0` disables the
 *   timer (used for the persistent hidden placeholder).
 * - `close-label` -- accessible label for the close button.
 *
 * Per Hyperion's SRP convention new interactive UI lives in a dedicated
 * `<hyperion-*>` component rather than leaking behavior into the catch-
 * all utilities. Close + auto-hide is a discrete behavior that would not
 * belong on the mini-cart / accordion / dropdown components.
 */

import { LitElement, html, css } from 'lit';

const DEFAULT_AUTO_CLOSE_MS = 6000;
// A toast left after a hover never closes in less than this.
const MIN_RESUME_MS = 1000;

/** Dismiss every visible toast (a drawer opening on top of one calls this). */
export function dismissAllNotifications(root = document) {
    for (const toast of root.querySelectorAll('hyperion-notification:not([hidden])')) {
        if (typeof toast.dismiss === 'function') toast.dismiss();
        else toast.setAttribute('hidden', '');
    }
}

export class HyperionNotification extends LitElement {
    static properties = {
        autoClose: { type: Number, attribute: 'auto-close' },
        closeLabel: { type: String, attribute: 'close-label' },
    };

    static styles = css`
        :host {
            display: block;
            position: relative;
        }
        :host([hidden]) {
            display: none;
        }
        .close {
            position: absolute;
            top: 0.375rem;
            right: 0.5rem;
            width: 1.5rem;
            height: 1.5rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            background: transparent;
            border: 0;
            border-radius: 9999px;
            color: inherit;
            cursor: pointer;
            opacity: 0.75;
            transition: opacity 150ms ease-in-out, background-color 150ms ease-in-out;
        }
        .close:hover {
            opacity: 1;
            background-color: rgba(255, 255, 255, 0.12);
        }
        .close:focus-visible {
            opacity: 1;
            outline: 2px solid currentColor;
            outline-offset: 2px;
        }
        .close svg {
            width: 1rem;
            height: 1rem;
            stroke: currentColor;
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
    `;

    constructor() {
        super();
        this.autoClose = DEFAULT_AUTO_CLOSE_MS;
        this.closeLabel = 'Dismiss notification';
        this._timer = null;
        this._remaining = 0;
        this._startedAt = 0;
        this._hovered = false;
        this._focused = false;
        this._onPointerEnter = () => { this._hovered = true; this._pauseTimer(); };
        this._onPointerLeave = () => { this._hovered = false; this._resumeTimer(); };
        this._onFocusIn = () => { this._focused = true; this._pauseTimer(); };
        this._onFocusOut = (event) => {
            // Focus moving between the close button and slotted content
            // stays on the toast.
            const next = event.relatedTarget;
            if (next && typeof this.contains === 'function' && this.contains(next)) return;
            this._focused = false;
            this._resumeTimer();
        };
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('pointerenter', this._onPointerEnter);
        this.addEventListener('pointerleave', this._onPointerLeave);
        this.addEventListener('focusin', this._onFocusIn);
        this.addEventListener('focusout', this._onFocusOut);
        this._startTimer();
        // Watch the host's `hidden` attribute so a JS-driven reveal
        // (entry.js::showErrorNotification toggling `hidden = false`
        // on the persistent placeholder) also restarts the auto-close
        // timer. LitElement does not reflect unknown attributes, so we
        // use a MutationObserver instead of attributeChangedCallback.
        this._hiddenObserver = new MutationObserver(() => {
            if (this.hasAttribute('hidden')) {
                this._clearTimer();
            } else {
                this._clearTimer();
                this._startTimer();
            }
        });
        this._hiddenObserver.observe(this, {
            attributes: true,
            attributeFilter: ['hidden'],
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('pointerenter', this._onPointerEnter);
        this.removeEventListener('pointerleave', this._onPointerLeave);
        this.removeEventListener('focusin', this._onFocusIn);
        this.removeEventListener('focusout', this._onFocusOut);
        this._clearTimer();
        if (this._hiddenObserver) {
            this._hiddenObserver.disconnect();
            this._hiddenObserver = null;
        }
    }

    // Restart the timer when auto-close changes at runtime. HTMX swaps
    // replace the element entirely, so this mostly covers runtime
    // callers that twiddle the attribute.
    updated(changed) {
        if (changed.has('autoClose')) {
            this._clearTimer();
            this._startTimer();
        }
    }

    _startTimer() {
        if (this.hasAttribute('hidden')) return;
        if (!this.autoClose || this.autoClose <= 0) return;
        this._remaining = this.autoClose;
        if (this._hovered || this._focused) return;
        this._schedule(this._remaining);
    }

    _schedule(ms) {
        this._startedAt = Date.now();
        this._timer = setTimeout(() => this._dismiss(), ms);
    }

    /** Hold the auto-dismiss while the shopper reads or operates the toast. */
    _pauseTimer() {
        if (!this._timer) return;
        const elapsed = Date.now() - this._startedAt;
        this._remaining = Math.max(this._remaining - elapsed, MIN_RESUME_MS);
        clearTimeout(this._timer);
        this._timer = null;
    }

    _resumeTimer() {
        if (this._timer || this._hovered || this._focused) return;
        if (this.hasAttribute('hidden')) return;
        if (!this.autoClose || this.autoClose <= 0) return;
        this._schedule(this._remaining || this.autoClose);
    }

    _clearTimer() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._remaining = 0;
    }

    _dismiss = () => {
        this._clearTimer();
        // A hidden element holds neither the pointer nor the focus.
        this._hovered = false;
        this._focused = false;
        this.setAttribute('hidden', '');
    };

    /** Hide the toast now (the close button, a drawer opening). */
    dismiss() {
        this._dismiss();
    }

    render() {
        return html`
            <button
                type="button"
                class="close"
                aria-label="${this.closeLabel}"
                @click="${this._dismiss}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <slot></slot>
        `;
    }
}

if (!customElements.get('hyperion-notification')) {
    customElements.define('hyperion-notification', HyperionNotification);
}
