# Compatibility

## Support policy

- Tier 1: Magento Open Source 2.4.9 and Mage-OS 4.0, PHP 8.4 and 8.5. Full battery on every release, blocking CI gate.
- Tier 2: Magento Open Source 2.4.8 and Mage-OS 3.6 (upstream no longer maintains 3.6 since 4.0 shipped; expected to work, kept at no code cost). One smoke battery per release candidate, best-effort fixes, not in the CI gate.
- Dropped: Magento 2.4.7 and Mage-OS 2.x. `0.9.0-beta.4` is the last release whose notes mention them; those rows were last verified on 2026-10-29. Newer `magento/framework` versions install but are untested until their row appears.

Tier 1 rows are rerun on every release, Tier 2 rows on every release
candidate. Each row of the matrix below shows the release it was run on and
the date of the run.

## Declared requirements

| | Value |
|---|---|
| PHP | `~8.3.0 \|\| ~8.4.0 \|\| ~8.5.0`, `ext-gd` (`ext-imagick` suggested) |
| Magento framework | `magento/framework ^103.0.8`: Magento Open Source 2.4.8 and 2.4.9, Mage-OS 3.6 and 4.0 |
| Magento modules | `magento/module-catalog >= 104.0.8` and `magento/module-media-storage >= 100.4.7` (HyperionImage, the 2.4.8 versions), the others unconstrained. Hard requirements on core modules that a store could in principle remove: `magento/module-re-captcha-ui` (Core), `magento/module-page-builder` (Cms), `magento/module-wishlist` (Customer), `magento/module-elasticsearch` and `magento/module-advanced-search` (Search), `magento/module-backend`, `module-ui`, `module-widget` (MegaMenu); all of them ship with every Open Source and Mage-OS install |
| Search engine | Elasticsearch or OpenSearch (the Search module queries the engine) |
| Varnish | Varnish 7.4 to 8.x tested; the VCL is `vcl 4.1` and uses only `std`; 6.0 LTS untested |
| Node.js | `>= 22` (child themes and development only) |

