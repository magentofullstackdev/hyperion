// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Shipping types -- request / response for
 * `/V1/guest-carts/:cartId/estimate-shipping-methods` and
 * `/V1/guest-carts/:cartId/shipping-information`.
 *
 * Reference reading:
 *   vendor/magento/module-checkout/Api/Data/ShippingInformationInterface.php
 *   vendor/magento/module-shipping/Model/Carrier/CarrierInterface.php
 *   vendor/magento/module-checkout/Api/Data/PaymentDetailsInterface.php
 *
 * `estimate-shipping-methods` returns a plain array of `ShippingMethod`;
 * `shipping-information` returns a `PaymentDetails` envelope whose
 * `payment_methods` + `totals` feed the payment step and order summary.
 */
import type { AddressRequestPayload } from './address.js';
import type { ExtensionAttributes } from './common.js';
import type { PaymentMethodConfig } from './payment.js';
import type { Totals } from './totals.js';

export interface ShippingMethod {
    carrier_code: string;
    method_code: string;
    carrier_title: string;
    method_title: string;
    amount: number;
    base_amount: number;
    available: boolean;
    error_message: string;
    price_excl_tax: number;
    price_incl_tax: number;
    /**
     * Carriers that inject custom UI (ShipperHQ, pickup-point pickers)
     * surface data here. The bundle ignores the payload and logs a
     * console warning.
     */
    extension_attributes?: ExtensionAttributes;
}

/**
 * POST /V1/guest-carts/:cartId/estimate-shipping-methods
 *
 * Magento accepts a partial shipping address: only country_id is
 * strictly required by the endpoint, additional fields refine the
 * rate. The checkout asks for rates when the rate key of the address
 * changes (the fields that decide the rates: country, region and
 * postcode unless the configuration names others) and the address is
 * estimable (a country, a postcode and a region where the country
 * requires them), see `store/rate-key.ts`. An edit of any other field
 * asks for nothing, and an answer is applied only while the key it was
 * asked for is still the current one.
 */
export interface EstimateShippingMethodsRequest {
    address: Partial<AddressRequestPayload>;
}

/**
 * POST /V1/guest-carts/:cartId/shipping-information
 *
 * The "hinge" call -- saves the chosen method + addresses on the quote
 * and returns the combined payment-methods + totals payload. The
 * response populates `state.availablePaymentMethods` and
 * `state.totals` in one shot.
 */
export interface ShippingInformationRequest {
    addressInformation: {
        shipping_address: AddressRequestPayload;
        /** Left out while a billing address entered on its own is not complete yet. */
        billing_address?: AddressRequestPayload;
        shipping_method_code: string;
        shipping_carrier_code: string;
        extension_attributes?: ExtensionAttributes;
    };
}

/**
 * Wire-level response shape of `POST shipping-information`.
 * Known as `PaymentDetails` in Magento core.
 */
export interface PaymentDetails {
    payment_methods: readonly PaymentMethodConfig[];
    totals: Totals;
    extension_attributes?: ExtensionAttributes;
}

/**
 * Narrow alias used in local state to avoid carrying the entire
 * ShippingMethod around when all we need is the identifier tuple.
 */
export interface SelectedShippingMethod {
    carrier_code: string;
    method_code: string;
}
