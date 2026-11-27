// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flow = {
    saveShippingAndEstimateTotals: vi.fn().mockResolvedValue(undefined),
    estimateShippingNow: vi.fn().mockResolvedValue(undefined),
    estimateShipping: vi.fn().mockResolvedValue(undefined),
    invalidateBillingSync: vi.fn(),
    flushShippingForm: vi.fn(),
};
vi.mock('../../store/flow-actions.js', () => ({
    flowActions: () => flow,
}));

import type { ShippingExtensionConfig, ShippingExtensionValue } from '../../../extension-api.js';
import { setCheckoutConfig } from '../../bootstrap-config.js';
import { billingFollowsShipping, effectiveShippingAddress } from '../../extension/address-override.js';
import { resetCheckoutContextForTests } from '../../extension/context.js';
import { applyFilters } from '../../extension/filters.js';
import { resetGatesForTests, shippingExtensionsValid } from '../../extension/gates.js';
import { resetExtensionLoaderForTests, setModuleImporterForTests } from '../../extension/loader.js';
import { resetFiltersForTests } from '../../extension/request-filters.js';
import { buildDraft, restoredShippingExtensions, writeDraft } from '../../store/drafts.js';
import { resetFlowSelectorsForTests } from '../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../store/index.js';
import { requestValidation, resetValidationRequestsForTests } from '../../store/validation-request.js';
import type { Address } from '../../types/address.js';
import type { CheckoutConfig } from '../../types/config.js';
import type { ShippingMethod } from '../../types/shipping.js';
import { setActiveCatalogForTests } from '../../utils/i18n.js';
import { CALL_TIMEOUTS } from '../../extension/call.js';
import { shippingExtensionView } from '../shipping-extension-view.js';
import {
    resetShippingExtensionsForTests,
    SHIPPING_EXTENSION_SAVE_DELAY_MS,
    installShippingExtensions,
    startShippingExtensions,
    type ShippingExtensionHost,
} from '../shipping-extension-host.js';

const ORIGIN = 'https://shop.example';
const INCOMPLETE = 'Complete the delivery options.';
const FAILED = 'This delivery option could not be loaded.';

interface Picker extends HTMLElement {
    context: { extensionId: string };
    options: Record<string, unknown>;
    method: { carrier_code: string; method_code: string; amount: number } | null;
    value: ShippingExtensionValue | null;
    validate?: () => boolean;
    connectedSeen: { method: unknown; value: unknown; context: unknown } | null;
}

const created: Picker[] = [];
let validateAnswer = true;

class TestPicker extends HTMLElement {
    public static hyperionApi = '1';
    public context: unknown = null;
    public options: unknown = null;
    public method: unknown = null;
    public value: unknown = null;
    public connectedSeen: { method: unknown; value: unknown; context: unknown } | null = null;
    public validate = vi.fn(() => validateAnswer);

    public constructor() {
        super();
        created.push(this as unknown as Picker);
    }

    public connectedCallback(): void {
        this.connectedSeen ??= { method: this.method, value: this.value, context: this.context };
    }
}

function defineAll(tags: readonly string[] = ['test-locker-picker', 'test-delivery-note', 'test-gift-wrap']): void {
    for (const tag of tags) {
        if (!customElements.get(tag)) customElements.define(tag, class extends TestPicker {});
    }
}

const rate = (carrier: string, method: string, amount = 5): ShippingMethod => ({
    carrier_code: carrier,
    method_code: method,
    carrier_title: carrier,
    method_title: method,
    amount,
    base_amount: amount,
    available: true,
    error_message: '',
    price_excl_tax: amount,
    price_incl_tax: amount,
});

const LOCKER = rate('locker', 'standard', 3);
const FLAT = rate('flatrate', 'flatrate', 5);

function entry(overrides: Partial<ShippingExtensionConfig>): ShippingExtensionConfig {
    return {
        id: 'vendor_locker',
        match: { carrier: 'locker', method: null },
        slot: 'below-method',
        tag: 'test-locker-picker',
        moduleUrl: `${ORIGIN}/static/Vendor_Locker/js/picker.js`,
        kit: null,
        apiVersion: '1',
        required: false,
        sortOrder: 10,
        options: { radius: 5 },
        phrases: {},
        value: null,
        ...overrides,
    };
}

