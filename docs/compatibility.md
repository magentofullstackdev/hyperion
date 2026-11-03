# Compatibility

## Declared requirements

| | Value |
|---|---|
| PHP | `~8.3.0 \|\| ~8.4.0 \|\| ~8.5.0`, `ext-gd` (`ext-imagick` suggested) |
| Magento framework | `magento/framework ^103.0.6` (Magento Open Source 2.4.6+, Mage-OS 2.x and 3.x) |
| Magento modules | `magento/module-catalog >= 104.0.0`, `magento/module-media-storage >= 100.4.0`, the others unconstrained. Hard requirements on core modules that a store could in principle remove: `magento/module-re-captcha-ui` (Core), `magento/module-page-builder` (Cms), `magento/module-wishlist` (Customer), `magento/module-elasticsearch` and `magento/module-advanced-search` (Search), `magento/module-backend`, `module-ui`, `module-widget` (MegaMenu); all of them ship with every Open Source and Mage-OS install |
| Search engine | Elasticsearch or OpenSearch (the Search module queries the engine) |
| Varnish | VCL written for Varnish 6.x / 7.x |
| Node.js | `>= 22` (child themes and development only) |

## Tested matrix

Every row ran the complete set of checks (the end-to-end suite, 71 checks
when rows A to C ran and 74 since the success page offer joined it, plus
every feature check: `pw-search-shield.mjs`, `pw-megamenu.mjs`,
`pw-megamenu-admin.mjs`, `pw-infinite-scroll.mjs`, `pw-cls.mjs`,
`pw-ui-polish.mjs`, the cart, order, catalog and fallback page checks,
PHPUnit, phpstan and phpcs) on the dates given in the table. Rows D, E and F
ran last (the `pw-a11y.mjs` accessibility gate, `pw-search-shield.mjs`,
`pw-ui-polish.mjs`, `pw-cls.mjs` and the suite on 2026-10-30; the other
feature checks on 2026-10-29 on rows D and E, not on row F). Every row is
rerun before a tag.

| Environment | Magento | PHP | Varnish | Install | Mode | E2E suite | phpstan L5 | phpcs errors | PHPUnit |
|---|---|---|---|---|---|---|---|---|---|
| A | Magento Open Source 2.4.7-p10 | 8.3 | 7.4 | Composer path repository, symlinked | developer | 71 / 71 | 0 | 0 | 208 (PHPUnit 9, 2026-10-28) |
| B | Magento Open Source 2.4.8-p5 | 8.3 | 7.6 | Composer, copied, clean install on Luma sample data | developer and production | 71 / 71 (both modes) | 0 | 0 | 208 (PHPUnit 10, 2026-10-29) |
| C | Mage-OS 2.3.0 | 8.4 | 7.7 | Composer, copied | developer | 71 / 71 | 0 | 0 | 208 (PHPUnit 10, 2026-10-29) |
| D | Magento Open Source 2.4.9 | 8.4 | 7.7 | Composer, copied, clean install on Luma sample data | developer | 74 / 74 | 0 | 0 | 291 (PHPUnit 12, 2026-10-30) |
| E | Mage-OS 3.6.0 (OpenSearch 3.9, Valkey 8.1) | 8.4 | 7.7 | Composer, copied, `create-project` from repo.mage-os.org + Luma sample data | developer | 74 / 74 | 0 | 0 | 291 (PHPUnit 12, 2026-10-30) |
| F | Magento Open Source 2.4.9 (OpenSearch 3.9, Valkey 9, MariaDB 12.3) | 8.5 | 8 | Composer, copied, clean install on Luma sample data | developer | 74 / 74 | 0 | 0 | 291 (PHPUnit 12, 2026-10-30, no deprecation reported) |

The E2E suite covers every page type, add to cart for every product type
(simple, configurable, grouped, bundle, downloadable, virtual, custom
options), compare, wishlist, cart, a guest order and a customer order, and
the account and order pages, as a guest and as a logged-in customer. The
VCL and sanitizing fixes (browser-side `no-store` headers, purge ACL,
tag-based image invalidation, message sanitizing) were retested on the first
three environments afterwards: suite 71 / 71 each, `PURGE` through the public
host answers 405, Varnish still serves `MISS` then `HIT`.

