// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContext, CheckoutExtensionApi, RequestFilters } from '../../../../extension-api.js';
import register, {
    hyperionApi,
    maxLengthOf,
    ORDER_COMMENT_TAG,
    OrderCommentElement,
    resetOrderCommentForTests,
} from '../order-comment.js';

type PaymentFilter = (payload: RequestFilters['paymentInformation']) => RequestFilters['paymentInformation'];

function mockContext(): CheckoutContext {
    return {
        t: (source: string, params?: Readonly<Record<string, string | number>>) =>
            source.replace(/\{(\w+)\}/g, (match, name: string) => (params?.[name] === undefined ? match : String(params[name]))),
    } as unknown as CheckoutContext;
}

function mockApi(): { api: CheckoutExtensionApi; slots: [string, string][]; filters: Map<string, PaymentFilter> } {
    const slots: [string, string][] = [];
    const filters = new Map<string, PaymentFilter>();
    const api = {
        apiVersion: '1.0-beta',
        name: 'hyperion_order_comment',
        options: { maxLength: 20 },
        context: mockContext(),
        registerSlot: vi.fn((slot: string, tag: string) => {
            slots.push([slot, tag]);
            return () => undefined;
        }),
        filter: vi.fn((name: string, fn: PaymentFilter) => {
            filters.set(name, fn);
            return () => undefined;
        }),
        registerGate: vi.fn(),
    } as unknown as CheckoutExtensionApi;
    return { api, slots, filters };
}

function mount(options: Record<string, unknown>): OrderCommentElement {
    const el = document.createElement(ORDER_COMMENT_TAG) as OrderCommentElement;
    el.context = mockContext();
    el.options = options;
    document.body.appendChild(el);
    return el;
}

const body = (): RequestFilters['paymentInformation'] => ({
    paymentMethod: { method: 'checkmo', extension_attributes: { agreement_ids: ['1'] } },
    email: 'guest@example.com',
});

describe('order comment extension', () => {
    beforeEach(() => resetOrderCommentForTests());
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('declares the API major and registers its slot and its filter', () => {
        const { api, slots, filters } = mockApi();
        register(api);
        expect(hyperionApi).toBe('1');
        expect(OrderCommentElement.hyperionApi).toBe('1');
        expect(customElements.get(ORDER_COMMENT_TAG)).toBe(OrderCommentElement);
        expect(slots).toEqual([['before-place-order', 'hc-order-comment']]);
        expect(filters.has('paymentInformation')).toBe(true);
    });

    it('renders a labeled text area with the maximum and the count it is described by', () => {
        const { api } = mockApi();
        register(api);
        const el = mount({ maxLength: 20 });
        const area = el.querySelector('textarea')!;
        const label = el.querySelector('label')!;
        expect(label.htmlFor).toBe(area.id);
        expect(label.textContent).toBe('Order comment');
        expect(area.maxLength).toBe(20);
        const count = document.getElementById(area.getAttribute('aria-describedby') ?? '')!;
        expect(count.textContent).toBe('20 characters left');
        area.value = 'Leave at the door';
        area.dispatchEvent(new Event('input'));
        expect(count.textContent).toBe('3 characters left');
    });

    it('sends a comment that is not empty next to the agreements, and nothing otherwise', () => {
        const { api, filters } = mockApi();
        register(api);
        const filter = filters.get('paymentInformation')!;
        expect(filter(body())).toEqual(body());

        const el = mount({ maxLength: 20 });
        const area = el.querySelector('textarea')!;
        area.value = '   ';
        area.dispatchEvent(new Event('input'));
        expect(filter(body())).toEqual(body());

        area.value = '  Ring twice  ';
        area.dispatchEvent(new Event('input'));
        expect(filter(body()).paymentMethod.extension_attributes).toEqual({
            agreement_ids: ['1'],
            hyperion_order_comment: 'Ring twice',
        });
    });

    it('falls back to 500 characters when the option is missing or not a positive integer', () => {
        expect(maxLengthOf({})).toBe(500);
        expect(maxLengthOf({ maxLength: '0' })).toBe(500);
        expect(maxLengthOf({ maxLength: 250 })).toBe(250);
    });
});
