// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const savePaymentMethod = vi.fn();
vi.mock('../../../store/flow-actions.js', () => ({
    flowActions: () => ({ savePaymentMethod }),
}));

import type { PaymentContext } from '../../../../extension-api.js';
import guestFixture from '../../../fixtures/checkoutConfig.guest.json' with { type: 'json' };
import paymentRenderers from '../../../fixtures/payment-renderers.json' with { type: 'json' };
import enUS from '../../../i18n/en_US.json' with { type: 'json' };
import { setCheckoutConfig } from '../../../bootstrap-config.js';
import { resetFlowSelectorsForTests, initFlowSelectors } from '../../../store/flow-selectors.js';
import { createStore, setStoreForTests, type Store } from '../../../store/index.js';
import type { CheckoutConfig } from '../../../types/config.js';
import { setActiveCatalogForTests, t } from '../../../utils/i18n.js';
import '../../payment-method-list.js';
import type { PaymentMethodList } from '../../payment-method-list.js';
import { selectedOwnsPlaceOrder } from '../../place-order-button.js';
import { hostedElement, resetHostedForTests } from '../element-registry.js';
import type { PaymentEntry } from '../entries.js';
import { loadPaymentHost, resetPaymentHostForTests } from '../host.js';
import { READY_TIMEOUT_MS, resetMountForTests } from '../mount.js';
import { resetPaymentRowsForTests, rowState } from '../row-state.js';

const ORIGIN = window.location.origin;

/** What the element saw when it was connected. */
const connections: Array<{ context: unknown; options: unknown; method: unknown; config: unknown; token: unknown }> = [];

class VendorCard extends HTMLElement {
    public static readonly hyperionApi = '1';
    public context!: PaymentContext;
    public options: Readonly<Record<string, unknown>> = {};
    public method!: { code: string; title: string };
    public config: Readonly<Record<string, unknown>> = {};
    public token: unknown = null;
    public ownsPlaceOrder?: boolean;

    public connectedCallback(): void {
        connections.push({ context: this.context, options: this.options, method: this.method, config: this.config, token: this.token });
        if (!this.querySelector('[data-inner]')) {
            const inner = document.createElement('span');
            inner.setAttribute('data-inner', '');
            this.appendChild(inner);
        }
    }

    public emit(name: string, detail: Record<string, unknown> = {}): void {
        this.dispatchEvent(new CustomEvent(`hyperion-payment:${name}`, { bubbles: true, composed: true, detail }));
    }
}
customElements.define('vendor-psp-card', VendorCard);

const ENTRY: PaymentEntry = {
    ...(paymentRenderers[0] as unknown as PaymentEntry),
    id: 'vendor_psp',
    method: 'vendor_psp',
    pattern: null,
    tag: 'vendor-psp-card',
    builtin: null,
    moduleUrl: `${ORIGIN}/static/Vendor_Psp/js/card.js`,
    awaitsReady: true,
    options: { brand: 'Vendor' },
    phrases: { 'Card number': 'Numero di carta' },
};

