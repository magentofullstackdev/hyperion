# Changelog

All notable changes to Hyperion are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.0-beta.5] - 2026-11-12

A correctness release: listings, the checkout's order safety, cart prices under tax display settings, the mega menu admin and the sample data module. Read the upgrade notes at the end of this section before you update.

### Fixed

**Listings**
- Sort, direction, grid / list, page size, the pager, "Load more" and the automatic loading keep the active layered navigation filters: their URLs come from one place (`HyperionCatalog\ViewModel\Listing::getStateFragmentUrl()` / `getAppendFragmentUrl()`), which carries the filters of the layer state. Before, a sort or a page change on a filtered listing answered the unfiltered one.
- A listing URL with a page size the store does not offer (`product_list_limit=1&p=9000`) answered HTTP 500 from the search engine window. Toolbar parameters are validated before the layer runs: a sort order, direction, mode or page size the store does not offer is dropped, and the page clamp uses the page size the toolbar will really apply.
- A search engine outage is no longer cached. With the engine down the category list block saved core's empty error state in the block cache and Varnish kept an empty listing after the engine came back. A listing that cannot load now says "We can't load the products right now. Please try again in a moment.", marks the request degraded (no block cache entry, private response, no pushed URL), the listing fragments answer that message instead of an error, and the search autocomplete does not store an answer computed during the outage.
- Two quick clicks on listing controls (two filters, a filter then a sort) ended in whichever answer arrived last. The grid and the layered navigation share one request queue (`hx-sync` on the grid, `replace`): a newer request aborts the one in flight.
- Back and Forward across a listing change, or an account page change, restored a DOM snapshot that htmx had saved in `sessionStorage` (stale prices, stale session state, components upgraded twice). htmx now keeps no history snapshot (`historyCacheSize: 0`, `refreshOnHistoryMiss: true`): Back and Forward request the public URL again, served from the edge cache.
- The Varnish tags of a listing fragment come from the list block's identities, so the category's product tag (`cat_c_p_<id>`) is part of them and a change of the category's product assignment purges the fragments as it purges the page.
- Session messages (for example "You added ... to your comparison list" after a redirect) show on category pages: the theme removed the container that holds them there.
- The wish list and compare labels of the tiles were escaped twice (a product name with an apostrophe or an ampersand read as entity text to screen readers).
- Marketing parameters (`gclid`, `utm_*`, ...) on a category URL never count against the filter rate limit; the PHP guard and the VCL read one list.

**Add to Cart, wish list, compare**
- A double click or a double tap on Add to Cart added the product twice. Every Add to Cart, wish list and compare form drops a second submit while the first is in flight (`hx-sync="this:drop"`); the button shows "Adding to cart..." in place of its label without changing size and keeps the keyboard focus.
- Mini-cart quantity stepper: rapid taps lost steps or ended at a wrong quantity. Steps are accumulated and sent as one update after a short pause; a tap during a request is followed by exactly one more request with the final quantity.

**Checkout**
- An order could be placed against the previous shipping address or shipping method when Place Order was pressed right after an edit. Place Order now waits for the pending address estimate and save, and never sends the order while the form is ahead of what the server confirmed. A press after a failed shipping save sends the save again, once.
- Place Order could be pressed a second time after a successful order while the browser was still on its way to the success page. The button stays locked from the server's answer until the success page loads, and a checkout page restored from the back / forward cache reloads.
- A lost answer to the order request (timeout after 60 seconds, connection dropped) left the shopper with a generic error and an order that might exist. The checkout now reads the cart: the order was placed (the shopper is sent to the success page), it was not placed (the error says so and the button opens again), or the outcome is unknown (the message says so and the next press checks again before sending anything). A timeout with a cart that is still active is reported as unknown, because the server may still be working on the order.
- An error page of a proxy or of the web server (an HTML body) was shown as the error message. A body that is not JSON is never data and never a message; the checkout shows its own text for the status.
- Shipping methods: a carrier's error rate ("This shipping method is not available...") was selectable and could be preselected. Error rates are listed as disabled notices, the first available rate is preselected, and the in-store pickup rate is not listed (the checkout has no pickup location step).
- Purchase Order: the number typed in the checkout did not reach the order. It travels as `paymentMethod.po_number`, the field is required, and an early press names it.
- Bank transfer and cash on delivery instructions, and the "Make Check payable to" / "Send Check to" details of Check / Money Order, render under the selected method.
- PayPal Express and Google Pay refuse to start while a shipping save or a totals refresh is in flight (one gate, shared with Place Order); PayPal saves a separately entered billing address before it opens.
- reCAPTCHA at Place Order: a failed load of Google's script was cached, so every later press failed until a reload. A failed load is retried on the next press.
- A guest whose cart holds a downloadable product is sent to the sign in page by core's "Disable Guest Checkout if Cart Contains Downloadable Items" (`catalog/downloadable/disable_guest_checkout`, on by default), and the notice read "Guest checkout is disabled." even with guest checkout allowed. The notice now names the downloadable products when they are the reason.

**Cart and prices**
- Cart lines ignored the cart tax display: with prices shown including tax (`tax/cart_display/price`) the row totals were the amounts excluding tax and did not add up to the subtotal. The cart now prints a unit price and a row total per line in the configured display (including, excluding, or both), the mini-cart row total follows the same rule, and Fixed Product Tax is part of the line price when `tax/weee/display_sales` says so.
- Cart estimator: the rates were shown in the base currency beside totals in the display currency. Rates are converted to the quote currency and follow `tax/display/shipping`; a carrier's error rate is listed as a notice and cannot be selected or posted.
- Cart estimator: choosing a second shipping method showed the new totals while the quote kept the previous method. The newly selected method is the one stored.
- Decimal quantities (products with "Qty Uses Decimals") were truncated in the cart and the mini-cart. Both quantity inputs carry the product's `step`, `min` and `max` (quantity increments included) and accept decimals; the header count follows `checkout/cart_link/use_qty`.
- Product widget tiles and cart cross-sells showed the price excluding tax whatever `tax/display/type` said, and a grouped product's "Starting at" amount was converted twice in a non-base currency. Those prices come from the product's price info now, with the excluding amount beside them in the "both" display; a configurable tile no longer loads its children.
- Bundle options: the option prices and the "Price as configured" total ignored the catalog tax display, and were converted twice in a non-base currency. A selection name with an HTML entity (`&trade;`) printed the entity in the summary.
- Configurable products: after a swatch pick the price was formatted with a dot and two decimals on every store view. It uses the store view's number format (decimal comma, grouping, precision).

