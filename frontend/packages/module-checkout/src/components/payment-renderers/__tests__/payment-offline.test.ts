// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import guestFixture from '../../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../../bootstrap-config.js';
import { resetFlowSelectorsForTests, initFlowSelectors } from '../../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../../store/index.js';
import { requestValidation, resetValidationRequestsForTests } from '../../../store/validation-request.js';
import type { CheckoutConfig } from '../../../types/config.js';
import { setActiveCatalogForTests } from '../../../utils/i18n.js';
import { getPaymentRenderer } from '../registry.js';
import { registerOfflineRenderers, type PaymentOffline } from '../payment-offline.js';

function installConfig(payment: Record<string, unknown>): void {
    setCheckoutConfig({ ...(guestFixture as unknown as CheckoutConfig), payment } as unknown as CheckoutConfig);
}

async function settle(el: Element): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
        await Promise.all(
            [el, ...Array.from(el.querySelectorAll('hc-text-input'))]
                .map((node) => (node as unknown as { updateComplete?: Promise<unknown> }).updateComplete ?? Promise.resolve())
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

async function mount(code: string): Promise<PaymentOffline> {
    const el = document.createElement('payment-offline');
    el.setAttribute('code', code);
    document.body.appendChild(el);
    await settle(el);
    return el;
}

describe('<payment-offline>', () => {
    let store: Store;

    beforeEach(() => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        resetValidationRequestsForTests();
        resetFlowSelectorsForTests();
        registerOfflineRenderers();
        store = createStore();
        setStoreForTests(store);
        installConfig({});
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
        resetFlowSelectorsForTests();
    });

    describe('instructions', () => {
        it('bank transfer instructions render from payment.instructions.banktransfer, sanitized', async () => {
            installConfig({
                instructions: {
                    banktransfer: 'Bank: Hyperion Bank<br />\nIBAN: IT60 X054 2811 1010 0000 0123 456<script>alert(1)</script>',
                    cashondelivery: 'Pay the courier in cash.',
                },
            });

            const el = await mount('banktransfer');

            const block = el.querySelector('[data-payment-instructions]')!;
            expect(block.textContent).toContain('Bank: Hyperion Bank');
            expect(block.textContent).toContain('IBAN: IT60 X054 2811 1010 0000 0123 456');
            expect(block.querySelector('br')).not.toBeNull();
            expect(block.querySelector('script')).toBeNull();
            expect(block.textContent).not.toContain('Pay the courier');
        });

        it('each method shows its own instructions and a method without any shows none', async () => {
            installConfig({ instructions: { cashondelivery: 'Pay the courier in cash.' } });

            const cod = await mount('cashondelivery');
            expect(cod.querySelector('[data-payment-instructions]')?.textContent).toBe('Pay the courier in cash.');

            const bank = await mount('banktransfer');
            expect(bank.querySelector('[data-payment-instructions]')).toBeNull();
        });

        it('instructions under the method code itself are not read: core emits them under payment.instructions', async () => {
            installConfig({ banktransfer: { instructions: 'Wrong place' } });

            const el = await mount('banktransfer');

            expect(el.textContent).not.toContain('Wrong place');
        });
    });

    describe('check / money order details', () => {
        it('shows who the check is payable to as text and where to send it with its line breaks', async () => {
            installConfig({
                checkmo: {
                    payableTo: 'Hyperion <b>Store</b> Ltd',
                    mailingAddress: '1 Market Street<br />\nCalder, MI 49628',
                },
            });

            const el = await mount('checkmo');

            const details = el.querySelector('[data-payment-check-details]')!;
            const terms = Array.from(details.querySelectorAll('dt')).map((dt) => dt.textContent?.trim());
            expect(terms).toEqual(['Make Check payable to:', 'Send Check to:']);
            const payable = details.querySelector('[data-payment-check-payable-to]')!;
            expect(payable.textContent).toBe('Hyperion <b>Store</b> Ltd');
            expect(payable.querySelector('b')).toBeNull();
            const sendTo = details.querySelector('[data-payment-check-send-to]')!;
            expect(sendTo.querySelector('br')).not.toBeNull();
            expect(sendTo.textContent).toContain('Calder, MI 49628');
        });

        it('renders nothing when neither value is configured', async () => {
            installConfig({ checkmo: { payableTo: null, mailingAddress: '' } });

            const el = await mount('checkmo');

            expect(el.querySelector('[data-payment-check-details]')).toBeNull();
        });

        it('are not shown for another method', async () => {
            installConfig({ checkmo: { payableTo: 'Hyperion Store', mailingAddress: '' } });

            const el = await mount('banktransfer');

            expect(el.querySelector('[data-payment-check-details]')).toBeNull();
        });
    });

    describe('purchase order', () => {
        function renderer(): NonNullable<ReturnType<typeof getPaymentRenderer>> {
            const found = getPaymentRenderer('purchaseorder');
            if (!found) throw new Error('purchaseorder renderer is not registered');
            return found;
        }

        it('is not ready while the field is empty or blank, and follows the typing', async () => {
            store.availablePaymentMethods.set([{ code: 'purchaseorder', title: 'Purchase Order' }]);
            store.selectedPaymentMethod.set('purchaseorder');
            const selectors = initFlowSelectors();
            const el = await mount('purchaseorder');

            expect(renderer().isReady?.()).toBe(false);
            expect(selectors.paymentMethodReady.get()).toBe(false);

            const input = el.querySelector<HTMLInputElement>('input[name="po_number"]')!;
            input.value = '   ';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(selectors.paymentMethodReady.get()).toBe(false);

            input.value = 'HYP-PO-1';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            expect(store.paymentMethodData.get()['purchaseorder']).toEqual({ po_number: 'HYP-PO-1' });
            expect(renderer().isReady?.()).toBe(true);
            expect(selectors.paymentMethodReady.get()).toBe(true);
        });

        it('refuses to place without a number and hands over the trimmed number otherwise', async () => {
            await expect(renderer().beforePlaceOrder?.()).rejects.toThrow('Enter the purchase order number.');

            store.paymentMethodData.set({ purchaseorder: { po_number: ' HYP-PO-2 ' } });
            await expect(renderer().beforePlaceOrder?.()).resolves.toEqual({ po_number: 'HYP-PO-2' });
        });

        it('shows why the field is required after a blur', async () => {
            const el = await mount('purchaseorder');
            const input = el.querySelector<HTMLInputElement>('input[name="po_number"]')!;
            expect(input.getAttribute('aria-invalid')).toBe('false');

            input.dispatchEvent(new Event('blur'));
            await settle(el);

            expect(input.getAttribute('aria-invalid')).toBe('true');
            expect(el.textContent).toContain('Enter the purchase order number.');

            input.value = 'HYP-PO-3';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await settle(el);
            expect(input.getAttribute('aria-invalid')).toBe('false');
        });

        it('shows why the field is required after an early press of Place Order', async () => {
            const el = await mount('purchaseorder');
            const input = el.querySelector<HTMLInputElement>('input[name="po_number"]')!;

            requestValidation();
            await settle(el);

            expect(input.getAttribute('aria-invalid')).toBe('true');
            expect(el.textContent).toContain('Enter the purchase order number.');
        });

        it('the other offline methods have no readiness of their own', () => {
            for (const code of ['checkmo', 'banktransfer', 'cashondelivery', 'free']) {
                expect(getPaymentRenderer(code)?.isReady).toBeUndefined();
            }
        });
    });
});
