// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/shipping.js', () => ({
    estimateGuestShippingMethods: vi.fn(),
    estimateCustomerShippingMethods: vi.fn(),
    saveGuestShippingInformation: vi.fn(),
    saveCustomerShippingInformation: vi.fn(),
}));
vi.mock('../../api/payment.js', () => ({
    placeGuestOrder: vi.fn(),
    placeCustomerOrder: vi.fn(),
    setGuestPaymentInformation: vi.fn(),
    setCustomerPaymentInformation: vi.fn(),
    getGuestPaymentInformation: vi.fn(),
    getCustomerPaymentInformation: vi.fn(),
    assignGuestBillingAddress: vi.fn(),
    assignCustomerBillingAddress: vi.fn(),
}));
vi.mock('../../api/coupon.js', () => ({
    applyGuestCoupon: vi.fn(),
    applyCustomerCoupon: vi.fn(),
    removeGuestCoupon: vi.fn(),
    removeCustomerCoupon: vi.fn(),
}));
vi.mock('../../api/cart.js', () => ({
    getGuestTotals: vi.fn(),
    getCustomerTotals: vi.fn(),
    getGuestCartState: vi.fn(),
    getCustomerCartState: vi.fn(),
}));
vi.mock('../../api/gift-message.js', () => ({ saveGuestGiftMessage: vi.fn(), saveCustomerGiftMessage: vi.fn() }));
vi.mock('../../components/recaptcha-client.js', () => ({ executeRecaptcha: vi.fn().mockResolvedValue(null) }));
vi.mock('../../utils/navigate.js', () => ({ navigateTo: vi.fn() }));
vi.mock('../../utils/minimum-order.js', () => ({ minimumOrderError: vi.fn(() => null) }));

import type { ShippingExtensionConfig } from '../../../extension-api.js';
import * as paymentApi from '../../api/payment.js';
import * as shippingApi from '../../api/shipping.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { resetCheckoutContextForTests } from '../../extension/context.js';
import { resetGatesForTests } from '../../extension/gates.js';
import { resetExtensionLoaderForTests, setModuleImporterForTests } from '../../extension/loader.js';
import { resetFiltersForTests } from '../../extension/request-filters.js';
import { initFlowActions, resetFlowActionsForTests } from '../../store/flow-actions.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { stopOrderRecovery } from '../../store/recovery.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { PaymentDetails, ShippingMethod } from '../../types/shipping.js';
import type { Totals } from '../../types/totals.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { installShippingExtensions, resetShippingExtensionsForTests } from '../shipping-extension-host.js';

const ORIGIN = 'https://shop.example';

const rate = (carrier: string, code: string, amount: number): ShippingMethod => ({
    carrier_code: carrier, method_code: code, carrier_title: carrier, method_title: code,
    amount, base_amount: amount, available: true, error_message: '', price_excl_tax: amount, price_incl_tax: amount,
});

const details = (): PaymentDetails => ({
    payment_methods: [{ code: 'checkmo', title: 'Check / Money order' }],
    totals: {
        grand_total: '57.00', base_grand_total: '57.00', subtotal: '52.00', base_subtotal: '52.00',
        discount_amount: '0', base_discount_amount: '0', subtotal_with_discount: '52.00', subtotal_incl_tax: '52.00',
        shipping_amount: '3', shipping_tax_amount: '0', shipping_incl_tax: '3', shipping_discount_amount: '0',
        tax_amount: '0', coupon_code: null, items_qty: '1', items: [], total_segments: [],
        quote_currency_code: 'USD', base_currency_code: 'USD',
    } as unknown as Totals,
});

const LOCKER_ENTRY: ShippingExtensionConfig = {
    id: 'vendor_locker',
    match: { carrier: 'locker', method: null },
    slot: 'below-method',
    tag: 'pick-locker-picker',
    moduleUrl: `${ORIGIN}/static/picker.js`,
    kit: null,
    apiVersion: '1',
    required: true,
    sortOrder: 10,
    options: {},
    phrases: {},
    value: null,
};

