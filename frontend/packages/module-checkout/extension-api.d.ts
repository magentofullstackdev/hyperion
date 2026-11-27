// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Public contracts of the Hyperion checkout: what an extension element, a
 * generic extension module and an express button receive from the checkout
 * and may send back, and the shape of the configuration the server emits
 * under `checkoutConfig.hyperion`. API version "1.0-beta": it may change
 * until 1.0.
 *
 * Only plain data, DOM elements, events and promises cross this boundary:
 * nothing of Lit, of the signals or of the stylesheet.
 */

export type Unsubscribe = () => void;
export type Params = Readonly<Record<string, string | number>>;

/* ------------------------------------------------------------------ snapshots */

/** Magento REST address shape, region flattened. */
export interface AddressSnapshot {
    readonly firstname: string;
    readonly lastname: string;
    readonly middlename?: string;
    readonly prefix?: string;
    readonly suffix?: string;
    readonly company?: string;
    readonly street: readonly string[];
    readonly city: string;
    readonly postcode: string;
    readonly country_id: string;
    readonly region?: string;
    readonly region_code?: string;
    readonly region_id?: number;
    readonly telephone?: string;
    readonly vat_id?: string;
    /** attribute code => value */
    readonly custom_attributes?: Readonly<Record<string, unknown>>;
    readonly extension_attributes?: Readonly<Record<string, unknown>>;
}

export interface CartItemSnapshot {
    readonly item_id: number;
    readonly sku: string;
    readonly name: string;
    readonly qty: number;
    readonly product_type: string;
    readonly price: number;          // display currency
    readonly row_total: number;
    readonly base_price: number;     // base currency
    readonly base_row_total: number;
}

export interface MoneyTotals {
    readonly currency: string;       // ISO 4217
    readonly grandTotal: number;
    readonly subtotal: number;
    readonly shipping: number;
    readonly tax: number;
    readonly discount: number;
}

export interface TotalSegment {
    readonly code: string;
    readonly title: string;
    readonly value: number | null;
}

export interface ShippingMethodSnapshot {
    readonly carrier_code: string;
    readonly method_code: string;
    readonly carrier_title: string;
    readonly method_title: string;
    readonly amount: number;         // display currency
    readonly base_amount: number;
}

export interface CheckoutSnapshot {
    readonly isGuest: boolean;
    readonly isVirtual: boolean;
    readonly email: string;
    /** Masked id for guests, numeric id as a string for customers. */
    readonly cartId: string;
    readonly customerId: number | null;
    readonly storeCode: string;
    readonly locale: string;         // it_IT
    readonly currency: { readonly display: string; readonly base: string; readonly rate: number };
    /** Effective addresses: an address override and "same as shipping" are already resolved. */
    readonly shippingAddress: AddressSnapshot | null;
    readonly billingAddress: AddressSnapshot | null;
    /** The selected method; `isSettling` is true until the server confirmed it. */
    readonly shippingMethod: ShippingMethodSnapshot | null;
    readonly paymentMethod: string | null;
    readonly items: readonly CartItemSnapshot[];
    readonly totals: {
        readonly display: MoneyTotals;
        readonly base: MoneyTotals;
        readonly segments: readonly TotalSegment[];
    } | null;
    readonly agreementsAccepted: boolean;
    /** A quote write or refresh is queued or in flight: amounts may still change. */
    readonly isSettling: boolean;
    readonly isPlacingOrder: boolean;
    /** null when the order can be placed, else the first missing piece, translated. */
    readonly blocker: string | null;
}

/* ------------------------------------------------------------------ contexts */

/** Options of `rest()`. */
export interface RequestInit {
    readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    readonly body?: unknown;
    readonly signal?: AbortSignal;
}

/**
 * Options of `storefront()`. `GET` (the default) sends no body; `POST` sends
 * `body` as JSON, `{}` when there is none. Any other method value is sent as
 * POST.
 */
