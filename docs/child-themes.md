# Child themes

Customize Hyperion the Magento way: a child theme with
`Magentofullstackdev/hyperion` as parent, template and layout overrides at
the same paths, and an optional Vite + Tailwind build for your own CSS and
components. The parent's bundle (components, HTMX, base stylesheet) keeps
loading unchanged; your build only adds what your overrides need.

Requirements for the build: Node.js 22, the three npm packages listed at the
end of this page. A child theme without JavaScript or CSS additions needs no
Node at all.

## The `hyperion` CLI

`@magentofullstackdev/hyperion-theme` ships a scaffolding command. Run it from
the Magento root:

```bash
npx -p @magentofullstackdev/hyperion-theme hyperion create Vendor/Theme
```

Keep the `-p @magentofullstackdev/hyperion-theme` part: a bare `npx hyperion`
resolves to this CLI only inside a project where
`@magentofullstackdev/hyperion-theme` is already installed locally (then
`npx hyperion create Vendor/Theme` works); anywhere else `npx` downloads and
runs an unrelated third-party `hyperion` package from the npm registry.

Options: `--force` writes into a directory that already exists (files are
overwritten), `-h` / `--help`, `-v` / `--version`. Vendor and theme names
must start with a letter and contain letters, digits and underscores.

It writes `app/design/frontend/Vendor/Theme/`:

| File | Purpose |
|---|---|
| `registration.php` | registers `frontend/Vendor/Theme` |
| `theme.xml` | title "Theme by Vendor", parent `Magentofullstackdev/hyperion` |
| `package.json` | private package with `@magentofullstackdev/hyperion-shared` and `@magentofullstackdev/hyperion-theme` at `^<hyperion version>` and `lit` (declared directly so pnpm resolves it too), Vite, Tailwind, PostCSS; scripts `build` and `dev` (`vite build --watch`); `pnpm.onlyBuiltDependencies: ["esbuild"]` so pnpm 10 runs esbuild's binary install without a prompt or an "Ignored build scripts" notice (no other dependency script is enabled) |
| `vite.config.js` | builds `src/js/entry.js` into `web/assets/`: `entry.js` and `entry.css` under fixed names, every other chunk and asset with a hash in its name (`<name>.<hash>.js`), `base: './'`, source maps, no manifest |
| `tailwind.config.js` | Hyperion preset; scans this theme's `*/templates/**/*.phtml`, `*/layout/**/*.xml` and `src/**/*.{js,ts}` only |
| `postcss.config.js` | Tailwind + autoprefixer |
| `src/js/entry.js` | imports `../css/entry.css`; add your components here |
| `src/css/entry.css` | `@tailwind components; @tailwind utilities;` (preflight comes from the parent) and a place for token overrides |
| `Magento_Theme/layout/default.xml` | adds a block after `hyperion.head.scripts` that links the built assets |
| `Magento_Theme/templates/html/theme-assets.phtml` | `<link>` and `<script type="module">` for `assets/entry.css` and `assets/entry.js` |
| `README.md` | the build steps |

Then:

```bash
cd app/design/frontend/Vendor/Theme
npm install
npm run build          # or: npm run dev (rebuild on change)
cd - && bin/magento setup:upgrade && bin/magento cache:flush
```

Assign "Theme by Vendor" in Content > Design > Configuration. In production
mode run `bin/magento setup:static-content:deploy` after every build.

## How the assets are linked

The parent theme resolves its hashed bundles at request time through
`HyperionCore\Block\AssetManifest`, which reads the parent's
`web/manifest.json` only. A child theme therefore does not use the manifest:
its Vite config writes `web/assets/entry.js` and `web/assets/entry.css` with
fixed names, and `theme-assets.phtml` links them through
`$block->getViewFileUrl('assets/entry.js')`. Magento's static content signing
(`/static/version<timestamp>/...`) cache-busts them, and
`setup:static-content:deploy` materializes them like any theme file.

The block is inserted in the `after.body.start` container after
`hyperion.head.scripts`, so the parent's critical CSS, entry CSS, HTMX and
entry module are already in place when your code runs. The parent's own stylesheet link carries `data-hyperion-theme-css`: it is the sheet the mini-cart drawer adopts into its shadow root when it upgrades (fetched once per page, cached for every instance).