let picker: HTMLElement | null = null;

class PickPicker extends HTMLElement {
    public static hyperionApi = '1';
    public context: unknown = null;
    public options: unknown = null;
    public method: unknown = null;
    public value: unknown = null;
    public constructor() {
        super();
        picker = this;
    }
}

async function settle(): Promise<void> {
    for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('a pick of a required shipping extension, through the real flow actions and write queue', () => {
    let store: Store;

    beforeEach(() => {
        vi.clearAllMocks();
        setActiveCatalogForTests({});
        setCheckoutConfig({
            storeCode: 'default',
            hyperion: { enabled: true, extensionApi: '1.0-beta', shippingExtensions: [LOCKER_ENTRY] },
        } as unknown as CheckoutConfig);
        resetGatesForTests();
        resetFiltersForTests();
        resetCheckoutContextForTests();
        resetFlowSelectorsForTests();
        resetExtensionLoaderForTests(() => ORIGIN);
        setModuleImporterForTests(() => {
            if (!customElements.get('pick-locker-picker')) customElements.define('pick-locker-picker', PickPicker);
            return Promise.resolve({});
        });
        store = createStore();
        setStoreForTests(store);
        store.maskedQuoteId.set('masked-1');
        store.isGuest.set(true);
        store.email.set('ok@example.com');
        store.shippingAddress.set({
            country_id: 'US', city: 'Calder', firstname: 'Veronica', lastname: 'Costello', telephone: '555',
            postcode: '49628', street: ['1 Typed Street'], region_id: '33',
        });
        vi.mocked(shippingApi.estimateGuestShippingMethods).mockResolvedValue([rate('flatrate', 'flatrate', 5), rate('locker', 'standard', 3)]);
        vi.mocked(shippingApi.saveGuestShippingInformation).mockResolvedValue(details());
        vi.mocked(paymentApi.getGuestPaymentInformation).mockResolvedValue(details());
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        initFlowActions();
    });

    afterEach(async () => {
        resetShippingExtensionsForTests();
        stopOrderRecovery();
        resetFlowActionsForTests();
        resetGatesForTests();
        resetFiltersForTests();
        setModuleImporterForTests(null);
        await settle();
        setStoreForTests(null);
        vi.restoreAllMocks();
    });

    it('sends ONE shipping-information request, with the point address and the value, for a pick that reports data, validity and an address in one turn', async () => {
        const { flowActions } = await import('../../store/flow-actions.js');
        installShippingExtensions([LOCKER_ENTRY]);
        await flowActions().estimateShipping();
        await settle();
        expect(store.selectedShippingMethod.get()).toEqual({ carrier_code: 'locker', method_code: 'standard' });
        expect(shippingApi.saveGuestShippingInformation).not.toHaveBeenCalled();
        expect(picker).not.toBeNull();

        const el = picker!;
        const emit = (name: string, detail: unknown): void => {
            el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
        };
        emit('hyperion-shipping:data', { address: { locker_id: 'HL-001' } });
        emit('hyperion-shipping:valid', {});
        emit('hyperion-shipping:address-override', {
            address: { firstname: '', lastname: '', company: 'Locker', street: ['100 Congress Ave'], city: 'Austin', postcode: '78701', country_id: 'US', region_id: 57, region: 'Texas', region_code: 'TX' },
            keepContact: true,
            separateBilling: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 400));
        await flowActions().queue.whenIdle();
        await settle();

        const calls = vi.mocked(shippingApi.saveGuestShippingInformation).mock.calls;
        expect(calls).toHaveLength(1);
        const body = calls[0]![1] as unknown as { addressInformation: { shipping_address: Record<string, unknown> } };
        expect(body.addressInformation.shipping_address).toMatchObject({
            street: ['100 Congress Ave'],
            firstname: 'Veronica',
            extension_attributes: { locker_id: 'HL-001' },
        });
        expect(store.appliedShippingMethod.get()).toEqual({ carrier_code: 'locker', method_code: 'standard' });
    });
});
