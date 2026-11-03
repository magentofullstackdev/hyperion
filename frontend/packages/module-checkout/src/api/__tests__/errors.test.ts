// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect } from 'vitest';
import { interpolateMessage, MagentoApiError, normaliseMagentoError } from '../errors.js';

describe('normaliseMagentoError', () => {
    it('returns a generic error when body is not an object', () => {
        const e = normaliseMagentoError(500, 'boom');
        expect(e).toBeInstanceOf(MagentoApiError);
        expect(e.httpStatus).toBe(500);
        expect(e.message).toContain('HTTP 500');
    });

    it('preserves Magento message string', () => {
        const e = normaliseMagentoError(400, {
            message: 'Invalid email',
        });
        expect(e.message).toBe('Invalid email');
        expect(e.httpStatus).toBe(400);
    });

    it('normalises parameters object to Record<string,string>', () => {
        const e = normaliseMagentoError(422, {
            message: 'Bad',
            parameters: { email: 'foo@', count: 3 },
        });
        expect(e.parameters).toEqual({ email: 'foo@', count: '3' });
    });

    it('normalises parameters array to positional keys', () => {
        const e = normaliseMagentoError(400, {
            message: 'Bad',
            parameters: ['one', 'two'],
        });
        expect(e.parameters).toEqual({ '0': 'one', '1': 'two' });
    });

    it('renders a named placeholder from the parameters object', () => {
        const e = normaliseMagentoError(400, {
            message: 'The shipping information was unable to be saved. Error: "%message"',
            parameters: { message: 'The shipping address contains invalid data: "Zip/Postal Code" is a required value.' },
        });
        expect(e.message).toBe(
            'The shipping information was unable to be saved. Error: "The shipping address contains invalid data: "Zip/Postal Code" is a required value."'
        );
        expect(e.parameters).toEqual({ message: 'The shipping address contains invalid data: "Zip/Postal Code" is a required value.' });
    });

    it('renders positional placeholders from a parameters list', () => {
        const e = normaliseMagentoError(400, {
            message: '"%1" is a required value. Maximum %2 allowed.',
            parameters: ['Zip/Postal Code', 10],
        });
        expect(e.message).toBe('"Zip/Postal Code" is a required value. Maximum 10 allowed.');
    });

    it('reports an aggregate error by its nested, rendered messages', () => {
        const e = normaliseMagentoError(400, {
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
