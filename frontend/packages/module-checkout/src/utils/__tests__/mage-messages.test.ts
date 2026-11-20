// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import { MAGE_MESSAGES_COOKIE, drainMageMessages, firstMessageText } from '../mage-messages.js';

function setCookie(value: string): void {
    document.cookie = `${MAGE_MESSAGES_COOKIE}=${value}; path=/`;
}

function encode(messages: unknown): string {
    return encodeURIComponent(JSON.stringify(messages)).replace(/%20/g, '+');
}

describe('drainMageMessages', () => {
    afterEach(() => {
        document.cookie = `${MAGE_MESSAGES_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });

    it('returns nothing and leaves the cookies alone when there is no message cookie', () => {
        document.cookie = 'form_key=abc; path=/';
        expect(drainMageMessages()).toEqual([]);
        expect(document.cookie).toContain('form_key=abc');
        document.cookie = 'form_key=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });

    it('returns the messages and deletes the cookie', () => {
        setCookie(encode([
            { type: 'error', text: 'We can\'t initialize Express Checkout.' },
            { type: 'success', text: 'Saved.' },
        ]));

        expect(drainMageMessages()).toEqual([
            { type: 'error', text: 'We can\'t initialize Express Checkout.' },
            { type: 'success', text: 'Saved.' },
        ]);
        expect(document.cookie).not.toContain(MAGE_MESSAGES_COOKIE);
        expect(drainMageMessages()).toEqual([]);
    });

    it('reduces markup to plain text and decodes the plus signs of the cookie encoding', () => {
        setCookie(encode([{ type: 'error', text: 'Please <a href="/cart">check your cart</a> and retry.' }]));
        expect(drainMageMessages()).toEqual([
            { type: 'error', text: 'Please check your cart and retry.' },
        ]);
    });

    it('skips entries without a text and defaults the type', () => {
        setCookie(encode([{ type: 'error', text: '' }, null, { text: 'Plain notice' }, 'stray']));
        expect(drainMageMessages()).toEqual([{ type: 'notice', text: 'Plain notice' }]);
    });

    it('deletes a cookie it cannot read', () => {
        setCookie('%7Bnot-json');
        expect(drainMageMessages()).toEqual([]);
        expect(document.cookie).not.toContain(MAGE_MESSAGES_COOKIE);
    });

    it('ignores a cookie that is not a list', () => {
        setCookie(encode({ type: 'error', text: 'x' }));
        expect(drainMageMessages()).toEqual([]);
    });
});

describe('firstMessageText', () => {
    it('prefers the first error', () => {
        expect(firstMessageText([
            { type: 'success', text: 'Saved.' },
            { type: 'error', text: 'Declined.' },
        ])).toBe('Declined.');
    });

    it('falls back to the first message, then to an empty string', () => {
        expect(firstMessageText([{ type: 'notice', text: 'Heads up.' }])).toBe('Heads up.');
        expect(firstMessageText([])).toBe('');
    });
});
