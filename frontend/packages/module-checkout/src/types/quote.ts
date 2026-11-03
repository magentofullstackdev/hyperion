// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Quote + cart-item shapes.
 *
 * Reference reading:
 *   vendor/magento/module-quote/Api/Data/CartInterface.php
 *   vendor/magento/module-quote/Api/Data/CartItemInterface.php
 *
 * Fixtures: quoteData (52 keys) + quoteItemData[] (55 keys per item).
 * Both are provided by DefaultConfigProvider; the Lit bundle reads
 * only a narrow subset (ID, virtual flag, items count, item display
 * fields) and treats everything else as opaque via the index signature.
 *
 * The duplication between `quoteData.items` and `quoteItemData` is
 * Magento-authentic. The bundle prefers `quoteItemData` for rendering
 * because it's pre-enriched with display fields (`options`, `thumbnail`,
 * `product` summary).
 */
import type {
    Decimal,
    ExtensionAttributes,
    IsoDate,
    ItemId,
    MaskedQuoteId,
    ProductId,
    QuoteId,
    StringBool,
} from './common.js';

export type ProductType =
    | 'simple'
    | 'configurable'
    | 'bundle'
    | 'grouped'
    | 'virtual'
    | 'downloadable'
    | 'giftcard'
    | string;

/**
 * One line-item "option" as rendered in the cart (e.g. size: S,
 * color: Black). checkoutConfig serialises these as a JSON string in
 * older flows and as a structured array in 2.4.x -- we accept both.
 */
export interface QuoteItemOption {
    label: string;
    value: string;
    option_id?: string;
    option_type?: string;
    option_value?: string | string[];
    print_value?: string;
}

/**
 * Product summary nested inside each cart item. The full product
 * payload is much bigger; this interface enumerates only the fields
 * we actually use.
 */
export interface QuoteItemProduct {
    entity_id?: ProductId;
    sku?: string;
    name?: string;
    type_id?: ProductType;
    [key: string]: unknown;
}

export interface CartItem {
    item_id: ItemId;
    quote_id?: QuoteId;
    sku: string;
    name: string;
    qty: number;
    price: Decimal;
    price_incl_tax: Decimal;
    row_total: Decimal;
    row_total_incl_tax: Decimal;
    tax_amount: Decimal;
    discount_amount: Decimal;
    product_id: ProductId;
    product_type: ProductType;
    is_virtual: StringBool;
    thumbnail?: string | null;
    options?: readonly QuoteItemOption[] | string;
    product?: QuoteItemProduct;
    has_children?: boolean;
    parent_item_id?: ItemId | null;
    message?: string;
    redirect_url?: string | null;
    extension_attributes?: ExtensionAttributes;
    [key: string]: unknown;
}

/**
 * The `quoteData` slice of checkoutConfig. The Lit bundle primarily
 * reads `entity_id` (masked for guests, numeric for customers),
 * `is_virtual`, `items_qty`, and currency codes. Everything else is
 * reachable via the index signature but not narrowed.
 */
export interface QuoteData {
    entity_id: QuoteId | MaskedQuoteId;
    is_virtual: 0 | 1 | StringBool;
    items_qty: Decimal;
    items_count: string;
    customer_id: string | null;
    customer_is_guest: StringBool;
    customer_email: string | null;
    grand_total: Decimal;
    base_grand_total: Decimal;
    subtotal: Decimal;
    quote_currency_code: string;
    base_currency_code: string;
    store_id: number;
    coupon_code: string | null;
    applied_rule_ids: string | null;
    created_at: IsoDate;
    updated_at: IsoDate;
    items?: readonly CartItem[];
    extension_attributes?: ExtensionAttributes;
    [key: string]: unknown;
}
