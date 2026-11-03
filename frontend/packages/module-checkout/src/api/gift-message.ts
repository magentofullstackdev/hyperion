// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Gift message endpoint wrappers (`Magento_GiftMessage` web API).
 *
 *   POST /guest-carts/:cartId/gift-message            order level (guest)
 *   POST /guest-carts/:cartId/gift-message/:itemId    item level (guest)
 *   POST /carts/mine/gift-message                     order level (customer)
 *   POST /carts/mine/gift-message/:itemId             item level (customer)
 *
 * The body is `{ giftMessage: { sender, recipient, message } }`
 * (`Magento\GiftMessage\Api\Data\MessageInterface`). An empty `message`
 * removes the stored one (core's GiftMessageManager). The service answers
 * `true`.
 */
import { apiFetch } from './client.js';

export interface GiftMessagePayload {
    sender: string;
    recipient: string;
    message: string;
}

function path(cartSegment: string, itemId: number | null): string {
    return itemId === null
        ? `${cartSegment}/gift-message`
        : `${cartSegment}/gift-message/${encodeURIComponent(String(itemId))}`;
}

export function saveGuestGiftMessage(
    maskedCartId: string,
    itemId: number | null,
    giftMessage: GiftMessagePayload
): Promise<boolean> {
    return apiFetch<boolean>(path(`guest-carts/${encodeURIComponent(maskedCartId)}`, itemId), {
        method: 'POST',
        body: { giftMessage },
        auth: 'guest',
    });
}

export function saveCustomerGiftMessage(
    itemId: number | null,
    giftMessage: GiftMessagePayload
): Promise<boolean> {
    return apiFetch<boolean>(path('carts/mine', itemId), {
        method: 'POST',
        body: { giftMessage },
        auth: 'customer',
    });
}
