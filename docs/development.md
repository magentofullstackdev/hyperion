# Development

How the repository is laid out, how to build and test the frontend, which
PHP checks must pass, and how a release is cut. Read
[CONTRIBUTING.md](../CONTRIBUTING.md) for the ground rules first.

## Repository layout

```
app/
  code/Magentofullstackdev/
    HyperionCore/          ESI, asset manifest, view model registry,
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
    HyperionSampleData/    optional, demo stores: moves the Luma sample widgets to the theme, test products
  design/frontend/Magentofullstackdev/hyperion/
                           the theme: layout and template overrides of 36 core
                           modules (plus MageOS_ThemeOptimization), committed
                           build output in web/
frontend/
  pnpm-workspace.yaml, pnpm-lock.yaml, package.json, eslint.config.js, tsconfig.base.json
  packages/shared/         @magentofullstackdev/hyperion-shared (source only)
  packages/theme-default/  @magentofullstackdev/hyperion-theme (+ the hyperion CLI)
  packages/module-checkout/  @magentofullstackdev/hyperion-checkout
docs/                      this documentation
satis.json                 Composer repository definition (path repositories of this tree)
.github/workflows/         frontend.yml, php.yml, satis.yml; ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md
.github/scripts/           build-satis.sh (one path repository per release tag),
                           check-plugin-targets.php (every plugin method has a target)
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
pnpm -r lint         # ESLint 10 flat config (typescript-eslint 8) in frontend/eslint.config.js
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
pnpm e2e https://your-store.example            # the suite, guest + customer journeys
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
`pw-ui-polish.mjs`, `pw-critical.mjs` and `pw-a11y.mjs` need only the URL and
change no setting on the store (the suite places orders, subscribes one
`suite.news.<timestamp>@example.com` address to the newsletter per run and
adds products to carts; `pw-cls.mjs` registers one customer per run for its
checkout part unless `--customer=` names one, and both `pw-cls.mjs` and
`pw-a11y.mjs` leave guest carts behind). Every
other script takes `<baseUrl> <slotDir>` (the Magento install directory,
with its `.env` and docker compose files) and changes store configuration or
creates fixtures for the run, restoring everything at the end. Those scripts
assume a Docker install: `<slotDir>` holds the `compose.yaml`, the services
are named `php-fpm`, `db` and `varnish`, the Magento root inside `php-fpm` is
`/var/www/html` and its user is `www-data`; they run `docker compose
--project-directory <slotDir> exec` for `bin/magento`, SQL and `varnishadm`,
and `docker compose cp` for the fixture scripts of `frontend/e2e/fixtures/`.
Every script prints one PASS / FAIL line per check, an `N / M passed` line
and a JSON summary, and exits 1 on a failure, a page error or an HTTP 5xx.
The number of checks of each script on the last full run is in
[Compatibility](./compatibility.md#tested-matrix).

A script that changes configuration takes a snapshot first and restores
exactly what it found, through `e2e/lib/config-snapshot.mjs`: a setting has
three stored states (no row, a row holding SQL NULL, a row with a value),
which reading the effective value cannot tell apart, and writing a value
back with `config:set` would leave a row where there was none. Use the same
helper in a new script; never restore to a fixed default. Scripts that do
not run on `e2e/lib/harness.mjs` use `e2e/lib/run-config.mjs`: `set` takes
the snapshot on the first change of a setting, `restore` / `restoreAll` put
the settings back, and `onAbort(label, undo)` registers the undo of anything
else the run creates (a fixture, a file, a customer). An interrupted run
(SIGINT, SIGTERM, SIGHUP) runs the registered undo steps in reverse order
(a failing one does not skip the others), restores every setting, flushes
the caches and exits 130.

| Script | Arguments | What it checks | Changes on the store (restored) | reCAPTCHA relaxation |
|---|---|---|---|---|
| `pw-suite.mjs` | `<baseUrl> [--shots dir] [--skip-order]` | the guest and customer journeys: every page type, add to cart for every product type, compare, wishlist, cart, a guest order (address edited before the order) and a customer order, the success page offer and the delegated registration, the newsletter form, account and order pages; in the checkout: a guest address entry typed key by key takes at most three web API calls, an HTML 503 on the shipping save shows the translated message in its section with a control that sends the save again, a double click places one order | places orders, one newsletter subscriber | yes |
| `pw-check.mjs` | `<url> [screenshot.png]` | one page: status, htmx, defined elements, errors | none | no |
| `pw-perf.mjs` | `<baseUrl> [path ...]` | TTFB, LCP, CLS, requests, third parties | none | no |
| `pw-cls.mjs` | `<baseUrl> [--only=<parts>] [--viewport=desktop\|phone] [--dump=<file>] [--customer=<email>:<password>] [--coupon=<code>:<product path>]` | CLS 0 on the key page types under a slow network and CPU, desktop and phone; skeleton parity; motion knob; view transitions; the cart coupon form (part `coupon`: closed, open with an applied coupon after a reload, still open after a successful Cancel, open after a refused code, and the Apply button keeps its width while its request runs; `--coupon=` names a valid code and the product its rule applies to, default the sample data coupon `H20` on `/affirm-water-bottle.html`); the checkout as a flow (see below) | none; registers one customer unless `--customer=` is given | no |
| `pw-ui-polish.mjs` | `<baseUrl> [<slotDir>]` | header footprint, drawer scroll lock, toasts, category landings; request synchronization: a double click on Add to Cart adds one unit (product page and tile), the button shows its busy text without changing size and keeps the focus, rapid taps on the mini-cart stepper end at the right quantity with one or two requests; the cart on a phone: the sticky bar with the order total and the checkout link, its footprint, its place in the flow and the state it shares with the summary card. Only with `<slotDir>`, the store settings part: wish list, newsletter and contact off (no wish list link or icon, no subscribe form, no contact link, guest and the sample customer; the header keeps its footprint with the wish list off), `maxlength` of the header search fields from the search settings (the minimum stays 2), the logo size settings (the ratio at the drawn 40 px height, header and footer), the layered navigation counts switched off, one visible "Out of stock" on a product taken out of stock | none with the URL only (guest carts); with `<slotDir>`: `wishlist/general/active`, `newsletter/general/active`, `contact/contact/enabled`, `catalog/search/*_query_length`, `design/header/logo_*` and a logo image copied into `pub/media/logo/`, `catalog/layered_navigation/display_product_count`, `fixtures/stock-zero-fixture.php` (all undone, also when the run is interrupted) | with `<slotDir>` |
| `pw-critical.mjs` | `<baseUrl>` | the critical sheet of each page type paints the fold like the full stylesheet (pixel comparison), the non blocking stylesheet applies, the mini-cart adopts it, the untyped pages keep the synchronous link | none | no |
| `pw-a11y.mjs` | `<baseUrl> [--only=pages\|checkout] [--dump=<file>]` | axe-core on seven page types and on the checkout (two scans, see below): fails on `critical` / `serious` violations, lists the rest | none (a guest cart) | no |
| `pw-agreements.mjs` | `<baseUrl> <slotDir>` | checkout agreements, guest and customer order | one agreement, `checkout/options/enable_agreements` | yes |
| `pw-checkout-login.mjs` | `<baseUrl> <slotDir>` | inline checkout login: one availability request for an email typed key by key, the notice with the "Sign in" control, the password form on a click, quote merge, the typed address back after the sign-in | `checkout/options/enable_guest_checkout_login` | yes |
| `pw-catalogmode.mjs` | `<baseUrl> <slotDir>` | catalog mode and the listing Add to Cart setting | `hyperion_catalog_mode/*`, `hyperion/catalog/add_to_cart_from_listing` (put back as found) | handles it itself |
| `pw-cart-features.mjs` | `<baseUrl> <slotDir> [--with-fpt] [--with-custom-total] [--keep-recaptcha] [--only=<part,...>]` | estimator, Move to Wishlist, VAT field (one on the register form), gift message, shipping policy, FPT lines, the coupon form and its reCAPTCHA; cart money: estimator rates in a non-base display currency equal the Shipping totals row and the newly selected rate is the one marked, a carrier error rate is text and a forged post of it is refused, unit price and row total follow the cart tax display, a decimal quantity survives an update of another line; quantities post by themselves (one request for a burst, the focus stays on the line); the minimum order amount (checkout links disabled with the reason, opened by a quantity change, a direct visit to the checkout comes back with a notice); a refused coupon keeps the form open; a virtual cart has no estimator; a grouped child links to its parent; item options as label / value pairs; a customer's default address rates load when the estimate panel opens; "After Adding a Product Redirect to Shopping Cart" on (part `redirect to cart`, with "Add to Cart from Listing Page" on): an add from a tile and from a product page lands on the cart page with the success message, guest and customer, and with the setting back as found the add shows the toast; the estimator answers 429 above its budget (last check: the budget stays spent for the window). `--with-fpt`: the FPT demo must be in place (`fixtures/weee-demo.php`, then a price reindex); the script turns `tax/weee/*` on for the run and also checks the price box of the product page and of a listing in the four FPT display modes. `--with-custom-total`: installs a module with an unknown quote total (`fixtures/custom-total-fixture.php`, enabled and COMPILED, removed and compiled again at the end: the storefront answers errors meanwhile) and checks that the cart and the checkout summary list the same row. `--keep-recaptcha`: leaves the `coupon_code` reCAPTCHA setting as found. `--only=`: runs the named parts (`guest`, `quantity`, `minimum order`, `lines`, `multi-currency`, `error rate`, `tax display`, `decimal quantity`, `customer`, `custom total`, `fpt display`, `redirect to cart`, `rate limit`) | VAT visibility, shipping policy, coupon reCAPTCHA, carrier and tax display settings, the minimum order amount (the shortest possible window), `checkout/cart/redirect_to_cart` and `hyperion/catalog/add_to_cart_from_listing`, `tax/weee/*` with `--with-fpt`; `fixtures/tax-display-fixture.php`, `fixtures/decimal-qty-fixture.php`, a customer of the run (`fixtures/customer-fixture.php`, deleted at the end) | yes |
| `pw-orders-widgets-ga4.mjs` | `<baseUrl> <slotDir>` | GA4 dataLayer, history widgets, sidebars; bank transfer instructions under the selected method and on the customer and guest order views; a guest purchase order (Place Order closed without the number, the number stored on the order); the check payee | bank transfer, purchase order, `payment/checkmo/payable_to`, `google/gtag/*`, CMS page (`fixtures/sprint3-fixtures.php`) | yes |
| `pw-fallback-pages.mjs` | `<baseUrl> <slotDir> [--with-fpt]` | drawers' keyboard model, print pages, tracking popup, Orders and Returns widget, popular search terms, Email a Friend, the guest invoice / shipment / refund tabs, the footer service links, the demo store notice (styled bar, no layout shift), the newsletter form with Google's reCAPTCHA script blocked (one post, a message on the landing page; skipped without a key pair), no sideways scroll at phone widths; the checkout failure page (served to the session of the order, order number, one link to the cart and one to the store); a stored Braintree PayPal account on Stored Payment Methods and its Delete (skipped without the Braintree module); with the tax display of order items on "both", the item rows of the order view, the invoice page and the print pages (customer and guest) show both amounts, each labeled; the invoice comment on the customer and guest invoice pages; RSS (the category page links its feed and the feed answers XML, the order view links the order status feed, `/rss/` lists the feeds); the compare page prints through its Print This Page button, which is hidden in print; the dashboard's recently viewed block renders nothing with an empty history and lists a viewed product. `--with-fpt`: places the order with the FPT demo (`fixtures/weee-demo.php`, applied for the run and removed when the run applied it) and checks the FPT line of its order row | invoice, shipment, credit memo of a fresh order with a visible invoice comment, CMS page (`fixtures/sprint4-fixtures.php`), `tax/sales_display/price`, `rss/config/active`, `rss/catalog/category`, `rss/order/status`, `tax/weee/enable` and `tax/weee/display_sales` with `--with-fpt`, a customer of the run (`fixtures/customer-fixture.php`), a stored token row (`fixtures/vault-token-fixture.php`), `sendfriend/email/*`, `design/head/demonotice`, `recaptcha_frontend/type_for/newsletter` when the form is not protected | yes |
| `pw-catalog-completeness.mjs` | `<baseUrl> <slotDir>` | Open Graph (one set of tags whoever emits them: the theme, or a platform SEO module with its JSON-LD Product), stock notices, video, MAP, bundle total, review breakdown, grid / list, limiter, swatch filter chips; bundle prices under an including-tax catalog display; the variant price in the number format of a decimal-comma store view | MAP on `MH01`, a video on `24-MB01`, stock config (`fixtures/sprint1-fixtures.php`), `fixtures/tax-display-fixture.php` | yes |
| `pw-search-shield.mjs` | `<baseUrl> <slotDir>` | autocomplete layout and caches, relevance tuning, zero results, suggest freshness, Varnish query sorting, marketing parameters (one cache object, never counted by the limiter), filter guard, the search engine outage (the listing fragments and the suggest answer a degraded response no cache keeps; skipped without an `opensearch` service), rate limiter with junk toolbar values counted (last: the budget stays spent) | `hyperion_search/*`, `hyperion/catalog/*`, `hyperion/security/*`; a fixture product (`fixtures/search-freshness-fixture.php`); stops and restarts the `opensearch` service | no |
| `pw-sidebars.mjs` | `<baseUrl> <slotDir> [shotsDir]` | wishlist and compare rails on every page layout; Recently Ordered: in the account sidebar of a customer with orders, with a POST form and at most five items, adding the ticked item to the cart; never for a guest, never on a category page | a category's `page_layout`, wishlist config, the cart line it adds (removed at the end) | yes |
| `pw-custom-attributes.mjs` | `<baseUrl> <slotDir> [--shots dir]` | custom customer and address attributes on the account forms, as a new customer: the registration form renders the customer fields with their labels and rules (no address attribute there), an empty required field blocks the submit in the browser, the registration saves the values, the account edit form shows them after a reload and saves a change, a new address saves its attribute and the address form shows it after a reload; no page error, HTTP 5xx or Content Security Policy violation | three customer attributes and one address attribute (`fixtures/custom-attributes-fixture.php`, removed at the end), a customer of the run (deleted), `recaptcha_frontend/type_for/customer_create` and `customer_edit` cleared for the run. While the required attribute exists every new customer needs it: never run it next to another script that registers customers | clears the registration and account edit types itself |
| `pw-megamenu.mjs` | `<baseUrl> <slotDir> [shotsDir]` | storefront mega menu: fallback, panel grid, badges, store override, cache tags, hover and accordion | one group and a CMS block (`fixtures/megamenu-fixture.php`) | no |
| `pw-megamenu-admin.mjs` | `<baseUrl> <slotDir> [shotsDir]` | admin builder: group form, import, inspector, badge, drag and drop, store view title override; an item added in a store view is saved once as an item of that store view, the single "Use Default Value" box of the target and a target override, a customer group restriction set and cleared; the storefront fragments confirm each | a temporary admin user and a group | no |
| `pw-infinite-scroll.mjs` | `<baseUrl> <slotDir> [shotsDir]` | pager / Load more / automatic modes, append fragment, category override, search results | `hyperion/catalog/infinite_scroll`, a category's `hyperion_infinite_scroll` (`fixtures/infinite-scroll-fixture.php`) | yes |
| `pw-listing-state.mjs` | `<baseUrl> <slotDir> [shotsDir]` | a listing keeps its layered filters through sort, direction, grid / list, page size, the pager, Back and Forward, Load more and the automatic loading, on a category and on the search results; two quick filter clicks end in one consistent state; a page number far past the end answers 200. Guest only | `hyperion/catalog/infinite_scroll` and `hyperion/catalog/infinite_scroll_auto_pages` | no |
| `pw-cart-edit.mjs` | `<baseUrl> <slotDir>` | cart line Edit: `checkout/cart/configure` with the line's options and qty preselected, Update Cart replaces the line (configurable and bundle) | none (guest cart) | no |
| `pw-variant-stock.mjs` | `<baseUrl> <slotDir>` | per variant "Only N left" of a configurable within the stock threshold | a child's qty and `cataloginventory/options/stock_threshold_qty` (`fixtures/variant-stock-fixture.php`) | no |
| `pw-checkout-resilience.mjs` | `<baseUrl> <slotDir> [--shots <dir>] [--who guest\|customer] [--only <name,...>]` | what the checkout does when a request fails or loses its answer, each as a guest and as a customer the script registers: `offline` (the connection drops around a shipping method change), `unavailable` (an HTML 503 on the shipping save), `rate-limit` (a 429 with `Retry-After` on the estimate), `timeout` (the estimate gets no answer; the page clock is moved past the client's limit), `session` (401 on the customer cart routes, then a real sign-in; customer only), `unconfirmed` (the order request and the cart read both fail), `one-order` (double click, Enter, a street edited right before the press), `not-placed`, `placed` (the answer to the order is lost), `other-tab` (the order is placed in a second tab). In every scenario no raw transport error, HTTP status, "No such entity" phrase or HTML source may show. Every failure is injected in the browser (request routing, the offline switch, the page clock) | none on the server; places eight orders and registers one customer; reads order addresses with the read-only `fixtures/order-address-fixture.php`. The store must offer two shipping methods and Check / Money order | yes (login and registration) |
| `pw-checkout-flow.mjs` | `<baseUrl> <slotDir> [--only F3,F5] [--shots dir] [--with-recaptcha] [--with-braintree]` | the journeys through the checkout besides the plain order: F1 virtual and downloadable quotes; F2 coupons (invalid code, a 100 percent code selects `free`, removal, a free order; `--with-recaptcha` switches the `coupon_code` reCAPTCHA on and expects the token header); F3 reload in the middle of the flow, guest and customer (typed data back, Place Order usable with no REST request before it, one background rate refresh after it, a saved address that is not the default kept; prints the time from first contentful paint to a usable Place Order); F4 billing address different from shipping, Back from the success page lands on the cart; F5 a customer without saved addresses, "Add New Address" with and without "Save in address book"; F6 a cart price rule on the payment method; F7 country switch (required state, postcode warning, free text region, optional postcode); F8 shipping method change, no rate for an address, a coupon that makes shipping free; F10 a 390 px viewport (the total at load and beside Place Order, the summary bar opens); F11 a display currency other than the base currency; F12 an item that sells out between load and order, the minimum order amount at load and after a coupon; F13 no Content Security Policy violation while each gateway row is selected; F14 with `--with-braintree`, a card order through the Braintree hosted fields with a sandbox test card, guest and customer | Bank Transfer for F6, the minimum order amount for F12, the coupon reCAPTCHA with `--with-recaptcha` (put back as found, also when the run is interrupted); `fixtures/checkout-flow-fixture.php`, `fixtures/payment-rule-fixture.php`, `fixtures/stock-zero-fixture.php`; customers with a unique email per run and the orders they place stay | yes |
| `pw-captcha.mjs` | `<baseUrl> <slotDir> [--with-braintree] [--only <phase,...>] [--v3-threshold <score>] [--shots dir]`, or `<baseUrl> <slotDir> --restore` | the image CAPTCHA (sign-in after failed attempts and always, coupon, Place Order) and reCAPTCHA v2 invisible, v2 checkbox and v3 for Place Order, the coupon and the inline login, guest and customer; Google's script blocked and retried; `--with-braintree` adds card orders with the Braintree reCAPTCHA form. Google's service must be reachable (a leg that depends on it prints SKIP otherwise) | sets Google's public test keys and every CAPTCHA setting for the run and restores what it found, also after an interrupted run with `--restore` | sets its own keys |
| `pw-payment-api.mjs` | `<baseUrl> <slotDir> [--only card,currency,...] [--shots dir]` | the payment renderer contract and the express slots with the sample payment module: a hosted card element (base totals in the nonce, a fake 3D Secure challenge, a stored card), the redirect and form types, the express button, hidden methods and their diagnostic rows; guest and customer | needs `install-dev-modules.mjs` first; switches the sample methods on for the run | the customer parts log in |
| `pw-shipping-extensions.mjs` | `<baseUrl> <slotDir> [--only guest,customer,load-failure] [--shots dir]` | the shipping extension contract with the sample locker carrier: the picker under its rate, the held save and the gate, the address override, the summary, a reload, a load failure | needs `install-dev-modules.mjs` first; switches the sample carrier on for the run | the customer part logs in |
| `pw-extension-points.mjs` | `<baseUrl> <slotDir> [--only markers,account,footprint,checkout-api,checkout-error,consumers,off] [--shots dir]` | the storefront containers and both Core events with the sample markers, the generic checkout API (slot, gate, request filter, address field), the order comment and the newsletter opt-in, and that a disabled sample adds nothing | needs `install-dev-modules.mjs` first; switches the sample markers and the two first-party fields on for the run | the customer parts log in |

The three extension scripts need the development modules of
`dev/modules/` on the install: `node e2e/install-dev-modules.mjs <slotDir>`
copies them into `app/code/`, enables them and compiles; `--remove` takes
them out again. Every feature of those modules is off by default, and the
scripts switch on what they test and restore it
([Extending Hyperion](./extensions.md#testing-and-the-sample-modules)).

The fixture scripts in `frontend/e2e/fixtures/` are plain PHP that
bootstraps Magento from `/var/www/html`; each file header documents its
`apply` / `remove` arguments, and every check removes what it applied.
`tax-display-fixture.php` switches the catalog, cart and shipping tax display
to "including tax" for a destination an existing tax rule covers (nothing is
created in the tax tables) and `--remove` puts every `tax/*` row back as it
was, deleting the rows that did not exist; `decimal-qty-fixture.php <sku>`
makes the quantity of one simple product decimal and puts the previous flag
back.

The fixtures of the checkout and cart scripts:

| Fixture | Arguments (after the Magento root) | What it does |
|---|---|---|
| `checkout-flow-fixture.php` | `--apply` / `--remove`; `customer <email> <password> <0 or 2>` | three cart price rules with one coupon each (`HYPFLOW100` 100 percent with shipping, `HYPFLOW60` 60 percent, `HYPFLOWSHIP` free shipping); a customer with no saved address or with two (a default one in Michigan and a second one in Alaska). Customers are not removed: their orders keep pointing at them |
| `payment-rule-fixture.php` | `--apply` / `--remove` | a cart price rule of 5 percent whose condition is the payment method Bank Transfer; it only acts while that method is offered, which the calling script switches on and puts back |
| `stock-zero-fixture.php` | `--apply [sku]` / `--remove [sku]` | takes one simple product out of stock through the stock registry and puts it back (default `24-UG07`, which no other script buys); the values found are kept in `var/tmp` until `--remove` |
| `custom-total-fixture.php` | `--apply` / `--remove` | writes the module `HyperionTest_CustomTotal` into `app/code` of the install (a quote total `hyperion_test_fee`, 2.50 in the base currency), enables it and runs `setup:upgrade` and `setup:di:compile`; `--remove` undoes it and compiles again. The storefront answers errors while the compilation runs: never on a store that serves visitors |
| `customer-fixture.php` | `<email> <password> --apply` / `<email> --remove` | a confirmed customer with one default address (United States, Michigan), no welcome email; `--remove` deletes the customer |
| `vault-token-fixture.php` | `<customer email> --apply` / `--remove` | one stored PayPal account of the Braintree gateway in `vault_payment_token` for that customer (nothing is sent to a gateway: the row only renders); reports when the Braintree module is not enabled |
| `order-address-fixture.php` | `<increment id>` | read only: prints the shipping address of an order as one JSON line |
| `custom-attributes-fixture.php` | `--apply` / `--remove` | three user-defined customer attributes (a text, a select with two options, a required text) and one text attribute of the customer address, visible and assigned to the storefront and admin forms; an attribute that exists is left as it is; `--remove` deletes the four with their values. Flush the cache after each call |
| `weee-demo.php` | none / `--remove` | the Fixed Product Tax attribute `hyperion_fpt` with 5.00 on `24-MB01`. It writes no configuration: the script that uses it turns `tax/weee/*` on for its run and puts every row back (on a store checked by hand, set Sales > Tax > Fixed Product Taxes in the admin). Reindex prices and flush afterwards |

The customer login of the headless browser scores too low for reCAPTCHA v3,
so every check marked "yes" above needs the login form relaxed for the run
(only `pw-catalogmode.mjs` does it itself). Before the run:

```bash
bin/magento config:set recaptcha_frontend/type_for/customer_login ''
bin/magento config:set recaptcha_frontend/type_recaptcha_v3/score_threshold 0.1
bin/magento cache:flush
```

and afterwards restore the two values (`recaptcha_v3` and `0.5` on a stock
install, or whatever `bin/magento config:show` printed before).
`pw-checkout-resilience.mjs` and `pw-cls.mjs` also register a customer
through the storefront form, so on a store that protects it
(`recaptcha_frontend/type_for/customer_create`) the lowered score threshold
is what lets the headless browser through. Never leave a
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

The checkout joins as a flow, not as a page: every step of a guest order
(load, an invalid then a valid email, the country, the address, the shipping
method, a reload) must leave the layout where it was; the server rendered
skeleton of the checkout must put the contact card, the shipping card and
the summary exactly where the application renders them (the entry script
blocked against the mounted page); and a customer run repeats both with a
hydrated quote. Options are written `--name=value`:

- `--only=<parts>`: comma separated, from `pages`, `skeletons`, `motion`,
  `checkout-flow`, `checkout-parity`, `checkout-customer` (default: all,
  about nine minutes);
- `--viewport=desktop|phone`: limits the checkout parts to one viewport;
- `--dump=<file>`: writes every checkout measurement (layout shift entries
  with their sources, every rectangle of the skeleton and of the
  application) to a JSON file, which is what you tune the skeleton from;
- `--customer=<email>:<password>`: an existing customer WITHOUT saved
  addresses for the customer run; by default the script registers a new one.

Run the checkout parts after touching `checkout.phtml`,
`ViewModel\CheckoutSkeleton`, a checkout component or its stylesheet.

### Critical CSS per page type

The home and CMS pages, the category and search results pages and the
product page paint their fold from an inline critical sheet and load the
theme stylesheet without blocking; every other page inlines the small tokens
sheet (`src/css/source/critical.css`) and links the stylesheet synchronously,
as before. The sheets live in `frontend/packages/theme-default/src/css/critical/`:
`cms.css`, `category.css` and `product.css` import the structural partials the
fold of that page type uses and run a second Tailwind pass (`@config` with
`tailwind.<type>.ts`) whose `content` is the list of templates, layout files
and PHP renderers that print the markup above the fold (`tailwind.ts`, lists
`FOLD_COMMON`, `FOLD_CMS`, `FOLD_CATEGORY`, `FOLD_PRODUCT`). The list, not a
rendered page, is the extraction: the build is the same on every machine and
the sheet covers every store that renders those templates. Vite emits them as
`critical-<type>.<hash>.css`; `HyperionCore\Block\AssetManifest::getCriticalCss($type)`
reads them and `head/scripts.phtml` inlines the one named by the layout
argument `critical_css_type` of the `hyperion.head.scripts` block (the theme
sets it in `cms_index_index.xml`, `cms_page_view.xml`,
`catalog_category_view.xml`, `catalogsearch_result_index.xml` and
`catalog_product_view.xml`). Sizes: about 11 KB gzip for cms and product, 14 KB
for category (the full stylesheet is 17 KB), on top of every HTML response of
the type; the first paint no longer waits for the stylesheet request.

Three companions keep the page stable in that mode: the stylesheet link
carries `media="print"` and an inline script right after it flips it to `all`
on load (a `<noscript>` link covers browsers without scripting); the entry
module fetches the component chunks only once the stylesheet applies
(`src/js/lib/theme-stylesheet.js`), so they do not share the connection with
the images of the fold; and `RenderBlockingMarkerPlugin` adds
`<link rel="expect" href="#hyperion-footer" blocking="render">` to the head,
so the browser does not paint a document that is still streaming in.

`node e2e/pw-critical.mjs <baseUrl>` is the gate: it loads every typed page
with the stylesheet request aborted and again normally, desktop and phone,
and compares the viewport screenshots pixel by pixel (budget 0.1% of the
pixels); it also checks the link contract and that the untyped pages keep the
synchronous link. Something missing from a template list shows up there as a
difference; add the file to the list, never a rule by hand. To cover another
page type: a list in `tailwind.ts`, a `tailwind.<type>.ts`, a `<type>.css`
with the partials the fold needs, the input in `vite.config.ts`, the layout
argument on the handle, a page in `pw-critical.mjs`. `pw-cls.mjs` stays the
layout shift gate.

### Accessibility

`node e2e/pw-a11y.mjs <baseUrl>` injects [axe-core](https://github.com/dequelabs/axe-core)
(the `axe-core` devDependency of the workspace) into the home page, a
category, a product page, the login, registration and contact forms and the
cart, runs the default rule set and fails on any `critical` or `serious`
violation (rule, impact, the first target selectors and the page are printed;
`moderate` and `minor` findings are listed as warnings) or page error. Run it
after touching the header, the footer, a form template or a component that
wraps light DOM content.

The checkout follows with a product in the cart and is scanned twice: as it
loads, and with the billing address form open next to the shipping one
after a press on Place Order with nothing filled in (every error message
showing). There a duplicate id or a second main landmark fails the run
whatever impact the rule carries. `--only=pages|checkout` runs one half,
`--dump=<file>` writes every violation with its nodes (selector, HTML,
failure summary) to a JSON file.

### Checkout time to first byte in production mode

The checkout page is never cached, so its server time is what every shopper
waits for. To profile it:

1. Switch the install to production mode (`bin/magento deploy:mode:set
   production`, static content deployed) with the caches enabled, and put a
   product in a cart so `/checkout/` renders the application.
2. Load the page five times with that session and note the time to first
   byte of each load (`curl -s -o /dev/null -w '%{time_starttransfer}\n' -b
   'PHPSESSID=<the session of the cart>' <baseUrl>/checkout/`, or the
   Network panel of the browser that holds the cart). Without a cart the
   URL only answers the redirect to the cart page. Drop the first load: it
   warms the caches.
3. Time the config providers: `checkoutConfig` is built by every
   `ConfigProviderInterface` registered on
   `Magento\Checkout\Model\CompositeConfigProvider` (core's, Hyperion's and
   those of payment modules). Wrap each provider's `getConfig()` with a
   timer in a throwaway module or a profiler (Xdebug profile, Blackfire, or
   Magento's `MAGE_PROFILER`) and sort by time; a provider that asks a
   gateway or a carrier during the render is the usual cost.
4. Compare with the same five loads in developer mode only to rule out a
   measurement error: developer mode numbers say nothing about production.
5. Switch the mode back and redeploy.

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
  rollup-plugin-license): the full license text of every bundled library, for
  Composer consumers who never see the npm packages. A dependency without a
  license text or outside the allow list of that file fails the build.
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

All eleven modules have a `Test/` directory; the loop picks up
a new one without a change here or in CI. `--no-extensions` matters: core's
`phpunit.xml.dist` bootstraps the Allure extension with a config path that
is relative to the working directory, so from the Magento root every test
passes and the runner still exits 1. Never judge a QA command by its last
output line: check its exit code (`set -o pipefail` in scripts).

Required state: phpstan level 5 with no errors, phpcs with zero errors
(warnings remain), every `catch` block logs. Run
`vendor/bin/phpstan clear-result-cache` after `setup:di:compile`; phpstan
needs the generated factories, so compile first. Unit tests must run on
PHPUnit 10 (Magento 2.4.8) and 12 (Magento 2.4.9, Mage-OS 3.6 and 4.0):

- A data provider is a `public static` method named by the
  `#[\PHPUnit\Framework\Attributes\DataProvider('name')]` attribute, and by
  nothing else: no `@dataProvider` annotation (PHPUnit 12 ignores doc
  comment metadata).
- No `withConsecutive`, no `at()`.
- A double that only answers is `createStub()`; a double that verifies calls
  is `createMock()`, and then every test that uses it configures an
  expectation. `--display-all-issues` must print nothing.

**Plugin targets.** A plugin method whose subject has no such public method
compiles, passes phpstan and never runs. After `setup:di:compile`:

```bash
php path/to/hyperion/.github/scripts/check-plugin-targets.php <magento-root> path/to/hyperion
```

The script reads `etc/di.xml` and `etc/*/di.xml` of every module of the
repository (it autoloads the repository's classes, not the installed copy),
and for every public `before` / `after` / `around` method of a declared
plugin requires a public, non-static, non-final method of that name on the
target. It prints one line per miss and exits 1; a target that belongs to a
package of the module's Composer `suggest` and is not installed only raises
a warning. CI runs it on every leg.

Conventions the gate does not catch: templates escape with the
engine-provided `$escaper`, never `$block->escape*()`; inline `<script>`
tags carry an explicit `type`; theme layout files `referenceBlock` core
blocks instead of re-declaring them; every storefront page stays at zero
`x-magento-init` / `data-mage-init` occurrences; every source file starts
with the `SPDX-License-Identifier: MIT` header; no em dash or en dash
anywhere.

htmx conventions: it runs with `historyCacheSize: 0` and
`refreshOnHistoryMiss: true` (`HyperionCore\ViewModel\HtmxConfig`), so Back
and Forward across a pushed URL (listing changes, account navigation) are
full document requests for the public URL and nothing is stored in
`sessionStorage`; never listen for `htmx:historyRestore`. An Add to Cart
form carries `hx-sync="this:drop"`, no `hx-disabled-elt` and no
`hx-indicator`, and its button the `data-hyperion-atc` markup described in
[Child themes](./child-themes.md#markup-contracts-the-parent-javascript-relies-on).
Listing controls share one request queue through `hx-sync` on the grid root
and on the layered navigation; listing URLs come from
`HyperionCatalog\ViewModel\Listing`, never from a concatenated query string.
The build output must keep the file name shape the minification excludes
match: a hashed file directly under `assets/`, named `name.<hash>` or
`name-<hash>` with an eight character hash
([Install](./install.md#production-checklist)).

## CI workflows

`.github/workflows/frontend.yml` (push to `main`, pull requests): Node 22,
`pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r lint`,
`pnpm -r test`, `pnpm -r build`, the committed-assets check (`git status
--porcelain` over `app/**/web/assets/*`, `app/**/web/css/*`, the two
manifests and `app/**/web/THIRD_PARTY_LICENSES.txt`; the trailing `/*` is
what makes a git pathspec match the files of a directory), then `pnpm pack`
of every package to prove the tarballs build.

`.github/workflows/php.yml` (push to `main`, pull requests, and a nightly
schedule at 03:17 UTC): creates a Mage-OS project from `repo.mage-os.org`
(no authentication keys needed), installs Hyperion from the checkout through
path repositories with `symlink: false` (like a Packagist install), runs
`setup:install` against MariaDB 12.3 and OpenSearch 3 service containers and
`setup:di:compile`, then the plugin target check, phpcs (errors only),
phpstan level 5 and PHPUnit for every module that has a `Test/` directory.
The legs:

| Leg (check name) | Mage-OS | PHP | Blocking |
|---|---|---|---|
| `gate / Mage-OS 4.0.* / PHP 8.4` | 4.0 | 8.4 | yes |
| `gate / Mage-OS 4.0.* / PHP 8.5` | 4.0 | 8.5 | yes |
| `php-8.3 / Mage-OS 4.0.* / PHP 8.3` | 4.0 | 8.3 | no |
| `tier-2 / Mage-OS 3.6.* / PHP 8.4` | 3.6 | 8.4 | no |
| `canary / Mage-OS * / PHP 8.5` (nightly run only) | newest release | 8.5 | no |

The two `gate` legs also run `composer validate` on the twelve manifests and
check that the twelve Composer `version` fields and the three npm ones are
one and the same string. The non-blocking legs report a failure without
failing the workflow. A branch protection rule that lists required checks
names the two `gate` checks. Magento Open Source is not installed in CI (its
repository needs keys): Magento 2.4.9 and 2.4.8 are covered by the batteries
of [Compatibility](./compatibility.md).

`.github/workflows/satis.yml` (release tags `v*`, or by hand): runs
`.github/scripts/build-satis.sh`, which checks out every `v*` tag into a git
worktree, generates a `satis.json` with one pair of path repositories per
tag from the root `satis.json`, runs Satis (the `composer/satis` Docker
image) and deploys the output (`packages.json`, `p2/`, `dist/*.zip`,
`index.html`) to GitHub Pages with `actions/deploy-pages`. The index is
written again on every run; the archives of the releases the published site
already serves are fetched from it first and kept byte for byte, so only the
archives of a new release are built. The reason: a `composer.lock` records
the checksum of every archive, and an archive that is built again keeps its
URL but gets other file times and another checksum, so `composer install`
from a lock written before that build fails with "The checksum verification
of the file failed" on a machine without a Composer cache. The build
therefore aborts when the published site cannot be read, when a published
archive does not match the checksum of its metadata, and when a released
version would change or disappear. `HYPERION_PUBLISHED_REPOSITORY=<url>`
reads the released archives from another address; an empty value builds
every archive (a repository that was never published). One-time
setup: repository Settings > Pages > Source = "GitHub Actions". The build
aborts when any of the twelve `composer.json` files of a tag carries a
`version` other than the tag (a lagging module would be archived under the
wrong version and the theme's `self.version` requirements would never
resolve), and when an archive lacks `LICENSE` (every package carries its own
copy) or, for the theme and HyperionCheckout, `THIRD_PARTY_LICENSES.txt`. The
same script builds the working tree alone when no tag
exists (`.github/scripts/build-satis.sh http://127.0.0.1:8099` was used to
rehearse an install from a local HTTP server).

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
   package, then the Tier 1 platforms: install into Magento 2.4.9 and
   Mage-OS 4.0 and run the full battery on each (PHP 8.4 and 8.5 between
   them), plus one production-mode run with JS and CSS minification on. On a
   release candidate, run the smoke battery on the Tier 2 platforms (Magento
   2.4.8, Mage-OS 3.6). Write the release, the date and the counts of each
   run into the matrix of [Compatibility](./compatibility.md).
3. Tag `v<version>` (for this release `v0.9.0-beta.7`) and push.
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
5. Composer channel: pushing the tag triggers `satis.yml`, which builds the
   archives of the new tag, keeps the published ones and publishes the
   Composer repository on GitHub Pages
   (`https://magentofullstackdev.github.io/hyperion/`). Check the workflow
   run (its log says `released archives kept: <n>`, twelve per earlier
   release), then `composer require magentofullstackdev/theme-hyperion:^<version>`
   in a clean project as described in [Install](./install.md).
6. GitHub release with the changelog section and the known limitations.
