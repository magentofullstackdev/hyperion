// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContext, CheckoutExtensionApi, RequestFilters } from '../../../../extension-api.js';
import register, {
    hyperionApi,
    NEWSLETTER_OPTIN_TAG,
    NewsletterOptinElement,
    resetNewsletterOptinForTests,
} from '../newsletter-optin.js';

type PaymentFilter = (payload: RequestFilters['paymentInformation']) => RequestFilters['paymentInformation'];

const context = { t: (source: string) => source } as unknown as CheckoutContext;

function mockApi(): { api: CheckoutExtensionApi; slots: [string, string][]; filters: Map<string, PaymentFilter> } {
    const slots: [string, string][] = [];
    const filters = new Map<string, PaymentFilter>();
    const api = {
        apiVersion: '1.0-beta',
        name: 'hyperion_newsletter_optin',
        options: {},
        context,
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

function mount(options: Record<string, unknown>): NewsletterOptinElement {
    const el = document.createElement(NEWSLETTER_OPTIN_TAG) as NewsletterOptinElement;
    el.context = context;
    el.options = options;
    document.body.appendChild(el);
    return el;
}

const body = (): RequestFilters['paymentInformation'] => ({ paymentMethod: { method: 'checkmo' } });

describe('newsletter opt-in extension', () => {
    beforeEach(() => resetNewsletterOptinForTests());
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('declares the API major and registers its slot and its filter', () => {
        const { api, slots, filters } = mockApi();
        register(api);
        expect(hyperionApi).toBe('1');
        expect(NewsletterOptinElement.hyperionApi).toBe('1');
        expect(slots).toEqual([['after-email', 'hc-newsletter-optin']]);
        expect(filters.has('paymentInformation')).toBe(true);
    });

    it('renders one unticked, labeled checkbox and sends the opt-in only while it is ticked', () => {
        const { api, filters } = mockApi();
        register(api);
        const filter = filters.get('paymentInformation')!;
        const el = mount({});
        const box = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        expect(box.checked).toBe(false);
        expect(el.querySelector('label')?.htmlFor).toBe(box.id);
        expect(el.querySelector('label')?.textContent).toBe('Sign up for our newsletter');
        expect(filter(body())).toEqual(body());

        box.checked = true;
        box.dispatchEvent(new Event('change'));
        expect(filter(body()).paymentMethod.extension_attributes).toEqual({ hyperion_newsletter_subscribe: true });

        box.checked = false;
        box.dispatchEvent(new Event('change'));
        expect(filter(body())).toEqual(body());
    });

    it('starts ticked only when the store asks for it', () => {
        const { api } = mockApi();
        register(api);
        const el = mount({ checked: true });
        expect(el.querySelector<HTMLInputElement>('input')?.checked).toBe(true);
    });
});
