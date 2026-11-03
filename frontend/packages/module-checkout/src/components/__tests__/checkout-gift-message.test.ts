// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/gift-message.js', () => ({
    saveGuestGiftMessage: vi.fn(),
    saveCustomerGiftMessage: vi.fn(),
}));

import * as giftApi from '../../api/gift-message.js';
import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { CartItem } from '../../types/quote.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import '../checkout-gift-message.js';
import { resolveGiftMessageTargets, type CheckoutGiftMessage } from '../checkout-gift-message.js';

const api = vi.mocked(giftApi);

function item(id: number, name: string, virtual = false): CartItem {
    return {
        item_id: String(id),
        sku: `SKU-${id}`,
        name,
        qty: 1,
        price: '10',
        price_incl_tax: '10',
        row_total: '10',
        row_total_incl_tax: '10',
        tax_amount: '0',
        discount_amount: '0',
        product_id: String(id),
        product_type: 'simple',
        is_virtual: virtual ? '1' : '0',
    } as unknown as CartItem;
}

function install(extra: Partial<CheckoutConfig>): void {
    const base = { ...(guestFixture as unknown as Record<string, unknown>) };
    delete base['giftMessage'];
    delete base['isOrderLevelGiftOptionsEnabled'];
    delete base['isItemLevelGiftOptionsEnabled'];
    setCheckoutConfig({ ...(base as unknown as CheckoutConfig), ...extra });
}

async function mount(): Promise<CheckoutGiftMessage> {
    const el = document.createElement('checkout-gift-message') as CheckoutGiftMessage;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
}

async function settle(el: CheckoutGiftMessage): Promise<void> {
    await el.updateComplete;
    await Promise.all(
        Array.from(el.querySelectorAll('hc-text-input, hc-button')).map(
            (child) => (child as unknown as { updateComplete: Promise<unknown> }).updateComplete
        )
    );
}

describe('<checkout-gift-message>', () => {
    let store: Store;

    beforeEach(() => {
        vi.clearAllMocks();
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        store.maskedQuoteId.set('masked-9');
        store.items.set([item(11, 'Fusion Backpack'), item(12, 'Gift Wrap', true)]);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders nothing when the store allows no gift messages', async () => {
        install({});
        const el = await mount();
        expect(el.querySelector('[data-hyperion-gift-open]')).toBeNull();
        expect(el.textContent?.trim()).toBe('');
    });

    it('resolves the order form and the item forms from the config (virtual items and opted-out products excluded)', () => {
        const targets = resolveGiftMessageTargets({
            isOrderLevelGiftOptionsEnabled: true,
            isItemLevelGiftOptionsEnabled: true,
            giftMessage: {
                orderLevel: { gift_message_id: '5', sender: 'Ann', recipient: 'Bob', message: 'Enjoy' },
                itemLevel: {
                    '11': { message: { sender: 'A', recipient: 'B', message: 'For you' } },
                    '13': { is_available: false },
                },
            },
        }, [item(11, 'Fusion Backpack'), item(12, 'Gift Wrap', true), item(13, 'No gift')]);

        expect(targets.order).toEqual({ sender: 'Ann', recipient: 'Bob', message: 'Enjoy' });
        expect(targets.items.map((f) => f.item.name)).toEqual(['Fusion Backpack']);
        expect(targets.items[0]?.state.message).toBe('For you');
    });

    it('posts the order-level message as the native API expects (guest)', async () => {
        install({ isOrderLevelGiftOptionsEnabled: true, isItemLevelGiftOptionsEnabled: false, giftMessage: { orderLevel: true } });
        api.saveGuestGiftMessage.mockResolvedValue(true);
        const el = await mount();
        (el.querySelector('[data-hyperion-gift-open]') as HTMLButtonElement).click();
        await settle(el);

        const form = el.querySelector('[data-hyperion-gift-form="order"]')!;
        const fire = (name: string, value: string): void => {
            form.querySelector(`hc-text-input[name="gift_order_${name}"]`)!
                .dispatchEvent(new CustomEvent('value-change', { detail: { value, name }, bubbles: true }));
        };
        fire('sender', 'Ann');
        fire('recipient', 'Bob');
        const textarea = form.querySelector('textarea')!;
        textarea.value = 'Happy birthday';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await settle(el);

        (form.querySelector('hc-button button') as HTMLButtonElement).click();
        await settle(el);
        await Promise.resolve();
        await settle(el);

        expect(api.saveGuestGiftMessage).toHaveBeenCalledWith('masked-9', null, {
            sender: 'Ann',
            recipient: 'Bob',
            message: 'Happy birthday',
        });
        expect(el.querySelector('[data-hyperion-gift-notice="success"]')?.textContent).toContain('saved');
    });

    it('posts an item-level message for a customer and shows the API error when refused', async () => {
        store.isGuest.set(false);
        install({ isOrderLevelGiftOptionsEnabled: false, isItemLevelGiftOptionsEnabled: true, giftMessage: { itemLevel: true } });
        const { MagentoApiError } = await import('../../api/client.js');
        api.saveCustomerGiftMessage.mockRejectedValue(new MagentoApiError(400, '400', 'Gift messages are not applicable for this product'));
        const el = await mount();
        (el.querySelector('[data-hyperion-gift-open]') as HTMLButtonElement).click();
        await settle(el);

        expect(el.querySelector('[data-hyperion-gift-form="order"]')).toBeNull();
        const form = el.querySelector('[data-hyperion-gift-form="11"]')!;
        expect(el.querySelector('[data-hyperion-gift-form="12"]')).toBeNull();
        const textarea = form.querySelector('textarea')!;
        textarea.value = 'Hello';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await settle(el);
        (form.querySelector('hc-button button') as HTMLButtonElement).click();
        await settle(el);
        await Promise.resolve();
        await settle(el);

        expect(api.saveCustomerGiftMessage).toHaveBeenCalledWith(11, { sender: '', recipient: '', message: 'Hello' });
        expect(el.querySelector('[data-hyperion-gift-notice="error"]')?.textContent).toContain('not applicable');
    });
});
