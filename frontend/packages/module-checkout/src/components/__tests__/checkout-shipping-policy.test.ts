// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests } from '../../store/index.js';
import { initFlowActions, resetFlowActionsForTests } from '../../store/flow-actions.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-shipping.js';
import type { CheckoutShipping } from '../checkout-shipping.js';

function install(policy: NonNullable<CheckoutConfig['shippingPolicy']>): void {
    setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), shippingPolicy: policy });
}

async function mount(): Promise<CheckoutShipping> {
    const el = document.createElement('checkout-shipping') as CheckoutShipping;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

describe('<checkout-shipping> shipping policy', () => {
    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setStoreForTests(createStore());
        resetFlowActionsForTests();
        initFlowActions();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        resetFlowActionsForTests();
    });

    it('renders no trigger when the policy is disabled or empty', async () => {
        install({ isEnabled: false, shippingPolicyContent: 'We ship <b>fast</b>' });
        expect((await mount()).querySelector('[data-hyperion-shipping-policy-open]')).toBeNull();
        document.body.innerHTML = '';
        install({ isEnabled: true, shippingPolicyContent: '   ' });
        expect((await mount()).querySelector('[data-hyperion-shipping-policy-open]')).toBeNull();
    });

    it('opens an accessible dialog with the sanitised policy text', async () => {
        install({ isEnabled: true, shippingPolicyContent: 'Orders ship in <b>2 days</b>.<br>\n<script>alert(1)</script><a href="javascript:x" onclick="y()">terms</a>' });
        const el = await mount();
        const trigger = el.querySelector<HTMLButtonElement>('[data-hyperion-shipping-policy-open]');
        expect(trigger?.textContent).toContain('shipping policy');

        const dialog = el.querySelector<HTMLDialogElement>('dialog[data-hyperion-shipping-policy]')!;
        expect(dialog.getAttribute('aria-labelledby')).toBe('hc-shipping-policy-heading');
        expect(dialog.open).toBe(false);
        trigger!.click();
        await el.updateComplete;
        expect(dialog.open).toBe(true);
        expect(dialog.querySelector('b')?.textContent).toBe('2 days');
        expect(dialog.querySelector('script')).toBeNull();
        expect(dialog.querySelector('a')?.getAttribute('onclick')).toBeNull();
        expect(dialog.querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);

        (dialog.querySelector('hc-button button') as HTMLButtonElement | null)?.click();
        await el.updateComplete;
        expect(dialog.open).toBe(false);
    });
});
