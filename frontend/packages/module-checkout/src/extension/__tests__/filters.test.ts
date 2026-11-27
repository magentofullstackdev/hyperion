// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { resetCheckoutContextForTests } from '../context.js';
import { applyFilters, RequestFilterError } from '../filters.js';
import { registerRequestFilter, resetFiltersForTests } from '../request-filters.js';

const shipping = () => ({
    addressInformation: {
        shipping_address: { firstname: 'Veronica', city: 'Calder', country_id: 'US' },
        billing_address: { firstname: 'Veronica', city: 'Calder', country_id: 'US' },
        shipping_method_code: 'flatrate',
        shipping_carrier_code: 'flatrate',
    },
});

const payment = () => ({
    paymentMethod: { method: 'checkmo', extension_attributes: { agreement_ids: ['1'] } },
    billingAddress: { firstname: 'Veronica', city: 'Calder' },
    email: 'veronica@example.com',
});

describe('request filters', () => {
    beforeEach(() => {
        setActiveCatalogForTests({ 'Hyperion_Checkout::extension_request_failed': 'Reload the page.' });
        setCheckoutConfig({ storeCode: 'default', hyperion: { enabled: true } } as unknown as CheckoutConfig);
        setStoreForTests(createStore());
        resetFlowSelectorsForTests();
        resetCheckoutContextForTests();
        resetFiltersForTests();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        resetFiltersForTests();
        vi.restoreAllMocks();
    });

    it('returns the body itself while no filter is registered', () => {
        const body = shipping();
        expect(applyFilters('shippingInformation', body)).toBe(body);
    });

    it('hands each filter a clone and the snapshot, in registration order, the first ones ahead', () => {
        const order: string[] = [];
        const original = shipping();
        registerRequestFilter('shippingInformation', (body, snapshot) => {
            order.push('late');
            expect(typeof snapshot.isSettling).toBe('boolean');
            (body.addressInformation.extension_attributes as Record<string, unknown> | undefined) ??= {};
            return body;
        }, { owner: 'late' });
        registerRequestFilter('shippingInformation', (body) => {
            order.push('host');
            body.addressInformation.extension_attributes = { pickup: 'L-42' };
            (body.addressInformation.shipping_address as Record<string, unknown>).extension_attributes = { locker: 'L-42' };
            return body;
        }, { owner: 'host', first: true });
        const sent = applyFilters('shippingInformation', original);
        expect(order).toEqual(['host', 'late']);
        expect(sent.addressInformation).toMatchObject({
            extension_attributes: { pickup: 'L-42' },
            shipping_address: { firstname: 'Veronica', extension_attributes: { locker: 'L-42' } },
        });
        expect(original.addressInformation).not.toHaveProperty('extension_attributes');
    });

    it('puts the checkout keys back: the address, the method, the email and the agreement ids', () => {
        registerRequestFilter('shippingInformation', (body) => {
            const info = body.addressInformation as Record<string, unknown>;
            info.shipping_method_code = 'freeshipping';
            (info.shipping_address as Record<string, unknown>).city = 'Elsewhere';
            return body;
        }, { owner: 'rogue' });
        registerRequestFilter('paymentInformation', (body) => {
            body.email = 'other@example.com';
            body.paymentMethod = { method: 'free', extension_attributes: { hyperion_order_comment: 'Leave at the door' } };
            delete body.billingAddress;
            return body;
        }, { owner: 'comment' });
        const sentShipping = applyFilters('shippingInformation', shipping());
        expect(sentShipping.addressInformation.shipping_method_code).toBe('flatrate');
        expect((sentShipping.addressInformation.shipping_address as Record<string, unknown>).city).toBe('Calder');
        const sentPayment = applyFilters('paymentInformation', payment());
        expect(sentPayment).toEqual({
            paymentMethod: { method: 'checkmo', extension_attributes: { hyperion_order_comment: 'Leave at the door', agreement_ids: ['1'] } },
            billingAddress: { firstname: 'Veronica', city: 'Calder' },
            email: 'veronica@example.com',
        });
    });

    it('fails the write with the generic message when a filter throws or returns no object', () => {
        const remove = registerRequestFilter('billingAddress', () => { throw new Error('boom'); }, { owner: 'broken' });
        expect(() => applyFilters('billingAddress', { address: {} })).toThrow(RequestFilterError);
        expect(() => applyFilters('billingAddress', { address: {} })).toThrow('Reload the page.');
        expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain('"broken"');
        remove();
        registerRequestFilter('billingAddress', () => null as never, { owner: 'empty' });
        expect(() => applyFilters('billingAddress', { address: {} })).toThrow('Reload the page.');
    });

    it('a failed filter is shown as the message of a plain error, which the taxonomy displays', () => {
        const error = new RequestFilterError('Reload the page.');
        expect(error.name).toBe('Error');
        expect(error).toBeInstanceOf(Error);
    });
});