const TYPED: Address = {
    firstname: 'Veronica',
    lastname: 'Costello',
    street: ['6146 Honey Bluff Parkway'],
    city: 'Calder',
    postcode: '49628',
    country_id: 'US',
    region_id: '33',
    telephone: '5552293326',
};

async function flush(): Promise<void> {
    for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function emit(el: HTMLElement, name: string, detail: unknown = {}): void {
    el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}

function shippingPayload(): { addressInformation: Record<string, unknown> } {
    return {
        addressInformation: {
            shipping_address: { country_id: 'US', street: ['1 Main'], extension_attributes: { kept: 1 } },
            shipping_method_code: 'standard',
            shipping_carrier_code: 'locker',
        },
    };
}

describe('shipping extension host', () => {
    let store: Store;

    beforeEach(() => {
        vi.useRealTimers();
        for (const fn of Object.values(flow)) fn.mockClear();
        created.length = 0;
        validateAnswer = true;
        setActiveCatalogForTests({
            'Hyperion_Checkout::shipping_extension_incomplete': INCOMPLETE,
            'Hyperion_Checkout::shipping_extension_failed': FAILED,
            'Hyperion_Checkout::retry': 'Try again',
        });
        setCheckoutConfig({ storeCode: 'default', hyperion: { enabled: true, extensionApi: '1.0-beta' } } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        store.shippingAddress.set(TYPED);
        store.availableShippingMethods.set([FLAT, LOCKER]);
        store.estimateState.set('ready');
        resetFlowSelectorsForTests();
        resetCheckoutContextForTests();
        resetExtensionLoaderForTests(() => ORIGIN);
        setModuleImporterForTests(() => {
            defineAll();
            return Promise.resolve({});
        });
        resetGatesForTests();
        resetFiltersForTests();
        resetValidationRequestsForTests();
        restoredShippingExtensions.set({});
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(async () => {
        vi.useRealTimers();
        document.body.innerHTML = '';
        resetShippingExtensionsForTests();
        setModuleImporterForTests(null);
        resetFiltersForTests();
        resetGatesForTests();
        await flush();
        setStoreForTests(null);
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('creates the element only for the rate its match fits, with its properties set before it is connected', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        startShippingExtensions([entry({})]);
        await flush();
        expect(created).toHaveLength(0);
        expect(store.shippingExtensionData.get()).toEqual({});

        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        await flush();
        expect(created).toHaveLength(1);
        const picker = created[0]!;
        expect(picker.options).toEqual({ radius: 5 });
        expect(Object.isFrozen(picker.options)).toBe(true);
        expect(picker.context.extensionId).toBe('vendor_locker');
        expect(picker.method).toMatchObject({ carrier_code: 'locker', method_code: 'standard', amount: 3 });
        expect(picker.value).toBeNull();
        expect(store.shippingExtensionData.get()).toEqual({ vendor_locker: { value: null, valid: false, message: null } });

        const host = document.createElement('shipping-extension-host') as ShippingExtensionHost;
        host.placement = 'below-method';
        host.carrier = 'locker';
        host.method = 'standard';
        document.body.appendChild(host);
        await host.updateComplete;
        expect(host.contains(picker)).toBe(true);
        expect(picker.connectedSeen).toMatchObject({ method: { carrier_code: 'locker' }, value: null });
    });

    it('keeps a value through a rate refresh that still offers the rate and drops it when the rate disappears', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await flush();
        const picker = created[0]!;
        emit(picker, 'hyperion-shipping:data', { address: { locker_id: 'L1' } });
        await flush();
        expect(store.shippingExtensionData.get().vendor_locker?.value).toEqual({ address: { locker_id: 'L1' } });

        store.availableShippingMethods.set([rate('locker', 'standard', 4), FLAT]);
        await flush();
        expect(store.shippingExtensionData.get().vendor_locker?.value).toEqual({ address: { locker_id: 'L1' } });
        expect(picker.method?.amount).toBe(4);

        store.availableShippingMethods.set([FLAT]);
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await flush();
        expect(picker.value).toBeNull();
        store.availableShippingMethods.set([FLAT, LOCKER]);
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        await flush();
        expect(store.shippingExtensionData.get().vendor_locker?.value).toBeNull();
    });

    it('merges the values of the active entries into both targets and leaves them out after a switch of rate', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await flush();
        emit(created[0]!, 'hyperion-shipping:data', {
            address: { locker_id: 'L1' },
            information: { locker_slot: 'morning' },
            state: { search: 'Calder' },
        });
        await flush();
        const sent = applyFilters('shippingInformation', shippingPayload());
        expect(sent.addressInformation.shipping_address).toMatchObject({ extension_attributes: { kept: 1, locker_id: 'L1' } });
        expect(sent.addressInformation.extension_attributes).toEqual({ locker_slot: 'morning' });
        expect(JSON.stringify(sent)).not.toContain('Calder');

        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await flush();
        const after = applyFilters('shippingInformation', shippingPayload());
        expect(after.addressInformation.shipping_address).toMatchObject({ extension_attributes: { kept: 1 } });
        expect(JSON.stringify(after)).not.toContain('locker_id');
        expect(after.addressInformation.extension_attributes).toBeUndefined();
    });

    it('lets the higher sort order win a key two entries set and logs the collision', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        startShippingExtensions([
            entry({ id: 'vendor_wrap', match: null, slot: 'after-methods', tag: 'test-gift-wrap', sortOrder: 20 }),
            entry({ id: 'vendor_note', match: null, slot: 'after-methods', tag: 'test-delivery-note', sortOrder: 10 }),
        ]);
        await flush();
        const note = created.find((el) => el.localName === 'test-delivery-note')!;
        const wrap = created.find((el) => el.localName === 'test-gift-wrap')!;
        emit(note, 'hyperion-shipping:data', { information: { delivery_note: 'note' } });
        emit(wrap, 'hyperion-shipping:data', { information: { delivery_note: 'wrap' } });
        await flush();
        const sent = applyFilters('shippingInformation', shippingPayload());
        expect(sent.addressInformation.extension_attributes).toEqual({ delivery_note: 'wrap' });
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"vendor_note" and "vendor_wrap" both set'));
        expect(Object.keys(store.shippingExtensionData.get())).toEqual(['vendor_note', 'vendor_wrap']);
    });

    it('closes the gate until a required entry reports valid, with its own message, and validates on an early press', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({ required: true })]);
        await flush();
        expect(shippingExtensionsValid.get()).toBe(INCOMPLETE);
        const picker = created[0]!;
        emit(picker, 'hyperion-shipping:invalid', { message: 'Pick a locker.' });
        await flush();
        expect(shippingExtensionsValid.get()).toBe('Pick a locker.');
        emit(picker, 'hyperion-shipping:valid');
        await flush();
        expect(shippingExtensionsValid.get()).toBeNull();

        // A new value is not valid until the element says so again.
        emit(picker, 'hyperion-shipping:data', { address: { locker_id: 'L2' } });
        await flush();
        expect(shippingExtensionsValid.get()).toBe(INCOMPLETE);

        requestValidation();
        await flush();
        expect(picker.validate).toHaveBeenCalledTimes(1);
        expect(shippingExtensionsValid.get()).toBeNull();

        validateAnswer = false;
        requestValidation();
        await flush();
        expect(shippingExtensionsValid.get()).toBe(INCOMPLETE);
    });

    it('marks the step ahead of the quote at once and asks for the save after the pause', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await vi.runAllTimersAsync();
        const picker = created[0]!;
        emit(picker, 'hyperion-shipping:data', { address: { locker_id: 'L1' } });
        emit(picker, 'hyperion-shipping:data', { address: { locker_id: 'L2' } });
        expect(store.shippingDirty.get()).toBe(true);
        flow.flushShippingForm.mockClear();
        await vi.advanceTimersByTimeAsync(SHIPPING_EXTENSION_SAVE_DELAY_MS - 1);
        expect(flow.flushShippingForm).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        // After the pause only what the quote still misses goes out.
        expect(flow.flushShippingForm).toHaveBeenCalledTimes(1);
        expect(flow.saveShippingAndEstimateTotals).not.toHaveBeenCalled();

        store.isSavingShipping.set(true);
        emit(picker, 'hyperion-shipping:data', { address: { locker_id: 'L3' } });
        expect(flow.saveShippingAndEstimateTotals).toHaveBeenCalledTimes(1);

        emit(picker, 'hyperion-shipping:rates-refresh');
        expect(flow.estimateShipping).toHaveBeenCalledTimes(1);
    });

    it('ignores events that the element it created did not dispatch, and details of the wrong shape', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await flush();
        const picker = created[0]!;
        const child = document.createElement('span');
        picker.appendChild(child);
        emit(child, 'hyperion-shipping:data', { address: { locker_id: 'X' } });
        emit(picker, 'hyperion-shipping:data', 'not an object');
        emit(picker, 'hyperion-shipping:data', { address: ['not', 'a', 'map'], summary: { label: 'Locker', lines: ['a', 'b', 'c', 'd', 'e'] } });
        await flush();
        expect(store.shippingExtensionData.get().vendor_locker?.value).toEqual({ summary: { label: 'Locker', lines: ['a', 'b', 'c'] } });
    });

    it('puts the override address in place of the typed one, keeps the contact, asks for a separate billing address and gives it all back on null', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await flush();
        const picker = created[0]!;
        emit(picker, 'hyperion-shipping:address-override', {
            address: { firstname: 'Locker', lastname: 'L1', street: ['1 Station Road'], city: 'Calder', postcode: '49629', country_id: 'US' },
            keepContact: true,
            separateBilling: true,
        });
        await flush();
        expect(store.shippingAddressOverride.get()).toMatchObject({ extensionId: 'vendor_locker', keepContact: true, separateBilling: true });
        expect(effectiveShippingAddress(store)).toMatchObject({
            firstname: 'Veronica',
            lastname: 'Costello',
            telephone: '5552293326',
            street: ['1 Station Road'],
            postcode: '49629',
        });
        // The shopper's choice stays; the requests treat it as off.
        expect(store.billingSameAsShipping.get()).toBe(true);
        expect(billingFollowsShipping(store)).toBe(false);
        expect(flow.invalidateBillingSync).toHaveBeenCalledTimes(1);
        expect(flow.estimateShippingNow).toHaveBeenCalledTimes(1);

        emit(picker, 'hyperion-shipping:address-override', { address: null, keepContact: false, separateBilling: false });
        await flush();
        expect(store.shippingAddressOverride.get()).toBeNull();
        expect(effectiveShippingAddress(store)).toBe(TYPED);
        expect(store.billingSameAsShipping.get()).toBe(true);
        expect(billingFollowsShipping(store)).toBe(true);
        expect(flow.invalidateBillingSync).toHaveBeenCalledTimes(2);
        expect(flow.estimateShippingNow).toHaveBeenCalledTimes(2);
    });

    it('gives the typed address back when the entry that replaced it is no longer active', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await flush();
        emit(created[0]!, 'hyperion-shipping:address-override', {
            address: { firstname: 'L', lastname: 'L', street: ['1 Station Road'], city: 'Calder', postcode: '49629', country_id: 'US' },
            keepContact: false,
            separateBilling: false,
        });
        await flush();
        expect(store.shippingAddressOverride.get()).not.toBeNull();
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await flush();
        expect(store.shippingAddressOverride.get()).toBeNull();
        expect(flow.estimateShippingNow).toHaveBeenCalledTimes(2);
    });

    it('keeps the summary lines of a value, at most three, as plain text', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await flush();
        emit(created[0]!, 'hyperion-shipping:data', {
            summary: { label: 'Parcel locker', lines: ['Station Road 1', 'Calder', 'Open 24/7', 'Extra'] },
        });
        await flush();
        expect(store.shippingExtensionData.get().vendor_locker?.value?.summary).toEqual({
            label: 'Parcel locker',
            lines: ['Station Road 1', 'Calder', 'Open 24/7'],
        });
    });

    it('starts from the value the quote holds, else from the draft', async () => {
        restoredShippingExtensions.set({ vendor_note: { information: { delivery_note: 'from the draft' } } });
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([
            entry({ required: true, value: { address: { locker_id: 'Q1' } } }),
            entry({ id: 'vendor_note', match: null, slot: 'after-methods', tag: 'test-delivery-note', sortOrder: 20 }),
        ]);
        await flush();
        const picker = created.find((el) => el.localName === 'test-locker-picker')!;
        const note = created.find((el) => el.localName === 'test-delivery-note')!;
        expect(picker.value).toEqual({ address: { locker_id: 'Q1' } });
        expect(note.value).toEqual({ information: { delivery_note: 'from the draft' } });
        expect(shippingExtensionsValid.get()).toBeNull();
    });

    it('shows a load failure in place, keeps a required entry blocking and loads it again on Retry', async () => {
        let fail = true;
        setModuleImporterForTests(() => {
            if (fail) return Promise.reject(new Error('blocked by CSP'));
            defineAll(['test-pickup-point']);
            return Promise.resolve({});
        });
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        startShippingExtensions([entry({ id: 'vendor_pickup', match: null, slot: 'after-methods', tag: 'test-pickup-point', required: true })]);
        const host = document.createElement('shipping-extension-host') as ShippingExtensionHost;
        host.placement = 'after-methods';
        document.body.appendChild(host);
        await flush();
        await host.updateComplete;
        expect(shippingExtensionsValid.get()).toBe(FAILED);
        expect(host.querySelector('[data-shipping-extension-failed]')?.textContent).toContain(FAILED);
        const retry = host.querySelector('button')!;
        expect(retry.textContent).toBe('Try again');

        fail = false;
        retry.click();
        await flush();
        await host.updateComplete;
        expect(host.querySelector('[data-shipping-extension-failed]')).toBeNull();
        expect(host.querySelector('test-pickup-point')).not.toBeNull();
        expect(shippingExtensionsValid.get()).toBe(INCOMPLETE);
    });

    it('takes the entry the server emits, with a pattern match and the value the quote holds', async () => {
        const emitted = JSON.parse('{"id":"vendor_lockers","match":{"carrier":"vendorcarrier","method":"/locker_.*/"},"slot":"below-method","tag":"test-locker-picker","moduleUrl":"https://shop.example/static/version1/frontend/Magentofullstackdev/hyperion/en_US/Vendor_Lockers/js/hyperion/locker-picker.js","kit":null,"apiVersion":"1","required":true,"sortOrder":10,"options":{"mapZoom":14},"phrases":{"Choose a locker":"Choose a locker"},"value":{"address":{"vendor_locker_id":"L-12"},"summary":{"label":"Locker","lines":["Via Roma 1","Milano","20100"]}}}') as ShippingExtensionConfig;
        store.availableShippingMethods.set([FLAT, rate('vendorcarrier', 'locker_small', 4)]);
        store.selectedShippingMethod.set({ carrier_code: 'vendorcarrier', method_code: 'locker_small' });
        startShippingExtensions([emitted]);
        await flush();
        expect(created[0]?.value).toEqual(emitted.value);
        expect(created[0]?.options).toEqual({ mapZoom: 14 });
        expect(shippingExtensionsValid.get()).toBeNull();
        const sent = applyFilters('shippingInformation', shippingPayload());
        expect(sent.addressInformation.shipping_address).toMatchObject({ extension_attributes: { kept: 1, vendor_locker_id: 'L-12' } });
    });

    it('keeps the validity of a value an element reports again unchanged, also after a switch away and back', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({ required: true })]);
        await flush();
        const picker = created[0]!;
        emit(picker, 'hyperion-shipping:data', { address: { locker_id: 'L1' }, state: { pointId: 'L1' } });
        emit(picker, 'hyperion-shipping:valid');
        await flush();
        expect(shippingExtensionsValid.get()).toBeNull();
        store.shippingDirty.set(false);

        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await flush();
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        await flush();
        // The element reconnects and reports what it holds, without repeating :valid.
        emit(picker, 'hyperion-shipping:data', { address: { locker_id: 'L1' }, state: { pointId: 'L1' } });
        await flush();
        expect(shippingExtensionsValid.get()).toBeNull();
        expect(store.shippingDirty.get()).toBe(false);
        expect(picker.value).toEqual({ address: { locker_id: 'L1' }, state: { pointId: 'L1' } });
    });

    it('asks for the held shipping save once the gate of the selected rate opens', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({ required: true })]);
        await vi.runAllTimersAsync();
        expect(shippingExtensionsValid.get()).toBe(INCOMPLETE);
        flow.flushShippingForm.mockClear();
        emit(created[0]!, 'hyperion-shipping:valid');
        await vi.advanceTimersByTimeAsync(SHIPPING_EXTENSION_SAVE_DELAY_MS);
        expect(shippingExtensionsValid.get()).toBeNull();
        expect(flow.flushShippingForm).toHaveBeenCalledTimes(1);
    });

    /** A first page life: the typed address, a point picked (override recorded), the draft written. Returns the point. */
    async function pickPointThenReload(): Promise<Address> {
        store.isGuest.set(true);
        store.maskedQuoteId.set('masked-1');
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({})]);
        await flush();
        emit(created[0]!, 'hyperion-shipping:data', { address: { locker_id: 'HL-001' } });
        emit(created[0]!, 'hyperion-shipping:address-override', {
            address: { firstname: 'P', lastname: 'P', company: 'Locker HL-001', street: ['1 Station Road'], city: 'Calder', postcode: '49629', country_id: 'US' },
            keepContact: true,
            separateBilling: false,
        });
        await flush();
        writeDraft('default', buildDraft(store, 'masked-1'));
        const point = effectiveShippingAddress(store)!;
        resetShippingExtensionsForTests();
        // The reload: the quote's address (the point) is the store's, no override yet.
        store = createStore();
        setStoreForTests(store);
        store.isGuest.set(true);
        store.maskedQuoteId.set('masked-1');
        store.availableShippingMethods.set([FLAT, LOCKER]);
        store.estimateState.set('ready');
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        return point;
    }

    it('puts the typed address of the draft back after a reload once no extension with a value is active', async () => {
        const point = await pickPointThenReload();
        const hydrated: Address = { ...point };
        store.shippingAddress.set(hydrated);
        startShippingExtensions([entry({ value: { address: { locker_id: 'HL-001' } } })]);
        await flush();
        expect(store.shippingAddress.get()).toBe(hydrated);

        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await flush();
        expect(store.shippingAddress.get()).toMatchObject({ street: ['6146 Honey Bluff Parkway'], postcode: '49628' });
        expect(flow.estimateShippingNow).toHaveBeenCalled();
        sessionStorage.clear();
    });

    it('gives the typed address back in the same turn as the override after a reload, before the editor is drawn again', async () => {
        const point = await pickPointThenReload();
        const hydrated: Address = { ...point };
        store.shippingAddress.set(hydrated);
        startShippingExtensions([entry({ value: { address: { locker_id: 'HL-001' } } })]);
        await flush();
        // The element restored from the quote puts its point in place again.
        emit(created[created.length - 1]!, 'hyperion-shipping:address-override', {
            address: { firstname: 'P', lastname: 'P', company: 'Locker HL-001', street: ['1 Station Road'], city: 'Calder', postcode: '49629', country_id: 'US' },
            keepContact: true,
            separateBilling: false,
        });
        await flush();
        expect(store.shippingAddressOverride.get()).not.toBeNull();
        expect(store.shippingAddress.get()).toBe(hydrated);

        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        // One turn: the pass that drops the override. A render scheduled by
        // the same change runs right after it and must see the typed address.
        await Promise.resolve();
        expect(store.shippingAddressOverride.get()).toBeNull();
        expect(store.shippingAddress.get()).toMatchObject({ street: ['6146 Honey Bluff Parkway'], postcode: '49628' });
        sessionStorage.clear();
    });

    it('gives a customer the saved address of the draft back, selected by its id, in the same turn as the override', async () => {
        const saved: Address = { ...TYPED, id: '1', customer_id: '1' };
        const asCustomer = (): void => {
            store.isGuest.set(false);
            store.quoteId.set('2705');
            store.savedAddresses.set([saved]);
            store.availableShippingMethods.set([FLAT, LOCKER]);
            store.estimateState.set('ready');
        };
        // First page life: saved address 1 selected, a point picked, the draft written.
        asCustomer();
        store.selectedShippingAddressId.set('1');
        store.shippingAddress.set(saved);
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        const pointAddress = { firstname: 'P', lastname: 'P', company: 'Locker HL-001', street: ['1 Station Road'], city: 'Calder', postcode: '49629', country_id: 'US' };
        startShippingExtensions([entry({})]);
        await flush();
        emit(created[0]!, 'hyperion-shipping:data', { address: { locker_id: 'HL-001' } });
        emit(created[0]!, 'hyperion-shipping:address-override', { address: pointAddress, keepContact: true, separateBilling: false });
        await flush();
        writeDraft('default', buildDraft(store, '2705'));
        const point = effectiveShippingAddress(store)!;
        resetShippingExtensionsForTests();

        // The reload: the quote's address (the point, no id) is the store's.
        store = createStore();
        setStoreForTests(store);
        asCustomer();
        store.selectedShippingAddressId.set(null);
        store.shippingAddress.set({ ...point });
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        startShippingExtensions([entry({ value: { address: { locker_id: 'HL-001' } } })]);
        await flush();
        emit(created[created.length - 1]!, 'hyperion-shipping:address-override', { address: pointAddress, keepContact: true, separateBilling: false });
        await flush();
        expect(store.shippingAddressOverride.get()).not.toBeNull();

        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await Promise.resolve();
        expect(store.shippingAddressOverride.get()).toBeNull();
        expect(store.shippingAddress.get()).toBe(saved);
        expect(store.selectedShippingAddressId.get()).toBe('1');
        sessionStorage.clear();
    });

    it('keeps an address written elsewhere since the point was picked', async () => {
        const point = await pickPointThenReload();
        const newer: Address = { ...point, street: ['77 Market Street'], company: null, postcode: '49630' };
        store.shippingAddress.set(newer);
        startShippingExtensions([entry({ value: { address: { locker_id: 'HL-001' } } })]);
        await flush();
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        await flush();
        expect(store.shippingAddress.get()).toBe(newer);
        sessionStorage.clear();
    });

    it('answers synchronously whether the save of a rate is held, for any selection', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        installShippingExtensions([entry({ required: true })]);
        const view = shippingExtensionView.get()!;
        const lockerRate = { carrier_code: 'locker', method_code: 'standard' };
        expect(view.holdsSave(lockerRate)).toBe(true);
        expect(view.holdsSave({ carrier_code: 'flatrate', method_code: 'flatrate' })).toBe(false);
        expect(flow.flushShippingForm).toHaveBeenCalledTimes(1);

        store.selectedShippingMethod.set(lockerRate);
        await flush();
        emit(created[0]!, 'hyperion-shipping:data', { address: { locker_id: 'L1' } });
        emit(created[0]!, 'hyperion-shipping:valid');
        expect(view.holdsSave(lockerRate)).toBe(false);
        emit(created[0]!, 'hyperion-shipping:data', { address: { locker_id: 'L2' } });
        expect(view.holdsSave(lockerRate)).toBe(true);
    });

    it('asks the active element once per order attempt, also when the blocked order reveals what is missing', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        installShippingExtensions([entry({ required: true })]);
        const view = shippingExtensionView.get()!;
        // No element is active for this rate: nothing to ask.
        await expect(view.validate()).resolves.toBe(true);

        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        await flush();
        const picker = created[0]!;
        await expect(view.validate()).resolves.toBe(true);
        expect(picker.validate).toHaveBeenCalledTimes(1);

        validateAnswer = false;
        await expect(view.validate()).resolves.toBe(false);
        expect(picker.validate).toHaveBeenCalledTimes(2);
        // The reveal of that blocked order: no second call on the same press.
        requestValidation();
        await flush();
        expect(picker.validate).toHaveBeenCalledTimes(2);
        // The next blocked press asks again.
        requestValidation();
        await flush();
        expect(picker.validate).toHaveBeenCalledTimes(3);
    });

    it('counts a throwing element as invalid for the order', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        installShippingExtensions([entry({ required: true })]);
        await flush();
        created[0]!.validate = vi.fn(() => { throw new Error('boom'); });
        await expect(shippingExtensionView.get()!.validate()).resolves.toBe(false);
    });

    it('counts an element that does not answer in time as invalid for the order', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        installShippingExtensions([entry({ required: true })]);
        await flush();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        created[0]!.validate = vi.fn(() => new Promise<boolean>(() => undefined)) as unknown as () => boolean;
        const answer = shippingExtensionView.get()!.validate();
        await vi.advanceTimersByTimeAsync(CALL_TIMEOUTS.validate + 1);
        await expect(answer).resolves.toBe(false);
        vi.useRealTimers();
    });

    it('asks the elements once per press when the order step already validated them', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'locker', method_code: 'standard' });
        installShippingExtensions([entry({})]);
        await flush();
        const picker = created[0]!;
        const view = shippingExtensionView.get()!;
        expect(await view.validate()).toBe(true);
        expect(picker.validate).toHaveBeenCalledTimes(1);
        // Something after the shipping step blocked the order: the reveal asks no second time.
        requestValidation();
        await flush();
        expect(picker.validate).toHaveBeenCalledTimes(1);
        requestValidation();
        await flush();
        expect(picker.validate).toHaveBeenCalledTimes(2);
    });

    it('draws nothing while it has nothing to show', async () => {
        store.selectedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        startShippingExtensions([entry({})]);
        const host = document.createElement('shipping-extension-host') as ShippingExtensionHost;
        host.placement = 'after-methods';
        document.body.appendChild(host);
        await flush();
        await host.updateComplete;
        expect(host.children).toHaveLength(0);
    });
});
