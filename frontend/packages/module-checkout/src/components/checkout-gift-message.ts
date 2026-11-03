// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * <checkout-gift-message> -- gift options inside the checkout.
 *
 * Renders nothing unless the store allows gift messages (core's
 * `GiftMessageConfigProvider` keys). Otherwise a collapsible panel with one
 * form for the whole order (physical quotes only, as core decides) and one
 * per item whose product accepts a message. Each form saves through the
 * native web API (`api/gift-message.ts`); an empty message removes the
 * stored one. The messages entered on the cart page are the initial values.
 */
import { LitElement, html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { getStore } from '../store/index.js';
import { getCheckoutConfig } from '../bootstrap-config.js';
import { saveCustomerGiftMessage, saveGuestGiftMessage, type GiftMessagePayload } from '../api/gift-message.js';
import { MagentoApiError } from '../api/client.js';
import type { CartItem } from '../types/quote.js';
import type { GiftMessageItemLevel, StoredGiftMessage } from '../types/config.js';
import { t } from '../utils/i18n.js';
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

    public override createRenderRoot(): HTMLElement { return this; }

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
            <fieldset class="space-y-2 rounded-md border border-subtle p-3" data-hyperion-gift-form=${key}>
                <legend class="px-1 text-sm font-semibold text-brand">${heading}</legend>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    ${field('sender', t('Hyperion_Checkout::gift_sender_label'))}
                    ${field('recipient', t('Hyperion_Checkout::gift_recipient_label'))}
                </div>
                <label class="block">
                    <span class="block text-sm font-medium text-brand mb-1">${t('Hyperion_Checkout::gift_message_label')}</span>
                    <textarea
                        name=${`gift_${key}_message`}
                        rows="3"
                        maxlength=${String(MAX_MESSAGE_LENGTH)}
                        class="w-full rounded border border-subtle bg-surface px-3 py-2 text-sm text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                        .value=${form.message}
                        @input=${(e: Event) => this._update(key, initial, 'message', (e.target as HTMLTextAreaElement).value)}
                    ></textarea>
                </label>
                ${notice
                    ? html`<p class=${notice.tone === 'error' ? 'text-sm text-error' : 'text-sm text-success'}
                              role="status" data-hyperion-gift-notice=${notice.tone}>${notice.text}</p>`
                    : nothing}
                <div class="flex gap-2">
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
        this._forms = { ...this._forms, [key]: { ...current, [name]: value } };
        if (this._notice[key]) {
            const next = { ...this._notice };
            delete next[key];
            this._notice = next;
        }
    }

    private _save = async (target: Target, form: FormState): Promise<void> => {
        const key = keyOf(target);
        const store = getStore();
        const payload: GiftMessagePayload = {
            sender: form.sender.trim(),
            recipient: form.recipient.trim(),
            message: form.message.trim().slice(0, MAX_MESSAGE_LENGTH),
        };
        this._busy = { ...this._busy, [key]: true };
        try {
            if (store.isGuest.get()) {
                await saveGuestGiftMessage(store.maskedQuoteId.get() ?? '', target, payload);
            } else {
                await saveCustomerGiftMessage(target, payload);
            }
            this._notice = {
                ...this._notice,
                [key]: {
                    tone: 'success',
                    text: payload.message === ''
                        ? t('Hyperion_Checkout::gift_removed')
                        : t('Hyperion_Checkout::gift_saved'),
                },
            };
        } catch (err) {
            const text = err instanceof MagentoApiError ? err.message : t('Hyperion_Checkout::gift_save_failed');
            this._notice = { ...this._notice, [key]: { tone: 'error', text } };
        } finally {
            this._busy = { ...this._busy, [key]: false };
        }
    };
}

if (!customElements.get('checkout-gift-message')) {
    customElements.define('checkout-gift-message', CheckoutGiftMessage);
}

declare global {
    interface HTMLElementTagNameMap { 'checkout-gift-message': CheckoutGiftMessage; }
}
