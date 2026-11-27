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
import paymentRenderers from '../../fixtures/payment-renderers.json' with { type: 'json' };
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests, t } from '../../utils/i18n.js';
import { setPaymentVisibility } from '../../utils/payment-offer.js';
import { resetHostedForTests } from '../payment-host/element-registry.js';
import { loadPaymentHost, resetPaymentHostForTests } from '../payment-host/host.js';
import { resetMountForTests } from '../payment-host/mount.js';
import { resetPaymentRowsForTests } from '../payment-host/row-state.js';
import '../payment-method-list.js';
import type { PaymentMethodList } from '../payment-method-list.js';

/** A third-party entry whose element mounts live fields. */
const FAKE_CARD_ENTRY = {
    ...paymentRenderers[0],
    id: 'fake_card',
    method: 'fakecard',
    pattern: null,
    tag: 'fake-hosted-fields',
    moduleUrl: `${window.location.origin}/static/Vendor_Fake/js/card.js`,
    builtin: null,
    sortOrder: 90,
};

/** The configuration with the bundle's payment renderer entries, as the server emits them. */
function withPaymentRenderers(config: CheckoutConfig | null): CheckoutConfig {
    const base = (config ?? {}) as unknown as { hyperion?: Record<string, unknown> };
    return {
        ...base,
        hyperion: { ...(base.hyperion ?? {}), paymentRenderers: [...paymentRenderers, FAKE_CARD_ENTRY] },
    } as unknown as CheckoutConfig;
}

const FLATRATE = { carrier_code: 'flatrate', method_code: 'flatrate' };