async function settle(el: PaymentMethodList): Promise<void> {
    for (let i = 0; i < 4; i += 1) {
        await el.updateComplete;
        await Promise.all(Array.from(el.querySelectorAll('payment-method-row'))
            .map((row) => (row as unknown as { updateComplete: Promise<unknown> }).updateComplete));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe('<payment-method-row> as the host of a payment element', () => {
    let store: Store;
    let list: PaymentMethodList;

    beforeAll(async () => {
        await loadPaymentHost();
    });

    beforeEach(async () => {
        setActiveCatalogForTests(enUS as Record<string, string>, 'en_US');
        connections.length = 0;
        setCheckoutConfig({
            ...(guestFixture as unknown as CheckoutConfig),
            payment: { vendor_psp: { publishableKey: 'pk-1' } },
            hyperion: { ...(guestFixture as unknown as CheckoutConfig).hyperion, paymentRenderers: [...paymentRenderers, ENTRY] },
        } as unknown as CheckoutConfig);
        store = createStore();
        setStoreForTests(store);
        resetFlowSelectorsForTests();
        store.appliedShippingMethod.set({ carrier_code: 'flatrate', method_code: 'flatrate' });
        store.availablePaymentMethods.set([{ code: 'checkmo', title: 'Check' }, { code: 'vendor_psp', title: 'Vendor card' }]);
        store.selectedPaymentMethod.set('vendor_psp');
        list = document.createElement('payment-method-list') as PaymentMethodList;
        document.body.appendChild(list);
        await vi.waitFor(() => expect(list.querySelector('vendor-psp-card')).not.toBeNull());
        await settle(list);
    });

    afterEach(() => {
        resetPaymentRowsForTests();
        resetHostedForTests();
        resetMountForTests();
        resetPaymentHostForTests();
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function element(): VendorCard {
        return list.querySelector('vendor-psp-card') as VendorCard;
    }

    it('sets context, options, method, config and token before the element is connected', () => {
        expect(connections).toHaveLength(1);
        const seen = connections[0]!;
        expect(seen.method).toEqual({ code: 'vendor_psp', title: 'Vendor card' });
        expect(seen.options).toEqual({ brand: 'Vendor' });
        expect(seen.config).toEqual({ publishableKey: 'pk-1' });
        expect(seen.token).toBeNull();
        expect(Object.isFrozen(seen.config)).toBe(true);
        expect(typeof (seen.context as PaymentContext).placeOrder).toBe('function');
        expect((seen.context as PaymentContext).t('Card number')).toBe('Numero di carta');
        expect((seen.context as unknown as Record<string, unknown>)['firstParty']).toBeUndefined();
    });

    it('shows a placeholder of a fixed height until the element reports ready', async () => {
        const row = list.querySelector('payment-method-row')!;
        expect(list.querySelector('[data-payment-skeleton]')).not.toBeNull();
        expect(list.querySelector('[data-payment-body]')?.classList.contains('invisible')).toBe(true);

        element().emit('ready');
        await settle(list);

        expect(row.isConnected).toBe(true);
        expect(list.querySelector('[data-payment-skeleton]')).toBeNull();
        expect(list.querySelector('[data-payment-body]')?.classList.contains('invisible')).toBe(false);
    });

    it('offers a retry when the element does not report ready in time, and starts the element over', async () => {
        vi.useFakeTimers();
        resetHostedForTests();
        resetMountForTests();
        resetPaymentRowsForTests();
        list.remove();
        list = document.createElement('payment-method-list') as PaymentMethodList;
        document.body.appendChild(list);
        await vi.waitFor(() => expect(list.querySelector('vendor-psp-card')).not.toBeNull());
        const first = element();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 1);
        vi.useRealTimers();
        await settle(list);
        const error = list.querySelector('[data-payment-load-error]');
        expect(error?.textContent).toContain(t('Hyperion_Checkout::payment_renderer_failed'));
        expect(initFlowSelectors().paymentMethodReady.get()).toBe(false);

        error?.querySelector('button')?.click();
        await vi.waitFor(() => expect(element()).not.toBe(first));
        expect(list.querySelector('[data-payment-load-error]')).toBeNull();
    });

    it('takes events only from the element itself, and follows valid, invalid and busy', async () => {
        const selectors = initFlowSelectors();
        element().querySelector('[data-inner]')?.dispatchEvent(new CustomEvent('hyperion-payment:invalid', {
            bubbles: true, composed: true, detail: { message: 'From a child' },
        }));
        expect(rowState('vendor_psp').valid).toBe(true);

        element().emit('invalid', { message: '  Enter the card number.  ' });
        expect(rowState('vendor_psp')).toMatchObject({ valid: false, message: 'Enter the card number.' });
        expect(selectors.paymentMethodReady.get()).toBe(false);

        element().emit('valid');
        expect(selectors.paymentMethodReady.get()).toBe(true);

        element().emit('ready');
        element().emit('busy', { busy: true, label: 'Checking the card' });
        await settle(list);
        expect(list.querySelector('[data-payment-busy]')?.textContent).toContain('Checking the card');
        element().emit('busy', { busy: false });
        await settle(list);
        expect(list.querySelector('[data-payment-busy]')).toBeNull();
    });

    it('keeps the element and what it reported when another method is selected and back', async () => {
        const kept = element();
        kept.emit('ready');
        kept.emit('invalid', { message: 'Authorize first.' });

        store.selectedPaymentMethod.set('checkmo');
        await settle(list);
        expect(kept.isConnected).toBe(false);

        store.selectedPaymentMethod.set('vendor_psp');
        await settle(list);
        expect(element()).toBe(kept);
        expect(connections).toHaveLength(2);
        expect(connections[1]?.context).toBe(connections[0]?.context);
        expect(rowState('vendor_psp')).toMatchObject({ valid: false, message: 'Authorize first.' });
    });

    it('reads ownsPlaceOrder from the element, else the entry', async () => {
        expect(selectedOwnsPlaceOrder('vendor_psp')).toBe(false);
        element().ownsPlaceOrder = true;
        element().emit('ready');
        expect(selectedOwnsPlaceOrder('vendor_psp')).toBe(true);
    });

    it('shows a message of the element in the payment section', () => {
        element().emit('error', { message: 'The wallet is busy.' });
        expect(store.globalError.get()).toBe('The wallet is busy.');
    });

    it('retires the row for the page lifetime on a fatal error, and drops the selection', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        element().emit('error', { message: 'Gateway unavailable.', fatal: true });
        await settle(list);

        expect(store.selectedPaymentMethod.get()).toBeNull();
        expect(list.querySelector('#hc-pay-vendor_psp')).toBeNull();
        expect(list.querySelector('#hc-pay-checkmo')).not.toBeNull();
        expect(hostedElement('vendor_psp')).not.toBeNull();
    });
});