export interface StorefrontInit {
    readonly method?: 'GET' | 'POST';
    readonly body?: unknown;
    readonly signal?: AbortSignal;
}

/** Thrown by rest() and storefront(); passed to orderFailed(). */
export interface CheckoutError extends Error {
    readonly kind: 'network' | 'timeout' | 'unauthorized' | 'not-found' | 'rate-limited'
        | 'server' | 'validation' | 'aborted';
    readonly status: number | null;
    /** Translated, safe to show. Never a raw response body. */
    readonly message: string;
}

/** Shared by every checkout extension element. One stable object per element. */
export interface CheckoutContext {
    readonly apiVersion: string;                       // "1.0-beta"
    snapshot(): CheckoutSnapshot;                      // frozen, a new object after each change
    subscribe(listener: (snapshot: CheckoutSnapshot) => void): Unsubscribe;
    rest<T>(path: string, init?: RequestInit): Promise<T>;
    cartPath(suffix?: string): string;
    /**
     * A JSON controller of your module on the storefront, with the shopper's
     * session. `path` is relative to the store base URL (`vendor/route/action`,
     * a query string allowed; a scheme, `//` or `..` is refused). GET (the
     * default) sends no body; POST sends `init.body` as JSON (`{}` when none)
     * with `Content-Type: application/json` and the form key as the query
     * parameter `form_key`, which the controller must check itself (core's
     * CSRF check lets an AJAX POST through without it). Every request carries
     * `X-Requested-With: XMLHttpRequest`. The answer must be JSON; an empty
     * one resolves with null. A non-2xx answer, or one that is not JSON,
     * rejects with a `CheckoutError` whose message is generic, never the
     * controller's text: `kind` and `status` tell what happened. Return a
     * message the element must show in a 2xx JSON answer.
     */
    storefront<T>(path: string, init?: StorefrontInit): Promise<T>;
    t(source: string, params?: Params): string;
    formatPrice(amount: number, kind?: 'display' | 'base'): string;
    sanitizeHtml(html: string): string;
    /** Once per URL, CSP nonce aware, a failed load is evicted so a retry can succeed. */
    loadScript(url: string, attributes?: Readonly<Record<string, string>>): Promise<void>;
    readonly cspNonce: string | null;
    /** Resolved literal values (colors, font) for hosted field iframes. */
    readonly designTokens: Readonly<Record<string, string>>;
    readonly urls: { readonly base: string; readonly cart: string; readonly checkout: string;
                     readonly success: string };
}

/* ------------------------------------------------------------------ payment */

export interface PaymentMethodInfo { readonly code: string; readonly title: string }

export interface VaultTokenInfo {
    readonly publicHash: string;
    readonly paymentMethodCode: string;                // the vault method code
    readonly details: Readonly<Record<string, unknown>>;  // type, maskedCC, expirationDate, ...
}

/** What a renderer contributes to the order request. */
export interface PaymentData {
    /** Defaults to the row's method code. */
    readonly method?: string;
    readonly po_number?: string;
    readonly additional_data?: Readonly<Record<string, unknown>>;
    /** Merged next to agreement_ids; the key agreement_ids is refused. */
    readonly extension_attributes?: Readonly<Record<string, unknown>>;
}

export type PlaceOrderOutcome =
    | { readonly status: 'placed'; readonly orderId?: number }
    | { readonly status: 'redirect'; readonly url: string }
    | { readonly status: 'canceled' }
    | { readonly status: 'failed'; readonly message?: string };

export type AfterOrderOutcome =
    | { readonly action: 'success' }                                   // default
    | { readonly action: 'redirect'; readonly url: string }
    | { readonly action: 'post'; readonly url: string;
        readonly fields: Readonly<Record<string, string>> }
    | { readonly action: 'reload' };                                   // payment failed, quote restored by the module

export interface PlacedOrder { readonly orderId: number; readonly successUrl: string }

