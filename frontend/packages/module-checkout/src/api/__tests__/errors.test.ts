// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect, vi } from 'vitest';
import {
    interpolateMessage,
    MagentoApiError,
    NetworkError,
    NON_JSON_BODY,
    normalizeMagentoError,
    RequestTimeoutError,
} from '../errors.js';

describe('normalizeMagentoError', () => {
    it('a body that is not an object yields the translated message of the status class, never the body', () => {
        const e = normalizeMagentoError(500, 'boom');
        expect(e).toBeInstanceOf(MagentoApiError);
        expect(e.httpStatus).toBe(500);
        expect(e.message).toBe('The store is temporarily unavailable. Please try again in a moment.');
    });

    it('picks the message by status when the body carries none: 5xx, 429, 403, anything else', () => {
        expect(normalizeMagentoError(503, undefined).message)
            .toBe('The store is temporarily unavailable. Please try again in a moment.');
        expect(normalizeMagentoError(502, {}).message)
            .toBe('The store is temporarily unavailable. Please try again in a moment.');
        expect(normalizeMagentoError(429, undefined).message)
            .toBe('Too many requests. Please wait a moment.');
        expect(normalizeMagentoError(403, undefined).message)
            .toBe('Your request was blocked. Reload the page or contact us.');
        expect(normalizeMagentoError(400, { message: '' }).message)
            .toBe('Something went wrong. Please try again.');
        expect(normalizeMagentoError(404, null).message)
            .toBe('Something went wrong. Please try again.');
    });

    it('keeps the message of the server when a 429 or a 503 carries one', () => {
        expect(normalizeMagentoError(429, { message: 'Too many attempts, slow down.' }).message)
            .toBe('Too many attempts, slow down.');
        expect(normalizeMagentoError(503, { message: 'Maintenance until %1.', parameters: ['noon'] }).message)
            .toBe('Maintenance until noon.');
    });

    it('a timeout is a transport failure of its own kind', () => {
        const e = new RequestTimeoutError();
        expect(e).toBeInstanceOf(NetworkError);
        expect(e.name).toBe('RequestTimeoutError');
    });

    it('a transport failure is offline when the browser says so at that moment, a timeout always a timeout', () => {
        expect(new NetworkError(new TypeError('Failed to fetch')).kind).toBe('network');
        const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const offline = new NetworkError(new TypeError('Failed to fetch'));
        expect(new RequestTimeoutError().kind).toBe('timeout');
        onLine.mockRestore();
        expect(offline.kind).toBe('offline');
    });

    it('keeps the raw phrase next to the rendered message', () => {
        const e = normalizeMagentoError(400, {
            message: 'Carrier with such method not found: %1, %2',
            parameters: ['flatrate', 'express'],
        });
        expect(e.message).toBe('Carrier with such method not found: flatrate, express');
        expect(e.rawMessage).toBe('Carrier with such method not found: %1, %2');
        expect(e.nonJsonBody).toBe(false);
        expect(e.retryAfterMs).toBeUndefined();
    });

    it('marks a body that was not JSON and carries the Retry-After wait', () => {
        const page = normalizeMagentoError(503, NON_JSON_BODY, 30000);
        expect(page.nonJsonBody).toBe(true);
        expect(page.rawMessage).toBe('');
        expect(page.retryAfterMs).toBe(30000);
        expect(normalizeMagentoError(503, undefined).nonJsonBody).toBe(false);
        expect(normalizeMagentoError(429, { message: 'Slow down' }, 2000).retryAfterMs).toBe(2000);
    });

    it('an error built by hand reports its message as the raw phrase', () => {
        const e = new MagentoApiError(400, '400', 'Incorrect CAPTCHA');
        expect(e.rawMessage).toBe('Incorrect CAPTCHA');
        expect(e.kind).toBeUndefined();
    });

    it('preserves Magento message string', () => {
        const e = normalizeMagentoError(400, {
            message: 'Invalid email',
        });
        expect(e.message).toBe('Invalid email');
        expect(e.httpStatus).toBe(400);
    });

    it('normalizes parameters object to Record<string,string>', () => {
        const e = normalizeMagentoError(422, {
            message: 'Bad',
            parameters: { email: 'foo@', count: 3 },
        });
        expect(e.parameters).toEqual({ email: 'foo@', count: '3' });
    });

    it('normalizes parameters array to positional keys', () => {
        const e = normalizeMagentoError(400, {
            message: 'Bad',
            parameters: ['one', 'two'],
        });
        expect(e.parameters).toEqual({ '0': 'one', '1': 'two' });
    });

    it('renders a named placeholder from the parameters object', () => {
        const e = normalizeMagentoError(400, {
            message: 'The shipping information was unable to be saved. Error: "%message"',
            parameters: { message: 'The shipping address contains invalid data: "Zip/Postal Code" is a required value.' },
        });
        expect(e.message).toBe(
            'The shipping information was unable to be saved. Error: "The shipping address contains invalid data: "Zip/Postal Code" is a required value."'
        );
        expect(e.parameters).toEqual({ message: 'The shipping address contains invalid data: "Zip/Postal Code" is a required value.' });
    });

    it('renders positional placeholders from a parameters list', () => {
        const e = normalizeMagentoError(400, {
            message: '"%1" is a required value. Maximum %2 allowed.',
            parameters: ['Zip/Postal Code', 10],
        });
        expect(e.message).toBe('"Zip/Postal Code" is a required value. Maximum 10 allowed.');
    });

    it('reports an aggregate error by its nested, rendered messages', () => {
        const e = normalizeMagentoError(400, {
            message: 'One or more input exceptions have occurred.',
            errors: [
                { message: '"%fieldName" is required. Enter and try again.', parameters: { fieldName: 'telephone' } },
                { message: 'Invalid value of "%value" provided for the %fieldName field.', parameters: { fieldName: 'postcode', value: 'ABCDE' } },
            ],
        });
        expect(e.message).toBe(
            '"telephone" is required. Enter and try again. Invalid value of "ABCDE" provided for the postcode field.'
        );
        expect(e.errors).toHaveLength(2);
    });

    it('interpolation replaces longer names first and leaves unknown placeholders alone', () => {
        expect(interpolateMessage('%message / %messages / %2 / %other', { message: 'a', messages: 'b', '1': 'c' }))
            .toBe('a / b / c / %other');
        expect(interpolateMessage('100% sure', {})).toBe('100% sure');
    });
});
