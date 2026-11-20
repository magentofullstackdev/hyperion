// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-gift-message> -- gift options inside the checkout.
 *
 * Renders nothing unless the store allows gift messages (core's
 * `GiftMessageConfigProvider` keys). Otherwise a collapsible panel with one
 * form for the whole order (physical quotes only, as core decides) and one
 * per item whose product accepts a message. Each form saves through the
 * quote write queue (`flowActions().saveGiftMessage()`, one write per
 * target, serialized with the other saves of the quote); an empty message
 * removes the stored one. The messages entered on the cart page are the initial values.
 *
 * A form whose text differs from what the quote holds is saved when the
 * focus leaves it and, through a flusher registered with the queue, before
 * an order is placed; a form the shopper did not change is never sent (an
 * empty payload would delete the stored message).
 *
 * What is typed and not saved yet is mirrored in `giftDrafts`, which the
 * draft persistence keeps across a reload: such a form comes back open and
 * filled, and is saved like any other changed form. A save that fails shows
 * in the `gift` section status, with its retry; the line under a form only
 * confirms a save or tells that it could not be sent at all.
 */
// The section lives inside <checkout-app> and is built from its controls.
// Importing the application here keeps those shared modules in the
// application chunk instead of small chunks of their own.
import './checkout-app.js';
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import type { GiftMessagePayload } from '../api/gift-message.js';
import { giftDrafts } from '../store/drafts.js';
import { flowActions } from '../store/flow-actions.js';
import type { CartItem } from '../types/quote.js';
import type { GiftMessageItemLevel, StoredGiftMessage } from '../types/config.js';
import { t } from '../utils/i18n.js';
import './section-status.js';
import './ui/text-input.js';
import './ui/button.js';

/** `null` = the order, a number = a quote item. */
type Target = number | null;

interface FormState {
    sender: string;
    recipient: string;
    message: string;
}

const MAX_MESSAGE_LENGTH = 2000;

function keyOf(target: Target): string {
    return target === null ? 'order' : String(target);
}

function targetOf(key: string): Target {
    return key === 'order' ? null : Number(key);
}

function payloadOf(form: FormState): GiftMessagePayload {
    return {
        sender: form.sender.trim(),
        recipient: form.recipient.trim(),
        message: form.message.trim().slice(0, MAX_MESSAGE_LENGTH),
    };
}

function samePayload(a: GiftMessagePayload, b: GiftMessagePayload): boolean {
    return a.sender === b.sender && a.recipient === b.recipient && a.message === b.message;
}

function initialState(stored: StoredGiftMessage | true | undefined): FormState {
    if (!stored || stored === true) return { sender: '', recipient: '', message: '' };
    return {
        sender: typeof stored.sender === 'string' ? stored.sender : '',
        recipient: typeof stored.recipient === 'string' ? stored.recipient : '',
        message: typeof stored.message === 'string' ? stored.message : '',
    };
}

export interface GiftMessageTargets {
    order: FormState | null;
    items: readonly { item: CartItem; state: FormState }[];
}

/**
 * Which forms the config and the quote allow, with their stored values.
 * Exported for the unit tests.
 */
export function resolveGiftMessageTargets(
    cfg: Pick<ReturnType<typeof getCheckoutConfig>, 'giftMessage' | 'isOrderLevelGiftOptionsEnabled' | 'isItemLevelGiftOptionsEnabled'>,
    items: readonly CartItem[]
): GiftMessageTargets {
    const order = cfg.isOrderLevelGiftOptionsEnabled === true
        ? initialState(cfg.giftMessage?.orderLevel)
        : null;
    const itemLevel = cfg.giftMessage?.itemLevel;
    const perItem = itemLevel && itemLevel !== true ? itemLevel : {};
    const itemForms = cfg.isItemLevelGiftOptionsEnabled === true
        ? items
            .filter((item) => {
                const virtual = item.is_virtual === '1' || (item.is_virtual as unknown) === 1 || (item.is_virtual as unknown) === true;
                if (virtual) return false;
                const entry: GiftMessageItemLevel | undefined = perItem[String(item.item_id)];
                return entry?.is_available !== false;
            })
            .map((item) => ({ item, state: initialState(perItem[String(item.item_id)]?.message) }))
        : [];
    return { order, items: itemForms };
}

