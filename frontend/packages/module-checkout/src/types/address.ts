// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Address types -- aligned to `Magento\Customer\Api\Data\AddressInterface`.
 *
 * Reference reading (do not modify):
 *   vendor/magento/module-customer/Api/Data/AddressInterface.php
 *   vendor/magento/module-customer/Api/Data/RegionInterface.php
 *
 * Shape captured from a Magento checkoutConfig
 * (checkoutConfig.customer.json -> customerData.addresses["1"]).
 *
 * Key gotchas this typing captures:
 *   - `street` is `string[]` with 1-4 entries (never a scalar string),
 *     driven by `customer/address/street_lines` admin config.
 *   - `region_id` at the top level is a STRING (e.g. `"97"`), while the
 *     nested `region.region_id` is a NUMBER (e.g. `97`). That mismatch
 *     is Magento-authentic; we model both shapes.
 *   - `region` is either an embedded object (what checkoutConfig ships)
 *     or absent (what some REST payloads ship). `Partial<Region>` models
 *     the optional case; components should prefer `region.region`
 *     (string label) when present, falling back to the free-text
 *     `region` sibling.
 *   - `custom_attributes` is an array of `{attribute_code, value}`
 *     pairs, treated as unknown.
 */
import type {
    AddressId,
    CustomerId,
    ExtensionAttributes,
    RegionId,
} from './common.js';

export interface Region {
    region: string;
    region_code: string;
    region_id: RegionId;
}

export interface CustomAttribute {
    attribute_code: string;
    value: string | string[];
}

/**
 * Full customer-address shape as served by Magento REST and by
 * DefaultConfigProvider. Every optional field below is either null or
 * missing in real fixture data; the `?` marker picks the shape up.
 */
export interface Address {
    id?: AddressId;
    customer_id?: CustomerId;
    region?: Partial<Region> | null;
    region_id?: string | null;
    country_id: string;
    street: readonly string[];
    company?: string | null;
    telephone: string;
    fax?: string | null;
    postcode?: string | null;
    city: string;
    firstname: string;
    lastname: string;
    middlename?: string | null;
    prefix?: string | null;
    suffix?: string | null;
    vat_id?: string | null;
    default_shipping?: boolean;
    default_billing?: boolean;
    custom_attributes?: readonly CustomAttribute[];
    extension_attributes?: ExtensionAttributes;
    /** Human-readable single-line render, included in checkoutConfig. */
    inline?: string;
    email?: string;
    /** Distinguishes new-from-form addresses from saved-address picks. */
    save_in_address_book?: boolean;
}

/**
 * The quote address Magento accepts in `shipping-information`,
 * `billing-address` and `payment-information` requests
 * (`Magento\Quote\Api\Data\AddressInterface`): an allowlist of the fields
 * the checkout knows. `customer_address_id` identifies a saved address of
 * the current customer (core keeps its ownership checks); `vat_id`, `fax`,
 * `custom_attributes` and `extension_attributes` travel as entered, so
 * validators and extensions that read them receive the values.
 */
export interface AddressRequestPayload {
    country_id: string;
    region?: string;
    region_id?: number;
    region_code?: string;
    street: readonly string[];
    telephone?: string;
    postcode: string;
    city: string;
    firstname: string;
    lastname: string;
    prefix?: string;
    middlename?: string;
    suffix?: string;
    company?: string;
    fax?: string;
    vat_id?: string;
    email?: string;
    /** 1 or 0 for a new address; absent for a saved one. */
    save_in_address_book?: number;
    customer_id?: number;
    customer_address_id?: number;
    custom_attributes?: readonly CustomAttribute[];
    extension_attributes?: ExtensionAttributes;
}
