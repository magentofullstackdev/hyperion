# Architecture

How a Hyperion page is served, where the state lives and which pieces talk to each other. Read this before a change that crosses a module boundary. The per topic docs go deeper: [Varnish and caching](./docs/varnish.md), [Checkout](./docs/checkout.md), [PageBuilder](./docs/pagebuilder.md), [Child themes](./docs/child-themes.md), [Development](./docs/development.md).

## 1. The request path

```
browser
  |  HTTPS
  v
nginx ---> Varnish (ESI, cache by X-Magento-Vary, BAN by X-Magento-Tags)
             |  miss, or ESI include, or private route
             v
           nginx (Magento root) ---> php-fpm: Magento + Hyperion modules
```

Varnish runs the VCL shipped in `app/code/Magentofullstackdev/HyperionCore/etc/varnish/default.vcl`. Every HTML page and fragment reaches the browser as `no-store` (the browser never caches a page), while Varnish keeps the public ones. A page is public when no block on it is `cacheable="false"`; the cart, checkout, customer, wishlist and compare pages always have one and are never cached at the edge.

## 2. Three ways to render a dynamic piece

1. **ESI fragment** (`HyperionCore\Block\EsiFragment`, template `esi/fragment.phtml`). When the request carries `Surrogate-Capability: ESI/1.0` (the Hyperion VCL sets it) the block emits `<esi:include>` and Varnish assembles the page from separately cached pieces; without it the block renders its `inline` child in place. ESI fragments are session agnostic and registered in `PublicRouteRegistry`. Reference use: the desktop top menu, served by `hyperion/navigation/menu` with its own TTL and `X-Magento-Tags`.
2. **One header state request.** An edge cached page carries empty placeholders (`#hyperion-account-menu`, `#hyperion-wishlist-count`, `#hyperion-compare-count`, `#hyperion-mini-cart-count`). After load the header sends a single `hx-get` to `hyperion/header/state`; the response is every session fragment as an HTMX out of band swap. Modules contribute fragments by registering a layout handle and a block on `HyperionCore\Model\Htmx\HeaderStatePool` (`etc/frontend/di.xml`). Wishlist and compare membership on cached tiles comes from `data-*` attributes of these fragments (`lib/list-state.js`), never from a request per tile.
3. **HTMX actions.** Add to cart, wishlist, compare and cart mutations POST through HTMX to the CORE controllers; plugins in `HyperionCore/Plugin/` and `HyperionCheckout/Plugin/` detect the HTMX request and answer with fragments instead of a redirect: a toast (`NotificationRenderer`, placeholder `#hyperion-notification`), the refreshed header fragments (`FragmentRenderer`, out of band) and, for the cart page, the `hyperion_checkout_cart_fragment` handle. Messages are drained from Magento's message manager by `MessageCollector`. A guest action that needs a login answers `HX-Redirect` to the login page and core replays the action afterwards. Every Add to Cart, wish list and compare form carries `hx-sync="this:drop"`, so a second submit while the first is in flight is dropped; the Add to Cart button swaps its label for a busy text through CSS on the form's `htmx-request` class (no `hx-disabled-elt`, no `hx-indicator`).

htmx runs without eval, without script tags in swapped content and without a history snapshot (`historyCacheSize: 0`, `refreshOnHistoryMiss: true` in `HyperionCore\ViewModel\HtmxConfig`): Back and Forward across a pushed URL request the public URL again, so a page is never restored from a stale DOM copy.

## 3. Listings

Category and search grids are swapped in place. The toolbar (sort, limit, mode, direction), the pager, "Load more" and the layered navigation all target two fragment controllers, `hyperion/category/filter` and `hyperion/catalog/search`, rendered through `HyperionCatalog\Model\Listing\FragmentResponse`: the tiles, the layered navigation out of band, product cache tags, public cache headers, an `HX-Push-Url` header with the PUBLIC listing URL (built server side by `Model\Listing\ListingUrl`) and an `HX-Trigger` carrying the robots directive. `FilterGuard` sanitises the query (allowlist of filterable attributes, a cap on the number of filters, the page number clamped to the search engine window) and `InfiniteScroll` decides the loading mode per category. `FilterGuard` also validates the toolbar values (sort order, direction, mode, page size) against what the store offers. `ViewModel\Listing` is what every listing template shares: it builds every toolbar, pager and Load more URL (`getStateFragmentUrl()`, `getAppendFragmentUrl()`) with the active filters of the layer state. The grid root and the layered navigation carry `hx-sync="#<grid id>:replace"`, one request queue in which a newer listing request aborts the one in flight. When the search engine does not answer, the fragments answer a private "try again" message that nothing stores.

## 4. Catalog, images, search, navigation