export class CheckoutGiftMessage extends SignalWatcher(LitElement) {
    @state() private accessor _open = false;
    @state() private accessor _forms: Readonly<Record<string, FormState>> = {};
    @state() private accessor _busy: Readonly<Record<string, boolean>> = {};
    @state() private accessor _notice: Readonly<Record<string, { tone: 'success' | 'error'; text: string }>> = {};

    /**
     * What the quote holds for each edited form: the values the form
     * started from, then the last payload that was saved.
     */
    private _stored: Record<string, GiftMessagePayload> = {};

    /** The payload of the save that is on its way, per form: the same text is not sent twice. */
    private _sending: Record<string, GiftMessagePayload> = {};

    private _unregisterFlusher: (() => void) | null = null;

    public override createRenderRoot(): HTMLElement { return this; }

    public override connectedCallback(): void {
        super.connectedCallback();
        this._unregisterFlusher = flowActions().queue.registerFlusher(this._flushDirtyForms);
        this._restoreDrafts();
    }

    /**
     * Put back the forms typed before the page was left. Nothing is sent
     * here: a restored form that differs from the quote is saved when the
     * focus leaves it or before an order, like one typed just now.
     */
    private _restoreDrafts(): void {
        const drafts = giftDrafts.get();
        if (Object.keys(drafts).length === 0) return;
        const targets = resolveGiftMessageTargets(getCheckoutConfig(), getStore().items.get());
        const initial: Record<string, FormState> = {};
        if (targets.order !== null) initial[keyOf(null)] = targets.order;
        for (const { item, state: stored } of targets.items) initial[keyOf(Number(item.item_id))] = stored;
        const forms = { ...this._forms };
        let restored = false;
        for (const [key, draft] of Object.entries(drafts)) {
            const start = initial[key];
            if (start === undefined || forms[key] !== undefined) continue;
            const form: FormState = { sender: draft.sender, recipient: draft.recipient, message: draft.message };
            if (samePayload(payloadOf(form), payloadOf(start))) continue;
            this._stored[key] = payloadOf(start);
            forms[key] = form;
            restored = true;
        }
        if (!restored) return;
        this._forms = forms;
        this._open = true;
    }

    private _forgetDraft(key: string): void {
        const drafts = giftDrafts.get();
        if (!(key in drafts)) return;
        const { [key]: _saved, ...rest } = drafts;
        giftDrafts.set(rest);
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        this._unregisterFlusher?.();
        this._unregisterFlusher = null;
    }

    private _hasTargets(): boolean {
        const targets = resolveGiftMessageTargets(getCheckoutConfig(), getStore().items.get());
        return targets.order !== null || targets.items.length > 0;
    }

    /** Without gift options the element takes no place among its siblings. */
    protected override updated(): void {
        const empty = !this._hasTargets();
        this.toggleAttribute('hidden', empty);
        this.classList.toggle('hc-host', !empty);
    }

    private _isDirty(key: string): boolean {
        const form = this._forms[key];
        const stored = this._stored[key];
        if (form === undefined || stored === undefined) return false;
        const payload = payloadOf(form);
        const sending = this._sending[key];
        if (sending !== undefined && samePayload(payload, sending)) return false;
        return !samePayload(payload, stored);
    }

    /** Called by the queue before it drains for an order: every changed form becomes its write now. */
    private _flushDirtyForms = (): void => {
        for (const [key, form] of Object.entries(this._forms)) {
            if (this._isDirty(key)) void this._save(targetOf(key), form);
        }
    };

    /** The focus left a form (not for another of its controls): save it when it changed. */
    private _onFormFocusOut(key: string, e: FocusEvent): void {
        const fieldset = e.currentTarget as HTMLElement | null;
        const next = e.relatedTarget;
        if (fieldset !== null && next instanceof Node && fieldset.contains(next)) return;
        const form = this._forms[key];
        if (form !== undefined && this._isDirty(key)) void this._save(targetOf(key), form);
    }

    public override render(): unknown {
        const cfg = getCheckoutConfig();
        const targets = resolveGiftMessageTargets(cfg, getStore().items.get());
        if (targets.order === null && targets.items.length === 0) return nothing;

        if (!this._open) {
            return html`
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        data-hyperion-gift-open
                        @click=${() => { this._open = true; }}>
                    ${t('Hyperion_Checkout::gift_options_open')}
                </button>
            `;
        }

        return html`
            <div class="space-y-4" data-hyperion-gift-options>
                ${targets.order !== null
                    ? this._renderForm(null, t('Hyperion_Checkout::gift_order_heading'), targets.order)
                    : nothing}
                ${targets.items.map(({ item, state }) =>
                    this._renderForm(Number(item.item_id), t('Hyperion_Checkout::gift_item_heading', { name: item.name }), state))}
                <hc-section-status section="gift"></hc-section-status>
                <button type="button"
                        class="text-sm font-medium text-muted hover:underline"
                        @click=${() => { this._open = false; }}>
                    ${t('Hyperion_Checkout::gift_options_close')}
                </button>
            </div>
        `;
    }

