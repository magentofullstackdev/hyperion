// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

/**
 * Tailwind configuration of the page type critical sheets.
 *
 * A critical sheet is the theme stylesheet reduced to what the fold of ONE
 * page type can use: a second Tailwind pass whose `content` is the list of
 * templates, layout files and PHP renderers that print the markup above the
 * fold of that page type. The list, not a store's rendered page, is the
 * extraction mechanism, so the result is the same on every machine (CI
 * rebuilds the committed assets and compares them) and covers every store
 * that renders those templates, whatever its content.
 *
 * The sheet is inlined into every HTML response of its page type; the theme
 * stylesheet then loads without blocking (HyperionCore::head/scripts.phtml).
 * A file belongs in a list when a styled element of the fold needs it; the
 * gate is `e2e/pw-critical.mjs`, which paints the fold with the critical
 * sheet alone and with the full sheet and compares the pixels. Something
 * missing shows up there as a difference, something superfluous only as
 * bytes in every response of the type.
 *
 * Paths are relative to this directory (`content.relative`).
 */
import type { Config } from 'tailwindcss';
import hyperionPreset from '@magentofullstackdev/hyperion-shared/tailwind/preset';

const REPO = '../../../../../..';
const THEME = `${REPO}/app/design/frontend/Magentofullstackdev/hyperion`;
const MODULES = `${REPO}/app/code/Magentofullstackdev`;
const SRC = '../..';

/**
 * The page chrome every typed page paints first: header, menus, breadcrumbs,
 * title, and the footer, which is inside the fold of a short page (a CMS
 * page of a few paragraphs, a category with a handful of products).
 */
export const FOLD_COMMON: string[] = [
    `${THEME}/Magento_Theme/templates/root.phtml`,
    `${THEME}/Magento_Theme/templates/messages.phtml`,
    `${THEME}/Magento_Theme/templates/html/header.phtml`,
    `${THEME}/Magento_Theme/templates/html/topmenu.phtml`,
    `${THEME}/Magento_Theme/templates/html/breadcrumbs.phtml`,
    `${THEME}/Magento_Theme/templates/html/title.phtml`,
    `${THEME}/Magento_Theme/templates/html/notifications.phtml`,
    `${THEME}/Magento_Theme/templates/html/footer.phtml`,
    `${THEME}/Magento_Theme/layout/default.xml`,
    `${THEME}/Magento_Theme/page_layout/*.xml`,
    `${THEME}/Magento_Newsletter/templates/subscribe.phtml`,
    `${THEME}/Magento_Store/templates/switch/*.phtml`,
    `${THEME}/Magento_ReCaptchaFrontendUi/templates/*.phtml`,
    `${MODULES}/HyperionNavigation/Block/**/*.php`,
    `${MODULES}/HyperionMegaMenu/Model/**/Renderer.php`,
    `${MODULES}/HyperionCustomer/view/frontend/templates/welcome/fragment.phtml`,
    `${MODULES}/HyperionCustomer/view/frontend/templates/wishlist/fragment.phtml`,
    `${MODULES}/HyperionCatalog/view/frontend/templates/compare/fragment.phtml`,
];

/** The PHP that prints price markup (every other view model hands templates data, not classes). */
const PRICING_PHP: string[] = [
    `${MODULES}/HyperionCore/ViewModel/Pricing.php`,
    `${MODULES}/HyperionCatalog/ViewModel/Pricing.php`,
    `${MODULES}/HyperionCatalog/ViewModel/ProductList.php`,
    `${MODULES}/HyperionCatalog/ViewModel/ProductView.php`,
];

/** Home and CMS pages: PageBuilder content, widgets, the product widgets under a hero. */
export const FOLD_CMS: string[] = [
    `${THEME}/Magento_Cms/**/*.phtml`,
    `${THEME}/Magento_Cms/**/*.xml`,
    `${THEME}/Magento_PageBuilder/**/*.phtml`,
    `${THEME}/Magento_PageBuilder/**/*.xml`,
    `${THEME}/Magento_CatalogWidget/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/product/widget/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/product/price/**/*.phtml`,
    ...PRICING_PHP,
    `${SRC}/js/lib/product-card.js`,
];

/**
 * Category and search results: title, toolbar, tiles, layered navigation,
 * pricing, and the landing block or description a category may show above
 * the grid (CMS content, hence the widget templates).
 */
export const FOLD_CATEGORY: string[] = [
    `${THEME}/Magento_Cms/templates/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/category/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/navigation/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/product/list.phtml`,
    `${THEME}/Magento_Catalog/templates/product/list/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/product/price/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/product/swatches/skeleton.phtml`,
    `${THEME}/Magento_Catalog/layout/catalog_category_view.xml`,
    `${THEME}/Magento_CatalogSearch/templates/result.phtml`,
    `${THEME}/Magento_CatalogSearch/layout/catalogsearch_result_index.xml`,
    `${THEME}/Magento_LayeredNavigation/**/*.phtml`,
    `${THEME}/Magento_LayeredNavigation/**/*.xml`,
    `${THEME}/Magento_Review/templates/helper/summary_short.phtml`,
    `${THEME}/Magento_Msrp/**/*.phtml`,
    ...PRICING_PHP,
    `${SRC}/js/components/hyperion-list-toggle.*`,
    `${SRC}/js/components/hyperion-swatches.js`,
];

/** Product page: gallery skeleton, title, price, swatches, add to cart, PayPal, tabs strip. */
export const FOLD_PRODUCT: string[] = [
    `${THEME}/Magento_Catalog/templates/product/view.phtml`,
    `${THEME}/Magento_Catalog/templates/product/view/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/product/price/**/*.phtml`,
    `${THEME}/Magento_Catalog/templates/product/swatches/**/*.phtml`,
    `${THEME}/Magento_Catalog/layout/catalog_product_view.xml`,
    `${THEME}/Magento_Swatches/**/*.phtml`,
    `${THEME}/Magento_Bundle/**/*.phtml`,
    `${THEME}/Magento_GroupedProduct/**/*.phtml`,
    `${THEME}/Magento_Review/templates/helper/summary.phtml`,
    `${THEME}/Magento_Msrp/**/*.phtml`,
    `${THEME}/Magento_Paypal/templates/hyperion/**/*.phtml`,
    `${THEME}/Magento_Paypal/templates/paylater/**/*.phtml`,
    `${THEME}/Magento_Wishlist/templates/item/configure/**/*.phtml`,
    ...PRICING_PHP,
    `${SRC}/js/components/hyperion-swatches.js`,
    `${SRC}/js/components/hyperion-paypal-buttons.js`,
    `${SRC}/js/components/hyperion-msrp-popup.js`,
];

export function criticalConfig(files: string[]): Config {
    return {
        presets: [hyperionPreset as Config],
        content: { relative: true, files: [...FOLD_COMMON, ...files] },
    };
}