On the home, CMS, category, search and product pages the parent inlines a
critical sheet for that page type and loads its stylesheet without blocking
(`docs/development.md`, "Critical CSS per page type"); your own stylesheet
link stays synchronous, so your rules are in place at the first paint and
override the parent's as before. The parent's critical sheets are built from
the parent's templates: a child template that puts new Tailwind classes above
the fold of one of those pages should ship their rules in the child's own
sheet, or map the handle back to the synchronous mode with an empty
`critical_css_type` on the `hyperion.head.scripts` block in the child's layout
file for that handle.

### Minification

Magento's JS and CSS minification renames the files it processes to
`.min.js` / `.min.css`. That is harmless for the two entry files, because
the template links them through `getViewFileUrl()`, which adds `.min` by
itself; it would break every other chunk, because the entry imports those
by the file name Vite wrote. `HyperionCore` therefore excludes from
Magento's minification every hashed file directly under an `assets/`
directory (`name.<8 characters>.js`, `name-<8 characters>.js` and the `.css`
twins; see [Install](./install.md#production-checklist)), and the scaffold
writes exactly that shape:

```js
output: {
    entryFileNames: '[name].js',
    chunkFileNames: '[name].[hash].js',
    assetFileNames: (asset) => (isEntryStylesheet(asset) ? '[name][extname]' : '[name].[hash][extname]'),
},
```

- Do not change `chunkFileNames` / `assetFileNames` to unhashed names.
- A theme scaffolded before `0.9.0-beta.5` has `chunkFileNames: '[name].js'`.
  It keeps working while the build has a single chunk. As soon as it uses a
  dynamic `import()` and JS minification is on, the chunk is published as
  `<name>.min.js` while the entry still imports `./<name>.js` (a 404): copy
  the three `output` lines (and the `isEntryStylesheet` helper) from a fresh
  scaffold into your `vite.config.js`, or add a `minify_exclude` entry of
  your own.
- A file placed outside `web/assets/`, or in a subdirectory of it, is not
  covered by the exclude and is minified and renamed by Magento like any
  other static file.
- The entry files themselves are still processed by Magento's minifier when
  it is on. A deploy of a child theme under JS minification was not part of
  the test runs of this release: check your storefront once after the first
  production deploy.

## Design tokens

Colors are CSS custom properties declared by
`@magentofullstackdev/hyperion-shared/tokens/colors.css` as raw RGB channel
triplets (`37 99 235`, never hex or `rgb()`), which is what lets Tailwind's
opacity modifiers (`bg-primary/50`) work. Override them in your
`src/css/entry.css`:

```css
:root {
    --color-primary: 220 38 38;
    --color-primary-hover: 185 28 28;
}
```

The 38 tokens of `colors.css`:

| Group | Tokens |
|---|---|
| Brand | `--color-primary`, `--color-primary-hover`, `--color-secondary`, `--color-accent`, `--color-on-primary`, `--color-on-secondary` |
| Surfaces | `--color-surface`, `--color-surface-raised`, `--color-surface-sunken`, `--color-surface-overlay`, `--color-surface-inverted`, `--color-on-inverted`, `--color-on-inverted-muted` |
| Text | `--color-text-default`, `--color-text-secondary`, `--color-text-tertiary`, `--color-muted` |
| Lines | `--color-subtle` (borders and dividers), `--color-subtle-inverted`, `--color-border-default`, `--color-divider`, `--color-focus-ring` |
| States | `--color-error`, `--color-error-hover`, `--color-error-active`, `--color-error-strong` (error text on the `bg-error/10` tint), `--color-on-error`, `--color-success`, `--color-success-strong` (success text on the `bg-success/10` tint), `--color-success-subtle`, `--color-on-success`, `--color-warning`, `--color-warning-strong` (warning text on white and on the `bg-warning/10` tint, 4.5:1), `--color-warning-light`, `--color-on-warning`, `--color-info`, `--color-on-info` |
| Commerce | `--color-price-sale` (defaults to `var(--color-error)`) |

The file itself is the reference when a token is added. Spacing and
typography tokens live in `spacing.css` and `typography.css` next to it. The
Tailwind preset (`@magentofullstackdev/hyperion-shared/tailwind/preset`)
maps them to the semantic utilities used by the parent templates
(`bg-primary`, `text-muted`, `border-subtle`, ...), so a rebrand in the
tokens propagates to every template and to the checkout.

### Motion

`--hyperion-motion-fast` on `:root` (120ms in `_theme.css`) is the one knob of
the storefront's motion: the cross-fade between pages (cross-document view
transitions), the fade-in of every htmx swap, the dimming of the product
grid while it loads and the fade-in of the components that replace a server
fallback. Set it in your theme's CSS to change the feel, `0ms` turns it off;
visitors with `prefers-reduced-motion: reduce` never see it.

The rules live in the parent's `_motion.css` and hook into three things a
child component can reuse: htmx keeps the `htmx-added` class on swapped-in
content for its settle delay, and the parent fades `.htmx-added` from
transparent to opaque over the knob; an element that is the `hx-indicator`
of its own request gets `htmx-request` and the product grid uses it to dim
itself to 0.6 while it loads (`hx-indicator="#<grid id>"` on the request
element, or `hx-indicator="this"`); a component that replaces a server
fallback fades in through its `:defined` selector
(`hyperion-swatches:defined`, `hyperion-gallery:defined`). A new component
opts in with one rule in your CSS, for example
`hyperion-countdown:defined { animation: hyperion-fade-in var(--hyperion-motion-fast) both; }`
inside the same `@media (prefers-reduced-motion: no-preference)` block the
parent uses.

## Markup contracts the parent JavaScript relies on

The parent's components and HTMX wiring find their markup by `data-hyperion-*`
attributes. An override that keeps them keeps the behavior (and the zero
layout shift); an override that drops them loses it silently. The attributes
below are the ones a template override is most likely to touch.

**Skeletons (no layout shift).** `<hyperion-swatches>` and `<hyperion-gallery>`
render after their chunk arrives, so the server renders a placeholder with
the exact geometry of the component: the swatch rows come from
`Magento_Catalog::product/swatches/skeleton.phtml` (rows from
`SwatchConfig::getSkeletonRows()`, the option texts in transparent ink so the
pills wrap like the real ones; the tile and the product page variants differ
in height), and `product/view.phtml` renders a strip of 5rem thumbnail boxes
under the first image. Both carry `data-hyperion-swatch-skeleton` /
`data-hyperion-gallery-skeleton`, which the parent hides once the host is
`:defined`. An override of a tile, of `product/view.phtml` or of the swatch
markup must keep the skeleton (or render the component's final size some
other way); `node e2e/pw-cls.mjs <baseUrl>` from `frontend/` measures the
result.

**Add to Cart.** Every Add to Cart form carries `hx-sync="this:drop"` (a
second submit while the first is in flight is dropped), no `hx-disabled-elt`
and no `hx-indicator`. Its submit button is `data-hyperion-atc` and holds two
sibling spans as direct children, after the optional icon:
`<span data-hyperion-atc-label>` with the label and
`<span data-hyperion-atc-busy aria-hidden="true">` with the busy text
("Adding to cart..."). The parent's `_components.css` lays the button out as
a grid in which the busy text overlays the row of the icon and the label, so
the button has the size of the larger state from the first paint, and swaps
them while the form has htmx's `htmx-request` class. An override of a tile, of the product page or of
`product/view/addtocart.phtml` copies that markup; without the spans the
form still works and only the busy text is missing. The wish list and
compare forms carry `hx-sync="this:drop"` too. The former
`#hyperion-add-to-cart-indicator` element no longer exists.

**Listings and Load more.** `product/list.phtml` wraps its shell in
`if (!$append)` and marks the tiles list `data-hyperion-tiles`: an append
request (`append=1` on the fragment URL) answers with the tiles `<li>` only
plus the `load_more` child block (`product/list/load-more.phtml`) swapped
out of band. The link in that block carries
`hx-trigger="intersect once, click"` in scroll mode and a status line the
parent's `listing-load-more.js` moves the keyboard focus to after the swap.
An override of `list.phtml` must keep the `$append` branches, the
`data-hyperion-tiles` attribute and the `load_more` child; the toolbar and
pager share `HyperionCatalog\ViewModel\Listing`, which decides the mode and
builds every fragment URL (`getStateFragmentUrl()` for sort, direction, mode,
page size and the pager, `getAppendFragmentUrl()` for Load more): both carry
the active layered navigation filters, so never concatenate a query string
in a template. The grid root and the layered navigation carry
`hx-sync="#<grid id>:replace"`, which makes the listing controls one request
queue (a newer request aborts the one in flight); a form of your own inside
the grid needs its own `hx-sync`, or it joins that queue. Back and Forward
reload the public URL (htmx keeps no history snapshot), so a component must
not rely on `htmx:historyRestore`.

**Navigation and mega menu.** The top menu (category tree or mega menu
group) is one markup contract: `[data-hyperion-topmenu]` on the root list,
`[data-hyperion-submenu]` on every nested list, a toggle button per item with
children. A mega menu root item adds `data-hyperion-mega-item` and a
`div[data-hyperion-mega-panel]` child next to the link wrapper; the panel is
anchored to the header's full width by the rules in the parent's
`_topmenu.css`, the `::after` of the link wrapper bridges the strip of header
between link and panel, and `lib/mega-hover.js` keeps the panel open with an
`is-open` class for 250 ms after the pointer leaves. A header restyle must
keep those attributes and may restyle `[data-hyperion-mega-panel]` freely;
item-level selectors need `:not([data-hyperion-mega-panel])` because the
panel is a `div` child of the item like the link wrapper. The mobile drawer
renders the same tree as an accordion.

**Search dropdown.** The autocomplete fragment root is
`[data-hyperion-search-suggest]`; its aside holds a
`[data-hyperion-recent-searches]` section with a
`[data-hyperion-recent-searches-list]` list that the parent's
`lib/search-history.js` fills from `localStorage` (key
`hyperion_recent_searches`, per store path) after every swap, with DOM calls
only. The aside hides itself through a `:has()` rule in the parent's
`_components.css` when every section in it is hidden. An override of
`Magentofullstackdev_HyperionSearch::suggest.phtml` keeps those three
attributes to keep the recent searches.

## Overriding templates and layouts

Templates: copy the parent file to the same path in your theme, for example
`app/design/frontend/Vendor/Theme/Magento_Catalog/templates/product/view.phtml`.
The parent lives in `vendor/magentofullstackdev/theme-hyperion/` after a
Composer install. Keep the parent's conventions: escape with the
engine-provided `$escaper`, keep Tailwind class names literal in the file
(the JIT scanner reads `.phtml` files; string-built class names are not
generated), and give inline `<script>` tags an explicit `type`.

Layouts: always `referenceBlock` / `referenceContainer` an existing block.
Re-declaring a core block with `<block name="...">` discards the children
other modules scheduled inside it (this is how reCAPTCHA containers silently
disappear from forms). Example, showing address fields on the registration
form:

```xml
<?xml version="1.0"?>
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <body>
        <referenceBlock name="customer_form_register">
            <arguments>
                <argument name="show_address_fields" xsi:type="boolean">true</argument>
            </arguments>
        </referenceBlock>
    </body>
</page>
```

(`Magento_Customer/layout/customer_form_register.xml` in your theme.)

Body classes: one `<attribute name="class" value="..."/>` per class; Magento
joins a multi-word value into a single hyphenated token.

### Removing a head block

The theme renders `head.additional`, so a head block of any module reaches
the page. Core's own children that only feed RequireJS (the analytics and
Ads tags, the form key provider, the SRI hashes, the translation config)
and core's Open Graph block are removed by name in the parent's
`Magento_Theme/layout/default.xml`. To remove one more, for example a
third-party block that only prints `x-magento-init` (nothing processes it
on this theme), add to your theme's `Magento_Theme/layout/default.xml`:

