<p align="center">
  <img src="docs/assets/hyperion-banner.png" alt="Hyperion: Magento storefront theme built with Tailwind CSS, Lit and htmx" width="900">
</p>

# Hyperion

Hyperion is a Magento 2 storefront theme with no parent theme. It is built
with Tailwind CSS 3.4, Lit 3 light-DOM web components and HTMX 2, and it is
designed to be served through Varnish with ESI fragments. It does not use
RequireJS, jQuery or Knockout anywhere on the storefront. The theme ships with
ten PHP modules (core, catalog, catalog mode, checkout, customer, search,
mega menu, navigation, CMS, image) and an optional sample-data module, so one Composer
package installs the whole suite.

Built and maintained by [Sergiu Ro](https://magentofullstack.dev).

## Status

| | |
|---|---|
| Release | 0.9.0-beta.5, public beta |
| Website | [hyperionfront.dev](https://hyperionfront.dev) |
| Live demo | [demo.hyperionfront.dev](https://demo.hyperionfront.dev) |
| License | [MIT](./LICENSE) |
| Supported versions | see [SECURITY.md](./SECURITY.md) |

Beta means: the default flows of a Magento Open Source store (browse, search,
every product type, cart, checkout, account, orders) pass the same end-to-end
suite on every platform of the table below, but the long tail of native
features is not fully covered yet. Read [Known limitations](./docs/known-limitations.md) before you
plan a migration.

## Tested platforms

Hyperion supports two tiers ([support policy](./docs/compatibility.md#support-policy)):

- **Tier 1**: Magento Open Source 2.4.9 and Mage-OS 4.0, PHP 8.4 and 8.5.
  The full battery (the end-to-end suite with guest and logged-in customer
  journeys, every product type and orders placed; every feature script; the
  accessibility, layout shift and critical CSS gates; PHPUnit, phpstan,
  phpcs) runs on every release.
- **Tier 2**: Magento Open Source 2.4.8 and Mage-OS 3.6. One smoke battery
  per release candidate, best-effort fixes.

Tier 1 rows are rerun on every release, Tier 2 rows on every release
candidate; each row shows the release and the date of its run.

| Tier | Platform | PHP | Varnish | Mode | Release | Date | E2E suite |
|---|---|---|---|---|---|---|---|
| 1 | Magento Open Source 2.4.9 (clean install on Luma sample data) | 8.4 | 7.7 | developer | 0.9.0-beta.5 | 2026-11-11 | 84 / 84 |
| 1 | Magento Open Source 2.4.9, same install, JS and CSS minification on | 8.4 | 7.7 | production | 0.9.0-beta.5 | 2026-11-11 | 84 / 84 |
| 1 | Mage-OS 4.0.0 (clean install on Luma sample data, OpenSearch 3.9, Valkey 8.1, MariaDB 12.3) | 8.5 | 7.7 | developer and production | 0.9.0-beta.5 | 2026-11-11 | 84 / 84 |
| 1 | Magento Open Source 2.4.9 (clean install on Luma sample data, OpenSearch 3.9, Valkey 9, MariaDB 12.3) | 8.5 | 8 | developer and production | 0.9.0-beta.5 | 2026-11-12 | 84 / 84 |
| 2 | Magento Open Source 2.4.8-p5 (clean install on Luma sample data)| 8.3 | 7.6 | developer | 0.9.0-beta.5 | 2026-11-11 | 84 / 84 |
| 2 | Mage-OS 3.6.0 (clean install on Luma sample data, OpenSearch 3.9, Valkey)| 8.4 | 7.7 | developer | 0.9.0-beta.5 | 2026-11-12 | 84 / 84 |

Production mode: the second row is the dated production-mode battery, and
the [live demo](https://demo.hyperionfront.dev) is the standing
production-mode install. Counts per script, what was not tested, the
platforms that were tested before and are no longer supported, and the
PHPUnit notes: [Compatibility](./docs/compatibility.md).

## Requirements

- PHP 8.3, 8.4 or 8.5 (`~8.3.0 || ~8.4.0 || ~8.5.0`), with `ext-gd`;
  `ext-imagick` is recommended for large catalogs.
- Magento Open Source 2.4.8 or 2.4.9, or Mage-OS 3.6 or 4.0
  (`magento/framework ^103.0.8`). Older platforms keep resolving the last
  release that supported them, see
  [Compatibility](./docs/compatibility.md#previously-tested).
- Elasticsearch or OpenSearch as the search engine (the only engines Magento
  2.4 supports): the search module queries it for the autocomplete.
- Varnish in front of Magento is strongly recommended: the top menu is
  an ESI fragment and public fragments are cached at the edge. Varnish 7.4 to 8.x tested; the VCL is `vcl 4.1` and uses only `std`; 6.0 LTS untested.
  Without Varnish the fragments render inline; the built-in full page cache
  was not part of the test runs.
- Node.js 22 only if you build a child theme or work on the theme sources.
  Merchants installing through Composer never need Node: the build outputs
  are committed.

## Quick install

The verified procedure, run from the Magento root (details and every option in
[Install](./docs/install.md)):

```bash
composer config repositories.hyperion composer https://magentofullstackdev.github.io/hyperion/
composer config minimum-stability beta      # beta release; prefer-stable keeps everything else stable
composer config prefer-stable true
composer require magentofullstackdev/theme-hyperion:^0.9.0-beta.5
composer require magentofullstackdev/module-hyperion-sample-data:^0.9.0-beta.5   # optional, Luma sample data stores only
bin/magento setup:upgrade
bin/magento setup:di:compile
bin/magento setup:static-content:deploy -f
bin/magento config:set design/theme/theme_id <id of Magentofullstackdev/hyperion in the theme table>
bin/magento config:set hyperion_checkout/general/enabled 1
bin/magento config:set system/full_page_cache/caching_application 2
bin/magento setup:config:set --http-cache-hosts=<varnish host>:<port>
bin/magento config:set hyperion/security/trusted_proxies <varnish ip>,<tls proxy ip>   # when PHP sits behind a proxy
bin/magento cache:flush
```

Then load `app/code/Magentofullstackdev/HyperionCore/etc/varnish/default.vcl`
into Varnish after adapting the backend host / port and the purge ACL
([Varnish](./docs/varnish.md)).

Installing the modules does not change a Luma storefront: nothing Hyperion
renders until the theme is assigned.

## What you get

**Catalog**: product listing with layered navigation, HTMX sort / page size /
filters, configurable swatches, add to cart from the listing (inline picker),
product page with gallery and lightbox, tabs, tier prices, reviews, custom
options, bundle, grouped, downloadable and virtual products, MSRP / MAP
("click for price"), wishlist and compare with membership state on cached
pages, advanced search, WebP / AVIF generation for catalog images (queue
consumer or synchronous), catalog mode (purchasing limited to selected
customer groups: no Add to Cart, no mini-cart, cart and checkout routes
redirect to the login page).

**Languages**: every Hyperion string is translated in twelve locales next to
English (it, de, fr, es, pt, nl, pl, ro, uk, nb, sv, da) and ships with the
theme and the modules; Magento's own strings come from the language pack of
your choice, as usual (see [Languages](./docs/configuration.md#languages)).

**Search**: the header autocomplete is driven by the search engine (products
with the engine's total, popular terms, categories with their path, recent
searches from the browser), cached at the edge and in the application cache;
typo tolerance, SKU and promoted-SKU boosts, stop words and a zero-results
fallback on the results page.

**Mega menu**: menu groups built in the admin (Content > Menu > Menu
Management) with a drag and drop tree, import from categories, live
subcategories, badges, CMS block columns, customer group / store view / device
limits and per store view values; rendered by the Hyperion navigation as a
full width mega panel, a dropdown list or a vertical list, cached at the edge
with the tags of everything it shows. Without a group the category tree is
the menu, as before.

**Infinite loading**: category and search listings paginate, append the next
page with a "Load more" link, or load automatically while scrolling (with a
cap), per store and per category.

**Anti-abuse shield**: a rate limiter on the search and layered navigation
routes (HTTP 429), a parameter allowlist and a maximum number of active
filters per request (HTTP 400), `noindex` on multi-filter category pages, and
query string sorting in the Varnish VCL so filter permutations share one
cache entry.

**Checkout**: a single-page Lit checkout (address, shipping, payment, review)
driven by Magento's REST API, behind a feature flag (`hyperion_checkout/general/enabled`,
default off). Cart page and mini-cart with coupon, gift messages, downloadable
links and bundle selections, PayPal smart buttons and Pay Later messages on
the storefront.

**Payment methods in the checkout** (verification status from the test
reports):

| Method | Status |
|---|---|
| Check / money order, bank transfer, cash on delivery, purchase order (number required, stored on the order), free | verified; instructions and the purchase order number by the automated checks of 2026-11-11 on Magento 2.4.9 |
| PayPal Express Checkout, in-context (smart button) | verified with real sandbox payments (on a platform now in "Previously tested") |
| PayPal Express Checkout, redirect flow (`in_context = 0`) | reaches PayPal, payment completion not verified |
| Braintree card (hosted fields), vault, 3D Secure | verified against a Braintree sandbox (on a platform now in "Previously tested") |
| Braintree PayPal | renderer exists, not tested |
| Braintree Google Pay (with 3D Secure and stored cards) | button verified against the Braintree sandbox; payment not verified |
| Everything else | listed as "not supported by this checkout yet" |

**Customer**: registration (optional address fields), login, password reset,
account dashboard, address book with region selector, name prefix / suffix,
orders with invoices, shipments, credit memos, print, reorder, self-service
order cancellation, Login as Customer banner, wishlist (sharing,
edit with options), newsletter, product alerts, my downloadable products,
cookie restriction notice, reCAPTCHA on every form.

**CMS / PageBuilder**: every PageBuilder content type renders with its admin
settings, without RequireJS ([PageBuilder](./docs/pagebuilder.md)); full-width
page layouts for CMS pages, categories and products; store, store view and
currency switchers; transactional email CSS.

**Performance and SEO**: a local Lighthouse run on 2026-11-11 against
Magento 2.4.9 (mobile and desktop presets, CPU slowdown 4x; a lab number on
a developer machine, not a field measurement) scored performance 100 on the
home page, a category, a product page and the cart on both presets (eight
runs), with a cumulative layout shift of 0.
Cumulative layout shift is 0 on nine page types (home, a category in grid
and in list mode, a top-level category landing, a configurable and a simple
product, search results, cart, contact), desktop and phone, under a throttled
network and CPU: components that arrive after their chunk render
on top of server rendered skeletons with the same geometry. Third-party
scripts (PayPal SDK, reCAPTCHA, Braintree, Google Maps) load only on first
interaction or when the relevant element is on the page. Open Graph and
product price meta tags on the product page (on Mage-OS 4.0 the platform's
SEO module emits them, see [Compatibility](./docs/compatibility.md#mage-os-40-seo-module)); GA4 and Google Ads events
through a lazily loaded `<hyperion-gtag>`.

**Motion**: a 120 ms cross-fade between pages (view transitions), htmx swaps
fading in, the grid dimmed while it loads; one CSS knob
(`--hyperion-motion-fast`) sets it for the whole storefront and
`prefers-reduced-motion` turns it off.

## Known limitations

The short version; the full list is in [Known limitations](./docs/known-limitations.md).

- Analytics is GA4 / Google Ads only (no Universal Analytics, no Tag Manager).
- Multishipping and in-store pickup are not available.
- Magento's HTML minification (`dev/template/minify_html`) must stay off;
  JS and CSS minification are supported.
- Third-party extensions with Knockout / RequireJS frontends need an adapter.
- A few rarely used core pages (billing agreements, the RSS and
  multishipping pages) render core markup without styling.
- Adobe Commerce / B2B were not tested.

## Documentation

- [Install](./docs/install.md)
- [Configuration](./docs/configuration.md)
- [Varnish and caching](./docs/varnish.md)
- [Child themes](./docs/child-themes.md)
- [Checkout and payment renderers](./docs/checkout.md)
- [PageBuilder](./docs/pagebuilder.md)
- [Compatibility](./docs/compatibility.md)
- [Known limitations](./docs/known-limitations.md)
- [Development](./docs/development.md)
- [Architecture](./ARCHITECTURE.md)
- AI coding assistants: [CLAUDE.md](./CLAUDE.md), [AGENTS.md](./AGENTS.md), [llms.txt](./llms.txt)
- [Changelog](./CHANGELOG.md)

Frontend package READMEs: [`@magentofullstackdev/hyperion-shared`](./frontend/packages/shared/README.md),
[`@magentofullstackdev/hyperion-theme`](./frontend/packages/theme-default/README.md),
[`@magentofullstackdev/hyperion-checkout`](./frontend/packages/module-checkout/README.md).

## Contributing, security, license

- [CONTRIBUTING.md](./CONTRIBUTING.md): ground rules and development setup.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md): Contributor Covenant 2.1.
- [SECURITY.md](./SECURITY.md): how to report a vulnerability.
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md): bundled libraries.
- [LICENSE](./LICENSE): MIT.
