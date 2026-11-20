// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const applyCoupon = vi.fn();

vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ applyCoupon, removeCoupon: vi.fn() }),
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { couponDraft } from '../../store/drafts.js';
import { createStore, setStoreForTests } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import type { CouponForm } from '../coupon-form.js';
import '../coupon-form.js';

async function mount(): Promise<CouponForm> {
    const el = document.createElement('coupon-form');
    document.body.appendChild(el);
    await settle(el);
    return el;
}

async function settle(el: CouponForm): Promise<void> {
    await el.updateComplete;
    await Promise.all(
        Array.from(el.querySelectorAll('hc-text-input, hc-button')).map(
            (child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete
        )
    );
    await el.updateComplete;
}

function type(el: CouponForm, value: string): void {
    const input = el.querySelector<HTMLInputElement>('input[name="coupon_code"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function button(el: CouponForm, label: string): HTMLButtonElement {
    const found = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
    if (!found) throw new Error(`no "${label}" button`);
    return found;
}

describe('<coupon-form> draft', () => {
    beforeEach(() => {
        applyCoupon.mockReset();
        couponDraft.set('');
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        setStoreForTests(createStore());
    });

    afterEach(() => {
        document.body.replaceChildren();
        couponDraft.set('');
    });

    it('starts closed without a draft', async () => {
        const el = await mount();
        expect(el.querySelector('input[name="coupon_code"]')).toBeNull();
    });

    it('opens with a code typed before the page was left', async () => {
        couponDraft.set('SAVE10');
        const el = await mount();
        expect(el.querySelector<HTMLInputElement>('input[name="coupon_code"]')!.value).toBe('SAVE10');
    });

    it('keeps what is typed in the coupon draft, and a second instance shows it', async () => {
        const el = await mount();
        button(el, 'Have a promo code?').click();
        await settle(el);
        type(el, 'FREESHIP');
        await settle(el);
        expect(couponDraft.get()).toBe('FREESHIP');

        el.remove();
        const again = await mount();
        expect(again.querySelector<HTMLInputElement>('input[name="coupon_code"]')!.value).toBe('FREESHIP');
    });

    it('clears the draft once the code is applied, and keeps it when the code is refused', async () => {
        couponDraft.set(' SAVE10 ');
        const el = await mount();
        applyCoupon.mockResolvedValueOnce(false);
        button(el, 'Apply').click();
        await vi.waitFor(() => expect(applyCoupon).toHaveBeenCalledWith('SAVE10'));
        await settle(el);
        expect(couponDraft.get()).toBe(' SAVE10 ');

        applyCoupon.mockResolvedValueOnce(true);
        button(el, 'Apply').click();
        await vi.waitFor(() => expect(couponDraft.get()).toBe(''));
    });

    it('drops the draft on Cancel', async () => {
        couponDraft.set('SAVE10');
        const el = await mount();
        button(el, 'Cancel').click();
        await settle(el);
        expect(couponDraft.get()).toBe('');
        expect(el.querySelector('input[name="coupon_code"]')).toBeNull();
    });
});
