# @magentofullstackdev/hyperion-theme

Hyperion default Magento 2 theme: TypeScript / Lit / Tailwind source. A
standalone storefront theme (no Luma parent) built on HTMX, Lit Web
Components and Tailwind CSS instead of RequireJS, Knockout.js and jQuery.

This package ships the **source** of the theme so you can fork or extend it
inside your own Magento storefront. Vite produces hashed asset bundles that
are written into the matching Magento Composer package under
`app/design/frontend/Magentofullstackdev/hyperion/web/` (inside the Hyperion repository; the compiled assets are committed).

## What this package is

- A **source-first beta** (`0.9.0-beta.x`): the TypeScript, Lit and CSS
  sources of the theme plus the `hyperion` child theme CLI. No compiled
  JavaScript, no Magento installer.
- `npm install` does **not** install or activate the Magento theme or any
  Hyperion module. A working storefront needs the Composer packages
  (`magentofullstackdev/theme-hyperion` through the Hyperion Satis
  repository, which pulls in the modules) and the corresponding Magento
  configuration: see
  [`docs/install.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/install.md).
- The theme covers the default flows of a Magento Open Source store; what it
  does not cover yet is listed in
  [`docs/known-limitations.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/known-limitations.md).
  Read it before planning a migration.
- Checkout extensions and payment renderers are integrated through a fork
  and build of the repository, not through `npm install` in a child theme
  (see `@magentofullstackdev/hyperion-checkout`).

## Install

```bash
npm install @magentofullstackdev/hyperion-theme
```

## Build

The npm package ships the theme **source** (`src/`, `tailwind.config.ts`,
the `hyperion` CLI) and depends on `@magentofullstackdev/hyperion-shared` for
the design tokens and the Tailwind preset. It is not a build setup: the Vite
and PostCSS configs that produce the parent theme's bundles live in the
Hyperion repository and are not part of the tarball, so `npx vite build`
inside `node_modules` has nothing to build.

- To customize a store, create a child theme (next section): the scaffold is
  a standalone Vite + Tailwind project with its own `npm run build`.
- To rebuild the parent theme's bundles (a fork, a fix in a component), clone
  the repository and run `pnpm --filter @magentofullstackdev/hyperion-theme build`
  from `frontend/` (Node 22, pnpm 10). The build writes the hashed assets and
  `manifest.json` into `app/design/frontend/Magentofullstackdev/hyperion/web/`;
  `docs/development.md` in the main repo describes the workspace.

## Scaffold a child theme

The package ships a small CLI. From your Magento root:

```bash
npx -p @magentofullstackdev/hyperion-theme hyperion create Vendor/Theme
```

Keep the `-p @magentofullstackdev/hyperion-theme` part: a bare `npx hyperion`
resolves to this CLI only inside a project where
`@magentofullstackdev/hyperion-theme` is already installed locally; anywhere
else `npx` downloads and runs an unrelated third-party `hyperion` package from
the npm registry.

It writes `app/design/frontend/Vendor/Theme/` with `registration.php`,
`theme.xml` (parent `Magentofullstackdev/hyperion`), a `package.json`,
Vite / Tailwind / PostCSS configs, starter `src/` files and a layout block
that loads the built `web/assets/entry.{css,js}`. Then:

```bash
cd app/design/frontend/Vendor/Theme && npm install && npm run build
```

## What you get

- Lit Web Components for stateful UI (`<hyperion-slider>`, `<hyperion-mini-cart>`, ...)
- HTMX wiring for server-driven interactions
- Tailwind 3.x with the suite-wide semantic preset
- A handcrafted critical-CSS entry inlined by Magento's `head/scripts.phtml`
- ES-module output for native `<script type="module">` loading
- HTMX shipped as a standalone, cache-busted, non-module asset

## Links

- Website: <https://hyperionfront.dev>
- Live demo: <https://demo.hyperionfront.dev>
- Repository: <https://github.com/magentofullstackdev/hyperion>
- Changelog: [`CHANGELOG.md`](https://github.com/magentofullstackdev/hyperion/blob/main/CHANGELOG.md) in the main repo
- Issues: <https://github.com/magentofullstackdev/hyperion/issues>
- Documentation: `docs/child-themes.md` and `docs/development.md` in the main repo

## License

MIT, see [LICENSE](./LICENSE).
