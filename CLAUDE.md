# CLAUDE.md

Guidance for AI coding assistants (Claude Code and others) working in this repository. It complements `CONTRIBUTING.md` and `docs/development.md`; read those for the full procedures, this file is the short version an assistant should keep in mind on every task.

## What this is

Hyperion is a Magento 2 storefront theme plus a suite of eleven PHP modules. Frontend stack: Tailwind CSS 3.4, Lit 3 Web Components and HTMX 2, served through Varnish with ESI. There is no RequireJS, jQuery or Knockout on the storefront. License MIT, version `0.9.0-beta.2`, one maintainer.

Supported: Magento 2.4.7 to 2.4.9 and Mage-OS 2.3+ / 3.x, PHP `~8.3.0 || ~8.4.0 || ~8.5.0`, Node 22, pnpm 10. See `docs/compatibility.md`.

## Repository layout

- `app/code/Magentofullstackdev/Hyperion*`: the modules. `HyperionCore` is the foundation (ESI fragments, asset manifest, Varnish BAN, ViewModel registry, HTMX-aware controller plugins, rate limiter, purchase restriction pool). `HyperionCatalog`, `HyperionSearch`, `HyperionMegaMenu` (the only module with an admin UI), `HyperionCheckout`, `HyperionCustomer`, `HyperionNavigation`, `HyperionCms`, `HyperionImage`, `HyperionCatalogMode`, and the optional `HyperionSampleData`. Every module sequences on `Magentofullstackdev_HyperionCore` in `etc/module.xml` and has a `composer.json` named `magentofullstackdev/module-hyperion-<domain>`.
- `app/design/frontend/Magentofullstackdev/hyperion`: the theme (`magentofullstackdev/theme-hyperion`, no parent theme). Its `composer.json` requires the ten storefront modules. It overrides core templates module by module (`Magento_Catalog/templates/...`).
- `frontend/`: the pnpm workspace with three npm packages under `frontend/packages/`: `shared` (`@magentofullstackdev/hyperion-shared`: tokens, Tailwind preset, `HyperionLightElement`), `theme-default` (`@magentofullstackdev/hyperion-theme`: components, entry, CSS, the `hyperion` child theme CLI in `bin/hyperion.js`), `module-checkout` (`@magentofullstackdev/hyperion-checkout`: the Lit checkout app). End to end scripts live in `frontend/e2e/`.
- `docs/`: public documentation (`install.md`, `configuration.md`, `checkout.md`, `child-themes.md`, `pagebuilder.md`, `varnish.md`, `development.md`, `compatibility.md`, `known-limitations.md`). Keep it in sync when behaviour or configuration paths change.
- `.github/`: CI (`frontend.yml`, `php.yml`), the Satis workflow that publishes the Composer repository on GitHub Pages (`satis.yml`, `scripts/build-satis.sh`), issue and PR templates.

## Commands

All frontend commands run from `frontend/` (the only pnpm workspace; `npm install` does not work there because of the `workspace:^` protocol).

| Command | Purpose |
|---|---|
| `pnpm install --frozen-lockfile` | install |
| `pnpm -r build` | build shared, theme, checkout; writes the committed assets |
| `pnpm -r test` | Vitest (theme under happy-dom, checkout under jsdom) |
| `pnpm -r typecheck` / `pnpm -r lint` / `pnpm lint:e2e` | gates CI runs |
| `pnpm --filter @magentofullstackdev/hyperion-theme dev` | Vite dev server for the theme |
| `node e2e/pw-suite.mjs <baseUrl>` | the Playwright suite against a running store (see `docs/development.md`) |

PHP gates (from a Magento install that has the modules): phpstan level 5 and phpcs with the Magento2 standard must stay clean (warnings are tolerated, errors are not), PHPUnit from `dev/tests/unit/phpunit.xml.dist` with `--no-extensions` and `--display-all-issues` silent. Details and the exact commands: `docs/development.md`, "PHP quality gate".

## Architecture you must not break