```xml
<referenceBlock name="the.block.name" remove="true"/>
```

A removal in the `default` handle also removes a block that a page-specific
handle declares.

### Footer links

The footer's Customer service column lists four designed entries (contact,
orders and returns, privacy, terms) and then every link modules add to
core's `footer_links` block, which the theme keeps under `hyperion.footer`:
Advanced Search, Search Terms when `catalog/seo/search_terms` is on, RSS
when `rss/config/active` is on, third-party links. A link to one of the four
designed pages is dropped as a duplicate.

- Remove a link by the name of its block:
  `<referenceBlock name="catalog-search-advanced-link" remove="true"/>`.
- Add one the core way, with a `Magento\Framework\View\Element\Html\Link\Current`
  block inside `<referenceBlock name="footer_links">`.
- An override of `Magento_Theme::html/footer.phtml` calls
  `$block->getServiceLinks()` (rows of `label` and `url`) to keep them.

### Brand name and footer text

The wordmark of the header and of the footer, and the accessible name of
the logo link, print the store's name: Store Information > Store Name, then
the store group name, the website name, the host
(`HyperionNavigation\Model\StoreBrand`). Nothing in the theme prints
"Hyperion". The paragraph under the footer logo is the optional CMS block
`hyperion-footer-about`; create it in the admin, no template override is
needed.

