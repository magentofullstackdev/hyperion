// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * A payment context for the renderer tests: every method a spy, the
 * snapshot a plain object the test can change and publish, the first-party
 * services reading a quote the test holds. `mountPaymentElement()` sets the
 * properties before connecting the element, like the host does, and
 * records the events the element dispatches.
 */
import { vi, type Mock } from 'vitest';

import type {
    CheckoutSnapshot,
    PaymentContext,
    PaymentElement,
    PaymentMethodInfo,
    VaultTokenInfo,
} from '../../../../extension-api.js';
import type { CheckoutConfig } from '../../../types/config.js';
import type { FirstPartyQuote, FirstPartyServices } from '../first-party.js';
import enUS from '../../../i18n/en_US.json' with { type: 'json' };

type Json = Record<string, unknown>;

export const SNAPSHOT: CheckoutSnapshot = Object.freeze({
    isGuest: true,
    isVirtual: false,
    email: 'roni_cost@example.com',
    cartId: 'masked-1',
    customerId: null,
    storeCode: 'default',
    locale: 'en_US',
    currency: { display: 'EUR', base: 'EUR', rate: 1 },
    shippingAddress: null,
    billingAddress: null,
    shippingMethod: null,
    paymentMethod: null,
    items: [],
    totals: null,
    agreementsAccepted: true,
    isSettling: false,
    isPlacingOrder: false,
    blocker: null,
});

export interface MockContext {
    context: PaymentContext & { readonly firstParty: FirstPartyServices };
    /** Replace the snapshot and tell the subscribers. */
    publish(patch: Partial<CheckoutSnapshot>): void;
    quote: { current: FirstPartyQuote };
    config: { current: CheckoutConfig };
    spies: {
        requestCheckoutValidation: Mock;
        placeOrder: Mock;
        savePaymentInformation: Mock;
        refreshTotals: Mock;
        setError: Mock;
        loadScript: Mock;
        rest: Mock;
        storefront: Mock;
        holdQuote: Mock;
        sendOrderRequest: Mock;
        resolveLostOrder: Mock;
    };
}

const keysBySource = new Map<string, string>();
for (const [key, value] of Object.entries(enUS as Record<string, string>)) keysBySource.set(key, value);

/** `t()` of the context: a checkout key gives the English catalog's text, a source string itself. */
function translate(source: string, params?: Readonly<Record<string, string | number>>): string {
    const template = keysBySource.get(source) ?? source;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name];
        return value === undefined ? match : String(value);
    });
}

export function createMockContext(options: {
    snapshot?: Partial<CheckoutSnapshot>;
    quote?: Partial<FirstPartyQuote>;
    config?: Json;
} = {}): MockContext {
    let snapshot: CheckoutSnapshot = Object.freeze({ ...SNAPSHOT, ...(options.snapshot ?? {}) });
    const listeners = new Set<(s: CheckoutSnapshot) => void>();
    const quote = { current: { items: [], totals: null, shippingAddress: null, billingAddress: null, ...(options.quote ?? {}) } as FirstPartyQuote };
    const config = { current: (options.config ?? {}) as unknown as CheckoutConfig };
    const spies = {
        requestCheckoutValidation: vi.fn().mockResolvedValue(true),
        placeOrder: vi.fn().mockResolvedValue({ status: 'placed', orderId: 1 }),
        savePaymentInformation: vi.fn().mockResolvedValue(true),
        refreshTotals: vi.fn().mockResolvedValue(undefined),
        setError: vi.fn(),
        loadScript: vi.fn().mockResolvedValue(undefined),
        rest: vi.fn(),
        storefront: vi.fn(),
        holdQuote: vi.fn(async (run: () => Promise<unknown>) => run()),
        sendOrderRequest: vi.fn(async (run: () => Promise<unknown>) => run()),
        resolveLostOrder: vi.fn().mockResolvedValue(false),
    };
    const firstParty: FirstPartyServices = {
        config: () => config.current,
        quote: () => quote.current,
        holdQuote: spies.holdQuote as unknown as FirstPartyServices['holdQuote'],
        sendOrderRequest: spies.sendOrderRequest as unknown as FirstPartyServices['sendOrderRequest'],
        resolveLostOrder: spies.resolveLostOrder as unknown as FirstPartyServices['resolveLostOrder'],
        failureMessage: () => null,
        forgetTypedInput: vi.fn(),
    };
    const context = {
        apiVersion: '1.0-beta',
        snapshot: () => snapshot,
        subscribe: (listener: (s: CheckoutSnapshot) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        rest: spies.rest,
        cartPath: (suffix?: string) => (suffix ? `guest-carts/masked-1/${suffix}` : 'guest-carts/masked-1'),
        storefront: spies.storefront,
        t: translate,
        formatPrice: (amount: number) => `€${amount.toFixed(2)}`,
        sanitizeHtml: (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
        loadScript: spies.loadScript,
        cspNonce: null,
        designTokens: { color: '#111', colorMuted: '#666', colorDanger: '#c00', fontFamily: 'sans-serif', fontSize: '16px' },
        urls: { base: 'http://localhost:3000/', cart: 'http://localhost:3000/checkout/cart/', checkout: 'http://localhost:3000/checkout/', success: 'http://localhost:3000/checkout/onepage/success/' },
        requestCheckoutValidation: spies.requestCheckoutValidation,
        placeOrder: spies.placeOrder,
        savePaymentInformation: spies.savePaymentInformation,
        refreshTotals: spies.refreshTotals,
        setError: spies.setError,
        firstParty,
    } as unknown as MockContext['context'];
    return {
        context,
        publish: (patch) => {
            snapshot = Object.freeze({ ...snapshot, ...patch });
            for (const listener of listeners) listener(snapshot);
        },
        quote,
        config,
        spies,
    };
}

export interface Mounted<T extends PaymentElement> {
    element: T;
    events: Array<{ type: string; detail: unknown }>;
}

/** Create `tag`, set its properties, connect it and record its `hyperion-payment:*` events. */
export function mountPaymentElement<T extends PaymentElement>(
    tag: string,
    props: {
        context: PaymentContext;
        method: PaymentMethodInfo;
        config?: Json;
        options?: Json;
        token?: VaultTokenInfo | null;
    },
    parent: HTMLElement = document.body
): Mounted<T> {
    const element = document.createElement(tag) as T;
    const events: Mounted<T>['events'] = [];
    for (const type of ['ready', 'valid', 'invalid', 'busy', 'error', 'request-place-order']) {
        element.addEventListener(`hyperion-payment:${type}`, (event) => {
            if (event.target === element) events.push({ type, detail: (event as CustomEvent).detail });
        });
    }
    element.context = props.context;
    element.options = Object.freeze({ ...(props.options ?? {}) });
    element.method = Object.freeze({ ...props.method });
    element.config = Object.freeze({ ...(props.config ?? {}) });
    element.token = props.token ?? null;
    parent.appendChild(element);
    return { element, events };
}
