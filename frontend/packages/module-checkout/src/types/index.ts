// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Barrel export for `src/types/`. Import from `@/types` to pick any
 * domain interface up.
 */
export type {
    Decimal,
    IsoDate,
    IsoCountry,
    CustomerId,
    AddressId,
    QuoteId,
    MaskedQuoteId,
    ProductId,
    ItemId,
    RegionId,
    ExtensionAttributes,
    StringBool,
} from './common.js';
export type {
    Region,
    CustomAttribute,
    Address,
    AddressRequestPayload,
} from './address.js';
export type {
    ProductType,
    QuoteItemOption,
    QuoteItemProduct,
    CartItem,
    QuoteData,
} from './quote.js';
export type {
    TotalSegment,
    Totals,
} from './totals.js';
export type {
    ShippingMethod,
    SelectedShippingMethod,
    EstimateShippingMethodsRequest,
    ShippingInformationRequest,
    PaymentDetails,
} from './shipping.js';
export type {
    PaymentMethodConfig,
    PaymentInformationRequest,
    PlaceOrderResult,
} from './payment.js';
export type {
    CustomerData,
    CustomerDataGuest,
    CustomerDataAuthenticated,
} from './customer.js';
export { isAuthenticatedCustomer } from './customer.js';
export type {
    PriceFormat,
    CountryEntry,
    RegionEntry,
    AgreementEntry,
    AgreementsConfig,
    HyperionConfig,
    InitialStateConfig,
    InitialQuoteAddressesConfig,
    MinimumOrderConfig,
    ShippingPreselect,
    CheckoutConfig,
} from './config.js';
export type { CheckoutErrorKind, MagentoWireError } from './errors.js';
export type { CheckoutState, EstimateState, OrderOutcomeState, OrderStep } from './state.js';
export type {
    SectionId,
    SectionStatus,
    SectionStatusMap,
    SectionStatusSource,
} from './section.js';
export type {
    CaptchaConfig,
    CaptchaFormId,
    CaptchaFormState,
    CaptchaStateMap,
    RecaptchaAction,
    RecaptchaActionConfig,
    RecaptchaConfig,
    RecaptchaType,
} from './captcha.js';
