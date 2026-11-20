// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * The `mage-messages` cookie.
 *
 * A storefront controller that fails adds its message to the session, and
 * Magento writes the pending messages into this cookie on every response,
 * also on the answer to a `fetch()`. Left alone, the message of a failed
 * request made from the checkout would show up on the next page the shopper
 * opens. `drainMageMessages()` takes the messages out and deletes the
 * cookie, so the caller can show them now and nobody shows them again.
 *
 * The cookie holds a URL-encoded JSON list of `{ type, text }`; `text` may
 * carry markup, which is reduced to plain text here.
 */
import { htmlToText } from './sanitize-html.js';

export const MAGE_MESSAGES_COOKIE = 'mage-messages';

export interface MageMessage {
    type: string;
    text: string;
}

function readCookie(name: string): string {
    const prefix = `${name}=`;
    for (const raw of document.cookie.split(';')) {
        const piece = raw.trim();
        if (piece.startsWith(prefix)) return piece.substring(prefix.length);
    }
    return '';
}

export function drainMageMessages(): MageMessage[] {
    const raw = readCookie(MAGE_MESSAGES_COOKIE);
    if (!raw) return [];
    document.cookie = `${MAGE_MESSAGES_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    let parsed: unknown;
    try {
        parsed = JSON.parse(decodeURIComponent(raw.replace(/\+/g, ' ')));
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const messages: MageMessage[] = [];
    for (const entry of parsed as unknown[]) {
        if (!entry || typeof entry !== 'object') continue;
        const { type, text } = entry as Record<string, unknown>;
        if (typeof text !== 'string' || text === '') continue;
        const plain = htmlToText(text).trim();
        if (plain === '') continue;
        messages.push({ type: typeof type === 'string' && type ? type : 'notice', text: plain });
    }
    return messages;
}

/** The first error text of a drained list, or the first text of any type. */
export function firstMessageText(messages: readonly MageMessage[]): string {
    return (messages.find((message) => message.type === 'error') ?? messages[0])?.text ?? '';
}