Template-side logic: prefer a view model passed as a layout argument (every
Hyperion `.phtml` also receives `$viewModels`, a registry provided by
`HyperionCore`) over block subclasses.

## Adding a Lit component

Components are light-DOM custom elements so Tailwind utilities reach their
markup. Extend `HyperionLightElement` (a `LitElement` whose
`createRenderRoot()` returns the element itself), prefix the tag with
`hyperion-`, and import the file from your `src/js/entry.js`:

```ts
// src/js/components/hyperion-countdown.ts
// SPDX-License-Identifier: MIT
import { html } from 'lit';
import { HyperionLightElement } from '@magentofullstackdev/hyperion-shared/lit';

export class HyperionCountdown extends HyperionLightElement {
    static properties = { until: { type: String } };
    until = '';

    render() {
        return html`<span class="text-sm text-muted">${this.until}</span>`;
    }
}

customElements.define('hyperion-countdown', HyperionCountdown);
```

```js
// src/js/entry.js
import '../css/entry.css';
import './components/hyperion-countdown.ts';
```

Use the element in a template: `<hyperion-countdown until="2026-12-31"></hyperion-countdown>`.
Server-render the initial markup where you can so the page is complete
before the module loads. HTMX-swapped fragments are upgraded automatically
because custom elements are defined globally.