export interface PaymentContext extends CheckoutContext {
    /** Reveal what is missing exactly like the Place Order button; true when nothing blocks. */
    requestCheckoutValidation(): Promise<boolean>;
    /** The standard pipeline (write queue, agreements, reCAPTCHA, latch, afterPlaceOrder). */
    placeOrder(data: PaymentData): Promise<PlaceOrderOutcome>;
    /** Method and billing address on the quote, without an order (redirect first gateways). */
    savePaymentInformation(data: PaymentData): Promise<boolean>;
    /** Re-read totals and methods after the gateway changed the quote server side. */
    refreshTotals(): Promise<void>;
    /** Message in the payment section; null clears it. */
    setError(message: string | null): void;
}

/**
 * The class of every extension element: payment, shipping, checkout slot and
 * express button. An element whose class does not declare `hyperionApi` with
 * the checkout's major is not used (the loader logs a version mismatch).
 */
export interface ExtensionElementClass {
    new (): HTMLElement;
    readonly hyperionApi: string;                      // "1"
}

export interface PaymentElementClass extends ExtensionElementClass {
    new (): PaymentElement;
    readonly hyperionApi: string;                      // "1"
    /** Eager entries only: false hides the row. */
    canMakePayment?(args: { method: PaymentMethodInfo; config: Readonly<Record<string, unknown>>;
        options: Readonly<Record<string, unknown>>; snapshot: CheckoutSnapshot }): boolean | Promise<boolean>;
    /** Vault rows of eager entries: the row title. */
    describeToken?(token: VaultTokenInfo): { label: string };
}

/** Properties are set before the element is connected and never replaced. */
export interface PaymentElement extends HTMLElement {
    context: PaymentContext;
    options: Readonly<Record<string, unknown>>;        // pool entry options + options provider
    method: PaymentMethodInfo;
    config: Readonly<Record<string, unknown>>;         // checkoutConfig.payment[code] ?? {}
    token: VaultTokenInfo | null;                      // vault rows only
    /** Read after connection and after every event of the element; overrides the entry hint. */
    ownsPlaceOrder?: boolean;

    validate?(): boolean | Promise<boolean>;
    /** At Place Order: tokenize, 3DS. A rejection aborts; its message is shown. */
    getPaymentData?(signal: AbortSignal): PaymentData | Promise<PaymentData>;
    /** Replaces the order POST (the order is created elsewhere). */
    placeOrder?(args: { signal: AbortSignal; data: PaymentData }): Promise<PlaceOrderOutcome>;
    /** The order exists. May run long (3DS after order) while it reports busy. */
    afterPlaceOrder?(order: PlacedOrder): AfterOrderOutcome | void | Promise<AfterOrderOutcome | void>;
    /** The order request failed: drop single use state. */
    orderFailed?(error: CheckoutError): void;
}

export interface PaymentEvents {
    'hyperion-payment:ready': CustomEvent<Record<string, never>>;
    'hyperion-payment:valid': CustomEvent<Record<string, never>>;
    'hyperion-payment:invalid': CustomEvent<{ message?: string }>;
    'hyperion-payment:busy': CustomEvent<{ busy: boolean; label?: string }>;
    'hyperion-payment:error': CustomEvent<{ message: string; fatal?: boolean }>;
    'hyperion-payment:request-place-order': CustomEvent<Record<string, never>>;
}

/* ------------------------------------------------------------------ shipping */

export interface ShippingExtensionValue {
    /** Merged into shipping_address.extension_attributes. */
    readonly address?: Readonly<Record<string, unknown>>;
    /** Merged into addressInformation.extension_attributes. */
    readonly information?: Readonly<Record<string, unknown>>;
    /** Shown under the shipping row of the summary. */
    readonly summary?: { readonly label: string; readonly lines: readonly string[] };
    /** Opaque; handed back in `value`, never sent to Magento. */
    readonly state?: unknown;
}

export interface ShippingContext extends CheckoutContext {
    readonly extensionId: string;
}

