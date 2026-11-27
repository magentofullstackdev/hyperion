// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it, vi } from 'vitest';

import '../payment-redirect.js';
import '../payment-redirect-first.js';
import { valueAt, type PaymentRedirect } from '../payment-redirect.js';
import type { PaymentRedirectFirst } from '../payment-redirect-first.js';
import { createMockContext, mountPaymentElement } from './mock-context.js';

const ORIGIN = window.location.origin;

describe('<hc-payment-redirect>', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    function mount(options: Record<string, unknown>, config: Record<string, unknown> = {}, checkout: Record<string, unknown> = {}): PaymentRedirect {
        const mock = createMockContext({ config: checkout });
        return mountPaymentElement<PaymentRedirect>('hc-payment-redirect', {
            context: mock.context,
            method: { code: 'vendor_ideal', title: 'iDEAL' },
            config,
            options,
        }).element;
    }

    it('shows the method instructions, sanitized, and nothing without them', async () => {
        const el = mount({}, { instructions: 'You will pay on <b>the bank page</b>.<script>alert(1)</script>' });
        await el.updateComplete;
        const block = el.querySelector('[data-payment-instructions]');
        expect(block?.querySelector('b')?.textContent).toBe('the bank page');
        expect(block?.querySelector('script')).toBeNull();

        const empty = mount({});
        await empty.updateComplete;
        expect(empty.querySelector('[data-payment-instructions]')).toBeNull();
    });

    it('hands no data and continues on the route once the order exists', () => {
        const el = mount({ redirect: { route: `${ORIGIN}/vendorpsp/checkout/redirect/`, configPath: null } });
        expect(el.getPaymentData()).toEqual({});
        expect(el.afterPlaceOrder()).toEqual({ action: 'redirect', url: `${ORIGIN}/vendorpsp/checkout/redirect/` });
    });

    it('reads the URL at a dot path of the checkout configuration', () => {
        const el = mount(
            { redirect: { route: null, configPath: 'payment.vendor_ideal.redirectUrl' } },
            {},
            { payment: { vendor_ideal: { redirectUrl: 'https://pay.vendor-psp.example/ideal' } } }
        );
        expect(el.afterPlaceOrder()).toEqual({ action: 'redirect', url: 'https://pay.vendor-psp.example/ideal' });
    });

    it('continues on the success page when the path holds no string', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const el = mount(
            { redirect: { route: null, configPath: 'payment.vendor_ideal.redirectUrl' } },
            {},
            { payment: { vendor_ideal: { redirectUrl: 42 } } }
        );
        expect(el.afterPlaceOrder()).toEqual({ action: 'success' });
    });

    it('walks a dot path through plain objects only', () => {
        expect(valueAt({ a: { b: 'c' } }, 'a.b')).toBe('c');
        expect(valueAt({ a: { b: '' } }, 'a.b')).toBeNull();
        expect(valueAt({ a: null }, 'a.b')).toBeNull();
        expect(valueAt({}, 'constructor.name')).toBeNull();
    });
});

describe('<hc-payment-redirect-first>', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    function mount(options: Record<string, unknown>): { el: PaymentRedirectFirst; save: ReturnType<typeof vi.fn> } {
        const mock = createMockContext();
        const el = mountPaymentElement<PaymentRedirectFirst>('hc-payment-redirect-first', {
            context: mock.context,
            method: { code: 'vendor_wallet', title: 'Wallet' },
            options,
        }).element;
        return { el, save: mock.spies.savePaymentInformation };
    }

    it('saves the payment information, then continues on the route instead of an order', async () => {
        const { el, save } = mount({ redirect: { route: `${ORIGIN}/vendorpsp/wallet/start/`, configPath: null } });
        const outcome = await el.placeOrder({ signal: new AbortController().signal, data: { additional_data: { x: 1 } } });
        expect(save).toHaveBeenCalledWith({ additional_data: { x: 1 } });
        expect(outcome).toEqual({ status: 'redirect', url: `${ORIGIN}/vendorpsp/wallet/start/` });
    });

    it('stays when the save failed (the checkout shows why)', async () => {
        const { el, save } = mount({ redirect: { route: `${ORIGIN}/vendorpsp/wallet/start/`, configPath: null } });
        save.mockResolvedValue(false);
        expect(await el.placeOrder({ signal: new AbortController().signal, data: {} })).toEqual({ status: 'failed' });
    });

    it('fails without a route and saves nothing', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { el, save } = mount({ redirect: null });
        const outcome = await el.placeOrder({ signal: new AbortController().signal, data: {} });
        expect(outcome.status).toBe('failed');
        expect(save).not.toHaveBeenCalled();
    });
});
