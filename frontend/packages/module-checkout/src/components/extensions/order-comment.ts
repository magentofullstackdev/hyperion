// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The order comment: a first-party checkout extension, built only on the
 * public extension API (`extension-api.d.ts`). The server lists it in the
 * generic pool (`hyperion.extensions`) only while
 * `hyperion_checkout/order_comment/enabled` is on, with the maximum length
 * as the `maxLength` option.
 *
 * It registers `<hc-order-comment>` in the `before-place-order` slot (a
 * labeled text area, plain text, the characters left read with it) and
 * a `paymentInformation` filter that sends a comment that is not empty as
 * `paymentMethod.extension_attributes.hyperion_order_comment`. The server
 * strips tags, trims, cuts at the maximum and adds it to the order history.
 */
import type { CheckoutContext, CheckoutExtensionApi } from '../../../extension-api.js';

export const hyperionApi = '1';

export const ORDER_COMMENT_TAG = 'hc-order-comment';
const DEFAULT_MAX_LENGTH = 500;

/** What the shopper typed, read by the filter. */
let comment = '';
let instances = 0;

export function maxLengthOf(options: Readonly<Record<string, unknown>> | null | undefined): number {
    const max = Number(options?.maxLength);
    return Number.isInteger(max) && max > 0 ? max : DEFAULT_MAX_LENGTH;
}

export class OrderCommentElement extends HTMLElement {
    public static readonly hyperionApi = '1';

    public context!: CheckoutContext;
    public options: Readonly<Record<string, unknown>> = {};

    private _count: HTMLElement | null = null;

    public connectedCallback(): void {
        if (this.childElementCount > 0) return;
        instances += 1;
        const id = `hc-order-comment-${instances}`;
        const max = maxLengthOf(this.options);
        const tr = (source: string, params?: Readonly<Record<string, string | number>>): string =>
            this.context ? this.context.t(source, params) : source;

        this.className = 'hc-field';
        const label = document.createElement('label');
        label.htmlFor = id;
        label.className = 'hc-field-label text-brand';
        label.textContent = tr('Order comment');

        const area = document.createElement('textarea');
        area.id = id;
        area.name = 'hyperion_order_comment';
        area.rows = 3;
        area.maxLength = max;
        area.value = comment;
        area.className = 'hc-field-control h-24 resize-y border-subtle bg-surface text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent';
        area.setAttribute('aria-describedby', `${id}-count`);
        area.addEventListener('input', () => {
            comment = area.value.slice(0, max);
            this._renderCount(max, tr);
        });

        const count = document.createElement('p');
        count.id = `${id}-count`;
        count.className = 'hc-field-message text-muted';
        this._count = count;

        this.append(label, area, count);
        this._renderCount(max, tr);
    }

    private _renderCount(max: number, tr: (source: string, params?: Readonly<Record<string, string | number>>) => string): void {
        if (this._count !== null) {
            this._count.textContent = tr('{count} characters left', { count: Math.max(0, max - comment.length) });
        }
    }
}

/** The payment-information body with the comment, when there is one. */
export function withOrderComment<T extends { paymentMethod: Record<string, unknown> }>(payload: T): T {
    const text = comment.trim();
    if (text === '') return payload;
    const current = payload.paymentMethod.extension_attributes;
    const attributes = current !== null && typeof current === 'object' && !Array.isArray(current)
        ? current as Record<string, unknown>
        : {};
    payload.paymentMethod.extension_attributes = { ...attributes, hyperion_order_comment: text };
    return payload;
}

export default function register(api: CheckoutExtensionApi): void {
    if (!customElements.get(ORDER_COMMENT_TAG)) customElements.define(ORDER_COMMENT_TAG, OrderCommentElement);
    api.registerSlot('before-place-order', ORDER_COMMENT_TAG);
    api.filter('paymentInformation', (payload) => withOrderComment(payload));
}

export function resetOrderCommentForTests(): void {
    comment = '';
}