/** Its class declares `static hyperionApi` (`ExtensionElementClass`). */
export interface ShippingExtensionElement extends HTMLElement {
    context: ShippingContext;
    options: Readonly<Record<string, unknown>>;
    /** The matched selected method; null for entries without `match`. */
    method: ShippingMethodSnapshot | null;
    /** Last reported value, else the server side value: restore from it. */
    value: ShippingExtensionValue | null;
    validate?(): boolean | Promise<boolean>;
}

export interface ShippingEvents {
    /** A new value resets validity: report validity after every data event. */
    'hyperion-shipping:data': CustomEvent<ShippingExtensionValue>;
    'hyperion-shipping:valid': CustomEvent<Record<string, never>>;
    'hyperion-shipping:invalid': CustomEvent<{ message: string }>;
    'hyperion-shipping:address-override': CustomEvent<{
        address: AddressSnapshot | null;               // null gives the address back to the shopper
        keepContact: boolean;                          // keep name and telephone of the typed address
        separateBilling: boolean;                      // force a separate billing address
    }>;
    'hyperion-shipping:rates-refresh': CustomEvent<Record<string, never>>;
}

/* ------------------------------------------------------------------ generic API */

export type CheckoutSlotName =
    | 'after-email' | 'after-shipping-address' | 'after-shipping-methods'
    | 'before-payment-methods' | 'after-agreements' | 'before-place-order'
    | 'summary-after-totals';

/** Its class declares `static hyperionApi` (`ExtensionElementClass`). */
export interface CheckoutSlotElement extends HTMLElement {
    context: CheckoutContext;
    /** The entry's options (static `options` with the options provider's result merged over them): the same values as `api.options`, in a frozen copy of its own. */
    options: Readonly<Record<string, unknown>>;
    /** The standard `Element.slot`, reflected to the attribute: a TypeScript class writes `declare slot: CheckoutSlotName`, never a field. */
    slot: CheckoutSlotName;
    validate?(): boolean | Promise<boolean>;
}

export interface RequestFilters {
    /** Body of POST <cart>/shipping-information. */
    shippingInformation: { addressInformation: Record<string, unknown> };
    /** Body of POST <cart>/payment-information and set-payment-information. */
    paymentInformation: { paymentMethod: Record<string, unknown>; billingAddress?: Record<string, unknown>;
                          email?: string };
    /** Body of POST <cart>/billing-address. */
    billingAddress: { address: Record<string, unknown> };
}

export interface GateHandle { refresh(): void; remove(): void }

/** Handed to the default export of a module of the generic pool. */
export interface CheckoutExtensionApi {
    readonly apiVersion: string;
    readonly name: string;                             // the pool item name
    readonly options: Readonly<Record<string, unknown>>;
    readonly context: CheckoutContext;
    registerSlot(slot: CheckoutSlotName, tag: string, config?: { sortOrder?: number }): Unsubscribe;
    /** Synchronous and pure: receives a deep copy, returns the payload to send. */
    filter<K extends keyof RequestFilters>(
        name: K, fn: (payload: RequestFilters[K], snapshot: CheckoutSnapshot) => RequestFilters[K]
    ): Unsubscribe;
    /** fn returns a translated reason, or null. Evaluated on every snapshot change, on refresh() and at Place Order. */
    registerGate(fn: (snapshot: CheckoutSnapshot) => string | null): GateHandle;
}

export type CheckoutExtensionModule = {
    default(api: CheckoutExtensionApi): void | Promise<void>;
    readonly hyperionApi: string;                      // named export, "1"
};