Feature checks beyond the suite (all three environments unless noted):
PageBuilder kitchen sink and full-width layouts; 3-column layout; wishlist
swatch pre-selection; registration address fields and region selector;
address prefix / suffix; MSRP; gift messages; order cancellation; Login as
Customer banner; currency switch with Varnish (MISS then HIT, vary cookie
kept); horizontal overflow on every product type; transactional email CSS;
store switcher (B with a second store view, C across websites);
downloadable products end to end (B); PayPal Express with real sandbox
payments (C; A and B only verified that nothing PayPal-related renders or
loads when the module is disabled); payment renderer lazy loading (C real,
A and B simulated); Braintree card, vault and 3D Secure against a Braintree
sandbox (A).

Frontend unit tests: 644 (theme 331, checkout 313). PHPUnit: ten modules
have tests (Catalog, CatalogMode, Checkout, Cms, Core, Customer, Image,
MegaMenu, SampleData, Search), 435 tests on the release tree; the counts in
the matrix are the tests reported by the PHPUnit version of each platform on
the date given, when the tree had fewer tests. The CI workflows in `.github/workflows/` run the same gates on a
Mage-OS project pinned to the 3.6 minor (PHP 8.3, 8.4 and 8.5) plus a
non-blocking job on the latest Mage-OS release; they had not run on GitHub
yet at the time of writing.

## PHP and PHPUnit notes

- PHP 8.3, 8.4 and 8.5 are the declared range, the same as
  `magento/framework` 103.0.9. PHP 8.2 is no longer declared.
- Magento 2.4.7 declares `ManagerInterface::addErrorMessage()` /
  `addSuccessMessage()` for `string`; Hyperion casts its `Phrase` messages
  so the same code passes phpstan on 2.4.7 and on 2.4.8+.
- Magento 2.4.8 and Mage-OS 2.x run PHPUnit 10, Magento 2.4.9 and Mage-OS 3.x
  PHPUnit 12 (data providers need the `#[DataProvider]` attribute, which the
  tests carry next to the annotation); 2.4.7 runs PHPUnit 9. Hyperion's
  unit tests avoid PHPUnit 9 only APIs (`withConsecutive`, `at()`) and run
  on both.
- `Magento_Theme::root.phtml` prints `$headCritical` and `$headAssets` when
  they exist (2.4.8 and Mage-OS 2 add them), so one template serves every
  version.
- Magento 2.4.8+ / Mage-OS: Symfony Mailer rejects `sendmail_path` helper
  scripts; configure SMTP (see [Install](./install.md)).

## Not tested

- Production mode on Magento 2.4.9 and Mage-OS (developer mode only).
- Mage-OS 3.x `MageOS_ThemeOptimization`: the theme keeps the speculation
  rules prefetch and removes the view transitions opt-in and the bfcache
  handler (both written for Luma; the transition opt-in raised a page error on
  redirected navigations). Its response plugin that strips `no-store` only
  acts with the built-in page cache, not with Varnish.
- Magento 2.4.6 (allowed by the framework constraint, never installed).
- PHP 8.2 (dropped from the Composer constraints).
- Adobe Commerce, B2B, Dynamic Blocks, gift cards and every other
  Commerce-only feature.
- Braintree PayPal in the checkout (renderer exists, no PayPal account was
  linked to the sandbox), Apple Pay, Google Pay.
- PayPal Express redirect flow (`in_context = 0`) through to the placed
  order, and `payflow_express` against a live account (unit tested only).
- Real payments on Magento 2.4.7 / 2.4.8 (PayPal was paid for real on
  Mage-OS only, Braintree on 2.4.7 only).
- Downloadable link download limits and shareable links.
- Persistent cart ("Remember Me"): not exercised. Fixed product tax is
  covered by the cart features check (`pw-cart-features.mjs --with-fpt`) and
  the swatch filter chips by `pw-catalog-completeness.mjs`, both on Magento
  2.4.9.
- Third-party extensions of any kind.
