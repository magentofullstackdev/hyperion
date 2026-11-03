// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * `checkoutConfig` -- the JSON-island payload parsed at boot.
 *
 * The fixture captures (src/fixtures/) show 58 top-level keys. The
 * Lit bundle reads only the subset below; everything else is
 * reachable through the `[key: string]: unknown` index signature and
 * stays untyped on purpose -- every future Magento patch or third-
 * party extension can add keys without invalidating this contract.
 */
import type { CustomerData } from './customer.js';
import type { ExtensionAttributes } from './common.js';
import type { PaymentMethodConfig } from './payment.js';
import type { QuoteData, CartItem } from './quote.js';
import type { Totals } from './totals.js';

/**
 * Currency formatting spec used by `utils/currency.ts`. Fields come
 * from Magento's `\Magento\Framework\Locale\FormatInterface`.
 * `pattern` is a sprintf with a `%s` slot for the numeric value --
 * e.g. `"€%s"` for EUR, `"$%s"` for USD.
 */
export interface PriceFormat {
    pattern: string;
    precision: number;
    requiredPrecision: number;
    decimalSymbol: string;
    groupSymbol: string;
    groupLength: number;
    integerRequired: boolean;
}

/**
 * One country entry inside the stock `directoryData` array. Absent
 * in our fixtures because the capture cart's store is US-default.
 */
export interface CountryEntry {
    id: string;
    name: string;
    is_region_visible: boolean;
    is_region_required: boolean;
    extension_attributes?: ExtensionAttributes;
}

/**
 * One region entry, nested under directoryData[countryCode].
 */
export interface RegionEntry {
    code: string;
    name: string;
    id: number;
}

/**
 * Magento's `Magento\CheckoutAgreements\Model\AgreementModeOptions`
 * encodes mode as an integer (0 = auto, 1 = manual). The
 * `AgreementsConfigProvider` emits the model data as stored, so the JSON
 * island carries `mode` and `agreementId` as STRINGS ("1", "2");
 * `normaliseCheckoutConfig()` coerces them at boot so the rest of the
 * bundle works with the numbers declared here.
 */
export const AGREEMENT_MODE_AUTO = 0;
export const AGREEMENT_MODE_MANUAL = 1;
export type AgreementMode = typeof AGREEMENT_MODE_AUTO | typeof AGREEMENT_MODE_MANUAL;

/**
 * Enabled agreements block. Shape matches
 * `\Magento\CheckoutAgreements\Model\AgreementsConfigProvider::getAgreementsConfig()`:
 * `content` is already HTML-safe (raw HTML when the agreement is
 * authored as HTML, otherwise pre-escaped + nl2br'd) so the renderer
 * always passes it through `sanitiseHtml`.
 */
export interface AgreementEntry {
    agreementId: number;
    checkboxText: string;
    content: string;
    contentHeight: string;
    mode: AgreementMode;
    name?: string;
}

export interface AgreementsConfig {
    isEnabled: boolean;
    agreements?: readonly AgreementEntry[];
}

/**
 * Hyperion's own namespace (contributed by
 * `Hyperion\Checkout\Model\ConfigProvider`).
 */
export interface HyperionConfig {
    checkoutVersion: string;
    enabled: boolean;
    /**
     * The store's web base URL (scheme, host, install path). The bundle
     * builds its REST and storefront URLs on it; see `utils/base-url.ts`.
     */
    baseUrl?: string;
    /** The locale Magento resolved for the request (`it_IT`, `de_DE`, ...). */
    locale?: string;
    /**
     * The checkout strings of the module's `i18n/en_US.csv` rendered through
     * Magento's `__()`, keyed by the English source string. Merged over the
     * bundle's static catalog by `utils/i18n.ts`.
     */
    translations?: Record<string, string>;
    /** Present only when a PayPal Express method is available. */
    paypalExpress?: PaypalExpressConfig;
    /**
     * Name prefix / middle name / suffix settings
     * (`Magentofullstackdev\HyperionCheckout\Model\Checkout\NameFieldsConfigProvider`).
     * Absent on older config payloads: every field is then hidden.
     */
    nameFields?: NameFieldsConfig;
    /**
     * What the guest's quote already carries
     * (`Magentofullstackdev\HyperionCheckout\Model\Checkout\GuestQuoteConfigProvider`):
     * null for a logged in customer (core's `customerData` is the source
     * there) and on older payloads.
     */
    guestQuote?: GuestQuoteConfig | null;
}

