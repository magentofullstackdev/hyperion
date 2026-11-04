# Development

How the repository is laid out, how to build and test the frontend, which
PHP checks must pass, and how a release is cut. Read
[CONTRIBUTING.md](../CONTRIBUTING.md) for the ground rules first.

## Repository layout

```
app/
  code/Magentofullstackdev/
    HyperionCore/          ESI, asset manifest, Varnish BAN, view model registry,
                           HTMX-aware plugins, header state, rate limiter, VCL
    HyperionCatalog/       listing and product page blocks, fragment endpoints, swatches
    HyperionCatalogMode/   catalog mode: purchase restriction by customer group, route guard
    HyperionCheckout/      Lit checkout block and controller, cart page, mini-cart
    HyperionCustomer/      wishlist / compare / welcome fragments, order cancellation,
                           Login as Customer
    HyperionNavigation/    header, footer, top menu (ESI fragment)
    HyperionCms/           CMS and PageBuilder renderers
    HyperionImage/         WebP / AVIF generation (queue consumer, CLI, PHPUnit tests)
    HyperionMegaMenu/      admin menu builder (groups, items, per store view values), navigation source
    HyperionSearch/        engine autocomplete fragment, relevance plugins, zero-results fallback, shield routes
    HyperionSampleData/    optional: rebinds the Luma sample data to the theme
  design/frontend/Magentofullstackdev/hyperion/
                           the theme: layout and template overrides of 36 core
                           modules (plus MageOS_ThemeOptimization), committed
                           build output in web/
frontend/
  pnpm-workspace.yaml, pnpm-lock.yaml, package.json, .eslintrc.cjs, tsconfig.base.json
  packages/shared/         @magentofullstackdev/hyperion-shared (source only)
  packages/theme-default/  @magentofullstackdev/hyperion-theme (+ the hyperion CLI)
  packages/module-checkout/  @magentofullstackdev/hyperion-checkout
docs/                      this documentation
satis.json                 Composer repository definition (path repositories of this tree)
.github/workflows/         frontend.yml, php.yml, satis.yml; ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md
.github/scripts/           build-satis.sh (one path repository per release tag)
```

Every module sequences on `Magentofullstackdev_HyperionCore` in
`etc/module.xml`; Composer names are `magentofullstackdev/module-hyperion-<domain>`
and the theme is `magentofullstackdev/theme-hyperion`. The theme requires
the ten runtime modules with `self.version`.

## Frontend workspace

