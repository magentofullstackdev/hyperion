// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCheckoutConfig } from '../../bootstrap-config.js';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import type { CheckoutConfig } from '../../types/config.js';
import { loadOptionalSections } from '../optional-sections.js';

const base = guestFixture as unknown as CheckoutConfig;
const agreement = { agreementId: 1, mode: 1, checkboxText: 'Terms', content: 'Text', contentHeight: null, isHtml: false };

function install(config: CheckoutConfig): CheckoutConfig {
    setCheckoutConfig(config);
    return config;
}

describe('loadOptionalSections', () => {
    beforeEach(() => {
        install(base);
    });

    it('defines no section for a store that uses none', async () => {
        await loadOptionalSections({
            ...base,
            isOrderLevelGiftOptionsEnabled: false,
            isItemLevelGiftOptionsEnabled: false,
            checkoutAgreements: { isEnabled: false, agreements: [] },
        } as unknown as CheckoutConfig);

        expect(customElements.get('checkout-gift-message')).toBeUndefined();
        expect(customElements.get('checkout-agreements')).toBeUndefined();
        expect(customElements.get('hc-recaptcha-badge')).toBeUndefined();
    });

    it('defines the order overlay and the dialog of an ended session for every store', async () => {
        await loadOptionalSections(base);
        await vi.waitFor(() => {
            expect(customElements.get('loading-overlay')).toBeDefined();
            expect(customElements.get('hc-session-expired')).toBeDefined();
        });
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

    it('defines the reCAPTCHA client before it resolves when the store protects an action', async () => {
        const config = install({
            ...base,
            hyperion: { ...base.hyperion, recaptcha: { place_order: { type: 'v3', siteKey: 'site-key' } } },
        } as unknown as CheckoutConfig);

        await loadOptionalSections(config);

        expect(customElements.get('hc-recaptcha-badge')).toBeDefined();
    });
});