**Mega menu admin**
- An item added in a store view scope was saved twice (once as a shared item); it is saved once, as an item of that store view.
- A store view could not override the target of a shared item: the form printed two "Use Default Value" boxes with one name. There is one box, and the override shows after a reload.
- Deselecting every customer group or every store view of an item did not clear the restriction.
- An item could be saved through the URL of another menu group; the save is refused.

**Sample data** (`Magentofullstackdev_HyperionSampleData`)
- The widget rebind moved every Luma widget of the store to Hyperion on each `setup:upgrade`. It now moves only the 17 CMS block widgets the Luma sample data creates (matched by type and title, and only while `Magento_WidgetSampleData` is enabled) and their layout links.
- `pub/media/styles.css` is replaced only when it is the Luma sample stylesheet, and the original is kept as `styles.css.luma.bak`; a merchant's own file is left alone and reported in the log.
- The `{{MEDIA_URL}}styles.css` link is removed from `design/head/includes` only for store views that run Hyperion or a child theme; a row shared with a store view on another theme stays.
- The sample products are created on any `setup:upgrade` when the Luma catalog is present, and a failure is logged instead of aborting the deploy.
- Two data patches keep the look of the sample store now that the brand and the footer text come from the store: the store name `HYPERION` when the store has none (the wordmark), and the CMS block `hyperion-footer-about` with the former footer sentence, translated through the module's `i18n/` files.

**Forms and messages**
- A form protected by reCAPTCHA resubmitted itself without end when Google's script was blocked or failed (content blocker, network). The form is submitted once without a token, the server answers with its reCAPTCHA message, and the next attempt asks Google again.
- A storefront message set while the landing page comes from the page cache (for example a reCAPTCHA refusal of the footer newsletter form) showed on the next page the shopper opened. It now shows on the page it belongs to: `<hyperion-messages>` reads the message cookie again after each htmx request.
- Registration form with address fields: the VAT number field was printed twice.
- The header search field aborts the previous autocomplete request when a newer one starts.

