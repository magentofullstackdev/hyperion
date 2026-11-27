// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, describe, expect, it } from 'vitest';

import '../payment-offline.js';
import type { PaymentOffline } from '../payment-offline.js';
import { createMockContext, mountPaymentElement } from './mock-context.js';

async function mount(code: string, payment: Record<string, unknown> = {}): Promise<{ el: PaymentOffline; events: Array<{ type: string }> }> {
    const mock = createMockContext({ config: { payment } });
    const slice = payment[code];
    const { element, events } = mountPaymentElement<PaymentOffline>('hc-payment-offline', {
        context: mock.context,
        method: { code, title: code },
        config: slice && typeof slice === 'object' ? slice as Record<string, unknown> : {},
    });
    await element.updateComplete;
    return { el: element, events };
}

describe('<hc-payment-offline>', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('declares the extension API it was written for and reports ready once connected', async () => {
        const { el, events } = await mount('checkmo');
        expect((el.constructor as unknown as { hyperionApi: string }).hyperionApi).toBe('1');
        expect(events.map((event) => event.type)).toEqual(['ready']);
    });

    it('has nothing to collect: no data, no validation, no order of its own', async () => {
        const { el } = await mount('cashondelivery');
        const methods = el as unknown as Record<string, unknown>;
        expect(methods['getPaymentData']).toBeUndefined();
        expect(methods['validate']).toBeUndefined();
        expect(methods['placeOrder']).toBeUndefined();
    });

    describe('instructions', () => {
        it('bank transfer instructions render from payment.instructions.banktransfer, sanitized', async () => {
            const { el } = await mount('banktransfer', {
                instructions: {
                    banktransfer: 'Bank: Hyperion Bank<br />\nIBAN: IT60 X054 2811 1010 0000 0123 456<script>alert(1)</script>',
                    cashondelivery: 'Pay the courier in cash.',
                },
            });

            const block = el.querySelector('[data-payment-instructions]')!;
            expect(block.textContent).toContain('Bank: Hyperion Bank');
            expect(block.textContent).toContain('IBAN: IT60 X054 2811 1010 0000 0123 456');
            expect(block.querySelector('br')).not.toBeNull();
            expect(block.querySelector('script')).toBeNull();
            expect(block.textContent).not.toContain('Pay the courier');
        });

        it('each method shows its own instructions and a method without any shows none', async () => {
            const payment = { instructions: { cashondelivery: 'Pay the courier in cash.' } };
            const cod = await mount('cashondelivery', payment);
            expect(cod.el.querySelector('[data-payment-instructions]')?.textContent).toBe('Pay the courier in cash.');

            const bank = await mount('banktransfer', payment);
            expect(bank.el.querySelector('[data-payment-instructions]')).toBeNull();
        });

        it('instructions under the method code itself are not read: core emits them under payment.instructions', async () => {
            const { el } = await mount('banktransfer', { banktransfer: { instructions: 'Wrong place' } });
            expect(el.textContent).not.toContain('Wrong place');
        });
    });

    describe('check / money order details', () => {
        it('shows who the check is payable to as text and where to send it with its line breaks', async () => {
            const { el } = await mount('checkmo', {
                checkmo: {
                    payableTo: 'Hyperion <b>Store</b> Ltd',
                    mailingAddress: '1 Market Street<br />\nCalder, MI 49628',
                },
            });

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
            const { el } = await mount('checkmo', { checkmo: { payableTo: null, mailingAddress: '' } });
            expect(el.querySelector('[data-payment-check-details]')).toBeNull();
        });

        it('are not shown for another method', async () => {
            const { el } = await mount('banktransfer', { checkmo: { payableTo: 'Hyperion Store', mailingAddress: '' } });
            expect(el.querySelector('[data-payment-check-details]')).toBeNull();
        });
    });
});
