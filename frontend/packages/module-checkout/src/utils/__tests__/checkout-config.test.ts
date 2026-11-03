// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, it, expect } from 'vitest';
import { normaliseCheckoutConfig, normaliseQuoteAddress } from '../checkout-config.js';
import type { CheckoutConfig } from '../../types/config.js';

function configWith(checkoutAgreements: unknown): CheckoutConfig {
    return { checkoutAgreements } as unknown as CheckoutConfig;
}

describe('normaliseCheckoutConfig', () => {
    it('coerces the agreement id and mode Magento emits as strings', () => {
        const config = normaliseCheckoutConfig(configWith({
            isEnabled: true,
            agreements: [
                { agreementId: '2', mode: '1', checkboxText: 'I agree', content: 'c', contentHeight: null },
                { agreementId: '5', mode: '0', checkboxText: '', content: 'auto', contentHeight: '200px' },
            ],
        }));

        expect(config.checkoutAgreements.agreements).toEqual([
            { agreementId: 2, mode: 1, checkboxText: 'I agree', content: 'c', contentHeight: null },
            { agreementId: 5, mode: 0, checkboxText: '', content: 'auto', contentHeight: '200px' },
        ]);
        expect(config.checkoutAgreements.isEnabled).toBe(true);
    });

    it('leaves numeric values and the rest of the config untouched', () => {
        const raw = configWith({ isEnabled: true, agreements: [{ agreementId: 7, mode: 1, checkboxText: 't', content: 'c', contentHeight: null }] });
        (raw as unknown as { storeCode: string }).storeCode = 'default';

        const config = normaliseCheckoutConfig(raw);

        expect(config.checkoutAgreements.agreements?.[0]?.agreementId).toBe(7);
        expect(config.storeCode).toBe('default');
    });

    it('passes a config without agreements through unchanged', () => {
        const disabled = configWith({ isEnabled: false });
        expect(normaliseCheckoutConfig(disabled)).toBe(disabled);
        const missing = configWith(undefined);
        expect(normaliseCheckoutConfig(missing)).toBe(missing);
    });
});

describe('normaliseQuoteAddress', () => {
    it('builds the Address shape with the nested region when the quote carries a region id', () => {
        const address = normaliseQuoteAddress({
            firstname: ' Hunt ', lastname: 'Four', company: null, city: 'Austin', region: 'Texas', region_code: 'TX',
            region_id: '57', postcode: '78701', country_id: 'US', telephone: '512', fax: '', vat_id: 'X',
            prefix: null, middlename: null, suffix: null, street: ['100 Congress Avenue', '', '  '],
        });
        expect(address).toEqual({
            country_id: 'US', street: ['100 Congress Avenue'], city: 'Austin', firstname: 'Hunt', lastname: 'Four',
            telephone: '512', postcode: '78701', region_id: '57',
            region: { region: 'Texas', region_code: 'TX', region_id: 57 }, vat_id: 'X',
        });
    });

    it('keeps a typed region name as a string without a region id and copes with a scalar street', () => {
        const address = normaliseQuoteAddress({ country_id: 'IE', region: 'Leinster', street: 'Main St', city: 'Dublin' });
        expect(address).toMatchObject({ country_id: 'IE', region: 'Leinster', region_id: null, street: ['Main St'], postcode: null });
    });

    it('answers null without a country (the address was never entered)', () => {
        expect(normaliseQuoteAddress(null)).toBeNull();
        expect(normaliseQuoteAddress({ city: 'Austin', country_id: ' ' })).toBeNull();
    });
});