/** Stands for a gateway renderer that mounts live fields: every mount and teardown is counted. */
let mounted = 0;
let tornDown = 0;
class FakeHostedFields extends HTMLElement {
    public static readonly hyperionApi = '1';
    public connectedCallback(): void { mounted += 1; }
    public disconnectedCallback(): void { tornDown += 1; }
}
if (!customElements.get('fake-hosted-fields')) {
    customElements.define('fake-hosted-fields', FakeHostedFields);
}

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
        setCheckoutConfig(withPaymentRenderers(guestFixture as unknown as CheckoutConfig));
        store = createStore();
        setStoreForTests(store);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        resetPaymentRowsForTests();
        resetHostedForTests();
        resetMountForTests();
        resetPaymentHostForTests();
        vi.restoreAllMocks();
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
        it('has the row of a usable method while the module is on its way, not selectable yet', async () => {
            store.availablePaymentMethods.set([{ code: 'payflow_express', title: 'PayPal' }]);
            const el = document.createElement('payment-method-list') as PaymentMethodList;
            document.body.appendChild(el);
            await el.updateComplete;
            const row = el.querySelector('payment-method-row')!;
            await (row as unknown as { updateComplete: Promise<unknown> }).updateComplete;

            expect(row.querySelector<HTMLInputElement>('#hc-pay-payflow_express')?.disabled).toBe(true);
            expect(row.querySelector('[data-payment-unsupported]')).toBeNull();
        });
    });

    describe('a method no renderer serves', () => {
        const METHODS = [
            { code: 'checkmo', title: 'Check' },
            { code: 'some_unknown_gateway', title: 'Other' },
        ];

        it('is not shown to the shopper', async () => {
            store.appliedShippingMethod.set(FLATRATE);
            store.availablePaymentMethods.set(METHODS);
            const el = await mount();
            const ids = Array.from(el.querySelectorAll<HTMLInputElement>('input[name="payment_method"]')).map((input) => input.id);
            expect(ids).toEqual(['hc-pay-checkmo']);
            expect(el.querySelector('[data-payment-unsupported]')).toBeNull();
        });

        it('is a disabled diagnostic row when the store asks for them', async () => {
            setCheckoutConfig(withPaymentRenderers({
                ...(guestFixture as unknown as CheckoutConfig),
                hyperion: { ...(guestFixture as unknown as CheckoutConfig).hyperion, debug: { showUnsupportedPayments: true } },
            } as unknown as CheckoutConfig));
            store.appliedShippingMethod.set(FLATRATE);
            store.availablePaymentMethods.set(METHODS);
            const el = await mount();
            const diagnostic = el.querySelector('[data-payment-unsupported="some_unknown_gateway"]');
            expect(diagnostic).not.toBeNull();
            expect(diagnostic?.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
            expect(diagnostic?.textContent).toContain('some_unknown_gateway');
        });

        describe('seven gateway methods with no entry, the store asking for diagnostics', () => {
            const SEVEN = [
                'payment_services_paypal_hosted_fields',
                'payment_services_paypal_smart_buttons',
                'payment_services_paypal_apple_pay',
                'payment_services_paypal_google_pay',
                'payment_services_paypal_fastlane',
                'payment_services_paypal_apm',
                'payment_services_paypal_vault',
            ];

            beforeEach(() => {
                setCheckoutConfig(withPaymentRenderers({
                    ...(guestFixture as unknown as CheckoutConfig),
                    hyperion: { ...(guestFixture as unknown as CheckoutConfig).hyperion, debug: { showUnsupportedPayments: true } },
                } as unknown as CheckoutConfig));
                store.appliedShippingMethod.set(FLATRATE);
                store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }, ...SEVEN.map((code) => ({ code, title: code }))]);
            });

            afterEach(() => {
                setPaymentVisibility(null);
            });

            it('draws one disabled diagnostic row for each', async () => {
                const el = await mount();
                for (const code of SEVEN) {
                    expect(el.querySelector(`[data-payment-unsupported="${code}"] input`)?.hasAttribute('disabled')).toBe(true);
                }
            });

            it('draws them also when their gateway marks them as not presentable', async () => {
                setPaymentVisibility(Object.fromEntries(SEVEN.map((code) => [code, { isVisible: false }])));
                const el = await mount();
                expect(el.querySelectorAll('input[name="payment_method"]:not([disabled])')).toHaveLength(1);
                for (const code of SEVEN) {
                    expect(el.querySelector(`[data-payment-unsupported="${code}"]`)).not.toBeNull();
                }
            });
        });

        it('is a diagnostic row when the page URL asks for them', async () => {
            window.history.replaceState(null, '', '/checkout/?hyperion_debug_payments=1');
            try {
                store.appliedShippingMethod.set(FLATRATE);
                store.availablePaymentMethods.set(METHODS);
                const el = await mount();
                expect(el.querySelector('[data-payment-unsupported="some_unknown_gateway"]')).not.toBeNull();
            } finally {
                window.history.replaceState(null, '', '/');
            }
        });

        it('leaves the list saying no method is available when it was the only one, and names it in the console', async () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            store.appliedShippingMethod.set(FLATRATE);
            store.availablePaymentMethods.set([{ code: 'only_unknown_gateway', title: 'Other' }]);
            const el = await mount();
            expect(el.querySelector('[data-payment-methods-none]')?.getAttribute('role')).toBe('alert');
            expect(error.mock.calls.some((call) => String(call[0]).includes('only_unknown_gateway'))).toBe(true);
        });
    });

    it('says politely that the payment methods were updated when a change of the list dropped the selection', async () => {
        store.appliedShippingMethod.set(FLATRATE);
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }, { code: 'banktransfer', title: 'Bank Transfer' }]);
        store.selectedPaymentMethod.set('banktransfer');
        const el = await mount();
        const status = (): string => el.querySelector('[data-payment-methods-status]')?.textContent?.trim() ?? '';
        expect(el.querySelector('[data-payment-methods-status]')?.getAttribute('aria-live')).toBe('polite');
        expect(status()).toBe('');

        // A list change that keeps the selection says nothing.
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }, { code: 'banktransfer', title: 'Bank Transfer' }, { code: 'cashondelivery', title: 'COD' }]);
        await settle(el);
        expect(status()).toBe('');

        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        store.selectedPaymentMethod.set(null);
        await settle(el);
        expect(status()).toBe(t('Hyperion_Checkout::payment_methods_updated'));
    });

    it('a stored token has its row from the first render, before the module of its provider arrived', async () => {
        setCheckoutConfig(withPaymentRenderers({
            ...(guestFixture as unknown as CheckoutConfig),
            vault: { payflow_vault_without_module: { is_enabled: true }, braintree_paypal_vault: { is_enabled: true } },
            payment: {
                vault: {
                    braintree_paypal_vault_0: { config: { code: 'braintree_paypal_vault', publicHash: 'hash-1', details: {} } },
                    payflow_vault_without_module_0: { config: { code: 'payflow_vault_without_module', publicHash: 'hash-2', details: {} } },
                },
            },
        } as unknown as CheckoutConfig));
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
        await loadPaymentHost();
        const el = await mount();
        await vi.waitFor(() => expect(el.querySelector('fake-hosted-fields')).not.toBeNull());
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
        const order = Array.from(el.querySelectorAll('payment-method-row')).map((r) => r.row?.method.code);
        expect(order).toEqual(['banktransfer', 'cashondelivery', 'fakecard', 'checkmo']);

        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }]);
        await settle(el);
        expect(el.querySelector('fake-hosted-fields')).toBeNull();
        expect(tornDown).toBe(1);

        // The method comes back: the same element, with what it held.
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }, { code: 'fakecard', title: 'Card' }]);
        await settle(el);
        expect(el.querySelector('fake-hosted-fields')).toBe(fields);
    });
});
