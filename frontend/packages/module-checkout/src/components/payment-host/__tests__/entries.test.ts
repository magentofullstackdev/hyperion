// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import paymentRenderers from '../../../fixtures/payment-renderers.json' with { type: 'json' };
import { setCheckoutConfig } from '../../../bootstrap-config.js';
import { reconcilePaymentSelection } from '../../../store/flow-actions.js';
import type { CheckoutConfig } from '../../../types/config.js';
import type { Totals } from '../../../types/totals.js';
import { isPreselectable, matchEntry, paymentEntries, savesOnSelection, type PaymentEntry } from '../entries.js';
import { elementTagOf } from '../tags.js';
import { buildPaymentRows, unsupportedReason } from '../payment-rows.js';
import { patchEntry, patchRow, resetPaymentRowsForTests } from '../row-state.js';

const BASE = paymentRenderers[0] as unknown as PaymentEntry;

function entry(patch: Partial<PaymentEntry>): PaymentEntry {
    return { ...BASE, builtin: null, tag: 'vendor-psp-card', moduleUrl: 'https://shop.example/static/card.js', ...patch } as PaymentEntry;
}

function install(entries: readonly PaymentEntry[]): void {
    setCheckoutConfig({ hyperion: { paymentRenderers: entries } } as unknown as CheckoutConfig);
}

const TOTALS = { grand_total: '25.0000' } as unknown as Totals;

describe('payment renderer entries', () => {
    beforeEach(() => {
        resetPaymentRowsForTests();
        install(paymentRenderers as unknown as PaymentEntry[]);
    });

    afterEach(() => {
        resetPaymentRowsForTests();
        setCheckoutConfig(null as unknown as CheckoutConfig);
    });

    it('reads the entries the server emitted, none without the key', () => {
        expect(paymentEntries().map((candidate) => candidate.id)).toContain('braintree_card');
        setCheckoutConfig({ hyperion: {} } as unknown as CheckoutConfig);
        expect(paymentEntries()).toEqual([]);
        expect(matchEntry('checkmo')).toBeNull();
    });

    it('matches an exact method before any pattern, and the lower sort order between patterns', () => {
        install([
            entry({ id: 'broad', method: null, pattern: 'vendor_.*', sortOrder: 50 }),
            entry({ id: 'narrow', method: null, pattern: 'vendor_psp.*', sortOrder: 10 }),
            entry({ id: 'exact', method: 'vendor_psp_card', pattern: null, sortOrder: 90 }),
        ]);
        expect(matchEntry('vendor_psp_card')?.id).toBe('exact');
        expect(matchEntry('vendor_psp_wallet')?.id).toBe('narrow');
        expect(matchEntry('vendor_other')?.id).toBe('broad');
        expect(matchEntry('checkmo')).toBeNull();
    });

    it('serves the first-party methods from the emitted entries', () => {
        expect(matchEntry('checkmo')?.id).toBe('offline');
        expect(matchEntry('free')?.id).toBe('offline');
        expect(matchEntry('purchaseorder')?.type).toBe('form');
        expect(matchEntry('braintree_paypal_vault')?.id).toBe('braintree_vault');
        expect(matchEntry('payflow_express')?.id).toBe('paypal_express');
    });

    it('uses the bundle tags for first-party entries and the generic types, the entry tag otherwise', () => {
        expect(elementTagOf(matchEntry('checkmo') as PaymentEntry)).toBe('hc-payment-offline');
        expect(elementTagOf(matchEntry('braintree') as PaymentEntry)).toBe('hc-payment-braintree-card');
        expect(elementTagOf(entry({ builtin: 'braintree_card', tag: null }))).toBe('hc-payment-braintree-card');
        expect(elementTagOf(matchEntry('purchaseorder') as PaymentEntry)).toBe('hc-payment-form');
        expect(elementTagOf(entry({ type: 'redirect', tag: null }))).toBe('hc-payment-redirect');
        expect(elementTagOf(entry({ type: 'redirect-before-order', tag: null }))).toBe('hc-payment-redirect-first');
        expect(elementTagOf(entry({}))).toBe('vendor-psp-card');
        expect(elementTagOf(entry({ tag: null }))).toBeNull();
        expect(elementTagOf(entry({ builtin: 'unknown-builtin' }))).toBeNull();
    });

    it('saves a method on selection unless its entry says otherwise', () => {
        install([entry({ id: 'quiet', method: 'vendor_quiet', savesOnSelection: false }), ...(paymentRenderers as unknown as PaymentEntry[])]);
        expect(savesOnSelection('vendor_quiet')).toBe(false);
        expect(savesOnSelection('checkmo')).toBe(true);
        expect(savesOnSelection('no_entry_at_all')).toBe(true);
    });

    it('preselects only an offline method of the bundle', () => {
        expect(isPreselectable('checkmo')).toBe(true);
        expect(isPreselectable('purchaseorder')).toBe(false);
        expect(isPreselectable('braintree')).toBe(false);
        expect(isPreselectable('no_entry_at_all')).toBe(false);
    });
});

describe('unsupported methods', () => {
    beforeEach(() => {
        resetPaymentRowsForTests();
        install(paymentRenderers as unknown as PaymentEntry[]);
    });

    afterEach(() => {
        resetPaymentRowsForTests();
        setCheckoutConfig(null as unknown as CheckoutConfig);
    });

    it('a method without an entry, or whose module failed, or whose element gave up, has no row', () => {
        const methods = [
            { code: 'checkmo', title: 'Check' },
            { code: 'braintree', title: 'Card' },
            { code: 'braintree_paypal', title: 'PayPal' },
            { code: 'vendor_unknown', title: 'Unknown' },
        ];
        patchEntry('braintree_card', { load: 'load-failed' });
        patchEntry('braintree_paypal', { load: 'ready' });
        patchRow('braintree_paypal', { fatal: true });

        expect(buildPaymentRows(methods).map((row) => row.method.code)).toEqual(['checkmo']);
        expect(unsupportedReason('vendor_unknown')).toBe('no-renderer');
        expect(unsupportedReason('braintree')).toBe('load-failed');
        expect(unsupportedReason('braintree_paypal')).toBe('fatal');
        expect(unsupportedReason('checkmo')).toBeNull();
    });

    it('a version mismatch and a timeout make the method unsupported too', () => {
        patchEntry('braintree_card', { load: 'version-mismatch' });
        patchEntry('braintree_paypal', { load: 'timeout' });
        expect(unsupportedReason('braintree')).toBe('version-mismatch');
        expect(unsupportedReason('braintree_paypal')).toBe('timeout');
    });

    it('is never preselected, even as the only method, and a selection of it is dropped', () => {
        const only = [{ code: 'vendor_unknown', title: 'Unknown' }];
        expect(reconcilePaymentSelection(null, only, TOTALS)).toBeNull();
        expect(reconcilePaymentSelection('vendor_unknown', only, TOTALS)).toBeNull();
        expect(reconcilePaymentSelection('checkmo', [{ code: 'checkmo', title: 'Check' }, ...only], TOTALS)).toBe('checkmo');
        expect(reconcilePaymentSelection(null, [{ code: 'checkmo', title: 'Check' }], TOTALS)).toBe('checkmo');
        expect(reconcilePaymentSelection(null, [{ code: 'braintree', title: 'Card' }], TOTALS)).toBeNull();
    });
});
