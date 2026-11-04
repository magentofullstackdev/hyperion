# Configuration

Hyperion adds one tab, "Hyperion Theme", to Stores > Configuration with five
sections: Hyperion Theme, Catalog Mode, Checkout, Images and Search. Every field is listed below
with its path for `bin/magento config:set <path> <value>`. The second part of
this page lists the core Magento settings Hyperion reads and that change what
the storefront shows.

## Hyperion Theme (`hyperion`)

ACL resource `Magentofullstackdev_HyperionCore::config`. Scope: default,
website, store view.

| Group | Field | Path | Default | Meaning |
|---|---|---|---|---|
| Catalog | Add to Cart from Listing Page | `hyperion/catalog/add_to_cart_from_listing` | 1 | 1 renders the Add to Cart button (and the inline swatch picker for configurables) on the product tiles of category listings, search results and product widgets. 0 removes the button from the tiles; they only link to the product page, which keeps its own button. Flush the page cache after changing it. |
| Catalog | Maximum Active Filters per Request | `hyperion/catalog/max_active_filters` | 5 | Category pages, the layered navigation fragment and search results refuse a request that activates more filter attributes than this (HTTP 400, `noindex`): combinatorial filter URLs are a bot pattern, not a shopper's. Query parameters that are neither a filterable attribute, `cat`, `price`, nor a toolbar / tracking parameter (`p`, `q`, `product_list_*`, `utm_*`, `gclid`, `fbclid`, ...) are always dropped from the request before the layer runs. A category page with two or more filters is served with `X-Robots-Tag: noindex, nofollow` and the matching robots meta tag; the grid fragment hands the directive of the pushed URL to the page as an HTMX trigger (`hyperion:listing-robots`), so the meta follows the filters applied in place. 0 disables the limit. |
| Catalog | Infinite Scroll | `hyperion/catalog/infinite_scroll` | `disabled` | How category listings and search results load the next pages. `disabled`: the pager. `button`: a "Load more" link under the products appends the next page in place (a real link to `?p=N+1`, so crawlers and visitors without JavaScript still paginate), with a status line "Showing X of Y products" announced to screen readers; the keyboard focus moves to the new link. `scroll`: the next page loads by itself when the visitor reaches the end of the products. Every category can override the value in its Display Settings (attribute `hyperion_infinite_scroll`, store view scope, "Please select" = follow the configuration); the search results page follows the configuration only. The URL does not change while loading more. Flush the page cache after changing it. |
| Catalog | Automatic Loads Before the Button | `hyperion/catalog/infinite_scroll_auto_pages` | 3 | In the `scroll` mode, after this many pages loaded on scroll the "Load more" link stops loading by itself and waits for a click, so the footer stays reachable. 0 loads every page automatically. |
| Anti-Abuse Shield | Rate Limit Search and Filter Requests | `hyperion/security/rate_limit_enabled` | 1 | Counts the requests that reach PHP (a Varnish HIT is free) per client address in 10 second windows and answers HTTP 429 with `Retry-After: 10` above the limits below. |
| Anti-Abuse Shield | Search Requests per 10 Seconds | `hyperion/security/search_suggest_limit` | 30 | Budget of one client for `hyperion/search/suggest` and, counted separately, for the search results page. 0 disables the limit. |
| Anti-Abuse Shield | Filter Requests per 10 Seconds | `hyperion/security/catalog_filter_limit` | 25 | Budget of one client for `hyperion/category/filter` and for category pages that carry filter or unknown parameters. 0 disables the limit. |
| Anti-Abuse Shield | Trusted Proxy Addresses | `hyperion/security/trusted_proxies` | (empty) | Default scope only. The reverse proxies in front of PHP (Varnish, the TLS terminator), one per line or comma separated. The client address is then the rightmost `X-Forwarded-For` entry that is not a proxy. Leave empty when PHP sees the clients directly (a public peer): the header is then ignored. Left empty behind a proxy on a private network, the budget is keyed by the proxy address plus the forwarded address left after skipping the literal IPs of `http_cache_hosts` and at most one more hop in the proxy's subnet: a best effort that guesses the topology, so set this list in production. |
| Footer | Terms & Conditions CMS Page Identifier | `hyperion/footer/terms_cms_identifier` | `terms-and-conditions` | Identifier of the CMS page linked as Terms of Service in the footer. The link is omitted when the page does not exist or is inactive. `setup:upgrade` creates the default page as a placeholder when no page with that identifier exists (data patch `HyperionNavigation\Setup\Patch\Data\CreateTermsPage`): edit its content or point the setting to your own page. |
| Footer | Privacy Policy CMS Page Identifier | `hyperion/footer/privacy_cms_identifier` | `privacy-policy-cookie-restriction-mode` | Identifier of the CMS page linked as Privacy Policy in the footer (the default is the page the Luma sample data creates). |

