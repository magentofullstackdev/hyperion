// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Types of `@magentofullstackdev/hyperion-checkout/testing`. Every shape
 * comes from the public contracts in `extension-api.d.ts`.
 */
import type {
    CartSummary,
    CheckoutContext,
    CheckoutError,
    CheckoutSlotName,
    CheckoutSnapshot,
    ExpressContext,
    ExpressPlacement,
    PaymentContext,
    PaymentMethodInfo,
    RequestInit,
    ShippingContext,
    ShippingExtensionValue,
    ShippingMethodSnapshot,
    StorefrontInit,
    VaultTokenInfo,
} from '../extension-api.js';

/** The version of the public extension contracts this kit mirrors. */
export declare const API_VERSION: '1.0-beta';
/** The major an element declares in `static hyperionApi`. */
export declare const API_MAJOR: '1';
/** Base URL of every mock context (`https://shop.example/`). */
export declare const MOCK_BASE_URL: string;

/** Plain objects merge key by key; arrays and null replace. */
export type DeepPartial<T> = T extends readonly unknown[]
    ? T
    : T extends object
        ? { -readonly [K in keyof T]?: DeepPartial<T[K]> }
        : T;

export type SnapshotOverrides = DeepPartial<CheckoutSnapshot>;

/** A frozen snapshot: a guest with a US address, one item, flat rate shipping, merged with `overrides`. */
export declare function createSnapshot(overrides?: SnapshotOverrides): CheckoutSnapshot;

/** A recording function. */
export type Spy<F extends (...args: never[]) => unknown> = F & {
    /** The argument list of every call, oldest first. */
    readonly calls: Parameters<F>[];
    /** The function that answers the calls now. */
    readonly implementation: F;
    /** Answer the next calls with `next`. */
    implement(next: F): void;
    reset(): void;
};

export declare function createSpy<F extends (...args: never[]) => unknown>(implementation: F): Spy<F>;

/** A public `CheckoutError` built like the checkout's own. */
export declare function createCheckoutError(
    kind: CheckoutError['kind'], message: string, status?: number | null
): CheckoutError;

export declare function isPlainObject(value: unknown): value is Record<string, unknown>;

/** The small sanitizer of the mocks (drops active elements, handlers, `javascript:` URLs). */
export declare function mockSanitizeHtml(html: string): string;

/** A recorded call; a `storefront()` call is recorded as the request the checkout sends (`StorefrontInit`). */
export interface RecordedRequest<I = RequestInit> {
    readonly path: string;
    readonly init: I;
}

/** A `storefront()` call as sent: `{ method: 'GET' }`, or `{ method: 'POST', body }` with `{}` for a missing body. */
export type RecordedStorefrontRequest = RecordedRequest<StorefrontInit>;

export type RequestMatcher<I = RequestInit> = string | RegExp | ((path: string, init: I | undefined) => boolean);
/** A value, an `Error` (the call rejects with it) or a function of the request. */
export type RequestAnswer = unknown;

export interface MockControls {
    readonly calls: {
        readonly rest: RecordedRequest[];
        readonly storefront: RecordedStorefrontRequest[];
        readonly loadScript: [url: string, attributes?: Readonly<Record<string, string>>][];
    };
    /** The newest matching answer wins; an unanswered call rejects with kind `not-found`. */
    answerRest(matcher: RequestMatcher, answer: RequestAnswer): void;
    answerStorefront(matcher: RequestMatcher<StorefrontInit>, answer: RequestAnswer): void;
    /** Merge into the current snapshot and notify every subscriber. */
    setSnapshot(next: SnapshotOverrides): CheckoutSnapshot;
    subscriberCount(): number;
}

export type MockCheckoutContext = CheckoutContext & MockControls & {
    loadScript: Spy<CheckoutContext['loadScript']>;
};

