// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Minimal typings for the parts of the Braintree JS SDK (braintree-web 3.x,
 * loaded from the CDN as standalone UMD scripts) and of the PayPal JS SDK
 * that the checkout renderers call. Every SDK method is used in its
 * promise form (no callback argument).
 */

export interface BraintreeError extends Error {
    code?: string;
    type?: string;
    details?: {
        invalidFieldKeys?: readonly string[];
        originalError?: unknown;
        [key: string]: unknown;
    };
}

export interface BraintreeClient {
    getVersion?: () => string;
}

export interface BraintreeClientModule {
    create(options: { authorization: string }): Promise<BraintreeClient>;
}

export interface DataCollectorInstance {
    deviceData: string;
    teardown?: () => Promise<void>;
}

export interface DataCollectorModule {
    create(options: { client: BraintreeClient; paypal?: boolean }): Promise<DataCollectorInstance>;
}

export type HostedFieldName = 'number' | 'expirationDate' | 'cvv';

export interface HostedFieldOptions {
    container: HTMLElement;
    placeholder?: string;
}

export interface HostedFieldState {
    isValid: boolean;
    isPotentiallyValid: boolean;
    isEmpty: boolean;
    isFocused: boolean;
}

export interface HostedFieldsCard {
    type: string;
    niceType: string;
}

export interface HostedFieldsEvent {
    emittedBy: HostedFieldName;
    cards: readonly HostedFieldsCard[];
    fields: Partial<Record<HostedFieldName, HostedFieldState>>;
}

export type HostedFieldsEventName =
    | 'validityChange'
    | 'cardTypeChange'
    | 'focus'
    | 'blur'
    | 'empty'
    | 'notEmpty';

export interface HostedFieldsTokenizePayload {
    nonce: string;
    type?: string;
    description?: string;
    details: {
        bin?: string;
        cardType?: string;
        lastFour?: string;
        [key: string]: unknown;
    };
}

export interface HostedFieldsInstance {
    on(event: HostedFieldsEventName, handler: (event: HostedFieldsEvent) => void): void;
    tokenize(options?: Record<string, unknown>): Promise<HostedFieldsTokenizePayload>;
    teardown(): Promise<void>;
    focus(field: HostedFieldName): void;
}

export interface HostedFieldsModule {
    create(options: {
        client: BraintreeClient;
        fields: Partial<Record<HostedFieldName, HostedFieldOptions>>;
        styles?: Record<string, Record<string, string>>;
    }): Promise<HostedFieldsInstance>;
}

export interface ThreeDSecureAddress {
    givenName?: string;
    surname?: string;
    phoneNumber?: string;
    streetAddress?: string;
    extendedAddress?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    countryCodeAlpha2?: string;
}

export interface ThreeDSecureVerifyOptions {
    amount: string;
    nonce: string;
    bin: string;
    email?: string;
    collectDeviceData: boolean;
    challengeRequested: boolean;
    cardAddChallengeRequested: boolean;
    billingAddress: ThreeDSecureAddress;
    additionalInformation: Record<string, unknown>;
    onLookupComplete: (data: unknown, next: () => void) => void;
}

export interface ThreeDSecureVerifyPayload {
    nonce: string;
    liabilityShifted: boolean;
    liabilityShiftPossible: boolean;
}

export interface ThreeDSecureInstance {
    verifyCard(options: ThreeDSecureVerifyOptions): Promise<ThreeDSecureVerifyPayload>;
    teardown(): Promise<void>;
}

export interface ThreeDSecureModule {
    create(options: { client: BraintreeClient; version: 2 }): Promise<ThreeDSecureInstance>;
}

export interface PayPalShippingAddressOverride {
    recipientName: string;
    line1: string;
    line2: string;
    city: string;
    countryCode: string;
    postalCode: string;
    state: string;
}

export interface PayPalLineItem {
    name: string;
    kind: 'debit' | 'credit';
    quantity: string;
    unitAmount: string;
    productCode?: string;
    description?: string;
}

export interface PayPalCreatePaymentOptions {
    flow: 'checkout';
    amount: string;
    currency: string;
    locale?: string;
    displayName?: string;
    requestBillingAgreement?: boolean;
    enableShippingAddress?: boolean;
    shippingAddressEditable?: boolean;
    shippingAddressOverride?: PayPalShippingAddressOverride;
    lineItems?: readonly PayPalLineItem[];
}

export interface PayPalTokenizePayload {
    nonce: string;
    type?: string;
    details: {
        email?: string;
        firstName?: string;
        lastName?: string;
        payerId?: string;
        [key: string]: unknown;
    };
}

export interface PayPalCheckoutInstance {
    loadPayPalSDK(options: Record<string, string | boolean>): Promise<unknown>;
    createPayment(options: PayPalCreatePaymentOptions): Promise<string>;
    tokenizePayment(data: unknown): Promise<PayPalTokenizePayload>;
    teardown(): Promise<void>;
}

export interface PayPalCheckoutModule {
    create(options: { client: BraintreeClient }): Promise<PayPalCheckoutInstance>;
}

export interface BraintreeGlobal {
    client?: BraintreeClientModule;
    hostedFields?: HostedFieldsModule;
    dataCollector?: DataCollectorModule;
    threeDSecure?: ThreeDSecureModule;
    paypalCheckout?: PayPalCheckoutModule;
}

export interface PayPalButtonsOptions {
    fundingSource: string;
    style: { label?: string; color?: string; shape?: string };
    createOrder: () => Promise<string>;
    onApprove: (data: unknown) => Promise<void>;
    onCancel?: (data: unknown) => void;
    onError?: (err: unknown) => void;
}

export interface PayPalButtonsInstance {
    isEligible(): boolean;
    render(container: HTMLElement): Promise<void>;
    close?: () => Promise<void>;
}

export interface PayPalGlobal {
    Buttons(options: PayPalButtonsOptions): PayPalButtonsInstance;
}

declare global {
    interface Window {
        braintree?: BraintreeGlobal;
        paypal?: PayPalGlobal;
    }
}
