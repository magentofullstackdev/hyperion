// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const savePaymentMethod = vi.fn();
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => ({ savePaymentMethod }),
}));

import guestFixture from '../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import enUS from '../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { registerPaymentRenderer } from '../payment-renderers/registry.js';
import '../payment-method-list.js';
import type { PaymentMethodList } from '../payment-method-list.js';

const FLATRATE = { carrier_code: 'flatrate', method_code: 'flatrate' };

/** Stands for a gateway renderer that mounts live fields: every mount and teardown is counted. */
let mounted = 0;
let tornDown = 0;
class FakeHostedFields extends HTMLElement {
    public connectedCallback(): void { mounted += 1; }
    public disconnectedCallback(): void { tornDown += 1; }
}
if (!customElements.get('fake-hosted-fields')) {
    customElements.define('fake-hosted-fields', FakeHostedFields);
}
registerPaymentRenderer({ code: 'fakecard', component: 'fake-hosted-fields' });

async function settle(el: PaymentMethodList): Promise<void> {
    for (let i = 0; i < 3; i += 1) {
        await el.updateComplete;
        await Promise.all(Array.from(el.querySelectorAll('payment-method-row'))
            .map((row) => (row as unknown as { updateComplete: Promise<unknown> }).updateComplete));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe('<payment-method-list>', () => {
    let store: Store;

    beforeEach(() => {
        savePaymentMethod.mockReset();
        mounted = 0;
        tornDown = 0;
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        setCheckoutConfig(guestFixture as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        setStoreForTests(null);
    });

    async function mount(): Promise<PaymentMethodList> {
        const el = document.createElement('payment-method-list') as PaymentMethodList;
        document.body.appendChild(el);
        await settle(el);
        return el;
    }

    describe('without a method to show', () => {
        it('a physical quote whose shipping information is not confirmed waits for the shipping step', async () => {
            const el = await mount();

            const waiting = el.querySelector('[data-payment-methods-waiting]');
            expect(waiting?.textContent?.trim()).toBe('Select a shipping method to continue.');
            expect(waiting?.getAttribute('role')).toBe('status');
            expect(el.querySelector('[role="alert"]')).toBeNull();
        });

        it('a list on its way shows two placeholder rows and no text', async () => {
            store.isSettlingTotals.set(true);
            const el = await mount();

            const loading = el.querySelector('[data-payment-methods-loading]');
            expect(loading?.getAttribute('aria-busy')).toBe('true');
            expect(loading?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
            expect(el.querySelector('[data-payment-methods-waiting]')).toBeNull();

            store.isSettlingTotals.set(false);
            store.quoteWritesPending.set(1);
            await settle(el);
            expect(el.querySelector('[data-payment-methods-loading]')).not.toBeNull();
        });

        it('a confirmed quote the server offers nothing for says so as an alert', async () => {
            store.appliedShippingMethod.set(FLATRATE);
            const el = await mount();

            const none = el.querySelector('[data-payment-methods-none]');
            expect(none?.getAttribute('role')).toBe('alert');
            expect(none?.textContent?.trim()).toBe('No payment method is available for this order. Please contact us.');
        });

        it('a virtual quote never shows the shipping text', async () => {
            store.isVirtual.set(true);
            const el = await mount();

            expect(el.querySelector('[data-payment-methods-waiting]')).toBeNull();
            expect(el.querySelector('[data-payment-methods-none]')).not.toBeNull();
        });
    });

    describe('at a zero grand total', () => {
        const METHODS = [
            { code: 'checkmo', title: 'Check' },
            { code: 'free', title: 'No Payment Information Required' },
            { code: 'fakecard', title: 'Card' },
        ];
        const withTotal = (grand: string): Totals => ({ ...(guestFixture.totalsData as unknown as Totals), grand_total: grand });
        const listed = (el: PaymentMethodList): string[] =>
            Array.from(el.querySelectorAll<HTMLInputElement>('input[name="payment_method"]')).map((input) => input.id);

        it('lists only free when the server offers it, and the whole list again once the total is above zero', async () => {
            store.availablePaymentMethods.set(METHODS);
            store.totals.set(withTotal('0.0000'));
            const el = await mount();
            expect(listed(el)).toEqual(['hc-pay-free']);

            store.totals.set(withTotal('25.0000'));
            await settle(el);
            expect(listed(el)).toEqual(['hc-pay-checkmo', 'hc-pay-free', 'hc-pay-fakecard']);
        });

        it('lists what the server offers when free is not part of it', async () => {
            store.availablePaymentMethods.set(METHODS.filter((m) => m.code !== 'free'));
            store.totals.set(withTotal('0.0000'));
            const el = await mount();
            expect(listed(el)).toEqual(['hc-pay-checkmo', 'hc-pay-fakecard']);
        });
    });

    describe('a method whose renderer is a module of its own', () => {
        it('has the row of a usable method while the module is on its way, without the unsupported note', async () => {
            store.availablePaymentMethods.set([
                { code: 'payflow_express', title: 'PayPal' },
                { code: 'some_unknown_gateway', title: 'Other' },
            ]);
            const el = document.createElement('payment-method-list') as PaymentMethodList;
            document.body.appendChild(el);
            await el.updateComplete;
            const rows = Array.from(el.querySelectorAll('payment-method-row'));
            await Promise.all(rows.map((r) => (r as unknown as { updateComplete: Promise<unknown> }).updateComplete));

            expect(rows[0]!.querySelector('[data-payment-unsupported]')).toBeNull();
            expect(rows[0]!.querySelector('.opacity-60')).toBeNull();
            expect(rows[1]!.querySelector('[data-payment-unsupported]')).not.toBeNull();
        });

        it('shows no "not available" notice under such a row when it is the selected one', async () => {
            store.availablePaymentMethods.set([{ code: 'payflow_express', title: 'PayPal' }]);
            store.selectedPaymentMethod.set('payflow_express');
            const el = document.createElement('payment-method-list') as PaymentMethodList;
            document.body.appendChild(el);
            await el.updateComplete;
            const row = el.querySelector('payment-method-row')!;
            await (row as unknown as { updateComplete: Promise<unknown> }).updateComplete;

            expect(row.querySelector('payment-generic')).toBeNull();
        });
    });

    it('a stored token has its row from the first render, before the module of its provider arrived', async () => {
        setCheckoutConfig({
            ...(guestFixture as unknown as CheckoutConfig),
            vault: { payflow_vault_without_module: { is_enabled: true }, braintree_paypal_vault: { is_enabled: true } },
            payment: {
                vault: {
                    braintree_paypal_vault_0: { config: { code: 'braintree_paypal_vault', publicHash: 'hash-1', details: {} } },
                    payflow_vault_without_module_0: { config: { code: 'payflow_vault_without_module', publicHash: 'hash-2', details: {} } },
                },
            },
        } as unknown as CheckoutConfig);
        store.availablePaymentMethods.set([
            { code: 'checkmo', title: 'Check' },
            { code: 'braintree_paypal_vault', title: 'Stored PayPal' },
            { code: 'payflow_vault_without_module', title: 'Stored Cards' },
        ]);
        const el = document.createElement('payment-method-list') as PaymentMethodList;
        document.body.appendChild(el);
        await el.updateComplete;

        const ids = Array.from(el.querySelectorAll<HTMLInputElement>('input[name="payment_method"]')).map((input) => input.id);
        expect(ids).toEqual(['hc-pay-braintree_paypal_vault_0', 'hc-pay-checkmo']);
        expect(el.querySelector('[data-payment-unsupported]')).toBeNull();
    });

    it('selecting a method stores the selection and asks for it to be saved; a stored token is a choice inside the client', async () => {
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }, { code: 'banktransfer', title: 'Bank Transfer' }]);
        const el = await mount();
        const rows = el.querySelectorAll('payment-method-row');

        rows[1]!.dispatchEvent(new CustomEvent('payment-select', { detail: { code: 'banktransfer' } }));
        expect(store.selectedPaymentMethod.get()).toBe('banktransfer');
        expect(savePaymentMethod).toHaveBeenCalledTimes(1);

        rows[0]!.dispatchEvent(new CustomEvent('payment-select', { detail: { code: 'checkmo', publicHash: 'hash-1' } }));
        expect(savePaymentMethod).toHaveBeenCalledTimes(1);
    });

    it('a list change above the selected gateway row neither tears down nor recreates its fields; removing the method does', async () => {
        store.availablePaymentMethods.set([
            { code: 'checkmo', title: 'Check' },
            { code: 'fakecard', title: 'Card' },
        ]);
        store.selectedPaymentMethod.set('fakecard');
        const el = await mount();
        const fields = el.querySelector('fake-hosted-fields');
        const row = fields?.closest('payment-method-row');
        expect(fields).not.toBeNull();
        expect(mounted).toBe(1);

        // A coupon made `free` appear and a method above went away.
        store.availablePaymentMethods.set([
            { code: 'banktransfer', title: 'Bank Transfer' },
            { code: 'cashondelivery', title: 'Cash On Delivery' },
            { code: 'fakecard', title: 'Card' },
            { code: 'checkmo', title: 'Check' },
        ]);
        await settle(el);

        expect(el.querySelector('fake-hosted-fields')).toBe(fields);
        expect(fields?.closest('payment-method-row')).toBe(row);
        expect(tornDown).toBe(0);
        expect(mounted).toBe(1);
        const order = Array.from(el.querySelectorAll('payment-method-row')).map((r) => r.method.code);
        expect(order).toEqual(['banktransfer', 'cashondelivery', 'fakecard', 'checkmo']);

        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        await settle(el);
        expect(el.querySelector('fake-hosted-fields')).toBeNull();
        expect(tornDown).toBe(1);
    });
});
