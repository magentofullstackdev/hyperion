// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Customer shapes -- logged-in customer payload from checkoutConfig.
 *
 * Reference reading:
 *   vendor/magento/module-customer/Api/Data/CustomerInterface.php
 *
 * On guest sessions `checkoutConfig.customerData` is the empty ARRAY
 * `[]` (!) rather than `null` or an empty object -- we model the
 * guest-vs-customer boundary with a discriminated union
 * `CustomerDataGuest | CustomerDataAuthenticated`.
 */
import type {
    CustomerId,
    ExtensionAttributes,
    IsoDate,
} from './common.js';
import type { Address } from './address.js';

export interface CustomerDataGuest {
    readonly length: 0;
}

export interface CustomerDataAuthenticated {
    id: CustomerId;
    email: string;
    firstname: string;
    lastname: string;
    middlename: string | null;
    prefix: string | null;
    suffix: string | null;
    dob: string | null;
    gender: string | null;
    taxvat: string | null;
    group_id: string;
    store_id: string;
    website_id: string;
    created_at: IsoDate;
    updated_at: IsoDate;
    created_in: string;
    disable_auto_group_change: string;
    confirmation: string | null;
    /**
     * Keyed by address ID as a string. Magento serialises as an
     * object, not an array. Iterate with `Object.values()`.
     */
    addresses: Readonly<Record<string, Address>>;
    default_billing: string | null;
    default_shipping: string | null;
    extension_attributes?: ExtensionAttributes;
}

export type CustomerData = CustomerDataGuest | CustomerDataAuthenticated;

export function isAuthenticatedCustomer(
    data: CustomerData
): data is CustomerDataAuthenticated {
    return !Array.isArray(data) && 'id' in data;
}
