// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import { offeredPaymentMethods, setPaymentVisibility } from '../payment-offer.js';

const CHECKMO = { code: 'checkmo', title: 'Check / Money order' };
const CARD = { code: 'braintree', title: 'Credit Card' };
const FREE = { code: 'free', title: 'No Payment Information Required' };

describe('offeredPaymentMethods', () => {
    it('offers only free at a zero grand total when the server lists it', () => {
        expect(offeredPaymentMethods([CHECKMO, FREE, CARD], { grand_total: '0.0000' })).toEqual([FREE]);
        expect(offeredPaymentMethods([CHECKMO, FREE, CARD], { grand_total: '0' })).toEqual([FREE]);
    });

    it('offers the whole list again once the total is above zero', () => {
        const methods = [CHECKMO, FREE, CARD];
        expect(offeredPaymentMethods(methods, { grand_total: '12.5000' })).toBe(methods);
    });

    it('leaves a zero total without free as the server listed it', () => {
        const methods = [CHECKMO, CARD];
        expect(offeredPaymentMethods(methods, { grand_total: '0.0000' })).toBe(methods);
    });

    it('leaves the list alone while there are no totals', () => {
        const methods = [CHECKMO, FREE];
        expect(offeredPaymentMethods(methods, null)).toBe(methods);
    });
});

describe('setPaymentVisibility', () => {
    afterEach(() => setPaymentVisibility(null));

    it('drops a method whose gateway slice says it is not presentable', () => {
        setPaymentVisibility({ braintree: { isVisible: false }, checkmo: { isVisible: true }, other: 'x' });
        expect(offeredPaymentMethods([CHECKMO, CARD], { grand_total: '10' })).toEqual([CHECKMO]);
        expect(offeredPaymentMethods([CHECKMO, CARD], null)).toEqual([CHECKMO]);
    });

    it('drops a Braintree method that is inactive or has no client token', () => {
        setPaymentVisibility({ braintree: { isActive: true, clientToken: '' } });
        expect(offeredPaymentMethods([CHECKMO, CARD], { grand_total: '10' })).toEqual([CHECKMO]);
        setPaymentVisibility({ braintree: { isActive: false, clientToken: 'token' } });
        expect(offeredPaymentMethods([CHECKMO, CARD], { grand_total: '10' })).toEqual([CHECKMO]);
        setPaymentVisibility({ braintree: { isActive: true, clientToken: 'token' }, other: { clientToken: '' } });
        expect(offeredPaymentMethods([CHECKMO, CARD], { grand_total: '10' })).toEqual([CHECKMO, CARD]);
    });

    it('offers every method again once nothing is marked', () => {
        setPaymentVisibility({ braintree: { isVisible: false } });
        setPaymentVisibility({});
        const methods = [CHECKMO, CARD];
        expect(offeredPaymentMethods(methods, { grand_total: '10' })).toBe(methods);
    });
});
