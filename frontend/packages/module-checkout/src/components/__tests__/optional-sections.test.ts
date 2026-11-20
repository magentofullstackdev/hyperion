// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import type { CheckoutConfig } from '../../types/config.js';
import { loadOptionalSections } from '../optional-sections.js';

const base = guestFixture as unknown as CheckoutConfig;
const agreement = { agreementId: 1, mode: 1, checkboxText: 'Terms', content: 'Text', contentHeight: null, isHtml: false };

describe('loadOptionalSections', () => {
    it('defines neither section for a store that uses none', async () => {
        await loadOptionalSections({
            ...base,
            isOrderLevelGiftOptionsEnabled: false,
            isItemLevelGiftOptionsEnabled: false,
            checkoutAgreements: { isEnabled: false, agreements: [] },
        } as unknown as CheckoutConfig);

        expect(customElements.get('checkout-gift-message')).toBeUndefined();
        expect(customElements.get('checkout-agreements')).toBeUndefined();
    });

    it('defines the terms section before it resolves when the store has agreements', async () => {
        await loadOptionalSections({
            ...base,
            isOrderLevelGiftOptionsEnabled: false,
            isItemLevelGiftOptionsEnabled: false,
            checkoutAgreements: { isEnabled: true, agreements: [agreement] },
        } as unknown as CheckoutConfig);

        expect(customElements.get('checkout-agreements')).toBeDefined();
        expect(customElements.get('checkout-gift-message')).toBeUndefined();
    });

    it('defines the gift options before it resolves when one of the two levels is on', async () => {
        await loadOptionalSections({
            ...base,
            isOrderLevelGiftOptionsEnabled: false,
            isItemLevelGiftOptionsEnabled: true,
            checkoutAgreements: { isEnabled: false, agreements: [] },
        } as unknown as CheckoutConfig);

        expect(customElements.get('checkout-gift-message')).toBeDefined();
    });
});
