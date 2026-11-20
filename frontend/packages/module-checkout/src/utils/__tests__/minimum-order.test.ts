// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../i18n/en_US.json' with { type: 'json' };
import type { CheckoutConfig, MinimumOrderConfig } from '../../types/config.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../i18n.js';
import { minimumOrderError } from '../minimum-order.js';

const RULE: MinimumOrderConfig = {
    amount: 50,
    includeDiscount: false,
    includeTax: false,
    description: 'Minimum order amount is 50.00',
};

function config(rule: MinimumOrderConfig | null | undefined, cartData?: CheckoutConfig['cartData']): CheckoutConfig {
    const hyperion: Record<string, unknown> = { checkoutVersion: 'test', enabled: true };
    if (rule !== undefined) hyperion['minimumOrder'] = rule;
    const cfg: Record<string, unknown> = { hyperion };
    if (cartData !== undefined) cfg['cartData'] = cartData;
    return cfg as unknown as CheckoutConfig;
}

function totals(values: Record<string, unknown>): Totals {
    return { total_segments: [], ...values } as unknown as Totals;
}

describe('minimumOrderError', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
    });

    it('answers null when the rule is off or there are no totals yet', () => {
        expect(minimumOrderError(totals({ base_subtotal: '10.0000' }), config(null))).toBeNull();
        expect(minimumOrderError(null, config(RULE))).toBeNull();
    });

    it('compares the base subtotal with the threshold', () => {
        expect(minimumOrderError(totals({ base_subtotal: '49.9900' }), config(RULE))).toBe(RULE.description);
        expect(minimumOrderError(totals({ base_subtotal: '50.0000' }), config(RULE))).toBeNull();
        expect(minimumOrderError(totals({ base_subtotal: 80 }), config(RULE))).toBeNull();
    });

    it('reads the base amounts, not the amounts of the display currency', () => {
        expect(minimumOrderError(totals({ subtotal: '60.0000', base_subtotal: '45.0000' }), config(RULE)))
            .toBe(RULE.description);
    });

    it('subtracts the discount only when the rule includes it', () => {
        const discounted = totals({
            base_subtotal: '55.0000', base_discount_amount: '-10.0000', base_subtotal_with_discount: '45.0000',
        });
        expect(minimumOrderError(discounted, config(RULE))).toBeNull();
        expect(minimumOrderError(discounted, config({ ...RULE, includeDiscount: true }))).toBe(RULE.description);
    });

    it('derives the discounted subtotal when the payload does not carry it', () => {
        const discounted = totals({ base_subtotal: '55.0000', base_discount_amount: '-10.0000' });
        expect(minimumOrderError(discounted, config({ ...RULE, includeDiscount: true }))).toBe(RULE.description);
    });

    it('adds the tax only when the rule includes it', () => {
        const taxed = totals({ base_subtotal: '47.0000', base_tax_amount: '3.8800' });
        expect(minimumOrderError(taxed, config(RULE))).toBe(RULE.description);
        expect(minimumOrderError(taxed, config({ ...RULE, includeTax: true }))).toBeNull();
    });

    it('treats an amount a float rounds just below the threshold as reaching it', () => {
        expect(minimumOrderError(totals({ base_subtotal: 49.99995 }), config(RULE))).toBeNull();
    });

    it('falls back to the generic message for a rule without a description', () => {
        expect(minimumOrderError(totals({ base_subtotal: 1 }), config({ ...RULE, description: '' })))
            .toBe('Minimum order amount is not met.');
    });

    it('uses the answer computed for the page when the config carries no numeric rule', () => {
        const cart = totals({ base_subtotal: 1 });
        expect(minimumOrderError(cart, config(undefined))).toBeNull();
        expect(minimumOrderError(cart, config(undefined, { isMinimumAmountValid: true }))).toBeNull();
        expect(minimumOrderError(null, config(undefined, {
            isMinimumAmountValid: false, minimumAmountDescription: 'Minimum order amount is 20.00',
        }))).toBe('Minimum order amount is 20.00');
        expect(minimumOrderError(cart, config(undefined, { isMinimumAmountValid: false })))
            .toBe('Minimum order amount is not met.');
    });
});