What the framework constraint means in practice: Magento 2.4.8 and 2.4.9
resolve, and so do Mage-OS 3.6 and 4.0 (both replace `magento/framework`
103.0.9, Composer cannot tell them apart). What it means for the dropped
platforms is under [Previously tested](#previously-tested).

## Tested matrix

The full battery is the end-to-end suite (guest and logged-in customer
journeys, every product type, orders placed), every feature script of
`frontend/e2e/` (listed with its count below), the accessibility, layout
shift and critical CSS gates, PHPUnit, phpstan level 5, phpcs with the
Magento2 standard and the plugin target check
(see [Development](./development.md)). A smoke battery is PHPUnit, phpstan
level 5 and four scripts: `pw-suite.mjs`, `pw-a11y.mjs`, `pw-cls.mjs` and
`pw-listing-state.mjs`.

| Tier | Platform | PHP | Varnish | Install | Mode | Release | Date | E2E suite | Feature scripts | PHPUnit | phpstan L5 errors | phpcs errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Magento Open Source 2.4.9 (MariaDB, OpenSearch 3) | 8.4 | 7.7 | Composer, copied, clean install on Luma sample data | developer | `0.9.0-beta.5` | 2026-11-11 | 84 / 84 | all green, counts below | 692 (PHPUnit 12) | 0 | 0 |
| 1 | Magento Open Source 2.4.9, same install, JS and CSS minification on | 8.4 | 7.7 | Composer, copied, `setup:static-content:deploy` | production | `0.9.0-beta.5` | 2026-11-11 | 84 / 84 | `pw-cls` 6, `pw-critical` 39, `pw-a11y` 14, `pw-ui-polish` 26, `pw-listing-state` 26, `pw-cart-features` 51 | not rerun (same code as the row above) | not rerun | not rerun |
| 1 | Mage-OS 4.0.0 (MariaDB 12.3, OpenSearch 3.9, Valkey 8.1) | 8.5 | 7.7 | Composer, copied, `create-project` from repo.mage-os.org + Luma sample data | developer | `0.9.0-beta.5` | 2026-11-11 | 84 / 84 | all green, see the note on counts below | 692 (PHPUnit 12) | 0 | 0 |
| 1 | Magento Open Source 2.4.9 (MariaDB 12.3, OpenSearch 3.9, Valkey 9) | 8.5 | 8 | Composer, from the published Composer repository, clean install on Luma sample data | developer | `0.9.0-beta.1` | 2026-10-30 | 74 / 74 | not rerun for `0.9.0-beta.5`, see below | 291 (PHPUnit 12) | 0 | 0 |
| 2 | Magento Open Source 2.4.8-p5 | 8.3 | 7.6 | Composer, copied, clean install on Luma sample data | developer | `0.9.0-beta.5` | 2026-11-11 | 84 / 84 | smoke set: `pw-a11y` 14, `pw-cls` 6, `pw-listing-state` 26 | 692 (PHPUnit 10) | 0 | not in the smoke battery |
| 2 | Mage-OS 3.6.0 (OpenSearch 3.9, Valkey 8.1) | 8.4 | 7.7 | Composer, copied, `create-project` from repo.mage-os.org + Luma sample data | developer | `0.9.0-beta.5` | 2026-11-12 | 84 / 84 | smoke set: `pw-a11y` 14, `pw-cls` 6, `pw-listing-state` 26 | 692 (PHPUnit 12) | 0 | not in the smoke battery |

The plugin target check passed on every row run for this release (every
plugin method of the modules targets an existing public method of its
subject).

The Magento 2.4.9 / PHP 8.5 / Varnish 8 row is an install that takes the
packages from the published Composer repository, so it cannot run a release
before its publication: it keeps the release and date of its last battery and
is rerun once `0.9.0-beta.5` is published. PHP 8.5 is covered for this
release by the Mage-OS 4.0 row, and the shipped VCL of this release compiles
(`varnishd -C`) on Varnish 8.0, 7.7, 7.6 and 7.4.

On the Mage-OS 4.0 row every script passed too; four of them count fewer
checks there because the install has one store view, one currency and no
reCAPTCHA keys (`pw-megamenu-admin.mjs` 21, `pw-cart-features.mjs` 45,
`pw-fallback-pages.mjs` 57, `pw-catalog-completeness.mjs` 38). On that row
the Open Graph and JSON-LD checks ran against the platform SEO module, see
"Mage-OS 4.0 SEO module" below.

Counts of the first row (Magento 2.4.9, PHP 8.4, developer mode,
2026-11-11), one line per script, every check passed:

| Script | Checks |
|---|---|
| `pw-suite.mjs` (guest and customer journeys) | 84 |
| `pw-a11y.mjs` (accessibility gate) | 14 |
| `pw-ui-polish.mjs` | 26 |
| `pw-cls.mjs` (layout shift, CLS 0) | 6 |
| `pw-critical.mjs` | 39 |
| `pw-search-shield.mjs` | 45 |
| `pw-catalogmode.mjs` | 35 |
| `pw-megamenu.mjs` | 19 |
| `pw-megamenu-admin.mjs` | 22 |
| `pw-infinite-scroll.mjs` | 15 |
| `pw-cart-features.mjs` | 51 |
| `pw-agreements.mjs` | 15 |
| `pw-orders-widgets-ga4.mjs` | 49 |
| `pw-fallback-pages.mjs` | 62 |
| `pw-catalog-completeness.mjs` | 39 |
| `pw-checkout-login.mjs` | 9 |
| `pw-sidebars.mjs` | 12 |
| `pw-cart-edit.mjs` | 20 |
| `pw-variant-stock.mjs` | 7 |
| `pw-listing-state.mjs` | 26 |

Frontend unit tests (Vitest) on the release tree: theme 374, checkout 407.
PHPUnit: all eleven modules have tests; the count in the matrix is what
the PHPUnit version of the platform reports.

Lighthouse, run locally against the first row's install on 2026-11-11
(mobile and desktop presets, CPU slowdown 4x) on the home page, a category,
a product page and the cart: performance 100 on all eight runs, cumulative
layout shift 0. It is a lab number on a developer machine, not a field
measurement.

### Production mode

The second row is a battery in production mode on Magento 2.4.9 with
Magento's JS and CSS minification on (`dev/js/minify_files`,
`dev/css/minify_files`), run on 2026-11-11: every Hyperion asset kept its file name and answered 200 (71 static files, every import between them), and the seven scripts of that row passed (246 checks). The
public demo ([demo.hyperionfront.dev](https://demo.hyperionfront.dev),
Magento 2.4.9, PHP 8.5, Varnish 8) runs in production mode and is the
standing production-mode install. HTML minification
(`dev/template/minify_html`) is not supported in this release, see
[Known limitations](./known-limitations.md).

### What the suite covers

Every page type, add to cart for every product type (simple, configurable,
grouped, bundle, downloadable, virtual, custom options), compare, wishlist,
cart, a guest order and a customer order, the guest success page offer and
the delegated registration, the newsletter form, an address edit before the
order, and the account and order pages, as a guest and as a logged-in
customer. The feature scripts are described one by one in
[Development](./development.md#end-to-end-suite).

## Previously tested

Platforms that are no longer supported. The results are the last ones
recorded for them; nothing was rerun since.

| Platform | PHP | Varnish | Install | Mode | E2E suite | phpstan L5 errors | phpcs errors | PHPUnit | Last release that lists it | Last verified |
|---|---|---|---|---|---|---|---|---|---|---|
| Magento Open Source 2.4.7-p10 | 8.3 | 7.4 | Composer path repository, symlinked | developer | 71 / 71 | 0 | 0 | 208 (PHPUnit 9, 2026-10-28) | `0.9.0-beta.4` | 2026-10-29 |
| Mage-OS 2.3.0 | 8.4 | 7.7 | Composer, copied | developer | 71 / 71 | 0 | 0 | 208 (PHPUnit 10, 2026-10-29) | `0.9.0-beta.4` | 2026-10-29 |

Composer and the dropped platforms: Magento 2.4.7 ships `magento/framework`
103.0.7 and no longer resolves this release; such a project keeps
`0.9.0-beta.4`, the last compatible release. Mage-OS 2.3 replaces 103.0.8
and therefore still resolves although it is dropped: not supported, not
blocked.

Two verifications were made on these platforms only and were not repeated
on the supported ones: PayPal Express with real sandbox payments (Mage-OS
2.3.0) and Braintree card, vault and 3D Secure against a Braintree sandbox
(Magento 2.4.7-p10). The renderers and their unit tests are unchanged in
that respect; see "Not tested" below.

## CI

`.github/workflows/php.yml` installs a Mage-OS project from
`repo.mage-os.org`, installs Hyperion into it from the checkout and runs
`setup:di:compile`, the plugin target check, phpcs (errors only), phpstan
level 5 and PHPUnit for every module that has tests. Two legs are blocking:
Mage-OS 4.0 with PHP 8.4 and with PHP 8.5. Three legs are informative and
never fail the workflow: PHP 8.3 on Mage-OS 4.0, Mage-OS 3.6 on PHP 8.4,
and a nightly canary that installs the newest Mage-OS release on PHP 8.5.
The blocking legs also validate the twelve Composer manifests and check that
the fifteen version fields agree. `.github/workflows/frontend.yml` runs the
type check, the lint, the unit tests and the build, and fails when the
committed assets differ from a fresh build. Details:
[Development](./development.md#ci-workflows). Magento Open Source itself is
not installed in CI (its repository needs authentication keys); the Magento
rows of the matrix come from the batteries above.

## PHP and PHPUnit notes

- PHP 8.3, 8.4 and 8.5 are the declared range, the same as
  `magento/framework` 103.0.9. PHP 8.2 is not declared.
- Magento 2.4.8 declares `ManagerInterface::addErrorMessage()` /
  `addSuccessMessage()` for `string` (2.4.9 accepts `string|\Stringable`);
  Hyperion casts its `Phrase` messages so the same code passes phpstan on
  every supported version.
- Magento 2.4.8 runs PHPUnit 10; Magento 2.4.9, Mage-OS 3.6 and Mage-OS 4.0
  run PHPUnit 12. Data providers carry the `#[DataProvider]` attribute only
  (annotations are gone in PHPUnit 12), and the tests avoid the APIs removed
  after PHPUnit 9 (`withConsecutive`, `at()`).
- `Magento_Theme::root.phtml` prints `$headCritical` and `$headAssets`,
  which every supported version provides.
- Symfony Mailer (every supported version) rejects `sendmail_path` helper
  scripts; configure SMTP (see [Install](./install.md#mail)).
- Mage-OS 4.0 adds `MageOS_PasskeyAuth`, which depends on `Magento_TwoFactorAuth`:
  a development install that switches the admin 2FA off has to disable the two
  modules together (`module:disable MageOS_PasskeyAuth Magento_TwoFactorAuth`).

## Mage-OS 4.0 SEO module

Mage-OS 4.0 ships `MageOS_Seo`, which prints Open Graph tags and JSON-LD
structured data through the page head. The two sources never overlap:

- **Open Graph.** With the module enabled and its "Enable OG Tags" option on
  (`mageos_seo_general/og_tags/enabled`, store scope, on by default), the
  module is the one source of Open Graph tags and Hyperion emits none. With
  the option off, or without the module, Hyperion emits its own tags on
  product pages. The option is the switch: removing the module's block by
  name while the option stays on leaves the product page without Open Graph.
- **Differences when the module owns the tags.** `product:availability`
  reads `in stock` / `out of stock` (Hyperion: `instock` / `oos`);
  `og:description` is cut at 160 characters (Hyperion: 300); `og:image` is
  the large product page image (Hyperion: the base image); `og:site_name` is
  the organization or store view name; the module adds `og:locale` and the
  `twitter:*` card tags, and prints `og:*` on category and CMS pages too.
- **Structured data.** The module's JSON-LD `Product` is the structured data
  of a product page, and by default (`structured_data/remove_theme_microdata`)
  the module strips the theme's schema.org microdata from that page, so
  there is one description of the product. The review list loaded through
  htmx is a separate response the module does not process: it keeps its
  microdata.
- **Meta description.** No overlap: the module never writes
  `<meta name="description">`; Hyperion's fallback
  (`hyperion/seo/meta_description_fallback`) fills an empty one as on
  Magento.

On Magento Open Source nothing changes: Hyperion emits the product Open
Graph tags and the microdata.

## Not tested

- Production mode on Mage-OS (the production battery ran on Magento 2.4.9).
- HTML minification (`dev/template/minify_html`): not supported in this
  release, see [Known limitations](./known-limitations.md).
- A child theme deployed with Magento's JS minification on: the file names
  of the scaffold were checked against the exclude patterns by a unit test
  and a real build, not by a static content deploy.
- Magento's built-in full page cache (every run used Varnish).
- Varnish 6.0 LTS.
- Mage-OS `MageOS_ThemeOptimization`: the theme keeps the speculation
  rules prefetch and removes the view transitions opt-in and the bfcache
  handler (both written for Luma; the transition opt-in raised a page error on
  redirected navigations). Its response plugin that strips `no-store` only
  acts with the built-in page cache, not with Varnish.
- The Mage-OS 4.0 modules with a storefront of their own (passkey sign-in,
  returns, FAQ, shopping feed blocks): no Hyperion templates, see
  [Known limitations](./known-limitations.md).
- PHP 8.2 (not in the Composer constraints).
- Adobe Commerce, B2B, Dynamic Blocks, gift cards and every other
  Commerce-only feature.
- Braintree PayPal in the checkout (renderer exists, no PayPal account was
  linked to the sandbox). Braintree Google Pay: the button and the sheet
  request were verified against the Braintree sandbox, the payment itself was
  not completed by the automated checks.
- PayPal Express redirect flow (`in_context = 0`) through to the placed
  order, and `payflow_express` against a live account (unit tested only).
- Real gateway payments on the supported platforms: the PayPal Express and
  Braintree card sandbox payments were made on the platforms of "Previously
  tested".
- Downloadable link download limits and shareable links.
- Persistent cart ("Remember Me"): not exercised. Fixed product tax is
  covered by the cart features check (`pw-cart-features.mjs --with-fpt`) and
  the swatch filter chips by `pw-catalog-completeness.mjs`, both on Magento
  2.4.9.
- Third-party extensions of any kind.