/** Dispatched on <checkout-app>, bubbling and composed. Details carry no personal data. */
export interface CheckoutEvents {
    'hyperion:checkout:ready': CustomEvent<{ apiVersion: string }>;
    'hyperion:checkout:shipping-method-applied': CustomEvent<{ carrier_code: string; method_code: string }>;
    'hyperion:checkout:payment-method-selected': CustomEvent<{ method: string }>;
    'hyperion:checkout:totals-updated': CustomEvent<{ display: MoneyTotals; base: MoneyTotals }>;
    /** Cancelable: preventDefault() stops the order; pair it with a gate so the shopper is told why. */
    'hyperion:checkout:before-place-order': CustomEvent<{ method: string }>;
    'hyperion:checkout:order-placed': CustomEvent<{ method: string; display: MoneyTotals }>;
    'hyperion:checkout:error': CustomEvent<{ kind: CheckoutError['kind']; section: string }>;
}

/* ------------------------------------------------------------------ address fields */

export interface AddressFieldConfig {
    readonly code: string;
    readonly label: string;                            // translated
    readonly type: 'text' | 'tel' | 'email' | 'date' | 'select' | 'checkbox';
    readonly target: 'custom_attributes' | 'extension_attributes';
    readonly forms: readonly ('shipping' | 'billing')[];
    readonly required: boolean;
    /** RegExp source; must match the whole value. A mismatch blocks, and so does a pattern the browser cannot compile. */
    readonly pattern: string | null;
    readonly maxLength: number | null;
    readonly options: readonly { readonly value: string; readonly label: string }[];
    /** Empty = every country. */
    readonly countries: readonly string[];
    readonly autocomplete: string | null;
    readonly hint: string | null;
    readonly sortOrder: number;                        // position in the form; after the built-in fields by default
}

/* ------------------------------------------------------------------ express (theme side) */

export type ExpressPlacement = 'product' | 'cart' | 'minicart' | 'checkout-top';

export interface CartSummary {
    readonly cartId: string;                           // masked for guests
    readonly isGuest: boolean;
    readonly isVirtual: boolean;
    readonly itemsCount: number;
    readonly display: MoneyTotals;
    readonly base: MoneyTotals;
}

export interface ExpressContext {
    readonly apiVersion: string;
    readonly placement: ExpressPlacement;
    t(source: string, params?: Params): string;
    /**
     * The same contract as `CheckoutContext.storefront()`: a JSON controller
     * of your module, `path` relative to the store base URL; GET without a
     * body, or POST with the JSON body (`{}` when none), `Content-Type:
     * application/json` and the form key as the query parameter `form_key`
     * (check it in the controller); `X-Requested-With: XMLHttpRequest`; a
     * JSON answer (empty: null); a non-2xx answer rejects with a
     * `CheckoutError` whose message is generic.
     */
    storefront<T>(path: string, init?: StorefrontInit): Promise<T>;
    /** Product placement: posts the page's add-to-cart form (options and quantity validated). */
    addCurrentProductToCart(): Promise<{ ok: boolean; message?: string }>;
    /** Fetched on demand, so cached pages stay session free. */
    getCart(): Promise<CartSummary | null>;
    notify(message: string, tone?: 'success' | 'error'): void;
    /** The loading policy. A button must not load an SDK before one of these resolves. */
    whenWanted(): Promise<void>;                       // near the viewport AND the page loaded
    whenEngaged(): Promise<void>;                      // first real interaction with the page
    whenPageIdle(): Promise<void>;
    loadScript(url: string, attributes?: Readonly<Record<string, string>>): Promise<void>;
    readonly cspNonce: string | null;
    /** Same-origin, or a host of the entry's redirect_hosts. */
    redirect(url: string): void;
}

/** Its class declares `static hyperionApi` (`ExtensionElementClass`). */
export interface ExpressElement extends HTMLElement {
    context: ExpressContext;
    options: Readonly<Record<string, unknown>>;
    placement: ExpressPlacement;
}

export interface ExpressEvents {
    'hyperion-express:ready': CustomEvent<Record<string, never>>;
    'hyperion-express:unavailable': CustomEvent<Record<string, never>>;
    'hyperion-express:error': CustomEvent<{ message: string }>;
}

/* ------------------------------------------------------------------ emitted config */