/**
 * A quote address as the provider emits it: flat, every scalar a string or
 * null, `street` a list. `normaliseQuoteAddress()` turns it into an `Address`.
 */
export type QuoteAddressConfig = Readonly<Record<string, unknown>>;

export interface GuestQuoteConfig {
    email: string | null;
    /** The quote shipping address when it has a country; null on a virtual quote. */
    shippingAddress: QuoteAddressConfig | null;
    /**
     * The quote billing address when it was entered on its own (virtual
     * quote, or different from the shipping address); null means "billing
     * same as shipping".
     */
    billingAddress: QuoteAddressConfig | null;
}

/**
 * Core's `selectedShippingMethod`: `ShippingMethodInterface::__toArray()` of
 * the method on the quote, null when none is set.
 */
export interface SelectedShippingMethodConfig {
    carrier_code: string;
    method_code: string;
    [key: string]: unknown;
}

export type FieldVisibility = 'no' | 'opt' | 'req';

/**
 * One of `customer/address/{prefix,suffix}_show`; `options` lists the
 * `*_options` entries, empty for a free text input. The middle name has
 * no option list and is never required.
 */
export interface NameFieldConfig {
    show: FieldVisibility;
    options?: readonly string[];
}

export interface NameFieldsConfig {
    prefix: NameFieldConfig;
    middlename: NameFieldConfig;
    suffix: NameFieldConfig;
}

/**
 * Pay Later message of the payment step. `attributes` are the `data-pp-*`
 * attributes of the message element (style and placement).
 */
export interface PaypalPayLaterConfig {
    enabled: boolean;
    position: string;
    displayAmount: boolean;
    attributes: Readonly<Record<string, string>>;
}

/**
 * `Magentofullstackdev\HyperionCheckout\Model\Checkout\PaypalExpressConfigProvider`.
 * `startUrls` is keyed by method code and lists the available express
 * methods (`paypal_express`, `payflow_express`).
 */
export interface PaypalExpressConfig {
    inContext: boolean;
    sdkUrl: string;
    dataAttributes: Readonly<Record<string, string>>;
    styles: Readonly<Record<string, string>>;
    getTokenUrl: string;
    onAuthorizeUrl: string;
    onCancelUrl: string;
    startUrls: Readonly<Record<string, string>>;
    markImageUrl: string;
    whatIsPaypalUrl: string;
    payLater: PaypalPayLaterConfig | null;
}

/**
 * Cart-level metadata contributed by `Magento_Sales`'s
 * `MinimumOrderConfigProvider`. Both fields are absent when
 * `sales/minimum_order/active=0`. When present and `isMinimumAmountValid`
 * is `false`, Place Order must be blocked with `minimumAmountDescription`
 * surfaced in the global error banner.
 */
export interface CartData {
    isMinimumAmountValid?: boolean;
    minimumAmountDescription?: string;
    [key: string]: unknown;
}

/**
 * `Magento\GiftMessage\Model\GiftMessageConfigProvider`: present only when
 * the module is installed. `orderLevel` is `true` when no message is stored
 * yet, else the stored message; `itemLevel` maps quote item ids to an entry
 * whose `is_available` exists only when the product overrides the store
 * setting, and whose `message` is the stored item message.
 */
export interface StoredGiftMessage {
    gift_message_id?: number | string;
    sender?: string;
    recipient?: string;
    message?: string;
    [key: string]: unknown;
}

export interface GiftMessageItemLevel {
    is_available?: boolean;
    message?: StoredGiftMessage;
}

export interface GiftMessageConfig {
    orderLevel?: true | StoredGiftMessage;
    itemLevel?: true | Readonly<Record<string, GiftMessageItemLevel>>;
}