For confirmations use `hx-confirm` (routed to the parent's
`<hyperion-confirm>` dialog), and for toasts rely on the single
`#hyperion-notification` placeholder the parent renders once per page; never
add a second one.

## The npm packages

All three are published as source (`src/`, `tailwind.config.ts`, README,
LICENSE); a TypeScript-aware bundler such as Vite is required. Versions move
together with the Composer packages (`0.9.0-beta.5`).

| Package | Contents | Exports |
|---|---|---|
| `@magentofullstackdev/hyperion-shared` | design tokens, Tailwind preset, `HyperionLightElement`, HTML sanitizer | `.` (barrel), `./tokens/*` (`colors.css`, `spacing.css`, `typography.css`, `index.css`), `./tailwind/preset`, `./lit`, `./lit/*`, `./html`. Peer dependencies: `lit ^3.1.2`, `tailwindcss ^3.4.0` |
| `@magentofullstackdev/hyperion-theme` | theme entry, `hyperion-*` components, critical CSS sources, the `hyperion` CLI (`bin/hyperion.js`) | `main: ./src/js/entry.js`; bin `hyperion`. Dependencies: `hyperion-shared`, `lit`, `htmx.org`, `photoswipe` |
| `@magentofullstackdev/hyperion-checkout` | the Lit checkout application (`<checkout-app>`), payment renderers, REST client, signal store | `main: ./src/main.ts`. Dependencies: `hyperion-shared`, `lit`, `@lit-labs/signals`, `signal-polyfill` |

The scaffolded child theme depends on all three. Note that the checkout is a
separate bundle served by the `HyperionCheckout` module, not by the theme:
extending it (for example with a payment renderer) means rebuilding that
bundle, see [Checkout](./checkout.md).