Node.js 22 and pnpm (the version is pinned in `frontend/package.json`,
`packageManager`; Corepack or `npm i -g pnpm` installs it). npm cannot
install the workspace: the packages depend on each other with the
`workspace:^` protocol.

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm -r build        # shared (no-op), then theme, then checkout
pnpm -r test         # Vitest (happy-dom for the theme, jsdom for the checkout)
pnpm -r typecheck    # tsc --noEmit in every package
pnpm -r lint         # ESLint, config in frontend/.eslintrc.cjs
```

Per package: `pnpm --filter @magentofullstackdev/hyperion-theme build`,
`... dev` (Vite dev server on port 5173 for the theme, 5175 for the
checkout). A single test file: `npx vitest run path/to/file.test.ts` from
the package directory. Tests live in `__tests__/` folders next to the code;
a new component gets a test in `src/js/components/__tests__/`.

Dependency advisories: `pnpm audit --prod` (the graph a child theme installs:
Tailwind, PostCSS, the Hyperion packages) must report nothing, and the full
`pnpm audit` nothing critical or high; what is left in build and test tools
(the Vitest runner, the dev server) is evaluated at every release and noted
in the changelog, it never reaches a shipped asset. The pins live in
`pnpm.overrides` of `frontend/package.json` and the `hyperion create`
scaffold writes the same ones into a new child theme.

Where the builds write:

| Package | Output |
|---|---|
| `theme-default` | `app/design/frontend/Magentofullstackdev/hyperion/web/assets/*` (hashed), `web/manifest.json`, `web/css/email.css` + `email-inline.css` (unhashed, for transactional emails) |
| `module-checkout` | `app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/assets/*` and `.vite/manifest.json` |

The theme build auto-discovers every `src/js/components/hyperion-*.{ts,js}`
as its own chunk and manifest entry; components are imported from
`src/js/entry.js`. HTMX is copied as a standalone UMD asset and patched into
the manifest under the key `htmx`. The checkout build first runs
`scripts/sync-i18n.mjs`, then Vite with `base: './'`. Never put a hand-made
file under the theme's `web/`: the build empties that directory on every
run; anything that must ship there is emitted by the build.

In a Magento install, after a build:

```bash
bin/magento cache:flush
bin/magento setup:static-content:deploy -f
```

If `pub/static` still holds symlinks to the previous hashed assets, remove
them first: `find pub/static -xtype l -delete`.

## End-to-end suite

The Playwright scripts live in `frontend/e2e/` and run against any
Hyperion storefront with the Luma sample data (the Luma sample customer
and the `HyperionSampleData` products). They use the
workspace's `@playwright/test`; install its browser once:

```bash
cd frontend
pnpm exec playwright install chromium
pnpm e2e https://your-store.example            # the 74-check suite, guest + customer journeys
pnpm e2e -- https://your-store.example --shots /tmp/shots --skip-order
pnpm e2e:check https://your-store.example/     # one page: status, htmx, defined elements, errors
pnpm e2e:perf https://your-store.example       # TTFB / LCP / CLS / request counts
```

The scripts name the sample data pages with the stock `.html` suffix and
resolve the store's real category / product URL suffix once at start (a
probe of `/women/tops-women`, `e2e/lib/url-suffix.mjs`), so a store whose
`catalog/seo/*_url_suffix` is empty works unchanged; `HYPERION_URL_SUFFIX`
(the empty string allowed) skips the probe.

`pw-suite.mjs`, `pw-check.mjs`, `pw-perf.mjs`, `pw-cls.mjs`,
`pw-ui-polish.mjs` and `pw-a11y.mjs` need only the URL and change nothing on
the store. Every
other script takes `<baseUrl> <slotDir>` (the Magento install directory,
with its `.env` and docker compose files) and changes store configuration or
creates fixtures for the run, restoring everything at the end. Those scripts
assume a Docker install: `<slotDir>` holds the `compose.yaml`, the services
are named `php-fpm`, `db` and `varnish`, the Magento root inside `php-fpm` is
`/var/www/html` and its user is `www-data`; they run `docker compose
--project-directory <slotDir> exec` for `bin/magento`, SQL and `varnishadm`,
and `docker compose cp` for the fixture scripts of `frontend/e2e/fixtures/`.
Every script prints one PASS / FAIL line per check and a JSON summary and
exits 1 on a failure, a page error or an HTTP 5xx.

| Script | Arguments | What it checks | Changes on the store (restored) | reCAPTCHA relaxation |
|---|---|---|---|---|
| `pw-suite.mjs` | `<baseUrl> [--shots dir] [--skip-order]` | the 74-check guest and customer journeys (guest order, success page offer, delegated registration included) | places orders | yes |
| `pw-check.mjs` | `<url> [screenshot.png]` | one page: status, htmx, defined elements, errors | none | no |
| `pw-perf.mjs` | `<baseUrl> [path ...]` | TTFB, LCP, CLS, requests, third parties | none | no |
| `pw-cls.mjs` | `<baseUrl> [--pages n]` | CLS 0 on nine page types, skeleton parity, motion knob, view transitions | none | no |
| `pw-ui-polish.mjs` | `<baseUrl>` | header footprint, drawer scroll lock, toasts, category landings | none | no |
| `pw-a11y.mjs` | `<baseUrl>` | axe-core on seven page types: fails on `critical` / `serious` violations, lists the rest | none | no |
| `pw-agreements.mjs` | `<baseUrl> <slotDir>` | checkout agreements, guest and customer order | one agreement, `checkout/options/enable_agreements` | yes |
| `pw-checkout-login.mjs` | `<baseUrl> <slotDir>` | inline checkout login, quote merge | `checkout/options/enable_guest_checkout_login` | yes |
| `pw-catalogmode.mjs` | `<baseUrl> <slotDir>` | catalog mode and the listing Add to Cart setting | `hyperion_catalog_mode/*`, `hyperion/catalog/add_to_cart_from_listing` | handles it itself |
| `pw-cart-features.mjs` | `<baseUrl> <slotDir> [--with-fpt]` | estimator, Move to Wishlist, VAT field, gift message, shipping policy, FPT lines | VAT visibility, shipping policy; FPT demo from `fixtures/weee-demo.php` | yes |
| `pw-orders-widgets-ga4.mjs` | `<baseUrl> <slotDir>` | GA4 dataLayer, history widgets, sidebars, bank transfer order views | bank transfer, `google/gtag/*`, CMS page (`fixtures/sprint3-fixtures.php`) | yes |
| `pw-fallback-pages.mjs` | `<baseUrl> <slotDir>` | drawers' keyboard model, print pages, tracking popup, Orders and Returns widget | invoice, shipment, credit memo of a fresh order, CMS page (`fixtures/sprint4-fixtures.php`) | yes |
| `pw-catalog-completeness.mjs` | `<baseUrl> <slotDir>` | Open Graph, stock notices, video, MAP, bundle total, review breakdown, grid / list, limiter | MAP on `MH01`, a video on `24-MB01`, stock config (`fixtures/sprint1-fixtures.php`) | yes |
| `pw-search-shield.mjs` | `<baseUrl> <slotDir>` | autocomplete layout and caches, relevance tuning, zero results, filter guard, rate limiter (last: the budget stays spent) | `hyperion_search/*`, `hyperion/catalog/*`, `hyperion/security/*` | no |
| `pw-sidebars.mjs` | `<baseUrl> <slotDir> [shotsDir]` | wishlist and compare rails on every page layout | a category's `page_layout`, wishlist config | yes |
| `pw-megamenu.mjs` | `<baseUrl> <slotDir> [shotsDir]` | storefront mega menu: fallback, panel grid, badges, store override, cache tags, hover and accordion | one group and a CMS block (`fixtures/megamenu-fixture.php`) | no |
| `pw-megamenu-admin.mjs` | `<baseUrl> <slotDir> [shotsDir]` | admin builder: group form, import, inspector, badge, drag and drop, store view override | a temporary admin user and a group | no |
| `pw-infinite-scroll.mjs` | `<baseUrl> <slotDir> [shotsDir]` | pager / Load more / automatic modes, append fragment, category override, search results | `hyperion/catalog/infinite_scroll`, a category's `hyperion_infinite_scroll` (`fixtures/infinite-scroll-fixture.php`) | yes |
| `pw-cart-edit.mjs` | `<baseUrl> <slotDir>` | cart line Edit: `checkout/cart/configure` with the line's options and qty preselected, Update Cart replaces the line (configurable and bundle) | none (guest cart) | no |
| `pw-variant-stock.mjs` | `<baseUrl> <slotDir>` | per variant "Only N left" of a configurable within the stock threshold | a child's qty and `cataloginventory/options/stock_threshold_qty` (`fixtures/variant-stock-fixture.php`) | no |

The fixture scripts in `frontend/e2e/fixtures/` are plain PHP that
bootstraps Magento from `/var/www/html`; each file header documents its
`apply` / `remove` arguments, and every check removes what it applied.

The customer login of the headless browser scores too low for reCAPTCHA v3,
so every check marked "yes" above needs the login form relaxed for the run
(only `pw-catalogmode.mjs` does it itself). Before the run:

```bash
bin/magento config:set recaptcha_frontend/type_for/customer_login ''
bin/magento config:set recaptcha_frontend/type_recaptcha_v3/score_threshold 0.1
bin/magento cache:flush
```

and afterwards restore the two values (`recaptcha_v3` and `0.5` on a stock
install, or whatever `bin/magento config:show` printed before). Never leave a
store relaxed. `PW_HOST_RESOLVER="MAP store.example 10.0.0.4"` resolves a
host that is not in `/etc/hosts`. `pnpm lint:e2e` lints the scripts.

### Layout shifts and motion

`node e2e/pw-cls.mjs <baseUrl>` loads nine page types under a slow network
and a slowed CPU, desktop and phone, and fails on any layout shift (the
Layout Instability API, sources printed); it also checks that the skeletons
of the swatches and of the gallery thumbnails measure exactly what the
components render, and that the motion knob and the view transitions are in
place. Run it after touching a listing template, a component that renders
after its chunk arrives, or the page layouts.

### Accessibility

`node e2e/pw-a11y.mjs <baseUrl>` injects [axe-core](https://github.com/dequelabs/axe-core)
(the `axe-core` devDependency of the workspace) into the home page, a
category, a product page, the login, registration and contact forms and the
cart, runs the default rule set and fails on any `critical` or `serious`
violation (rule, impact, the first target selectors and the page are printed;
`moderate` and `minor` findings are listed as warnings) or page error. Run it
after touching the header, the footer, a form template or a component that
wraps light DOM content.

## Committed build assets

The build outputs listed above are committed on purpose: the code ships as
Composer packages and merchants never run Node. Rules:

- Rebuild before you commit a frontend change; the assets are part of the
  change. The `Frontend` workflow rebuilds and fails when
  `app/**/web/assets`, `app/**/web/manifest.json`, `app/**/.vite/manifest.json`,
  `app/**/web/css` or `app/**/web/THIRD_PARTY_LICENSES.txt` differ from the
  sources.
- `THIRD_PARTY_LICENSES.txt` (theme `web/`, checkout `view/frontend/web/`) is
  written by the build too (`frontend/build/third-party-licenses.ts`,
  rollup-plugin-license): the full licence text of every bundled library, for
  Composer consumers who never see the npm packages. A dependency without a
  licence text or outside the allow list of that file fails the build.
- Never `.gitignore` or delete them. `emptyOutDir: true` removes old hashes
  on each build, so a rebuild never leaves stale files behind.

## PHP quality gate

The tools come with Magento's `require-dev`; run them from a Magento root
that has Hyperion installed (path repository with `symlink: true` for live
edits, see CONTRIBUTING.md):

```bash
vendor/bin/phpcs --standard=Magento2 --extensions=php,phtml -n path/to/hyperion/app
vendor/bin/phpstan analyse --level=5 path/to/hyperion/app/code/Magentofullstackdev
for t in path/to/hyperion/app/code/Magentofullstackdev/*/Test; do
  vendor/bin/phpunit --no-extensions --do-not-cache-result -c dev/tests/unit/phpunit.xml.dist "$t"
done
```

Ten modules have a `Test/` directory today (Catalog, CatalogMode, Checkout,
Cms, Core, Customer, Image, MegaMenu, SampleData, Search); the loop picks up
a new one without a change here or in CI. `--no-extensions` matters: core's
`phpunit.xml.dist` bootstraps the Allure extension with a config path that
is relative to the working directory, so from the Magento root every test
passes and the runner still exits 1. Never judge a QA command by its last
output line: check its exit code (`set -o pipefail` in scripts).

Required state: phpstan level 5 with no errors, phpcs with zero errors
(warnings remain), every `catch` block logs. Run
`vendor/bin/phpstan clear-result-cache` after `setup:di:compile`; phpstan
needs the generated factories, so compile first. Unit tests must run on
PHPUnit 9 (Magento 2.4.7), 10 (2.4.8, Mage-OS 2.x) and 12 (2.4.9, Mage-OS 3.x;
data providers carry both the `@dataProvider` annotation and the
`#[DataProvider]` attribute): no `withConsecutive`,
no `at()`.

Conventions the gate does not catch: templates escape with the
engine-provided `$escaper`, never `$block->escape*()`; inline `<script>`
tags carry an explicit `type`; theme layout files `referenceBlock` core
blocks instead of re-declaring them; every storefront page stays at zero
`x-magento-init` / `data-mage-init` occurrences; every source file starts
with the `SPDX-License-Identifier: MIT` header; no em dash or en dash
anywhere.

## CI workflows

`.github/workflows/frontend.yml` (push to `main`, pull requests): Node 22,
`pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r lint`,
`pnpm -r test`, `pnpm -r build`, the committed-assets check (`git status
--porcelain` over `app/**/web/assets/*`, `app/**/web/css/*`, the two
manifests and `app/**/web/THIRD_PARTY_LICENSES.txt`; the trailing `/*` is
what makes a git pathspec match the files of a directory), then `pnpm pack`
of every package to prove the tarballs build.

`.github/workflows/php.yml` (same triggers, matrix PHP 8.3, 8.4 and 8.5):
creates a Mage-OS project from `repo.mage-os.org` (no authentication keys
needed), installs Hyperion from the checkout through path repositories with
`symlink: false` (like a Packagist install), runs `setup:install` against
MariaDB 11.4 and OpenSearch 2.19 service containers, `setup:di:compile`,
then phpcs (errors only), phpstan level 5 and PHPUnit for every module that
has a `Test/` directory (ten today).

`.github/workflows/satis.yml` (release tags `v*`, or by hand): runs
`.github/scripts/build-satis.sh`, which checks out every `v*` tag into a git
worktree, generates a `satis.json` with one pair of path repositories per
tag from the root `satis.json`, runs Satis (the `composer/satis` Docker
image) and deploys the output (`packages.json`, `p2/`, `dist/*.zip`,
`index.html`) to GitHub Pages with `actions/deploy-pages`. The site is
rebuilt from scratch on every run, so no state lives on Pages. One-time
setup: repository Settings > Pages > Source = "GitHub Actions". The build
aborts when any of the twelve `composer.json` files of a tag carries a
`version` other than the tag (a lagging module would be archived under the
wrong version and the theme's `self.version` requirements would never
resolve), and when an archive lacks `LICENSE` (every package carries its own
copy) or, for the theme and HyperionCheckout, `THIRD_PARTY_LICENSES.txt`. The
same script builds the working tree alone when no tag
exists (`.github/scripts/build-satis.sh http://127.0.0.1:8099` was used to
rehearse an install from a local HTTP server).

The three workflows were written for this release and had not run on GitHub
at the time of writing; expect adjustments on the first run.

## Purchase restrictions (extension point)

`Magentofullstackdev\HyperionCore\Model\Purchase\Availability` holds a pool of
`RestrictionInterface` rules (`isRestricted()`, `getMessage()`), evaluated
once per request; the first rule that restricts wins, a rule that throws is
logged and ignored. Templates never ask a rule directly: every purchase
affordance (product page form, tile buttons, compare and wishlist buttons,
reorder, mini-cart, mini-cart count fragment) reads
`$viewModels->require(\Magentofullstackdev\HyperionCore\ViewModel\Purchase::class)->canPurchase()`,
and `HyperionCatalog\ViewModel\ProductList::canAddToCartFromListing()` adds
the "Add to Cart from Listing Page" setting for tiles. A new template with
an Add to Cart button must go through the same view model. The catalog mode
module registers its rule and a route guard
(`Plugin\Framework\App\Action\CheckoutGuardPlugin`, around
`ActionInterface::execute`, prefixes configured in its `etc/frontend/di.xml`)
and owns no template. A rule must decide from state that is part of the
page cache key (customer group, store, currency).

## Release procedure

1. Align the version: the same string in the twelve `composer.json` files
   (11 modules + theme) and the three `package.json` files. The Composer
   `version` field must equal the git tag (Satis and Packagist read tags; a
   mismatch skips the tag). Update `CHANGELOG.md`.
2. Rehearse: fresh clone, `pnpm install --frozen-lockfile`, both workflows
   green, `pnpm -r publish --dry-run`, `composer validate` in every
   package, install from the tag in a clean Magento 2.4.8 and Mage-OS, run
   the end-to-end suite.
3. Tag `v<version>` (for this release `v0.9.0-beta.3`) and push.
4. Publish npm first or together with the tag: the child theme scaffold
   depends on the three packages at `^<version>`.
   `pnpm -r publish --access public` from `frontend/` (pnpm rewrites
   `workspace:^` to the real version in the tarballs). No `--tag beta`:
   while every release is in the `0.9.0-beta.*` series, publishing to the
   default `latest` dist-tag is what makes
   `npm install @magentofullstackdev/hyperion-theme` and
   `npx -p @magentofullstackdev/hyperion-theme hyperion create Vendor/Theme`
   resolve out of the box (with `--tag beta` and no earlier version, `latest`
   never exists and both commands fail with "No matching version found").
   `--tag beta` is reserved for pre-releases published once `1.0.0` is on
   `latest`.
5. Composer channel: pushing the tag triggers `satis.yml`, which rebuilds
   the Composer repository from every tag and publishes it on GitHub Pages
   (`https://magentofullstackdev.github.io/hyperion/`). Check the workflow
   run, then `composer require magentofullstackdev/theme-hyperion:^<version>`
   in a clean project as described in [Install](./install.md).
6. GitHub release with the changelog section and the known limitations.