The module also changes one core default in its `config.xml`:
`catalog/navigation/max_depth` = 4 (core default is 0, unlimited), the depth
of the top menu.

## Catalog Mode (`hyperion_catalog_mode`)

Module `Magentofullstackdev_HyperionCatalogMode`, ACL resource
`Magentofullstackdev_HyperionCatalogMode::config`. Scope: default, website,
store view. Catalog mode turns the store into a browsable catalog for
everybody who is not in an allowed customer group: prices stay visible,
buying does not.

| Group | Field | Path | Default | Meaning |
|---|---|---|---|---|
| General | Enable Catalog Mode | `hyperion_catalog_mode/general/enabled` | 0 | Master switch. |
| General | Allowed Customer Groups | `hyperion_catalog_mode/general/allowed_customer_groups` | (empty) | Multiselect of every customer group including NOT LOGGED IN; comma-separated ids on the CLI (`0,1,2`). Only these groups may buy. Leave NOT LOGGED IN out to require a login before buying; with no group selected nobody can buy. |

For a restricted visitor the theme does not render: the Add to Cart form on
the product page (a short notice takes its place: "Please log in to purchase
items." for guests, "Your account is not allowed to purchase items." for
customers), the Add to Cart buttons on category, search and widget tiles, on
the compare page and the wishlist pages, the PayPal buttons, the reorder
links and the recently ordered sidebar, and the mini-cart in the header. The
storefront routes `checkout/*` (cart, cart actions, checkout, success page),
`multishipping/*`, `paypal/express/*` and the Hyperion mini-cart and cart
fragment endpoints answer with a redirect to the login page (guests) or the
account dashboard (customers) and the same message; HTMX requests get it as
an `HX-Redirect` header. Everything else (wishlist, compare, account,
reviews, product alerts) keeps working.

The decision is made per request from the customer group and is part of
the page cache variation (`X-Magento-Vary` carries the group of logged-in
customers), so cached pages are correct per group. Flush the page cache
after changing these settings. The web API (`/rest/V1/carts/mine/*`,
`/graphql`) is not guarded: catalog mode is a storefront feature, not an
access control for integrations.

Other modules can add their own rule without touching a template:
implement `Magentofullstackdev\HyperionCore\Model\Purchase\RestrictionInterface`
and register it on `Magentofullstackdev\HyperionCore\Model\Purchase\Availability`
(argument `restrictions`) in `etc/frontend/di.xml`; templates read the
result through the `Purchase` view model. See [Development](./development.md).

## Search (`hyperion_search`)

Module `Magentofullstackdev_HyperionSearch`, ACL resource
`Magentofullstackdev_HyperionSearch::config`. Scope: default, website, store
view. The module serves the header autocomplete (`hyperion/search/suggest`)
and tunes the engine queries of the search results page; it needs
Elasticsearch or OpenSearch (the only engines of Magento 2.4.4+). The dropdown
has two columns from 1024px (a sidebar with the shopper's recent searches,
the popular search terms and the matching categories with their path; a
product column with the engine's total, a "View All (+N)" link for the
products it does not show and a four-column product grid) and stacks
vertically below that width, where the same products render as a compact
list. The typed query is bold wherever it occurs. The recent searches come
from the browser's `localStorage` (the last five terms the shopper submitted,
clicked or landed on, per store path), so the fragment stays public and
identical for every visitor.