- **Product page**: view models under `HyperionCatalog\ViewModel\` (`ProductView` gallery payload, `SwatchConfig` for `<hyperion-swatches>`, `Stock`, `Pricing` for guarded price boxes, `BundleOptions`, `ReviewBreakdown`); Open Graph tags through a plugin on the head renderer. Prices are rendered through the guarded view models: a price that fails to render marks the request degraded (`HyperionCore\Model\Cache\DegradedResponse`) so the page is not cached with a placeholder.
- **Images**: `HyperionImage` emits `<picture>` sources with WebP / AVIF companions it converts in a queue consumer; conversions are scheduled by a plugin on Magento's image resize service and, as a safety net, when a template asks for a companion that is missing. The HTML rewriter adds dimensions and the `<picture>` wrapper to CMS images. One off backfill: `bin/magento hyperion:image:convert`.
- **Search**: `HyperionSearch` serves the autocomplete fragment (`hyperion/search/suggest`, public, cached by store, vary string and query), tunes the engine queries (fuzziness, SKU and promoted boosts, stop words) and renders the zero results fallback.
- **Navigation**: `HyperionNavigation` renders the category tree; `HyperionMegaMenu` is a navigation source (`Model\Menu\SourcePool`) with an admin builder, one global tree per group with per store view values, and its own cache tag.

## 5. Checkout

`HyperionCheckout` replaces the Knockout checkout with a single Lit application (`frontend/packages/module-checkout`). The PHP side provides the config (`checkoutConfig`, composed by core's `CompositeConfigProvider` plus Hyperion providers: translations, locale, PayPal Express, the guest quote for hydration on reload) and renders the `#checkout-config` JSON island; the app talks to Magento through the standard REST endpoints with `X-Requested-With: XMLHttpRequest` so the storefront session is honoured. State is signal based; the flow actions number every shipping estimate and save so superseded responses are dropped; Place Order waits for pending shipping work and never orders against an address the server has not confirmed, stays locked after a successful order, and resolves a lost answer to the order request by reading the cart (`docs/checkout.md`, "Order safety"); address completeness is one predicate; payment methods are rendered by renderers registered in `components/payment-renderers/` (offline, vault, Braintree, PayPal). The cart page keeps server rendering: `ViewModel\CartData` for items and totals, the estimator through `Controller\Cart\Estimate`.

## 6. Purchase restrictions and the shield

Every template that renders a way to buy asks `HyperionCore\ViewModel\Purchase::canPurchase()`, which consults the `HyperionCore\Model\Purchase\Availability` pool (`RestrictionInterface`, registered in `etc/frontend/di.xml`). `HyperionCatalogMode` registers a customer group rule and a route guard (an around plugin on `ActionInterface::execute` that redirects the purchase routes). `HyperionCore\Model\Security\RateLimiter` throttles the fragment and search routes per client (route groups declared by each module), `ClientAddress` trusts `X-Forwarded-For` only behind configured proxies.

## 7. Frontend assets

- The theme build (Vite) writes hashed chunks and `web/manifest.json` into the theme; the checkout build writes into `HyperionCheckout/view/frontend/web/`. Both outputs are COMMITTED, because the code ships as Composer packages and consumers never run npm. `HyperionCore\Block\AssetManifest` and `HyperionCheckout\Block\Checkout` resolve the hashed names at request time. `HyperionCore/etc/config.xml` excludes the build output from Magento's JS and CSS minification by its file name shape (a hashed file directly under `assets/`), because the chunks import each other by name.
- `HyperionCore/view/frontend/templates/head/scripts.phtml` is the entry pipeline: preconnects, inline critical CSS, the entry stylesheet, HTMX as a standalone deferred UMD asset, then the ES module `entry.js`, which imports component chunks on demand (one chunk per `hyperion-*` component, lazy ones listed in `LAZY_COMPONENTS`). The pipeline sits at the top of `<body>`; the document head keeps `head.additional`, so head blocks of other modules render, and the theme removes by name only the core children that feed RequireJS.
- Components extend `HyperionLightElement` (light DOM so Tailwind utilities apply) unless they need a shadow root (gallery, carousel, mini-cart, dropdowns). Components that render after their chunk arrives ship a server rendered skeleton with the same geometry, so the page does not shift.
- Design tokens and the Tailwind preset live in `@magentofullstackdev/hyperion-shared`; child themes consume the preset and override tokens (`docs/child-themes.md`).

## 8. Invalidation

Every cacheable response carries `X-Magento-Tags`, and invalidation goes through one route: core's `clean_cache_by_tags` path (the `Magento_CacheInvalidate` observer), which sends a `PURGE` with the tag pattern to the hosts of `http_cache_hosts` on product, category and CMS saves (repository saves from imports and API writes included) and on `cache:clean full_page`. Hyperion sends its own tags down the same path and never purges by any other route: mega menu saves and image conversions invalidate their own tags; the suggest cache is flushed by the fulltext indexer, category saves and the search configuration section. Nothing is written to the block cache, the suggest cache or Varnish while a request is degraded (a price that failed to render, a search engine that does not answer). Details: [Varnish and caching](./docs/varnish.md#invalidation).

## 9. Where to add things

| You want to | Do this |
|---|---|
| a new storefront component | file under `frontend/packages/theme-default/src/js/components/`, reference it from a template through the asset manifest, test next to it |
| a new session fragment in the header | register a handle and block on `HeaderStatePool` in your module's `etc/frontend/di.xml` |
| a new HTMX action | a plugin on the core controller built from `HyperionCore/Model/Htmx/`, answering fragments and a toast |
| a purchase rule | a `RestrictionInterface` in the `Availability` pool |
| a payment method in the checkout | a renderer under `components/payment-renderers/` (`docs/checkout.md`) |
| a configuration option | `etc/adminhtml/system.xml` of the owning module, defaults in `etc/config.xml`, documented in `docs/configuration.md` |
