// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, expect, it, vi } from 'vitest';

import paymentRenderers from '../../fixtures/payment-renderers.json' with { type: 'json' };
import type { PaymentRendererConfig } from '../../../extension-api.js';
import { matchPaymentEntry } from '../match.js';
import { matchesShippingMethod } from '../match-shipping.js';

const entry = (id: string, fields: Partial<PaymentRendererConfig>): PaymentRendererConfig =>
    ({ id, method: null, pattern: null, sortOrder: 0, ...fields }) as PaymentRendererConfig;

describe('descriptor matchers', () => {
    it('lets the exact method win over every pattern, then the lowest sort order among patterns', () => {
        const entries = [
            entry('wide', { pattern: 'vendor_.*', sortOrder: 50 }),
            entry('narrow', { pattern: '^vendor_psp_.*$', sortOrder: 10 }),
            entry('exact', { method: 'vendor_psp_card', sortOrder: 90 }),
        ];
        expect(matchPaymentEntry(entries, 'vendor_psp_card')?.id).toBe('exact');
        expect(matchPaymentEntry(entries, 'vendor_psp_wallet')?.id).toBe('narrow');
        expect(matchPaymentEntry(entries, 'vendor_other')?.id).toBe('wide');
        expect(matchPaymentEntry(entries, 'checkmo')).toBeNull();
        expect(matchPaymentEntry([], 'checkmo')).toBeNull();
        expect(matchPaymentEntry(undefined, 'checkmo')).toBeNull();
    });

    it('matches a pattern against the whole code, as the server does', () => {
        expect(matchPaymentEntry([entry('prefix', { pattern: 'vendor_' })], 'vendor_psp')).toBeNull();
        expect(matchPaymentEntry([entry('prefix', { pattern: 'vendor_' })], 'vendor_')?.id).toBe('prefix');
        expect(matchPaymentEntry([entry('either', { pattern: 'a|b' })], 'ab')).toBeNull();
        expect(matchesShippingMethod({ carrier: '*', method: '/locker_/' }, { carrier_code: 'c', method_code: 'locker_a' })).toBe(false);
    });

    it('leaves the first-party entries, anchored already, matching the codes they serve', () => {
        const served: Record<string, readonly string[]> = {
            offline: ['checkmo', 'banktransfer', 'cashondelivery', 'free'],
            braintree_vault: ['braintree_cc_vault', 'braintree_googlepay_vault', 'braintree_paypal_vault'],
            paypal_express: ['paypal_express', 'payflow_express'],
        };
        const entries = paymentRenderers as unknown as PaymentRendererConfig[];
        expect(entries.filter((e) => e.pattern !== null).map((e) => e.id).sort()).toEqual(Object.keys(served).sort());
        for (const [id, codes] of Object.entries(served)) {
            for (const code of codes) expect(matchPaymentEntry(entries, code)?.id).toBe(id);
        }
        expect(matchPaymentEntry(entries, 'checkmo_extra')).toBeNull();
        expect(matchPaymentEntry(entries, 'braintree_cc_vault_x')).toBeNull();
    });

    it('skips a pattern that does not compile, and says so once', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(matchPaymentEntry([entry('broken', { pattern: '([' })], 'vendor')).toBeNull();
        expect(matchPaymentEntry([entry('broken', { pattern: '([' })], 'other')).toBeNull();
        expect(errors).toHaveBeenCalledTimes(1);
        vi.restoreAllMocks();
    });

    it('matches a shipping method by exact code, star or expression between slashes', () => {
        const locker = { carrier_code: 'vendorcarrier', method_code: 'locker_express' };
        expect(matchesShippingMethod(null, null)).toBe(true);
        expect(matchesShippingMethod({ carrier: 'vendorcarrier', method: '/locker_.*/' }, locker)).toBe(true);
        expect(matchesShippingMethod({ carrier: '*', method: 'locker_express' }, locker)).toBe(true);
        expect(matchesShippingMethod({ carrier: 'vendorcarrier', method: null }, locker)).toBe(true);
        expect(matchesShippingMethod({ carrier: 'flatrate', method: '*' }, locker)).toBe(false);
        expect(matchesShippingMethod({ carrier: 'vendorcarrier', method: '/home_.*/' }, locker)).toBe(false);
        expect(matchesShippingMethod({ carrier: 'vendorcarrier', method: '*' }, null)).toBe(false);
    });
});