| Group | Field | Path | Default | Meaning |
|---|---|---|---|---|
| Relevance | Typo Tolerance (Fuzziness) | `hyperion_search/general/fuzziness` | `auto` | `off`, `auto`, `1` or `2`: the edit distance the engine allows on the text fields ("jost dufle" still finds "Joust Duffle Bag"). AUTO allows one edit for words of 3 to 5 characters and two above; the first character must match. Quoted phrases stay exact. |
| Relevance | Minimum Query Length for Typo Tolerance | `hyperion_search/general/fuzzy_min_query_length` | 4 | Shorter queries are matched exactly. |
| Relevance | SKU Match Weight | `hyperion_search/general/sku_boost` | 3 | Multiplier on the relevance of exact and partial SKU matches. 1 keeps the engine's weights. |
| Relevance | Promoted SKUs | `hyperion_search/general/promoted_skus` | (empty) | Comma separated SKUs boosted to the top of the search results they match (never added to results they do not match). |
| Relevance | Promoted SKU Weight | `hyperion_search/general/promoted_boost` | 100 | Relevance multiplier of the promoted products (selected by product id, so it works whatever the analyzer of the SKU field). |
| Relevance | Stop Words | `hyperion_search/general/stop_words` | (empty) | Comma or space separated words removed from the query before it runs; the query is left untouched when only stop words remain. Per store view. |
| Relevance | Fallback on Zero Results | `hyperion_search/general/zero_results_fallback` | 1 | A search with no result shows the products of the engine's spelling suggestion ("did you mean", needs the core "Enable Search Suggestions" setting) or, for a multi-word query, of the longest word that matches; the matching categories; and the top-level categories. |
| Autocomplete | Products | `hyperion_search/suggest/products` | 4 | Products in the dropdown (search engine results, best first); four fill one row of the desktop grid. 0 hides the section. |
| Autocomplete | Popular Search Terms | `hyperion_search/suggest/terms` | 4 | Search terms of the store that start with the query, with their result counts. 0 hides the section. |
| Autocomplete | Categories | `hyperion_search/suggest/categories` | 3 | Active categories whose name matches the query, with their path. 0 hides the section. |

The suggestions are public: Varnish keeps a fragment for an hour per
normalized query and `X-Magento-Vary` cookie, the application cache keeps the
rendered HTML for the same hour, and both are purged by the tags of the
products and categories they show. Both also carry the tag
`HYPERION_SEARCH_SUGGEST`, which is cleaned (application cache and Varnish)
every time the `catalogsearch_fulltext` indexer runs (a product save in
"Update on Save", the cron in "Update by Schedule", `indexer:reindex`), when a
category is saved or deleted, and when this configuration section is saved,
so a cached answer never outlives the index it was computed from.

## Mega Menu (Content > Menu > Menu Management)

Module `Magentofullstackdev_HyperionMegaMenu`, ACL resources
`Magentofullstackdev_HyperionMegaMenu::menu` / `::group`. There is no system
configuration: the menus are built in **Content > Menu > Menu
Management**. Without a group the header shows the category tree, exactly as
before. The header picks the active group of the website and the device with
the highest priority; any group can also be placed on a page with the
"Hyperion Mega Menu" widget (parameters: group, device) or a layout block
(`Magentofullstackdev\HyperionMegaMenu\Block\Menu` with a `group_identifier`
argument).

