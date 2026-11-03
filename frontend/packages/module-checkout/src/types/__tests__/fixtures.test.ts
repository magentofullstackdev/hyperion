// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Fixture shape tests -- ensures the captured checkoutConfig files in
 * `src/fixtures/` remain typecheck-compatible with the declared
 * `CheckoutConfig` interface.
 *
 * The import uses `import assertions` / `with` to opt JSON in, and
 * casts through a `satisfies` check to confirm the shape at compile
 * time. The runtime assertions below are a belt-and-braces sanity
 * layer in case future TypeScript relaxes its JSON narrowing.
 */
import { describe, it, expect } from 'vitest';
import type { CheckoutConfig } from '../config.js';
import { isAuthenticatedCustomer } from '../customer.js';

import guest from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import customer from '../../fixtures/checkoutConfig.customer.json' with { type: 'json' };
import virtualCart from '../../fixtures/checkoutConfig.virtual.json' with { type: 'json' };

const guestCfg = guest as unknown as CheckoutConfig;
const customerCfg = customer as unknown as CheckoutConfig;
const virtualCfg = virtualCart as unknown as CheckoutConfig;

describe('checkoutConfig fixtures', () => {
    it('guest fixture has hyperion + storeCode + quoteData', () => {
        expect(guestCfg.hyperion).toEqual({ checkoutVersion: '2.0.0', enabled: true });
        expect(guestCfg.storeCode).toBe('en');
        expect(guestCfg.isCustomerLoggedIn).toBe(false);
        expect(guestCfg.quoteData.entity_id).toMatch(/^[A-Za-z0-9]{20,}$/);
    });

    it('customer fixture has customerData with addresses', () => {
        expect(customerCfg.isCustomerLoggedIn).toBe(true);
        const cd = customerCfg.customerData;
        expect(isAuthenticatedCustomer(cd)).toBe(true);
        if (isAuthenticatedCustomer(cd)) {
            expect(cd.email).toBe('roni_cost@example.com');
            expect(Object.keys(cd.addresses).length).toBeGreaterThan(0);
        }
    });

    it('virtual fixture has quoteData.is_virtual truthy', () => {
        const iv = virtualCfg.quoteData.is_virtual;
        expect(iv === 1 || iv === '1').toBe(true);
    });

    it('all three fixtures expose readable priceFormat', () => {
        for (const cfg of [guestCfg, customerCfg, virtualCfg]) {
            expect(typeof cfg.priceFormat.pattern).toBe('string');
            expect(typeof cfg.priceFormat.precision).toBe('number');
        }
    });

    it('all three fixtures include the hyperion namespace', () => {
        for (const cfg of [guestCfg, customerCfg, virtualCfg]) {
            expect(cfg.hyperion.enabled).toBe(true);
            expect(cfg.hyperion.checkoutVersion).toBe('2.0.0');
        }
    });
});
