// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <hc-section-status section="...">: the failed request of one section of
 * the checkout, next to the controls it belongs to.
 *
 * Renders nothing (and takes no space) while `sectionStatus[section]` is
 * null. A failure of something the shopper pressed is an alert, one of a
 * request the checkout started by itself a status. The keyboard focus moves
 * to the message only for a failed Place Order, Apply coupon or Sign in
 * (the control that was pressed is right there); never for a background
 * failure, which must not take the shopper out of a field.
 *
 * What the shopper can do follows from the kind of failure: "Try again"
 * runs the request again ("Check again" for an order whose outcome is not
 * known), a rate limit holds that button back until the wait the server
 * asked for is over, a blocked request offers a reload, a cart that is
 * gone the way back to it, an item out of stock the cart to review.
 */
import { LitElement, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { peekCheckoutConfig } from '../bootstrap-config.js';
import { discardDrafts } from '../store/drafts.js';
import { getStore } from '../store/index.js';
import type { SectionId, SectionStatus } from '../types/section.js';
import { t } from '../utils/i18n.js';

/** The sections whose failed action leaves the focus on the message. */
const FOCUSED_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>(['order', 'coupon', 'contact']);

function cartUrl(): string {
    const config = peekCheckoutConfig();
    return config?.hyperion?.cartUrl ?? config?.cartUrl ?? '';
}

export class SectionStatusElement extends SignalWatcher(LitElement) {
    @property({ type: String }) public section: SectionId = 'order';

    /** The status on screen, to tell a new failure from another render of the same one. */
    private _shown: SectionStatus | null = null;
    /** The wait a rate limit asked for is still running. */
    private _waiting = false;
    private _waitTimer: ReturnType<typeof setTimeout> | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._endWait();
    }

    private _status(): SectionStatus | null {
        return getStore().sectionStatus.get()[this.section] ?? null;
    }

    public override willUpdate(): void {
        const status = this._status();
        if (status === this._shown) return;
        this._endWait();
        const wait = status?.retryAt === undefined ? 0 : status.retryAt - Date.now();
        if (wait > 0) {
            this._waiting = true;
            this._waitTimer = setTimeout(() => {
                this._waitTimer = null;
                this._waiting = false;
                this.requestUpdate();
            }, wait);
        }
    }

    public override render(): unknown {
        const status = this._status();
        if (status === null) return nothing;
        return html`
            <div role=${status.source === 'action' ? 'alert' : 'status'}
                 tabindex="-1"
                 data-section-status
                 data-kind=${status.kind}
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex flex-wrap items-start gap-x-3 gap-y-2 outline-none focus-visible:ring-2 focus-visible:ring-danger">
                <p class="flex-1 text-sm text-error-strong">${status.message}</p>
                ${this._renderAction(status)}
            </div>
        `;
    }

    public override updated(): void {
        const status = this._status();
        const isNew = status !== null && status !== this._shown;
        this._shown = status;
        if (isNew && status.source === 'action' && FOCUSED_SECTIONS.has(this.section)) {
            const focus = (): void => {
                this.querySelector<HTMLElement>('[data-section-status]')?.focus();
            };
            // Still under the overlay of the order that just failed: what
            // is inert cannot take the focus, so wait for the overlay to
            // give the page back.
            if (this.closest('[inert]') !== null) {
                setTimeout(focus, 0);
            } else {
                focus();
            }
        }
    }

    private _renderAction(status: SectionStatus): unknown {
        if (status.kind === 'quote-gone') {
            return html`<a href=${cartUrl()}
                           data-section-status-action
                           class="text-sm font-medium text-error-strong underline"
                           @click=${discardDrafts}>${t('Hyperion_Checkout::return_to_cart')}</a>`;
        }
        if (status.kind === 'stock') {
            return html`<a href=${cartUrl()}
                           data-section-status-action
                           class="text-sm font-medium text-error-strong underline">${t('Hyperion_Checkout::error_stock_link')}</a>`;
        }
        if (status.kind === 'blocked') {
            return html`<button type="button"
                                data-section-status-action
                                class="text-sm font-medium text-error-strong underline"
                                @click=${this._reload}>${t('Hyperion_Checkout::reload_page')}</button>`;
        }
        if (!status.retry) return nothing;
        const label = status.kind === 'order-unknown'
            ? t('Hyperion_Checkout::check_again')
            : t('Hyperion_Checkout::retry');
        return html`<button type="button"
                            data-section-status-action
                            class="text-sm font-medium text-error-strong underline aria-disabled:opacity-50 aria-disabled:no-underline"
                            aria-disabled=${this._waiting ? 'true' : 'false'}
                            @click=${this._retry}>${label}</button>`;
    }

    private _retry = (): void => {
        if (this._waiting) return;
        this._status()?.retry?.();
    };

    private _reload = (): void => {
        window.location.reload();
    };

    private _endWait(): void {
        if (this._waitTimer !== null) clearTimeout(this._waitTimer);
        this._waitTimer = null;
        this._waiting = false;
    }
}

if (!customElements.get('hc-section-status')) {
    customElements.define('hc-section-status', SectionStatusElement);
}

declare global {
    interface HTMLElementTagNameMap { 'hc-section-status': SectionStatusElement; }
}