    private _renderForm(target: Target, heading: string, initial: FormState): unknown {
        const key = keyOf(target);
        const form = this._forms[key] ?? initial;
        const notice = this._notice[key];
        const field = (name: keyof FormState, label: string): unknown => html`
            <hc-text-input
                label=${label}
                name=${`gift_${key}_${name}`}
                .value=${form[name]}
                @value-change=${(e: CustomEvent<{ value: string }>) => this._update(key, initial, name, e.detail.value)}
            ></hc-text-input>
        `;
        return html`
            <fieldset class="rounded-lg border border-subtle p-3"
                      data-hyperion-gift-form=${key}
                      @focusout=${(e: FocusEvent) => this._onFormFocusOut(key, e)}>
                <legend class="px-1 text-sm font-semibold text-brand">${heading}</legend>
                <div class="hc-field-row hc-field-row-2">
                    ${field('sender', t('Hyperion_Checkout::gift_sender_label'))}
                    ${field('recipient', t('Hyperion_Checkout::gift_recipient_label'))}
                </div>
                <label class="mt-4 block">
                    <span class="hc-field-label text-brand">${t('Hyperion_Checkout::gift_message_label')}</span>
                    <textarea
                        name=${`gift_${key}_message`}
                        rows="3"
                        maxlength=${String(MAX_MESSAGE_LENGTH)}
                        class="mt-1.5 block w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                        .value=${form.message}
                        @input=${(e: Event) => this._update(key, initial, 'message', (e.target as HTMLTextAreaElement).value)}
                    ></textarea>
                </label>
                <p class="hc-field-message ${notice?.tone === 'error' ? 'text-danger' : 'text-success-strong'}"
                   role="status"
                   data-hyperion-gift-notice=${notice?.tone ?? 'none'}>${notice ? notice.text : nothing}</p>
                <div class="mt-2 flex gap-2">
                    <hc-button variant="secondary"
                               .label=${t('Hyperion_Checkout::gift_save')}
                               .loading=${this._busy[key] === true}
                               @click=${() => this._save(target, form)}></hc-button>
                </div>
            </fieldset>
        `;
    }

    private _update(key: string, initial: FormState, name: keyof FormState, value: string): void {
        const current = this._forms[key] ?? initial;
        this._stored[key] ??= payloadOf(initial);
        const next = { ...current, [name]: value };
        this._forms = { ...this._forms, [key]: next };
        giftDrafts.set({ ...giftDrafts.get(), [key]: next });
        if (this._notice[key]) {
            const next = { ...this._notice };
            delete next[key];
            this._notice = next;
        }
    }

    private _save = async (target: Target, form: FormState): Promise<void> => {
        const key = keyOf(target);
        const payload = payloadOf(form);
        this._busy = { ...this._busy, [key]: true };
        this._sending[key] = payload;
        const outcome = await flowActions().saveGiftMessage(target, payload);
        if (this._sending[key] === payload) delete this._sending[key];
        this._busy = { ...this._busy, [key]: false };
        // A newer save of the same form took over: it reports for both.
        if (outcome.status === 'superseded') return;
        if (outcome.status === 'applied') {
            this._stored[key] = payload;
            // Typed since the request left: that text is still a draft.
            const current = this._forms[key];
            if (current === undefined || samePayload(payloadOf(current), payload)) this._forgetDraft(key);
            this._notice = {
                ...this._notice,
                [key]: {
                    tone: 'success',
                    text: payload.message === ''
                        ? t('Hyperion_Checkout::gift_removed')
                        : t('Hyperion_Checkout::gift_saved'),
                },
            };
            return;
        }
        // A request that failed is on screen in the section status, with
        // its reason and its retry.
        if (outcome.status === 'failed') return;
        this._notice = {
            ...this._notice,
            [key]: { tone: 'error', text: t('Hyperion_Checkout::gift_save_failed') },
        };
    };
}

if (!customElements.get('checkout-gift-message')) {
    customElements.define('checkout-gift-message', CheckoutGiftMessage);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-gift-message': CheckoutGiftMessage; }
}
