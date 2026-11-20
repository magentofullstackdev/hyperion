// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-agreements>: Terms and Conditions checkboxes.
 *
 * Renders one required checkbox per manual-mode agreement from
 * `checkoutConfig.checkoutAgreements`. Auto-mode agreements are
 * server-side accepted and never reach the UI.
 *
 * The checkbox label is the short text of the agreement; the full text
 * opens in a modal <dialog> from a "Read the terms" button next to it
 * (its body is as high as the agreement's configured content height), so
 * the checkbox is not described by paragraphs of legal text. A box that
 * is still unticked when Place Order was pressed too early
 * (`validationRequests`, bumped after this element mounted) AND the
 * agreements are the piece the order is missing is marked invalid with
 * its own message in a line reserved under it. The first such box is then
 * the first invalid control of the page, which is where the button moves
 * the focus; while something else is missing (a field, a method) the
 * boxes stay unmarked and the focus goes to that.
 *
 * The component reads and writes the store's `acceptedAgreements`; the
 * `agreementsAccepted` and `canPlaceOrder` selectors gate Place Order.
 *
 * Admin-authored `content` is run through `sanitiseHtml()` before
 * being assigned to `.innerHTML`.
 */
// The section lives inside <checkout-app> and is built from its controls.
// Importing the application here keeps those shared modules in the
// application chunk instead of small chunks of their own.
import './checkout-app.js';
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { initFlowSelectors } from '../store/flow-selectors.js';
import { placeOrderBlocker } from '../store/place-order-hint.js';
import { validationRequests } from '../store/validation-request.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { sanitiseHtml } from '../utils/sanitize-html.js';
import { t } from '../utils/i18n.js';
import type { AgreementEntry } from '../types/config.js';
import { AGREEMENT_MODE_MANUAL } from '../types/config.js';
import './ui/button.js';

const DEFAULT_CONTENT_HEIGHT = '60vh';

/**
 * The configured content height as a CSS length: a bare number is pixels,
 * a number with a length unit is taken as is, anything else (empty, a
 * keyword, a declaration) falls back to the default.
 */
export function agreementContentHeight(raw: unknown): string {
    const value = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
    const match = /^(\d+(?:\.\d+)?)(px|em|rem|vh|%)?$/.exec(value);
    if (!match || Number(match[1]) <= 0) return DEFAULT_CONTENT_HEIGHT;
    return `${match[1]}${match[2] ?? 'px'}`;
}

export class CheckoutAgreements extends SignalWatcher(LitElement) {
    /** Unticked boxes show their error once a validation was requested after mount. */
    @state() private accessor _reveal = false;

    private _validationBaseline = 0;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this._validationBaseline = validationRequests.get();
    }

    public override willUpdate(): void {
        if (!this._reveal && validationRequests.get() > this._validationBaseline) {
            this._reveal = true;
        }
    }

    private _manualAgreements(): readonly AgreementEntry[] {
        const cfg = getCheckoutConfig().checkoutAgreements;
        if (!cfg || !cfg.isEnabled || !cfg.agreements) return [];
        return cfg.agreements.filter((a) => a.mode === AGREEMENT_MODE_MANUAL);
    }

    /** Without agreements the element takes no place among its siblings. */
    protected override updated(): void {
        const empty = this._manualAgreements().length === 0;
        this.toggleAttribute('hidden', empty);
        this.classList.toggle('hc-host', !empty);
    }

    public override render(): unknown {
        const manual = this._manualAgreements();
        if (manual.length === 0) return nothing;

        const store = getStore();
        const accepted = new Set(store.acceptedAgreements.get());
        const showErrors = this._reveal && placeOrderBlocker(store, initFlowSelectors()) === 'agreements';

        return html`
            <fieldset class="pt-3 border-t border-subtle"
                      aria-labelledby="hc-agreements-heading">
                <legend id="hc-agreements-heading" class="sr-only">
                    ${t('Hyperion_Checkout::agreements_heading')}
                </legend>
                ${manual.map((a) => this._renderRow(a, accepted.has(a.agreementId), showErrors))}
            </fieldset>
        `;
    }

    private _renderRow(agreement: AgreementEntry, isAccepted: boolean, showErrors: boolean): unknown {
        const id = `hc-agreement-${agreement.agreementId}`;
        const errorId = `${id}-msg`;
        const headingId = `${id}-heading`;
        const labelText = agreement.checkboxText || agreement.name || '';
        const title = agreement.name || labelText;
        const invalid = showErrors && !isAccepted;
        return html`
            <div data-hyperion-agreement=${String(agreement.agreementId)}>
                <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <label for=${id}
                           class="flex items-start gap-2 cursor-pointer text-sm text-brand">
                        <input
                            id=${id}
                            type="checkbox"
                            class="mt-0.5 h-4 w-4 rounded ${invalid ? 'border-danger' : 'border-subtle'} text-accent focus:ring-2 focus:ring-accent"
                            .checked=${isAccepted}
                            required
                            aria-required="true"
                            aria-invalid=${invalid ? 'true' : 'false'}
                            aria-describedby=${ifDefined(invalid ? errorId : undefined)}
                            @change=${(e: Event) => this._onToggle(agreement.agreementId, e)}
                        />
                        <span>${labelText} <span aria-hidden="true" class="text-danger">*</span></span>
                    </label>
                    ${agreement.content
                        ? html`
                              <button type="button"
                                      class="text-sm font-medium text-accent underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-accent"
                                      aria-haspopup="dialog"
                                      data-hyperion-agreement-open
                                      @click=${() => this._openTerms(agreement.agreementId)}>
                                  ${t('Hyperion_Checkout::agreements_read')}
                              </button>
                          `
                        : nothing}
                </div>
                <p id=${errorId} class="hc-field-message pl-6 text-danger">
                    ${invalid ? t('Hyperion_Checkout::agreements_required') : nothing}
                </p>
                ${agreement.content
                    ? html`
                          <dialog class="w-full max-w-lg rounded-xl border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                                  aria-labelledby=${headingId}
                                  data-hyperion-agreement-dialog=${String(agreement.agreementId)}>
                              <div class="p-4 space-y-3">
                                  <h3 id=${headingId} class="text-base font-semibold text-brand">${title}</h3>
                                  <div class="text-sm text-brand space-y-2 overflow-y-auto"
                                       style=${styleMap({ maxHeight: agreementContentHeight(agreement.contentHeight) })}
                                       data-hyperion-agreement-content
                                       .innerHTML=${sanitiseHtml(agreement.content)}></div>
                                  <div class="flex justify-end">
                                      <hc-button variant="secondary"
                                                 .label=${t('Hyperion_Checkout::agreements_close')}
                                                 @click=${() => this._closeTerms(agreement.agreementId)}></hc-button>
                                  </div>
                              </div>
                          </dialog>
                      `
                    : nothing}
            </div>
        `;
    }

    private _dialog(agreementId: number): HTMLDialogElement | null {
        return this.querySelector<HTMLDialogElement>(`dialog[data-hyperion-agreement-dialog="${agreementId}"]`);
    }

    private _openTerms(agreementId: number): void {
        const dialog = this._dialog(agreementId);
        if (!dialog) return;
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    }

    private _closeTerms(agreementId: number): void {
        const dialog = this._dialog(agreementId);
        if (!dialog) return;
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    }

    private _onToggle(agreementId: number, e: Event): void {
        const checked = (e.target as HTMLInputElement).checked;
        const slot = getStore().acceptedAgreements;
        const current = slot.get();
        if (checked) {
            if (!current.includes(agreementId)) slot.set([...current, agreementId]);
        } else {
            slot.set(current.filter((id) => id !== agreementId));
        }
    }
}

if (!customElements.get('checkout-agreements')) {
    customElements.define('checkout-agreements', CheckoutAgreements);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-agreements': CheckoutAgreements; }
}