- **Build outputs are committed.** `web/assets/`, `web/manifest.json` of the theme and `view/frontend/web/` of the checkout module ship as part of the Composer packages; consumers never run npm. Never ignore or delete them; after any change under `frontend/` run `pnpm -r build` before committing. CI fails when the committed assets differ from a fresh build. Never put a hand written file under the theme's `web/` directory: the build empties it.
- **Two manifest readers.** `HyperionCore\Block\AssetManifest` reads the theme `web/manifest.json`; `HyperionCheckout\Block\Checkout` reads Vite's `.vite/manifest.json` of the checkout. Hashed file names are resolved at request time.
- **Adding a Lit component** = a new file in `frontend/packages/theme-default/src/js/components/hyperion-<name>.js` (or `.ts`). A Vite glob turns it into its own chunk and manifest entry; reference it from a template through the asset manifest block. Components extend `HyperionLightElement` (light DOM, so Tailwind utilities reach them) unless they need a shadow root; the element prefix is always `hyperion-`. New components get a test in `src/js/components/__tests__/`.
- **HTMX is a standalone asset** copied from `htmx.org` by the Vite plugin, not bundled. It runs with `allowEval`, `allowScriptTags` and `includeIndicatorStyles` off: no `hx-on`, no `js:` attribute values, no `<script>` inside swapped fragments. Data for scripts travels in `data-*` attributes.
- **Edge cached pages carry no session state.** The header issues ONE request to `hyperion/header/state` and the response is every session fragment as an out of band swap (`HeaderStatePool`). Never add a second `hx-trigger="load"` session request to the header. Any fragment served through ESI must be session agnostic and registered in `PublicRouteRegistry`.
- **HTMX action responses** (cart add, wishlist, compare, cart update) are built from `HyperionCore/Model/Htmx/` (`MessageCollector`, `NotificationRenderer`, `FragmentRenderer`). The toast placeholder `#hyperion-notification` and the `<hyperion-confirm>` dialog exist once per page; use `hx-confirm`, never `window.confirm`.
- **Cache keys and cacheability.** A block with a `cache_lifetime` includes `Http\Context::getVaryString()` in its cache key. Every page or fragment that renders session data (cart, checkout, customer, wishlist, compare, mini-cart) needs at least one `cacheable="false"` block, otherwise logged in customers see empty data while guests look fine. Test session bound flows as a guest AND as a logged in customer.
- **Controllers** implement `ActionInterface` directly; `StoreContextPlugin` sets the store and currency context for them. Never build a response that bypasses `sendVary()`.
- **Listings** (category and search) swap their grid through fragment controllers (`hyperion/category/filter`, `hyperion/catalog/search`) rendered by `Model\Listing\FragmentResponse`, which pushes the PUBLIC listing URL through `HX-Push-Url`. Never put `hx-push-url="true"` on a fragment request.
- **PageBuilder** content is plain HTML plus core's structural stylesheet ported to `_pagebuilder.css`; the theme replaces core's RequireJS widgets with components that read the same `data-*` attributes. A CMS `<img>` may be wrapped in `<picture>` by `HyperionImage` at any time: never select a content image with a child combinator from its container.
- **Optional modules** (`Magento_Paypal`, `Magento_Msrp`, `Magento_GiftMessage`, `Magento_Weee`, `Magento_LoginAsCustomer*`, `Magento_OrderCancellation*`) are reached only through `Module\Manager` and string class names, and listed under composer `suggest`.
- **Checkout state** uses signals; address completeness is ONE predicate in `utils/address-validation.ts`; a postcode format mismatch is a warning, only a missing required postcode blocks; the REST client sends `X-Requested-With: XMLHttpRequest`; URLs are built on `hyperion.baseUrl`, never on `staticBaseUrl`.
- **Motion and layout shift.** Components that render after their chunk arrives ship a server rendered skeleton with the same geometry; `_motion.css` carries the reduced motion rules for the light DOM and every shadow root component carries its own `@media (prefers-reduced-motion: reduce)` block placed after the transitions it overrides. `node e2e/pw-cls.mjs <baseUrl>` must report CLS 0.

## Conventions

- Every TS/JS file starts with `// SPDX-License-Identifier: MIT` and the copyright line used by its siblings.
- Templates escape with the engine provided `$escaper`, never `$block->escape*()`; inline `<script>` tags carry an explicit `type`; keep Tailwind class names literal (the JIT scans `.phtml`, `src/**` and `Model/**/Renderer.php`).
- Theme layout files `referenceBlock` core blocks; never re-declare a core block with `<block name="...">` (it discards the children other modules scheduled inside). One `<attribute name="class">` per class.
- Never override, at the same path, a core template that core also renders elsewhere (emails, print pages) without checking every layout that uses it.
- User facing strings: `__()` in PHP and templates, `t()` in the checkout; a new phrase goes into the module or theme `i18n/en_US.csv` AND every locale CSV (same row position), and for the checkout into `src/i18n/en_US.json` and `it_IT.json` too (`scripts/sync-i18n.mjs` writes those two CSVs from the JSON catalogs at build time).
- Unit tests must run on PHPUnit 9, 10 and 12: data providers carry both the `@dataProvider` annotation and the `#[DataProvider]` attribute and are `public static`; no `withConsecutive`, no `at()`; a double that only answers is a stub, a double that verifies calls configures an expectation in every test.
- Commit messages use conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`). Keep the three npm versions and the twelve Composer versions aligned on release; the Composer `version` must equal the git tag (the Satis build refuses a mismatch). Release steps: `docs/development.md`, "Release procedure".
- Comments explain the code; do not record project history, ticket numbers or tooling conversations in them.
- Plain hyphens, commas and colons in prose; no em dash or en dash in code, comments, docs or commit messages.

## Before you say a task is done

1. `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` green; `pnpm -r build` run and the result committed when anything under `frontend/` changed.
2. phpstan level 5 and phpcs clean on every PHP file touched; PHPUnit green for the modules touched.
3. The relevant Playwright script run against a store with sample data (the suite, or the focused script for the area; `docs/development.md` lists them), as a guest and as a customer where sessions are involved.
4. `docs/` and `CHANGELOG.md` ("Unreleased" section) updated when behaviour, configuration paths or limitations changed.