/** One `<code>` of `zip_codes.xml`: a PCRE pattern (also valid as a JS RegExp) and an example. */
export interface PostcodePattern {
    pattern: string;
    example: string;
}

/** `shipping/shipping_policy/*`, emitted by core's DefaultConfigProvider (content already nl2br'd). */
export interface ShippingPolicyConfig {
    isEnabled: boolean;
    shippingPolicyContent: string;
}

/**
 * The top-level checkoutConfig shape. Fields used by the Lit bundle
 * are typed; everything else (58 total keys) is reachable through the
 * index signature and stays as `unknown`.
 */
export interface CheckoutConfig {
    hyperion: HyperionConfig;

    storeCode: string;
    /** Top level alternatives to `hyperion.locale` / `hyperion.translations`. */
    locale?: string;
    translations?: Record<string, string>;
    websiteCode: string;
    formKey: string;
    staticBaseUrl: string;
    cartUrl: string;
    checkoutUrl: string;
    defaultSuccessPageUrl: string;
    registerUrl: string;
    forgotPasswordUrl: string;

    defaultCountryId: string;
    defaultRegionId: string | null;
    defaultPostcode: string | null;
    originCountryCode: string;

    priceFormat: PriceFormat;
    basePriceFormat: PriceFormat;

    isCustomerLoggedIn: boolean;
    isGuestCheckoutAllowed: boolean;
    isCustomerLoginRequired: boolean;
    displayBillingOnPaymentMethod: boolean;
    reloadOnBillingAddress: boolean;

    customerData: CustomerData;
    quoteData: QuoteData;
    quoteItemData: readonly CartItem[];
    totalsData: Totals;

    paymentMethods: readonly PaymentMethodConfig[];
    /**
     * Per-method additional config (keyed by method code). Includes
     * Stripe `publishableKey`, Braintree `clientToken`, offline
     * instructions, etc. The `payment.ccform` entry is special-purpose
     * for CC gateways and not used directly by our bundle.
     */
    payment: Readonly<Record<string, Record<string, unknown>>>;

    activeCarriers: readonly string[];
    checkoutAgreements: AgreementsConfig;
    /** The shipping method on the quote (core's DefaultConfigProvider), null when none. */
    selectedShippingMethod?: SelectedShippingMethodConfig | null;

    giftMessage?: GiftMessageConfig;
    isOrderLevelGiftOptionsEnabled?: boolean;
    isItemLevelGiftOptionsEnabled?: boolean;

    shippingPolicy?: ShippingPolicyConfig;

    /** `Magento\Weee\Model\WeeeConfigProvider` (Fixed Product Tax). */
    isWeeeEnabled?: boolean;
    isIncludedInSubtotal?: boolean;

    /**
     * Country -> postcode patterns (`Magento\Directory\Model\Country\Postcode\Config`,
     * from `zip_codes.xml`): `postCodes.US.pattern_1 = { example, pattern }`.
     * A country without an entry accepts any postcode.
     */
    postCodes: Readonly<Record<string, Readonly<Record<string, PostcodePattern>>>>;

    /**
     * Tax display flags from `tax/cart_display/*`.
     */
    isFullTaxSummaryDisplayed: boolean;
    isZeroTaxDisplayed: boolean;
    includeTaxInGrandTotal: boolean;

    /**
     * Tax display modes from `Magento\Tax\Model\TaxConfigProvider`:
     * how the review step shows item prices, subtotal and shipping, and
     * how the shipping step prices the methods.
     */
    reviewItemPriceDisplayMode?: 'excluding' | 'including' | 'both';
    reviewTotalsDisplayMode?: 'excluding' | 'including' | 'both';
    reviewShippingDisplayMode?: 'excluding' | 'including' | 'both';
    isDisplayShippingPriceExclTax?: boolean;
    isDisplayShippingBothPrices?: boolean;

    /**
     * `Magento_Sales::MinimumOrderConfigProvider` payload. Optional --
     * absent when the feature is disabled.
     */
    cartData?: CartData;

    /** Index signature for every other Magento / extension key. */
    [key: string]: unknown;
}
