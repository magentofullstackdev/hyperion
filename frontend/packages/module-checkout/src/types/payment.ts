// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Payment types -- request / response for the payment step.
 *
 * Reference reading:
 *   vendor/magento/module-checkout/Api/Data/PaymentInformationInterface.php
 *   vendor/magento/module-payment/Model/Method/AbstractMethod.php
 *   vendor/magento/module-checkout/Model/PaymentInformationManagement.php
 *
 * Payment methods come from two places:
 *   - `checkoutConfig.paymentMethods` and `checkoutConfig.payment` seed
 *     the bundle's initial list (may be empty until shipping is saved).
 *   - The `PaymentDetails.payment_methods` array returned by
 *     `POST shipping-information` is the authoritative list for the
 *     step; it narrows to methods allowed for the chosen shipping
 *     address + carrier.
 */
import type { AddressRequestPayload } from './address.js';
import type { ExtensionAttributes } from './common.js';

/**
 * Configuration descriptor (the "available method" shape). Bundles
 * method-specific data from `checkoutConfig.payment[code]` under
 * `additional_data` when a method reserves an initialisation blob
 * (e.g. Stripe publishable key).
 */
export interface PaymentMethodConfig {
    code: string;
    title: string;
    sort_order?: number;
    instructions?: string;
    /**
     * Free-form per-method config slice from `checkoutConfig.payment`.
     * Known consumers:
     *   - Stripe reads `publishableKey`, `options`.
     *   - Braintree reads `clientToken`, `ccTypesMapper`.
     *   - Offline methods usually have no extra data.
     */
    additional_data?: Record<string, unknown>;
    extension_attributes?: ExtensionAttributes;
}

/**
 * POST /V1/guest-carts/:cartId/payment-information
 *
 * Places the order. `additional_data` is where gateway-specific
 * tokens / nonces land (Stripe payment_method_id, Braintree nonce,
 * PayPal order id, etc.) -- populated by each payment renderer's
 * `beforePlaceOrder()` hook.
 *
 * `email` is required on guest carts (server-side validation). Logged-in
 * carts infer email from the customer session.
 *
 * `paymentMethod.extension_attributes.agreement_ids` carries the accepted
 * agreement IDs. Magento reads them from the payment object
 * (`PaymentInterface::getExtensionAttributes()->getAgreementIds()` in
 * `Magento\CheckoutAgreements\Model\Checkout\Plugin\Validation` and
 * `GuestValidation`); the attribute is declared as `string[]` in
 * `Magento_CheckoutAgreements/etc/extension_attributes.xml`. Present only
 * when the shopper accepted at least one agreement.
 */
export interface PaymentMethodPayload {
    method: string;
    additional_data?: Record<string, unknown>;
    extension_attributes?: {
        agreement_ids?: readonly string[];
        [key: string]: unknown;
    };
}

export interface PaymentInformationRequest {
    email?: string;
    paymentMethod: PaymentMethodPayload;
    billingAddress: AddressRequestPayload;
}

/**
 * `POST payment-information` returns the numeric order ID as a bare
 * number in the body (no wrapper object). When a gateway requires a
 * redirect (paypal_express, 3DS flows), the response shape can
 * differ per module -- we normalise to `PlaceOrderResult`.
 */
export type PlaceOrderResult =
    | { kind: 'ok'; orderId: number }
    | { kind: 'redirect'; url: string }
    | { kind: 'error'; message: string; code?: string };