**Platform**
- Magento's JS and CSS minification (`dev/js/minify_files`, `dev/css/minify_files`) broke the storefront in production mode: Magento renamed the build output to `.min` files that the manifest and the chunks' own imports did not know (404 for the stylesheet, htmx and every component). `HyperionCore` ships `minify_exclude` defaults for the build output of the theme and of the checkout, which Vite already minifies; see [Install](./docs/install.md#production-checklist).
- Image cache flush: the plugin that removes leftover WebP / AVIF companions when the catalog image cache is flushed was declared on a class that has no such method and never ran. It targets `Magento\Catalog\Model\Product\Image::clearCache()`.
- Varnish: the backend probe no longer sets `.initial = 2`, which marked the backend sick for about 10 seconds after every VCL load (503 answers); one good poll marks it healthy.
- Varnish: the list of marketing parameters stripped from the cache key follows core 2.4.9 and adds `gad_campaignid`, `ttclid`, `twclid`, `li_fat_id`, `igshid`, `epik` and `yclid`.
- The rate limiter's counters are saved without a cache tag: nothing ever cleaned by that tag, and the counters expire on their own after the window.
- Persistent Shopping Cart: core's "remember me" configuration script (RequireJS only) is not printed on guest pages.
- A long store name in the header wordmark made the page scroll sideways on narrow phones: the wordmark truncates.
- Core's local storage notice (`web/browser_capabilities/local_storage`) printed a RequireJS script, a page error on this theme; the theme does not render that notice.

### Changed
- `head.additional` renders again. The theme used to remove the whole container; it now removes by name the core children that only feed RequireJS (`google_analytics`, `google_gtag_analytics`, `gtag_google_adwords`, `form_key_provider`, `csp.sri.hashes`, `translate-config`) and core's `opengraph.general`, so a head block of another module reaches the page as that module wrote it.
- Open Graph on Mage-OS 4.0: when `MageOS_Seo` is enabled with its Open Graph tags on (`mageos_seo_general/og_tags/enabled`), that module is the one source of the tags and Hyperion emits none; with the option off Hyperion emits its product tags as before. See [Compatibility](./docs/compatibility.md#mage-os-40-seo-module).
- Footer: the Customer service column lists the links modules add to core's `footer_links` block (Advanced Search, Search Terms, RSS, third-party links) after the four designed entries, without duplicates; a `referenceBlock remove` of one link is respected.
- Brand: the header and footer wordmark and the logo link's accessible name use the store's name (Stores > Configuration > General > Store Information > Store Name, then the store group name, the website name, the host), never "Hyperion". The footer tagline is gone; the paragraph under the footer logo is the optional CMS block `hyperion-footer-about`.
- Guest order lookup: the Invoices, Shipments and Refunds tabs render in the same shell as the guest order view (info card, items, totals, print links), and the tabs are styled.
- The demo store notice (`design/head/demonotice`) and the "JavaScript disabled" notice are styled bars above the header, without a layout shift.
- Product page: the first gallery image carries `srcset`, `sizes`, `width` and `height` (medium and large cache files), so a high density phone gets the large file and everything else the medium one.
- PayPal placements (the product page buttons, the Pay Later messages) request the PayPal SDK only after a sign of the shopper on the page (a pointer move, a scroll, a touch, a key), on top of the placement being near the viewport and the page idle. About 450 KB of script in three frames no longer runs on a page nobody interacts with, and a lab measurement of the product page (PageSpeed) no longer counts its long tasks; a shopper sees the buttons as before, the placement keeps its reserved height.
- The product history write of the product page runs in an idle slot; the product carousel measures its track from the resize observer's first report instead of forcing a layout right after its first render.
- Composer: `magento/framework ^103.0.8` in every package (was `^103.0.6`); `HyperionImage` requires `magento/module-catalog >=104.0.8` and `magento/module-media-storage >=100.4.7`; `mage-os/module-seo` is a `suggest` of `HyperionCatalog`.
- Child theme scaffold (`hyperion create`): the generated Vite config keeps `entry.js` and `entry.css` under fixed names and writes every other chunk and asset with a hash in its name, the shape the minification excludes match.
- Unit tests: data providers carry the `#[DataProvider]` attribute only (PHPUnit 10 and 12); the `@dataProvider` annotations are gone.
- End-to-end scripts: `pw-listing-state.mjs` is new; the scripts that change configuration snapshot the stored state of each setting and restore exactly that (`e2e/lib/config-snapshot.mjs`), instead of writing fixed defaults.
- CI: the PHP workflow gates on Mage-OS 4.0 with PHP 8.4 and 8.5; PHP 8.3 on Mage-OS 4.0, Mage-OS 3.6 and a nightly run on the newest Mage-OS are informative. Every leg checks that each plugin method targets an existing public method (`.github/scripts/check-plugin-targets.php`); the gate legs validate the twelve Composer manifests and check that the fifteen version fields agree.

### Removed
- Platform support for Magento Open Source 2.4.7 and Mage-OS 2.x. `0.9.0-beta.4` is the last release whose notes mention them; those rows were last verified on 2026-10-29. Magento 2.4.7 (`magento/framework` 103.0.7) no longer resolves this release and keeps `0.9.0-beta.4`. The supported platforms and their tiers are in [Compatibility](./docs/compatibility.md#support-policy).
- The code paths kept for those platforms: the `$headCritical` / `$headAssets` fallback of `root.phtml`, the PHPUnit 9 `@dataProvider` annotations.

### Upgrade notes
1. **Requirements.** `magento/framework ^103.0.8`: Magento Open Source 2.4.8 and 2.4.9, Mage-OS 3.6 and 4.0. A Magento 2.4.7 project keeps resolving `0.9.0-beta.4`. Mage-OS 2.3 still resolves (it replaces `magento/framework` 103.0.8) but is not supported.
2. **Commands.** `composer update "magentofullstackdev/*"`, `bin/magento setup:upgrade`, `bin/magento setup:di:compile` (constructor signatures changed and a plugin moved; without the compile the storefront answers an error), `bin/magento setup:static-content:deploy -f`, `bin/magento cache:flush`. No new database table.
3. **Varnish.** The shipped VCL changed (marketing parameters, backend probe). Regenerate your VCL from `HyperionCore/etc/varnish/default.vcl`, keeping your backend and purge ACL lines, and reload it. Until then URLs that carry the new marketing parameters get cache objects of their own, as before.
4. **Caches.** Flush the full page cache and the block cache after the upgrade: the header and footer markup, the listing controls and the head output changed.
5. **Head output.** `head.additional` renders again. A module that adds a script or a tag there now emits it; look at the page head once after the upgrade. A block that only prints `x-magento-init` does nothing on this theme: remove it by name in a child theme ([Child themes](./docs/child-themes.md#removing-a-head-block)).
6. **Minification.** If JS or CSS minification is on, the static content deploy of step 2 is what applies the fix: the build output is excluded from Magento's minification and keeps its file names. HTML minification (`dev/template/minify_html`) is not supported in this release and must stay off ([Known limitations](./docs/known-limitations.md)).
7. **Child themes scaffolded before this release** build unhashed chunk names. With a single chunk nothing changes; a theme that uses a dynamic `import()` needs the three `output` lines of a fresh scaffold when JS minification is on. See [Child themes](./docs/child-themes.md#minification).
8. **Cart prices** follow `tax/cart_display/price`, the estimator follows `tax/display/shipping`. A store that displays prices including tax will see the cart lines change to match the subtotal.
9. **Brand and footer.** The wordmark prints the store name: set Store Information > Store Name if the website name is not what you want to show. A store that relied on the footer tagline creates the CMS block `hyperion-footer-about`; `HyperionSampleData` sets the store name `HYPERION` (when none is set) and creates that block (when it does not exist) on its next `setup:upgrade`.
10. **`HyperionSampleData`.** The widget rebind only touches the Luma sample widgets; a store that relied on it to move its own Luma widgets rebinds them by hand. Not for a store that serves Luma to customers ([Install](./docs/install.md)).
11. **Mega menu.** No schema change, no data migration.
12. **CI of a fork.** The checks of the PHP workflow have new names (`gate / Mage-OS 4.0.* / PHP 8.4`, `gate / Mage-OS 4.0.* / PHP 8.5`); a branch protection rule that lists required checks must name them.
13. **Template and view model overrides.** `CartData::getItems()` rows: `row_total_display` is now the amount of the configured tax display (new keys `price_display`, `price_display_excl`, `row_total_display_excl`, `row_total_incl`, `is_qty_decimal`, `qty_step`, `qty_min`, `qty_max`); `CartData::getShippingRates()` rows may be unavailable (check `available` before rendering a radio); `CartData::getItemCount()` and `Minicart\Fragment::getItemCount()` return `float|int`; `BundleOptions::format()` formats without converting; the constructor of `HyperionCore\ViewModel\Pricing` changed. An override of a tile or of the product page copies the Add to Cart markup contract (`docs/child-themes.md`); the element `#hyperion-add-to-cart-indicator` is gone. An override of `footer.phtml` calls `$block->getServiceLinks()` to keep the extra links. Checkout bundle forks: `placeOrder()` of the flow actions can resolve with `'placed-unconfirmed'`, `normaliseMagentoError` is now `normalizeMagentoError`, `PaymentRenderer` gained the optional `notReadyMessage`.

## [0.9.0-beta.4] - 2026-11-09

### Changed
- Critical CSS per page type: the home and CMS pages, the category and search results pages and the product page inline a critical sheet that paints their fold on its own (built by a second Tailwind pass over the templates of that fold, `frontend/packages/theme-default/src/css/critical/`) and load the theme stylesheet without blocking the first paint; the entry module fetches the component chunks once the stylesheet applies, and a `<link rel="expect">` marker keeps the browser from painting a document that is still streaming in. The other pages keep the synchronous stylesheet. The layout argument `critical_css_type` on the `hyperion.head.scripts` block maps a handle to a sheet (an empty value restores the synchronous mode). `e2e/pw-critical.mjs` compares the fold painted by the critical sheet with the full stylesheet pixel by pixel.
- Development toolchain: ESLint 10 with the flat config (`frontend/eslint.config.js`, typescript-eslint 8), which removes the last minimatch 3 dependency of the toolchain; the `minimatch` of the ESLint tree is pinned to the 11 line glob already uses. The rules new to the recommended set led to small source changes with no change in behavior: a rethrown checkout error now carries the original as its `cause`, initial values that were always overwritten are gone, and stale `eslint-disable` comments are removed.

### Fixed
- Product page: the gallery sizes (`product_page_image_small`, `_medium`, `_large`) are resolved through Magento's image helper like every other product image of the theme, so a size that was never generated (fresh install without `catalog:images:resize`, media import, changed `view.xml` sizes) is written during the render instead of depending on the web server routing the miss to `get.php`; the files written that way get their WebP / AVIF companions scheduled immediately.
- Product page: the PayPal buttons under Add to Cart showed through the open mini-cart. The PayPal SDK positions its button iframe and its funding menu with their own z-index against the page, above the sticky header that contains the drawers; the component host now isolates them inside its own box (the Pay Later message too).
- Mini-cart and mobile navigation drawer: the closed panel sits just past the right edge of the viewport and its shadow shaded the page along that edge (visible on phones and in PageSpeed screenshots). The closed panel is hidden now; the slide in and out are unchanged.
- Product page: the tab strip (Details, More Information, Reviews) widened the page on viewports narrower than its labels (about 320px, wider with longer translations), leaving a gap beside the footer. The strip wraps onto a second row instead, and the server rendered skeleton does the same.

## [0.9.0-beta.3] - 2026-11-04

### Added
- Images: the first content image of a request (the hero banner of a landing page, the usual largest contentful paint) gets `fetchpriority="high"` from the CMS image rewriter, so the browser no longer queues it behind the stylesheet and the module preloads. An image with `loading="lazy"` or its own `fetchpriority` opts out.
- Images: resized variants of the content images (`media/wysiwyg`): a WebP / AVIF file at every configured width below the source width (`hyperion_image/variants/widths`, default 640 and 960) next to the full size companion, emitted as `srcset` with width descriptors and a `sizes` attribute on the `<picture>` sources, so phones download a banner cut to their width. Generated by the same conversion paths as the companions (conversion modes, render time safety net, `hyperion:image:convert`); `hyperion_image/variants/enabled` switches them off.
- SEO: a category, product or CMS page without a meta description (and no store default) gets one made from its own description, short description or content, cut at a word boundary within 160 characters (`hyperion/seo/meta_description_fallback`, on by default; a value typed in the admin is never replaced).
- Sample data: `setup:upgrade` removes the Luma `<link>` to `{{MEDIA_URL}}styles.css` from `design/head/includes` at every scope (`LumaStylesheetLinkRemover`), one render blocking request less; other includes of the scope are kept.

### Changed
- End to end scripts resolve the store's category / product URL suffix once at start (`e2e/lib/url-suffix.mjs`) instead of assuming `.html`, so they run against a store with an empty `catalog/seo/*_url_suffix`.
- Development toolchain: Vitest 4.1 and glob 14 (Dependabot advisories on `@vitest/mocker` and `minimatch`); no change to the shipped assets. `vi.fn()` mocks assigned to typed callbacks declare their signature, and tests that spy on `window.confirm` stub it first (happy-dom defines none).

## [0.9.0-beta.2] - 2026-11-03

### Added
- Checkout: Google Pay through Braintree (`braintree_googlepay`). The Braintree `google-payment` component and Google's `pay.js` load when the method is selected, `isReadyToPay` decides whether the official button renders, the sheet shows the order lines and total, a card that is not network tokenized goes through 3D Secure, and the button places the order (`payment_method_nonce`, `device_data`, `is_network_tokenized`, the vault choice). Cards stored through Google Pay (`braintree_googlepay_vault`) pay like stored Braintree cards.

### Fixed
- Header: the Sign in link rendered inside the header state fragment wrapped the login page's own URL as the referer when the fragment was requested from the login, create account or forgot password page, so every visit nested the previous referer once more (longer and longer URLs). An account page now passes the referer it already carries, or none, like core's own link.
- Mega menu: a category item with "Live subcategories" listed a subcategory twice when the same category was also added by hand under the item (an imported tree with the live option switched on later showed every column twice). The live subcategory now folds into the manual item, which keeps its title, badge and width and gains the live levels below it.

## [0.9.0-beta.1] - 2026-11-03

First public beta. See the README for supported Magento versions and
[Known limitations](./docs/known-limitations.md).

### Added
- Guest "Create an Account" offer on the order success page: core's `checkout.registration` block is kept and rendered with Hyperion's own template (a card with the order email and a link to `checkout/account/delegateCreate`, which pre-fills the registration form from the order).
- Layered navigation: visual swatch attributes render as color / image chips and text swatch attributes as pills (`LayerFilterSwatches` view model); every chip is a link with the HTMX grid swap and a "Label (count)" accessible name. Filter links carry the active filters in the fragment request, and the search results filters target the search fragment endpoint.
- Per variant stock notices on configurable products: "Only N left" for the chosen variant within `cataloginventory/options/stock_threshold_qty` (`SwatchConfig` `stockNotices`, `<hyperion-swatches stock-target>`).
- Cart line "Edit" (cart and mini-cart) opens core's `checkout/cart/configure` page with the line's options and quantity preselected (configurable, bundle, custom options); "Update Cart" replaces the line in place through `checkout/cart/updateItemOptions`.
- Mini-cart quantity stepper (minus, input, plus) posting to core's `checkout/cart/updatePost` like the cart page; a quantity the stock refuses, which core saves without a message, is reported as an error toast and printed under the line in the cart and in the drawer (`UpdatePostPlugin`, `CartData` item `messages`).
- Checkout: a guest's email and addresses survive a reload. The quote's data is emitted as `checkoutConfig.hyperion.guestQuote` (`GuestQuoteConfigProvider`) and hydrates the store at boot, the way a customer's quote already did.
- Checkout: a postcode that does not match the format of `zip_codes.xml` only raises a warning with the examples under the field, as in Luma; the address stays complete and the value is sent as typed. Only a missing postcode in a country outside `general/country/optional_zip_countries` blocks the order. Place Order is `aria-disabled` while something is missing, reveals the errors and focuses the first invalid field.
- Images: the storefront schedules the WebP / AVIF companion of a product image that has none (once per file and day, in the application cache), and core's resize service is hooked (`ScheduleCompanionsPlugin`), so `catalog:images:resize`, the admin save and `get.php` queue the companions too; `hyperion:image:convert --paths=catalog/product/cache` backfills a cache that predates the module in one pass. Local CMS images are wrapped in `<picture>` as soon as the companion exists.
- Listings: every toolbar, pager, filter and "Load more" request answers with the public listing URL as `HX-Push-Url` (one kind of URL in the history, never a fragment route), re-renders the layered navigation out of band while keeping the open cards and the focus, and a page number past the engine window (`p` x `limit` above 10000) is clamped and answered with a message and a link instead of an error.
- Popular Search Terms page (`/search/term/popular/`) rendered as pill links scaled by popularity, with an empty state (`Magento_Search::term.phtml`).
- Email a Friend: the form is styled without RequireJS (server rendered recipient rows up to the configured maximum, Add / Remove through `lib/sendfriend.js` loaded only on that page, reCAPTCHA and image CAPTCHA containers) and the product page action row shows the link when the feature is on and the visitor may use it (`HyperionCatalog\ViewModel\SendFriend`: guests need `sendfriend/email/allow_guest`).
- Storefront theme `Magentofullstackdev/hyperion` (no parent theme) with the
  `HyperionCore`, `HyperionCatalog`, `HyperionCatalogMode`, `HyperionCheckout`,
  `HyperionCustomer`, `HyperionNavigation`, `HyperionCms`, `HyperionImage`,
  `HyperionSearch` and `HyperionMegaMenu` modules and the optional
  `HyperionSampleData` module.
- Lit checkout application with offline payment methods, PayPal Express
  Checkout, Braintree (card, vault, 3D Secure) and lazily loaded payment
  renderers.
- PageBuilder support for every content type, PayPal smart buttons and Pay
  Later messages, MSRP, gift messages, self-service order cancellation, Login
  as Customer banner, store and currency switchers, downloadable, bundle,
  grouped and custom-option products.
- Varnish VCL with ESI fragments and tag-based invalidation.
- `hyperion` CLI (`npx -p @magentofullstackdev/hyperion-theme hyperion create Vendor/Theme`)
  that scaffolds a child theme.
- Catalog mode module (`Magentofullstackdev_HyperionCatalogMode`): purchasing
  limited to selected customer groups; Add to Cart, PayPal, reorder and the
  mini-cart disappear for everybody else and the cart / checkout routes
  redirect to the login page. Built on a purchase restriction pool in
  `HyperionCore` that other modules can extend.
- "Add to Cart from Listing Page" setting now controls the button on
  category, search and widget tiles.
- Search module (`Magentofullstackdev_HyperionSearch`): the header
  autocomplete queries the search engine (products), the search terms
  (popular queries with result counts) and the categories (with their path),
  and is cached at the edge and in the application cache; typo tolerance,
  SKU weight, promoted SKUs, stop words and a zero-results fallback on the
  search results page. The dropdown is a two-column layout on desktop
  (recent searches from the browser's localStorage, popular searches and
  categories beside a four-column product grid with the engine's total and
  a "View All (+N)" link) and a compact list on phones, with the query in
  bold wherever it occurs.
- Mega menu module (`Magentofullstackdev_HyperionMegaMenu`): menu groups per
  website and device built in the admin (Content > Menu > Menu Management:
  drag and drop tree, instant inspector form, import from categories, live
  subcategories, badges, customer group and store view limits, per store view
  values behind "Use Default Value"), rendered by the Hyperion navigation as
  a full width 12 column mega panel, a dropdown list or a vertical list, with
  CMS block columns, cached at the edge with the tags of everything it shows;
  the category tree stays the navigation until a group exists. A widget
  places any group on a page.
- Anti-abuse shield: rate limiter on the search and layered navigation
  routes (HTTP 429), parameter allowlist and maximum active filters on
  listings (HTTP 400), `noindex` on category pages with two or more filters,
  query string sorting in the Varnish VCL.
- Infinite loading of the listings: `Hyperion Theme > Catalog > Infinite
  Scroll` (`disabled`, `button`, `scroll` with a cap of automatic loads) and the
  per category override `hyperion_infinite_scroll`; the "Load more" link appends
  the next page of a category or of the search results in place. The search
  results grid has its own fragment endpoint (`hyperion/catalog/search`), so
  sort, page size, mode and page changes on search swap the grid like a category.
- Accessibility gate `frontend/e2e/pw-a11y.mjs` (axe-core on seven page
  types, fails on critical or serious violations); the mini-cart trigger is
  one control once upgraded (no link nested in the shadow button), the logo
  link's name starts with its visible text and the reCAPTCHA note reads at
  4.5:1 or better on light and inverted surfaces.
- No layout shift: server rendered skeletons for the swatch rows
  (tiles and product page) and the gallery thumbnail strip with the exact
  geometry of the components, columns kept from the first frame on pages with
  a rail, `width` and `height` added to local CMS images that carry neither;
  CLS 0 on every page type under throttling. Motion: a 120 ms
  cross-fade for page navigations (view transitions), htmx swaps fading in,
  the grid dimmed while it loads, components fading in; one knob
  (`--hyperion-motion-fast`), off under `prefers-reduced-motion`.
- Cart: "Estimate Shipping and Tax" in the summary card (destination, rates,
  applied method) and "Move to Wishlist" on every line for customers.
- Address forms (address book, registration) render the VAT number when
  `customer/create_account/vat_frontend_visibility` is on, and a
  `customer_form_address_user_attributes` child when a module schedules one.
- Checkout: gift message editor (order and item level, core web API), shipping
  policy dialog, Fixed Product Tax lines per item and FPT totals row; the
  mini-cart and the cart show the FPT lines too.
- Order pages (customer, guest, print): payment instructions and details
  (bank transfer, check / money order, purchase order number, the method's
  specific information) and the status comments visible on the storefront.
- Wishlist and compare sidebars on 2 / 3 column pages, rendered from the
  header-state fragments (no extra request); Recently Viewed / Recently
  Compared Products widgets rendered from a localStorage history written by
  product page views and compare clicks.
- Google Analytics 4 and Google Ads conversion (`google/gtag/*`) through
  `<hyperion-gtag>`: lazily loaded gtag.js honoring the cookie restriction
  mode, `view_item`, `view_item_list`, `add_to_cart`, `begin_checkout`,
  `purchase` and the Ads `conversion`.
- Accessibility: the mobile menu and mini-cart drawers are `inert` while
  closed, trap Tab while open, close on Escape and return the focus to the
  opener; carousel and slider arrows have default accessible names; the
  compare page has one `<h1>`.
- Styled pages: stored payment methods (delete behind the site dialog),
  tracking popup, print order / invoice / shipment / credit memo (customer
  and guest, with a document header and print stylesheet), single review
  page, Orders and Returns CMS widget (with form key).
- Product page: Open Graph and product price meta tags, "Only N left" and
  quantity increment notices with `min` / `max` / `step` on the quantity
  input, product videos in the gallery (privacy-enhanced iframe on a
  selected slide), MAP on configurable variants kept hidden by the swatches,
  bundle "Price as configured" running total with a selection summary,
  a star breakdown of the reviews.
- Listings: grid / list switch (list layout with the short description);
  the generic pager renders the per-page limiter.
- `setup:upgrade` creates the Terms and Conditions CMS page the footer links
  when it does not exist.
- The Playwright end-to-end suite ships in `frontend/e2e/` (`pnpm e2e`).
- Composer repository built with Satis from every release tag and published
  on GitHub Pages (`satis.json`, `.github/workflows/satis.yml`).
- Every Composer package (the 11 modules and the theme) carries its own `LICENSE`, and the two packages that ship a compiled bundle carry `THIRD_PARTY_LICENSES.txt` next to the assets (`web/` of the theme, `view/frontend/web/` of HyperionCheckout) with the full license text of every bundled library (lit, lit-html, lit-element, @lit/reactive-element, htmx.org, photoswipe, @lit-labs/signals, signal-polyfill); the file is written by the build, so it survives `emptyOutDir`, and the Satis script refuses an archive that lacks either file.
- Translations of every Hyperion phrase (theme templates, checkout, mega menu admin, module settings) in twelve locales next to the English source: `it_IT`, `de_DE`, `fr_FR`, `es_ES`, `pt_PT`, `nl_NL`, `pl_PL`, `ro_RO`, `uk_UA`, `nb_NO`, `sv_SE`, `da_DK` (`i18n/<locale>.csv` of the theme and of each module). Core strings still come from a Magento language pack (see [Languages](./docs/configuration.md#languages)). The `en_US.csv` catalogs were regenerated from `i18n:collect-phrases` minus the phrases core already lists.

### Changed
- The account dropdown is a disclosure (no `menu` role, no `aria-haspopup`); the store, language and currency switchers are plain lists. Arrow keys and Escape keep working inside the panel.
- Supported PHP versions are 8.3, 8.4 and 8.5 (`~8.3.0 || ~8.4.0 || ~8.5.0`, the range of `magento/framework` 103.0.9); PHP 8.2 is no longer declared.
- Drawers (mini-cart, mobile menu) lock the body scroll without the
  scrollbar layout jump (`scrollbar-gutter: stable`; where the gutter
  collapses the lock pads the body by the width the root actually gains),
  dismiss any open toast, and the mini-cart is 32rem wide.
- The account menu, the mobile menu and the mini-cart keep the footprint of
  their trigger until their component chunk defines them (no header flash
  on slow networks), and the dropdown's built-in trigger no longer takes
  space next to a slotted one.
- The header renders the wish list and compare icons in the cached markup
  with the same footprint as the fragments the header state swaps in, so
  the action bar no longer moves when the counts arrive.
- Success toasts close after 3.5 s (errors after 8 s).
- Category landing pages: a CMS widget bound to the category's own landing
  block renders once; the subcategory navigation of non-layered categories
  and the Luma "left menu" blocks are styled.

### Fixed
- The cart coupon form carries the `coupon_code` reCAPTCHA of `Magento_ReCaptchaCheckoutSalesRule` (`<hyperion-recaptcha>` rendered inside the HTMX form, token in the request body, a reCAPTCHA refusal answered as a toast instead of a redirect), sends `remove` only when canceling a coupon so the check really runs, and takes its five labels from translated attributes.
- The Luma sample "Privacy Policy" page menu toggles again: `lib/collapsible-nav.js` gives `.block-collapsible-nav > .title` button semantics on phones (role, tabindex, aria-expanded, aria-controls; click, Enter, Space) and `_widgets.css` styles the menu as a card.
- Every price box of the theme is guarded (related, upsell and cross-sell lists, the compare table, the product widgets, the cart cross-sells): a pricing failure prints `--` and degrades the request instead of an HTTP 500, and no block cache entry (`block_html`) is written during a degraded request, widgets included (`DegradedBlockCachePlugin`).
- PHP 8.5 deprecations removed: `imagedestroy()` in the GD encoder, `ReflectionProperty::setAccessible()` in the breadcrumbs observer and the image conversion plugin.
- A page or fragment that printed the `--` price fallback is no longer stored by the full page cache or Varnish, and the block cache skip now fires on the path the list and product templates really use (`ViewModel\Pricing`): a request-scoped `DegradedResponse` flag is raised by every price view model and applied once the page output is complete, because core sets the public headers again while price blocks render.
- Search autocomplete: the cached suggestions (tag `HYPERION_SEARCH_SUGGEST`,
  application cache and Varnish) are flushed whenever the
  `catalogsearch_fulltext` indexer runs, a category is saved or deleted, or
  the Hyperion Search configuration is saved; a query answered before a
  product was indexed shows the product after the reindex.
- Mega menu: the panel stays open while the pointer crosses the header strip
  between the root link and the panel (hover intent plus a hover bridge); the
  admin group form shows the saved websites again.
- Wishlist and compare sidebars follow the page layout (2columns-left: under
  the filters on the left; 2columns-right: on the right; 3columns: right rail;
  1column: under the inline filters of a category page; account pages: under
  the account menu) instead of always opening a right-hand column, and a
  disabled wishlist renders no sidebar at all.
- Search results sorted by relevance again: the layered navigation handed the
  toolbar its collection before the list block declared the search sort
  defaults, so every search page was sorted by category position and
  "Relevance" never showed as selected.
- Checkout: terms and conditions render again. Magento emits the agreement
  `mode` and `agreementId` as strings, which the bundle compared with
  numbers, so no checkbox was ever rendered and a required agreement made
  every order fail server-side; the config is normalized at boot. Accepted
  ids are sent as `paymentMethod.extension_attributes.agreement_ids`, where
  Magento's agreement validation reads them.
- Reduced motion is honored inside the shadow DOM components too (mini-cart, gallery, swatches, notification: each carries its own `prefers-reduced-motion` block, the document stylesheet never reaches a shadow root) and the JavaScript scroll calls take their `behavior` from `lib/reduced-motion.js`; the document rules shorten every duration instead of removing transforms, which would break the translate based panels.
- The header is sticky; every drawer returns the focus with `preventScroll`, otherwise Chrome scrolled the page on close, and `html:active-view-transition { overflow-x: clip }` removes the transient horizontal overflow of cross document transitions.
- Checkout: overlapping shipping estimates and shipping saves are tracked
  per request; a superseded response is ignored, an aborted estimate is not
  reported as an error, an address without rates clears the selected method
  and Place Order waits for the server to confirm the selected method.
- PageBuilder content types are rewritten only on storefront requests
  rendered by the Hyperion theme or one of its child themes.
- `ViewModelRegistry::optional()` logs a missing class, a construction
  failure or a non view model of an enabled module instead of returning null
  silently.
- The committed frontend assets are built from the repository lockfile
  (htmx 2.0.11); CI installs pnpm from `frontend/package.json`.
- Catalog mode guard: an exception thrown by the guarded action propagates
  instead of running the action a second time; the wishlist to cart, wishlist
  all to cart and reorder routes are guarded too.
- Review list fragment: the product must be assigned to the current website,
  enabled and visible, as in core's review controller; otherwise 404.
- Search autocomplete only offers products visible in search; the product
  description renders through the catalog output helper.
- Checkout: inline login signs in through the storefront AJAX login (session,
  quote merge, cookies) and reloads the checkout; REST and storefront URLs are
  built on the store's base URL emitted in the config, never on the static
  files host; a billing address entered on its own is put on the quote and
  the payment methods and totals are refreshed before the order; applying or
  removing a coupon refreshes the payment methods and the selection (`free`
  at a zero total); the address payload keeps VAT, fax, custom and extension
  attributes and identifies saved addresses; an optional or hidden telephone
  no longer blocks the order; `save_in_address_book` is always explicit.
- The search suggest and review fragments no longer carry `Pragma: cache`
  and a future `Expires` beside their private `Cache-Control`.
- Sample data: the Hyperion fixtures no longer abort `setup:install` when the
  Luma categories are missing (the products are created without a category
  and a warning is logged).
- Mage-OS 3.x: the theme removes the `MageOS_ThemeOptimization` view
  transitions opt-in and bfcache handler (Luma-specific, page error on
  redirected navigations) and keeps the speculation rules prefetch.
- A MAP variant wrote the struck MSRP over the whole `.map-old-price` wrapper and dropped its inner `.price` span (a selector list answers in document order); the inner span is now addressed first.
- Image conversion: `hyperion_image/general/max_pixels` (default 40 MP, 0 disables) refuses a source above the pixel budget before it is decoded (GD reads the header with `getimagesize`, Imagick with `pingImage`), and both encoders remove `<target>.tmp` in a single `finally` when a write or the rename fails.
- A product price that fails to render (the `--` fallback) is no longer stored in the block cache of the category grid or of the product page, and the cart page and mini-cart say "Unable to load cart details right now" instead of "Your cart is empty" when the quote or its totals could not be read (`CartData::hasLoadFailure()`).
- The footer showed the store views twice: core's language switcher duplicated Hyperion's store switcher (scope `all`) and is no longer rendered; the footer disclosures (store, currency) share a `name`, so opening one closes the other.
- Wishlist and compare sidebar cards were printed under the footer on 1column pages without the category view (home page, customer pages): the page layout moved their wrapper into a block that only category pages have, and Magento detaches an element whose move destination is missing. The wrapper now goes into the `hyperion.sidebar.inline` container, which every page has; the category handle moves that container under the inline filters (`Magento_Theme/page_layout/1column.xml`, `Magento_LayeredNavigation/page_layout/1column.xml`, `catalog_category_view.xml`). A hidden card no longer keeps its grid cell on the 1column row.
- Header on tablets: the top menu, the account, wish list and compare icons now appear from the `lg` breakpoint (1024px) and the burger drawer serves narrower screens; between 768 and 1023px the logo, six menu items and five icons overlapped.
- Product grid beside the layered navigation shows two tiles per row between 768 and 1279px (names, prices and buttons were breaking in three and four narrow columns); the wish list and compare labels of the tiles are icons only below `xl`; under 480px the Add to Cart label drops to one line (smaller text, no icon).
- Admin grids failed with "Not registered handle customer_listing_data_source" (Customers, Orders, every grid whose collection comes from the UI component `CollectionFactory`): the mega menu module registered its own grid collection in `etc/adminhtml/di.xml`, and an area di.xml replaces a global array argument instead of merging with it, so the adminhtml area kept one data source. The registration moved to the module's global `etc/di.xml`, where core registers its own.
- The Sign in link of the header account menu sent the customer to `/hyperion/header/state` after the login: the menu is rendered for the htmx header state request and core's `Customer\Model\Url` put that request's own URL in the `referer`. For an htmx request the login URL now carries the page the request came from (`HX-Current-URL`, own origin only; none when the "redirect to dashboard" setting is on) through `HyperionCore\Model\Htmx\RequestContext`.
- The wishlist and compare sidebars render on the category, search result and account pages only, as in Luma; they no longer appear on the home page, CMS pages, sign in, register and contact pages.
- `Magentofullstackdev_HyperionSampleData` replaces the Luma sample data stylesheet (`pub/media/styles.css`, linked by `design/head/includes`) at `setup:upgrade`: its floats and fixed widths squashed the privacy policy menu and the contact page, and everything else in it duplicated the theme's own styling of the sample content.
- Footer newsletter: the reCAPTCHA notice renders under the email field instead of between the lead text and the field.
- Luma sample data promo blocks: the "more" link arrow was printed as the text `\2192` (a doubled backslash in `_widgets.css`).
- Opening the mobile navigation drawer no longer focuses its search box, which raised the phone keyboard over the menu on every open; the focus goes to the first link, a tap on the box starts a search (`focusFirst(root, { avoidTextEntry: true })`).

### Security
- Rate limiter without configured trusted proxies: a public peer is the
  client and `X-Forwarded-For` is ignored; behind a proxy on a private
  network the bucket key is the peer plus the forwarded address left after
  dropping the known proxies (the peer, the literal IPs of
  `http_cache_hosts`) and at most one undeclared hop in the peer's subnet.
  The old key used the leftmost forwarded address, which let a visitor join
  another visitor's bucket or dodge the limit by rotating the header, and a
  walk to the first public address would have let a private client pick its
  bucket with a forged public prefix. The fallback is documented as a best
  effort; configure `hyperion/security/trusted_proxies` in production.
- Browser-facing HTML is never cacheable (Varnish still caches it), the purge
  ACL is restricted to localhost, HTML from cookies and responses is sanitized
  with an allowlist, htmx runs without eval or script tags.
- Frontend toolchain: Vite 6.4.5, Vitest 3.2.7, happy-dom 21, jsdom 30 and `pnpm.overrides` for `source-map-js`, `postcss-selector-parser`, `tinypool` and `minimatch` 9 take the workspace from 5 critical and 7 high advisories to none (`pnpm audit --prod` is clean; the three moderate ones left are in the Vitest runner, not in any shipped asset). The `hyperion create` scaffold pins the same Vite and writes the same overrides (`overrides` for npm, `pnpm.overrides` for pnpm), so a new child theme audits clean too; the root `frontend/package.json` scripts run through `pnpm -r` and `pnpm --filter`.

[Unreleased]: https://github.com/magentofullstackdev/hyperion/compare/v0.9.0-beta.5...HEAD
[0.9.0-beta.5]: https://github.com/magentofullstackdev/hyperion/compare/v0.9.0-beta.4...v0.9.0-beta.5
[0.9.0-beta.4]: https://github.com/magentofullstackdev/hyperion/compare/v0.9.0-beta.3...v0.9.0-beta.4
[0.9.0-beta.3]: https://github.com/magentofullstackdev/hyperion/compare/v0.9.0-beta.2...v0.9.0-beta.3
[0.9.0-beta.2]: https://github.com/magentofullstackdev/hyperion/compare/v0.9.0-beta.1...v0.9.0-beta.2
[0.9.0-beta.1]: https://github.com/magentofullstackdev/hyperion/releases/tag/v0.9.0-beta.1
