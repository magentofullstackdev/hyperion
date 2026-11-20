// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/payment.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../api/payment.js')>()),
    getGuestPaymentInformation: vi.fn(),
    getCustomerPaymentInformation: vi.fn(),
}));
// The taxonomy has its own tests: here a failure keeps the message it was thrown with.
vi.mock('../../api/error-kinds.js', () => {
    const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));
    return {
        classifyError: vi.fn((err: unknown) => ({ kind: 'unexpected', message: messageOf(err) })),
        describeError: vi.fn(messageOf),
    };
});
vi.mock('../../api/gift-message.js', () => ({
    saveGuestGiftMessage: vi.fn(),
    saveCustomerGiftMessage: vi.fn(),
}));

import * as giftApi from '../../api/gift-message.js';
import * as paymentApi from '../../api/payment.js';
import { giftDrafts } from '../../store/drafts.js';
import { flowActions, initFlowActions, resetFlowActionsForTests } from '../../store/flow-actions.js';
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
        giftDrafts.set({});
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        store = createStore();
        setStoreForTests(store);
        store.maskedQuoteId.set('masked-9');
        store.items.set([item(11, 'Fusion Backpack'), item(12, 'Gift Wrap', true)]);
        const answer = { payment_methods: [], totals: { grand_total: '57.00', total_segments: [] } };
        vi.mocked(paymentApi.getGuestPaymentInformation).mockResolvedValue(answer as never);
        vi.mocked(paymentApi.getCustomerPaymentInformation).mockResolvedValue(answer as never);
        resetFlowActionsForTests();
        initFlowActions();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        resetFlowActionsForTests();
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
        // The save went through the quote write queue: the totals were read once after it.
        expect(paymentApi.getGuestPaymentInformation).toHaveBeenCalledTimes(1);
        expect(store.quoteWritesPending.get()).toBe(0);
    });

    it('posts an item-level message for a customer and shows a refusal once, in the section status', async () => {
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
        expect(store.sectionStatus.get().gift?.message).toContain('not applicable');
        expect(el.querySelector('[data-hyperion-gift-notice="error"]')).toBeNull();
        expect(el.querySelector('hc-section-status[section="gift"]')).not.toBeNull();
    });

    it('mirrors what is typed in the gift drafts and forgets it once saved', async () => {
        install({ isOrderLevelGiftOptionsEnabled: true, isItemLevelGiftOptionsEnabled: false, giftMessage: { orderLevel: true } });
        api.saveGuestGiftMessage.mockResolvedValue(true);
        const el = await mount();
        (el.querySelector('[data-hyperion-gift-open]') as HTMLButtonElement).click();
        await settle(el);
        const form = el.querySelector('[data-hyperion-gift-form="order"]')!;
        const textarea = form.querySelector('textarea')!;
        textarea.value = 'Hello';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        await settle(el);
        expect(giftDrafts.get()).toEqual({ order: { sender: '', recipient: '', message: 'Hello' } });

        (form.querySelector('hc-button button') as HTMLButtonElement).click();
        for (let i = 0; i < 6; i += 1) {
            await Promise.resolve();
            await settle(el);
        }
        expect(api.saveGuestGiftMessage).toHaveBeenCalledTimes(1);
        expect(giftDrafts.get()).toEqual({});
    });

    it('opens with a restored draft filled in, sends nothing at mount and saves it with the next flush', async () => {
        install({ isOrderLevelGiftOptionsEnabled: true, isItemLevelGiftOptionsEnabled: false, giftMessage: { orderLevel: true } });
        api.saveGuestGiftMessage.mockResolvedValue(true);
        giftDrafts.set({
            order: { sender: 'Ann', recipient: 'Bob', message: 'Typed before the reload' },
            99: { sender: '', recipient: '', message: 'An item that left the cart' },
        });
        const el = await mount();
        await settle(el);

        const form = el.querySelector('[data-hyperion-gift-form="order"]')!;
        expect(form.querySelector('textarea')!.value).toBe('Typed before the reload');
        expect(api.saveGuestGiftMessage).not.toHaveBeenCalled();

        await flowActions().queue.flush();
        await flowActions().queue.whenIdle();
        expect(api.saveGuestGiftMessage).toHaveBeenCalledTimes(1);
        expect(api.saveGuestGiftMessage).toHaveBeenCalledWith(
            'masked-9', null, { sender: 'Ann', recipient: 'Bob', message: 'Typed before the reload' }
        );
    });

    it('leaves the panel closed for a draft that equals what the quote holds', async () => {
        install({
            isOrderLevelGiftOptionsEnabled: true,
            isItemLevelGiftOptionsEnabled: false,
            giftMessage: { orderLevel: { gift_message_id: '5', sender: 'Ann', recipient: 'Bob', message: 'Enjoy' } },
        });
        giftDrafts.set({ order: { sender: 'Ann', recipient: 'Bob', message: 'Enjoy' } });
        const el = await mount();
        await settle(el);

        expect(el.querySelector('[data-hyperion-gift-open]')).not.toBeNull();
        await flowActions().queue.flush();
        expect(api.saveGuestGiftMessage).not.toHaveBeenCalled();
    });
    describe('a changed form', () => {
        async function openOrderForm(): Promise<{ el: CheckoutGiftMessage; form: Element; typeMessage: (text: string) => Promise<void> }> {
            install({
                isOrderLevelGiftOptionsEnabled: true,
                isItemLevelGiftOptionsEnabled: false,
                giftMessage: { orderLevel: { gift_message_id: '5', sender: 'Ann', recipient: 'Bob', message: 'Enjoy' } },
            });
            api.saveGuestGiftMessage.mockResolvedValue(true);
            const el = await mount();
            (el.querySelector('[data-hyperion-gift-open]') as HTMLButtonElement).click();
            await settle(el);
            const form = el.querySelector('[data-hyperion-gift-form="order"]')!;
            const typeMessage = async (text: string): Promise<void> => {
                const textarea = form.querySelector('textarea')!;
                textarea.value = text;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                await settle(el);
            };
            return { el, form, typeMessage };
        }

        async function drain(el: CheckoutGiftMessage): Promise<void> {
            for (let i = 0; i < 6; i += 1) {
                await Promise.resolve();
                await settle(el);
            }
        }

        function leave(form: Element, next: Element | null): void {
            form.querySelector('textarea')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: next }));
        }

        it('is saved when the focus leaves the form, not when it moves inside it', async () => {
            const { el, form, typeMessage } = await openOrderForm();
            await typeMessage('Happy birthday');

            leave(form, form.querySelector('hc-button button'));
            await drain(el);
            expect(api.saveGuestGiftMessage).not.toHaveBeenCalled();

            leave(form, document.body);
            await drain(el);
            expect(api.saveGuestGiftMessage).toHaveBeenCalledTimes(1);
            expect(api.saveGuestGiftMessage).toHaveBeenCalledWith('masked-9', null, { sender: 'Ann', recipient: 'Bob', message: 'Happy birthday' });
            expect(el.querySelector('[data-hyperion-gift-notice="success"]')).not.toBeNull();

            // Saved: leaving again sends nothing.
            leave(form, document.body);
            await drain(el);
            expect(api.saveGuestGiftMessage).toHaveBeenCalledTimes(1);
        });

        it('an untouched form, or one typed back to the stored text, is never sent', async () => {
            const { el, form, typeMessage } = await openOrderForm();
            leave(form, document.body);
            await flowActions().queue.flush();
            await drain(el);
            expect(api.saveGuestGiftMessage).not.toHaveBeenCalled();

            await typeMessage('Something else');
            await typeMessage('Enjoy');
            leave(form, document.body);
            await flowActions().queue.flush();
            await drain(el);
            expect(api.saveGuestGiftMessage).not.toHaveBeenCalled();
        });

        it('is saved by the flush of the write queue, also while the panel is closed, once', async () => {
            const { el, typeMessage } = await openOrderForm();
            await typeMessage('For the flush');
            (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Hide gift options')) as HTMLButtonElement).click();
            await settle(el);
            expect(el.querySelector('[data-hyperion-gift-form]')).toBeNull();

            expect(await flowActions().queue.flush()).toBe(true);
            expect(api.saveGuestGiftMessage).toHaveBeenCalledTimes(1);
            expect(api.saveGuestGiftMessage).toHaveBeenCalledWith('masked-9', null, { sender: 'Ann', recipient: 'Bob', message: 'For the flush' });

            await drain(el);
            expect(await flowActions().queue.flush()).toBe(true);
            expect(api.saveGuestGiftMessage).toHaveBeenCalledTimes(1);
        });

        it('stops answering the queue once it left the page', async () => {
            const { el, typeMessage } = await openOrderForm();
            await typeMessage('Never sent');
            el.remove();
            await flowActions().queue.flush();
            expect(api.saveGuestGiftMessage).not.toHaveBeenCalled();
        });

        it('keeps one notice line in the flow, with the token classes of its tone', async () => {
            const { el, form, typeMessage } = await openOrderForm();
            const line = form.querySelector('[data-hyperion-gift-notice]')!;
            expect(line.getAttribute('data-hyperion-gift-notice')).toBe('none');
            expect(line.textContent?.trim()).toBe('');
            expect(line.classList.contains('hc-field-message')).toBe(true);

            await typeMessage('Happy birthday');
            leave(form, document.body);
            await drain(el);
            expect(form.querySelectorAll('[data-hyperion-gift-notice]').length).toBe(1);
            expect(line.getAttribute('data-hyperion-gift-notice')).toBe('success');
            expect(line.classList.contains('text-success-strong')).toBe(true);

            // A refused save is told by the section status alone.
            api.saveGuestGiftMessage.mockRejectedValue(new Error('refused'));
            await typeMessage('Again');
            leave(form, document.body);
            await drain(el);
            expect(line.getAttribute('data-hyperion-gift-notice')).toBe('none');
            expect(store.sectionStatus.get().gift?.message).toBe('refused');

            // A save the queue did not take (nothing is written any more) is told by the form.
            flowActions().queue.close();
            await typeMessage('Once more');
            leave(form, document.body);
            await drain(el);
            expect(line.getAttribute('data-hyperion-gift-notice')).toBe('error');
            expect(line.classList.contains('text-danger')).toBe(true);
            expect(line.classList.contains('text-success-strong')).toBe(false);
        });
    });
});
