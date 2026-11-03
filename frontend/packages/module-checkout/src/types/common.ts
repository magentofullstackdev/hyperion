// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Common type aliases used across the checkout contract.
 *
 * Magento's REST + checkoutConfig serialize most monetary and numeric
 * values as DECIMAL STRINGS (e.g. `"52.0000"`, `"1.0000"`). Mixing these
 * with native `number` values silently breaks arithmetic in JavaScript
 * (`"52.0000" * 0.1` === `5.2`, `"52.0000" + 5` === `"52.00005"`).
 *
 * These aliases are documentation-only at the type level but prevent the
 * ambiguity by making the decimal-string nature visible in every
 * signature. Use `utils/currency.ts` to parse and format.
 */
export type Decimal = string;
export type IsoDate = string;
export type IsoCountry = string;

/**
 * Opaque identifier shapes -- Magento returns most entity IDs as
 * strings even when numeric, so we model them that way unless a
 * specific endpoint documents a typed number return.
 */
export type CustomerId = string;
export type AddressId = string;
export type QuoteId = string;
export type MaskedQuoteId = string;
export type ProductId = string;
export type ItemId = string;
export type RegionId = number;

/**
 * The `extension_attributes` bag that Magento attaches to virtually
 * every entity. Third-party extensions can add arbitrary keys; we
 * deliberately keep this untyped so our contract doesn't need to
 * change when the store installs a new extension.
 *
 * Do NOT structurally narrow this inside the checkout bundle.
 * Consumers that need specific extension attributes should read them
 * defensively via property access.
 *
 * IMPORTANT: Some Magento endpoints serialize an empty
 * `extension_attributes` as `[]` (empty array) rather than `{}` -- the
 * `.total_segments` fixture is proof. Handle both shapes on read.
 */
export type ExtensionAttributes = Record<string, unknown> | readonly unknown[];

/**
 * Magento uses `"0"` and `"1"` string booleans in some serialisations
 * (`quoteData.customer_is_guest`, `quoteItemData[].is_virtual`). This
 * alias marks those fields so utility code can normalise them.
 */
export type StringBool = '0' | '1';