export interface PaymentRendererConfig {
    readonly id: string;                               // pool item name
    readonly method: string | null;                    // exact code, or
    /** RegExp source, validated in PHP; must match the whole value (the method code); one the browser cannot compile matches no method. */
    readonly pattern: string | null;
    readonly type: 'element' | 'redirect' | 'redirect-before-order' | 'form';
    readonly tag: string | null;
    readonly moduleUrl: string | null;                 // null for built-in entries and generic types
    readonly builtin: string | null;                   // first-party chunk id
    readonly apiVersion: string;
    readonly ownsPlaceOrder: boolean;
    readonly eager: boolean;
    readonly awaitsReady: boolean;
    /** false: the method is not written to the quote on selection, only at Place Order. */
    readonly savesOnSelection: boolean;
    readonly sortOrder: number;
    readonly options: Readonly<Record<string, unknown>>;
    readonly phrases: Readonly<Record<string, string>>;   // English source => translation
    readonly redirectHosts: readonly string[];
    readonly redirect: { readonly route: string | null; readonly configPath: string | null } | null;
    readonly fields: readonly PaymentFormField[];         // type "form"
}

export interface PaymentFormField {
    readonly name: string;
    readonly label: string;
    readonly type: 'text' | 'tel' | 'date' | 'select';
    readonly required: boolean;
    /** RegExp source; must match the whole value. A mismatch blocks, and so does a pattern the browser cannot compile. */
    readonly pattern: string | null;
    readonly options: readonly { readonly value: string; readonly label: string }[];
    readonly target: 'additional_data' | 'po_number';
}

export interface ExpressButtonConfig {
    readonly id: string; readonly tag: string; readonly moduleUrl: string | null;
    readonly builtin: string | null; readonly apiVersion: string; readonly reservedHeight: number;
    readonly sortOrder: number; readonly options: Readonly<Record<string, unknown>>;
    readonly phrases: Readonly<Record<string, string>>; readonly redirectHosts: readonly string[];
}

export interface ShippingExtensionConfig {
    readonly id: string;
    /** Each part: an exact code, `*`, or a RegExp source between slashes that must match the whole value (the code). */
    readonly match: { readonly carrier: string | null; readonly method: string | null } | null;
    readonly slot: 'below-method' | 'after-methods' | 'replaces-address';
    readonly tag: string | null; readonly moduleUrl: string | null;
    readonly kit: string | null;                       // reserved for a later release; null in this release
    readonly apiVersion: string; readonly required: boolean; readonly sortOrder: number;
    readonly options: Readonly<Record<string, unknown>>;
    readonly phrases: Readonly<Record<string, string>>;
    readonly value: ShippingExtensionValue | null;     // what the quote already holds
}

export interface CheckoutExtensionConfig {
    readonly name: string; readonly moduleUrl: string | null; readonly builtin: string | null;
    readonly apiVersion: string; readonly required: boolean;
    readonly slots: readonly { readonly slot: CheckoutSlotName; readonly tag: string; readonly sortOrder: number }[];
    readonly options: Readonly<Record<string, unknown>>;
    readonly phrases: Readonly<Record<string, string>>;
}

export interface HyperionExtensionConfig {
    readonly extensionApi: string;                     // "1.0-beta"
    readonly staticOrigins: readonly string[];         // origins other than the page's that may serve modules
    readonly debug: { readonly showUnsupportedPayments: boolean };
    readonly paymentRenderers: readonly PaymentRendererConfig[];
    /**
     * Reserved for an express row inside the checkout application; an empty
     * list in this release. The `checkout-top` buttons render through the
     * theme's express slot above the application, like every other placement.
     */
    readonly expressButtons: readonly ExpressButtonConfig[];
    readonly shippingExtensions: readonly ShippingExtensionConfig[];
    readonly extensions: readonly CheckoutExtensionConfig[];
    readonly addressFields: readonly AddressFieldConfig[];
}