| Where | Setting | Meaning |
|---|---|---|
| Group | Identifier | `main_navigation` is the usual header menu; any identifier works, the header takes the first active group that matches the website and the device (highest priority first). |
| Group | Menu Type | `Horizontal mega menu` (root items with a dropdown width of 2 or more open a full width 12 column panel), `Horizontal list with dropdowns`, `Vertical list` (for the widget and the footer). |
| Group | Websites, Devices, Priority | Where the group applies; `Devices` lets one group serve the desktop bar and another the mobile drawer. |
| Group | Root Category for the import | "Import from Categories" in the builder creates category items from this subtree (the default store's root when empty), keeping the hierarchy; categories already imported are skipped, so it can run again. |
| Item | Link type | Category, product (SKU), CMS page, CMS block (prints its content as a panel column), custom URL (`{storeurl}path`, a relative path, or an absolute URL), home, a label without link, and the system links (sign in, create an account, my account, cart, wish list, contact). Sign in and create an account are hidden for a signed in customer. |
| Item | Live subcategories | A category item renders its live subcategories (one to three levels, active and shown in the menu) after the items you add by hand: no import to repeat when the catalog changes. A subcategory you already added by hand is not listed twice: the item keeps its own title, badge and width and gains the live levels below it. |
| Item | Dropdown | On a root item of a mega menu group, 2 to 12 opens a full width panel whose sub-items are the columns (their own width, 3 of 12 when 0); "Panel in the site container" keeps the panel content as wide as the page container. |
| Item | Badge, color | `NEW`, `SALE`, `-20%` next to the title in the primary, danger, success, warning or neutral tone of the theme. |
| Item | Customer groups, Store views | Limit the item to customer groups and to store views (none selected = everybody, everywhere). An item created in a store view scope belongs to that store view. |
| Item | Open in, nofollow, CSS class | The anchor attributes. |
| Store view scope | Use Default Value | In a store view the builder edits the title, the badge, the target, the status and the order of a shared item behind "Use Default Value" checkboxes (one row per item and store view, no copies of the tree); the structure is edited in Default Config. |

The rendered menu is cached per store view, customer group and device
(block cache and the `/hyperion/navigation/menu` fragment at Varnish) and
tagged with the group, the categories, the products, the pages and the
blocks it shows: saving any of them, or anything in the builder, purges it.

## Checkout (`hyperion_checkout`)

ACL resource `Magentofullstackdev_HyperionCheckout::config`. Scope: default,
website, store view.

| Group | Field | Path | Default | Meaning |
|---|---|---|---|---|
| General | Enable Lit Checkout | `hyperion_checkout/general/enabled` | 0 | 1 renders the Hyperion Lit single-page checkout on `/checkout`; 0 renders the stock Knockout checkout, which does not work on the Hyperion theme (it needs RequireJS). Flush the cache after changing it. |

## Images (`hyperion_image`)

ACL resource `Magentofullstackdev_HyperionImage::config`. The module writes a
`.webp` and optionally an `.avif` file next to every catalog image it
converts and the theme emits `<picture>` elements with the new sources; the
JPG / PNG stays the fallback (a `<source>` is only emitted when the companion
file exists, browsers do not fall back from a 404 inside `<picture>`).

Local images inside CMS blocks and pages get the same `<picture>` wrap,
`width` / `height` from the file when they carry neither, and the first
content image of the page (the hero banner of a landing page, usually the
largest contentful paint) gets `fetchpriority="high"` so the browser
requests it before the stylesheet and the module preloads; an image with
`loading="lazy"` or its own `fetchpriority` is left alone.

A conversion is triggered in three places, all honouring the conversion mode
below: when Magento's image helper writes a cache file on demand
(`Product\Image::saveFile`, the Luma style resize), when core's resize service
writes the cache files (`bin/magento catalog:images:resize`, the product save
in the admin, the `media.storage.catalog.image.resize` consumer, `get.php`;
these are the gallery and tile sizes Hyperion links through `UrlBuilder`), and
as a safety net when a template finds no companion for an image it renders:
the conversion is then scheduled once per file and day (a flag in the
application cache, tag `HYPERION_IMAGE`) so the next render carries the
`<source>`. A file that already has its companions is never scheduled again.

| Group | Field | Path | Default | Scope | Meaning |
|---|---|---|---|---|---|
| General | Enable WebP/AVIF generation | `hyperion_image/general/enabled` | 1 | default, website | Master switch for the conversion. |
| General | Conversion mode | `hyperion_image/general/conversion_mode` | `queue` | default, website | `queue`: WebP / AVIF are generated by the cron-started consumer `hyperion.image.convert`; the JPG is served immediately as fallback. `sync`: generated while the JPG cache is built; adds 100-300 ms to the first render of each image, only for environments without cron. |
| General | Invalidate affected product pages after a batch | `hyperion_image/general/invalidate_on_batch_end` | 1 | default | At the end of a consumer run or of the CLI command, the cache tags (`cat_p_<id>`) of the products whose images were converted are cleaned, so their cached pages re-render with the new `<source>` tags. Only those products are invalidated; the cache is never flushed as a whole. Images without a product (category, WYSIWYG) are picked up when the cached page expires. With 0, pages pick up the new formats when their cache lifetime ends or the product is saved. |
| General | Maximum source image size (pixels) | `hyperion_image/general/max_pixels` | 40000000 | default, website | Images above this many pixels (width x height) are not converted: the encoders read the header only (`getimagesize`, `Imagick::pingImage`) and refuse the source before decoding it, so a small file that declares a huge canvas cannot exhaust the memory of the consumer. 0 disables the limit. |
| WebP | Enable WebP | `hyperion_image/webp/enabled` | 1 | default, website | |
| WebP | WebP quality (1-100) | `hyperion_image/webp/quality` | 82 | default, website | Recommended 80-85; visible artifacts under 70. |
| WebP | Skip if larger than original | `hyperion_image/webp/skip_if_larger` | 1 | default, website | Discards a WebP that is larger than the source (happens with very small images). |
| AVIF | Enable AVIF | `hyperion_image/avif/enabled` | 0 | default, website | About 30 % smaller than WebP, but encoding is 3-10x slower (CPU). Recommended for static catalogs only. |
| AVIF | AVIF quality (1-100) | `hyperion_image/avif/quality` | 75 | default, website | |
| AVIF | Skip if larger than original | `hyperion_image/avif/skip_if_larger` | 1 | default, website | |
| Encoder | Encoder preference | `hyperion_image/encoder/preference` | `auto` | default | `auto` uses Imagick when installed and falls back to GD; `imagick` and `gd` force one encoder (diagnostics). |

Bulk conversion of existing media:

```bash
bin/magento hyperion:image:convert [--dry-run] [--force] [--paths=catalog/product/cache,catalog/category,wysiwyg]
```

`--dry-run` reports the candidate count, `--force` re-converts even when
companion files exist, `--paths` overrides the three default roots (relative
to `pub/media/`). It encodes synchronously, whatever the conversion mode, and
invalidates the cache tags of the affected products at the end: the one-off to
run on a store whose product image cache predates the module, or after
`catalog:images:resize` when you do not want to wait for the consumer. The
queue consumer needs no configuration: it exits after 5 s idle and cron
restarts it when new messages arrive; `bin/magento queue:consumers:start
hyperion.image.convert` drains it by hand.

## Core settings Hyperion reads

These are standard Magento settings. Hyperion honors them with its own
templates, so they behave as documented by Magento unless a note below says
otherwise.

| Area | Path(s) | Notes |
|---|---|---|
| Checkout guests | `checkout/options/guest_checkout`, minimum order amount | The Hyperion checkout controller applies core's guards. A guest who may not check out is sent to the login page with a notice and returns to the checkout after signing in (core sends to the cart). |
| Cookie restriction | `web/cookie/cookie_restriction`, `web/cookie/cookie_restriction_lifetime` | The notice banner is rendered on every page (pages stay cacheable) and shown until the shopper accepts; the consent cookie `user_allowed_save_cookie` has the same shape as core's. |
| Shipping policy | `shipping/shipping_policy/enable_shipping_policy`, `shipping_policy_content` | The shipping step shows a "See our shipping policy" button that opens the text in a dialog. |
| Fixed Product Tax | `tax/weee/*` | FPT lines per item in the mini-cart, the cart and the checkout summary, plus an FPT totals row when `tax/weee/include_in_subtotal` is off. The product page and listings do not show it yet. |
| VAT number on address forms | `customer/create_account/vat_frontend_visibility` | The address book form and the registration address render `vat_id`. |
| Cart estimator | `general/country/default`, shipping origin and carriers | "Estimate Shipping and Tax" in the cart summary: destination + rates, the chosen rate is applied to the quote (`hyperion/cart/estimate`). |
| Move to wishlist | `wishlist/general/active` | Logged-in customers get "Move to Wishlist" on every cart line (core's `wishlist/index/fromcart`, HTMX-enhanced). |
| Open Graph | none (always on) | Product pages carry `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:site_name`, `product:price:amount`, `product:price:currency` and `product:availability`, appended to the head by `HyperionCatalog` (core's block lives in the removed `head.additional`). |
| Stock notices and quantity rules | `cataloginventory/options/stock_threshold_qty`, `cataloginventory/item_options/min_sale_qty`, `max_sale_qty`, `enable_qty_increments`, `qty_increments` (and the per-product values) | "Only N left" on simple, virtual and downloadable product pages within the threshold, and on configurable product pages for the chosen variant (the swatch config carries the notices of the children within the threshold); "%1 is available to buy in increments of %2"; the quantity input carries `min`, `max` and `step`. |
| Product video | `catalog/product_video/*` is not read | Video entries of the media gallery (YouTube, Vimeo) get a play overlay on their thumbnail; the stage plays them in a privacy-enhanced iframe (youtube-nocookie.com, player.vimeo.com) only while the slide is selected. The API key setting is used by the admin only. |
| Listing mode | `catalog/frontend/list_mode`, `grid_per_page_values`, `list_per_page_values`, `grid_per_page`, `list_per_page` | Grid / list switch in the toolbar (HTMX on categories, links on search); `product_list_mode` is part of the listing block cache key. The list layout shows the short description. |
| MSRP on configurable products | see MSRP / MAP below | Picking a variant whose MAP hides the price updates the struck MSRP and the "Click for price" dialog, never the visible price. |
| Google Analytics 4 / Google Ads | `google/gtag/analytics4/active`, `measurement_id`, `google/gtag/adwords/active`, `conversion_id`, `conversion_label` | Read directly (core's `Magento_GoogleGtag` blocks are RequireJS only and removed). `<hyperion-gtag>` owns the dataLayer, loads gtag.js after the first interaction or when idle (after the cookie consent when the restriction mode is on) and sends `view_item`, `view_item_list`, `add_to_cart`, `begin_checkout`, `purchase` plus the Ads `conversion` of the purchase (`send_to` = conversion id / label). Nothing is emitted while both features are off. |
| Recently viewed / compared widgets | widget instance parameters (`page_size`, `show_attributes`, `show_buttons`, template grid / list / sidebar) | Core's "Recently Viewed Products" and "Recently Compared Products" widgets render `<hyperion-recently-viewed>`, fed by the browser's localStorage history (`hyperion_recently_viewed` / `hyperion_recently_compared`, per store and currency, 20 entries) that product page views and compare clicks write; `catalog/recently_products/*` (the server-side counters) is not used. |
| Wishlist and compare sidebars | `wishlist/general/active` + `wishlist/general/show_in_sidebar` for the wishlist (compare has no switch, as in core) | The sidebars follow the page layout like Luma's: on 2columns-left both rails are on the left, the sidebars under the filters; 2columns-right mirrors it; 3columns puts the filters left and the sidebars right; on a 1column category page they are a row of cards under the inline filter bar; on the account pages they sit under the account menu. They render on the category, search result and account pages only (like Luma): the home page, CMS pages, sign in, register and contact pages show none. They render from the header-state fragments, so cached pages show the visitor's own lists without an extra request; Remove is HTMX, Add to Cart / Clear All are plain POSTs. A disabled feature renders nothing, and the rail collapses while both lists are empty. |
| Order view | `payment/banktransfer/instructions`, `payment/checkmo/payable_to`, `mailing_address`, purchase order number, comment visibility | The customer, guest and print order pages show the payment method with its instructions / details, and the order view the status comments marked "Visible on Storefront". |
| Gift options | `sales/gift_options/allow_order`, `sales/gift_options/allow_items`, per-product `gift_message_available` | Gift messages are edited in the cart (order level and per item) and inside the Lit checkout (`<checkout-gift-message>`, saved through core's gift message web API), and shown on the order pages. Requires `Magento_GiftMessage` (optional module). |
| MSRP / MAP | `sales/msrp/enabled`, `sales/msrp/display_price_type`, per-product `msrp` and `msrp_display_actual_price_type` | Struck MSRP on tiles and product pages; "on gesture" opens a "Click for price" dialog with the product's own add-to-cart form; "in cart" / "before order confirm" show core's message instead of the price. The cart always shows the real price. Configurable products: a variant with MAP keeps its price hidden when picked (struck MSRP and dialog updated). Requires `Magento_Msrp` (optional module). |
| PayPal Express | `payment/paypal_express/active`, `payment/paypal_express/in_context`, smart button and Pay Later settings | All values come from core's `SmartButtonConfig`, `SdkUrl` and `PayLaterConfig`, so every admin setting (button style, placements, Pay Later `*_display` values, `buyer_country`) applies. `in_context = 1` renders the smart button in the checkout; `in_context = 0` uses the redirect flow (completion not verified). Requires `Magento_Paypal` (optional module). |
| PayPal Hosted Pro | `payment/hosted_pro/active`, `payment/hosted_pro/display_ec` | With Hosted Pro active and `display_ec = 0`, core hides `paypal_express` from the checkout (`Express::canUseCheckout()`). Set `display_ec = 1` to offer PayPal Express next to Hosted Pro. Hosted Pro itself has no renderer and is listed as not supported. |
| Inline sign-in at the checkout | `checkout/options/enable_guest_checkout_login` | Core (2.4.7+) answers the email availability check only when this is Yes; with the default No the checkout never offers the inline password field. |
| PayPal billing agreements | `payment/paypal_billing_agreement/active` | When active, Pay Later messages render without an amount (core rule). Turn it off to get amounts. The billing agreement payment method has no renderer. |
| Braintree | `payment/braintree/active`, `payment/braintree_cc_vault/active`, `payment/braintree/verify_3dsecure`, merchant id, public / private key | Card (hosted fields), vault and 3D Secure verified against a sandbox; Braintree PayPal untested. When you set the keys from the CLI, use the structure path so they are stored encrypted, for example `bin/magento config:set payment/braintree_section/braintree/braintree_required/private_key <value>`. Setting the plain config path (`payment/braintree/private_key`) stores the value in clear text. |
| Order cancellation | `sales/cancellation/enabled`, reasons list | 2.4.7+. Hyperion renders its own dialog on the order view, the order history and the dashboard; the button is hidden when shipments exist. Requires `Magento_OrderCancellation` (optional module). |
| Login as Customer | `login_as_customer/general/enabled`, `store_view_manual_choice_enabled` | The "You are connected as ..." banner rides the single header state request, so cached pages show it only for impersonated sessions. Requires `Magento_LoginAsCustomer` (optional module). |
| Name prefix / suffix / middle name | `customer/address/prefix_show`, `prefix_options`, `middlename_show`, `suffix_show`, `suffix_options` | Applied on the registration form, the address book and the Lit checkout address form (select when options are configured, free text otherwise; `req` makes the field required). |
| Address fields | `customer/address/company_show`, `telephone_show`, `fax_show`, `street_lines`, `customer/create_account/vat_frontend_visibility` | Honored on the address forms, VAT number included; a `customer_form_address_user_attributes` child block is rendered when a module schedules one. |
| Registration address fields | layout argument, not a config path | Core has no admin setting for address fields on the registration form. Enable them with a layout update on the `customer_form_register` handle in a child theme or module: `<referenceBlock name="customer_form_register"><arguments><argument name="show_address_fields" xsi:type="boolean">true</argument></arguments></referenceBlock>`. |
| Currency | `currency/options/allow`, `currency/options/default` | The currency switcher is in the footer. The page cache varies on currency (Hyperion sets the store and currency context for its own controllers and includes it in its block cache keys). |
| Store switcher | layout argument `scope` on block `hyperion.footer.store_switcher` | `group` (core semantics: store groups of the current website), `website` (every view of the website, one section per group) or `all` (every active view of every website, one section per website). The theme sets `all`, which already lists every store view, so core's language switcher (`Magento_Store::switch/languages.phtml`) is not rendered. The quote does not follow across websites (core behavior). |
| Top menu depth | `catalog/navigation/max_depth` | Default set to 4 by Hyperion (see above). |
| PageBuilder maps | `cms/pagebuilder/google_maps_api_key`, `cms/pagebuilder/google_maps_style` | Read by the map renderer; without a key a keyless Google embed of the first location is shown instead of core's error box. |
| reCAPTCHA | `recaptcha_frontend/*` | Core's backend modules are used untouched; the type and site key are read for every protected form and for the checkout (`place_order` action). |
| Full page cache | `system/full_page_cache/caching_application`, `http_cache_hosts` in `env.php` | See [Varnish](./varnish.md). |

## Languages

Hyperion ships its own strings in thirteen locales: `en_US` (the source), `it_IT`, `de_DE`, `fr_FR`, `es_ES`, `pt_PT`, `nl_NL`, `pl_PL`, `ro_RO`, `uk_UA`, `nb_NO`, `sv_SE` and `da_DK`. The catalogs live in `i18n/<locale>.csv` of the theme (storefront templates) and of every module that has strings of its own (the checkout app, the mega menu admin, the search and image settings). They cover only the phrases Hyperion adds; everything Magento itself prints (Add to Cart, the account pages, the checkout steps' core labels, admin menus) comes from a Magento language pack for that locale, which you install separately as usual (for example the Mageplaza or community packs on Packagist). A store view with `general/locale/code` set to one of these locales therefore reads fully translated once both are in place; a child theme adds or overrides strings with its own `i18n/<locale>.csv`.

The English catalogs are the source of truth: `bin/magento i18n:collect-phrases` over `app/code/Magentofullstackdev` and the theme, minus the phrases any core `en_US.csv` already lists, is exactly their content. Keep that rule when adding strings, then translate the new rows in every locale file.