export type MockPaymentContext = PaymentContext & MockControls & {
    loadScript: Spy<CheckoutContext['loadScript']>;
    requestCheckoutValidation: Spy<PaymentContext['requestCheckoutValidation']>;
    placeOrder: Spy<PaymentContext['placeOrder']>;
    savePaymentInformation: Spy<PaymentContext['savePaymentInformation']>;
    refreshTotals: Spy<PaymentContext['refreshTotals']>;
    setError: Spy<PaymentContext['setError']>;
    /** Every message passed to `setError()`. */
    readonly errors: (string | null)[];
};

export type MockShippingContext = ShippingContext & MockControls & {
    loadScript: Spy<CheckoutContext['loadScript']>;
};

export type MockExpressContext = ExpressContext & {
    readonly calls: {
        readonly storefront: RecordedStorefrontRequest[];
        readonly loadScript: [url: string, attributes?: Readonly<Record<string, string>>][];
    };
    answerStorefront(matcher: RequestMatcher<StorefrontInit>, answer: RequestAnswer): void;
    addCurrentProductToCart: Spy<ExpressContext['addCurrentProductToCart']>;
    getCart: Spy<ExpressContext['getCart']>;
    notify: Spy<ExpressContext['notify']>;
    loadScript: Spy<ExpressContext['loadScript']>;
    redirect: Spy<ExpressContext['redirect']>;
    /** Every URL passed to `redirect()`. */
    readonly redirects: string[];
    /** With `loading: 'manual'`: resolve one of the loading policy promises. */
    release(name: 'wanted' | 'engaged' | 'idle'): void;
};

/** `snapshot` shapes the first snapshot, `phrases` feeds `t()`, any other key replaces that member. */
export type MockContextOverrides<C> = {
    snapshot?: SnapshotOverrides;
    phrases?: Readonly<Record<string, string>>;
} & Partial<Omit<C, 'apiVersion' | 'snapshot'>>;

export declare function createMockCheckoutContext(overrides?: MockContextOverrides<CheckoutContext>): MockCheckoutContext;
export declare function createMockPaymentContext(overrides?: MockContextOverrides<PaymentContext>): MockPaymentContext;
export declare function createMockShippingContext(
    overrides?: MockContextOverrides<ShippingContext> & { extensionId?: string }
): MockShippingContext;
export declare function createMockExpressContext(overrides?: {
    placement?: ExpressPlacement;
    phrases?: Readonly<Record<string, string>>;
    loading?: 'immediate' | 'manual';
    cart?: CartSummary | null;
} & Partial<Omit<ExpressContext, 'apiVersion' | 'placement'>>): MockExpressContext;

/* ------------------------------------------------------------------ mounting */

export declare const CONTRACT_EVENTS: readonly string[];

export interface RecordedEvent {
    readonly type: string;
    readonly detail: unknown;
    readonly bubbles: boolean;
    readonly composed: boolean;
    readonly cancelable: boolean;
    /** A listener on the host saw it (it left the element's shadow root). */
    readonly reachedHost: boolean;
    readonly event: Event;
}

export interface EventRecorder {
    readonly all: RecordedEvent[];
    of(type: string): RecordedEvent[];
    last(type: string): RecordedEvent | null;
    /** The first event of `type`, already recorded or still to come; rejects after `timeoutMs` (2000). */
    waitFor(type: string, timeoutMs?: number): Promise<RecordedEvent>;
    /** Start listening inside the element's open shadow root (the mount helpers call it after connecting). */
    watchShadow(): void;
    clear(): void;
    stop(): void;
}

export declare function recordEvents(element: HTMLElement, host: HTMLElement, names?: readonly string[]): EventRecorder;

/** A `<checkout-app>` stand-in appended to `document.body`. */
export declare function createCheckoutHost(): HTMLElement;

export interface Mounted<E extends HTMLElement, C> {
    readonly element: E;
    readonly host: HTMLElement;
    readonly events: EventRecorder;
    readonly context: C;
    /** Remove the element, and the host when the helper created it. */
    unmount(): void;
}

/*
 * The mount helpers set the properties before the element is connected, as
 * the checkout does. Each throws for a tag that is not defined, and for one
 * whose class declares no `static hyperionApi` with the supported major:
 * the checkout and the storefront would not use such an element, whatever
 * its kind.
 */

export declare function mountPaymentElement<E extends HTMLElement = HTMLElement, C = MockPaymentContext>(tag: string, init?: {
    method?: PaymentMethodInfo;
    config?: Readonly<Record<string, unknown>>;
    options?: Readonly<Record<string, unknown>>;
    token?: VaultTokenInfo | null;
    context?: C;
    host?: HTMLElement;
}): Mounted<E, C>;

export declare function mountShippingElement<E extends HTMLElement = HTMLElement, C = MockShippingContext>(tag: string, init?: {
    /** Defaults to the shipping method of the context's snapshot. */
    method?: ShippingMethodSnapshot | null;
    value?: ShippingExtensionValue | null;
    options?: Readonly<Record<string, unknown>>;
    context?: C;
    host?: HTMLElement;
}): Mounted<E, C>;

export declare function mountSlotElement<E extends HTMLElement = HTMLElement, C = MockCheckoutContext>(tag: string, init?: {
    slot?: CheckoutSlotName;
    options?: Readonly<Record<string, unknown>>;
    context?: C;
    host?: HTMLElement;
}): Mounted<E, C>;

export declare function mountExpressElement<E extends HTMLElement = HTMLElement, C = MockExpressContext>(tag: string, init?: {
    placement?: ExpressPlacement;
    options?: Readonly<Record<string, unknown>>;
    context?: C;
    host?: HTMLElement;
}): Mounted<E, C>;

/* ------------------------------------------------------------------ contract suites */

export declare const PAYMENT_DATA_KEYS: readonly string[];
export declare const SHIPPING_VALUE_KEYS: readonly string[];

/** What is wrong with a `getPaymentData()` answer; empty when it is valid. */
export declare function paymentDataProblems(data: unknown): string[];
/** What is wrong with a `hyperion-shipping:data` detail; empty when it is valid. */
export declare function shippingValueProblems(detail: unknown): string[];

/** The `it` and `expect` of the caller's test runner. */
export interface ContractRunner {
    it(name: string, fn: () => unknown): unknown;
    expect(actual: unknown): { toEqual(expected: unknown): unknown };
}

export interface PaymentContractOptions {
    method?: PaymentMethodInfo;
    config?: Readonly<Record<string, unknown>>;
    options?: Readonly<Record<string, unknown>>;
    token?: VaultTokenInfo | null;
    /** The pool entry declares `awaits_ready`: the element must dispatch `hyperion-payment:ready`. */
    awaitsReady?: boolean;
    snapshot?: SnapshotOverrides;
    context?: MockContextOverrides<PaymentContext>;
    /** Limit for ready, `validate()` and `getPaymentData()`; 5000 ms by default. */
    timeoutMs?: number;
    /** Fills the element (a test card number) before `getPaymentData()`. */
    prepare?(element: HTMLElement): unknown;
}

export interface ShippingContractOptions {
    method?: ShippingMethodSnapshot | null;
    /** A value to restore from; `{ state: { restored: true } }` by default. */
    value?: ShippingExtensionValue | null;
    options?: Readonly<Record<string, unknown>>;
    snapshot?: SnapshotOverrides;
    context?: MockContextOverrides<ShippingContext> & { extensionId?: string };
    /** Drives the element until it reports a value (search, pick a point). */
    interact?(element: HTMLElement): unknown;
    /** The caller's own check of a restored element. */
    expectRestored?(element: HTMLElement): unknown;
}

export declare function runPaymentRendererContract(
    args: ContractRunner & { tag: string; options?: PaymentContractOptions }
): void;

export declare function runShippingExtensionContract(
    args: ContractRunner & { tag: string; options?: ShippingContractOptions }
): void;
