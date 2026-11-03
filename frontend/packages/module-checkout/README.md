# @magentofullstackdev/hyperion-checkout

Hyperion one-step Magento 2 checkout: Lit + Tailwind, signal-based store,
REST-driven. It replaces the Luma Knockout / jQuery checkout on a storefront
that runs the Hyperion theme and the `Magentofullstackdev_HyperionCheckout`
module.

Ships the **source** of the checkout app so you can extend or rebrand it.
Vite writes hashed bundles into the matching Magento module under
`app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/` (inside the Hyperion repository; the compiled assets are committed).

## What this package is

- A **source-first beta** (`0.9.0-beta.x`): the TypeScript / Lit / Signals
  sources of the checkout application, for reading, IDE types and forking.
  No compiled bundle, no Magento installer.
- `npm install` does **not** install or activate the Magento module or the
  theme. A working checkout needs the Composer packages
  (`magentofullstackdev/theme-hyperion` through the Hyperion Satis
  repository, which requires `module-hyperion-checkout`) and the
  corresponding Magento configuration (`hyperion_checkout/general/enabled`):
  see
  [`docs/install.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/install.md).
- Payment renderers and other checkout extensions are integrated through a
  fork and build of the repository (next section), not through
  `npm install` in a child theme: the bundle is built once, from the
  repository.
- Known gaps (payment methods, flows) are listed in
  [`docs/known-limitations.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/known-limitations.md).
- The tests and the test scaffolding (Vitest unit tests, fixtures, the
  Playwright e2e scripts) live in the repository; the tarball excludes them.

## Install

```bash
npm install @magentofullstackdev/hyperion-checkout
```

The checkout depends on `@magentofullstackdev/hyperion-shared` for the
Tailwind preset and design tokens.

## Build

The npm package ships the TypeScript / Lit / Signals **source** of the
checkout application: read it, get IDE types for the store, the REST client
and the payment renderer interface, or fork it. It is not a build setup: the
Vite config and `scripts/sync-i18n.mjs` live in the Hyperion repository, so
`npx vite build` inside `node_modules` has nothing to build, and a child
theme file cannot add a renderer to the bundle.

The Magento module's assets are rebuilt from a clone or fork of the
repository with `pnpm --filter @magentofullstackdev/hyperion-checkout build`
in `frontend/` (Node 22, pnpm 10). The build first runs
`scripts/sync-i18n.mjs`, which needs the monorepo: it writes the strings of
`src/i18n/en_US.json` and `src/i18n/it_IT.json` into the module's
`i18n/en_US.csv` and `i18n/it_IT.csv` (the other eleven locale CSVs of the
module are hand translated). The bundles land in
`app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/` and are
committed. `docs/checkout.md` in the main repo explains how to add a renderer.

The bundled `<checkout-app>` Lit element parses `#checkout-config` (rendered
server-side by the Magento `Magentofullstackdev_HyperionCheckout` module), boots the signal
store, configures the REST client, and mounts the UI.

## What you get

- One-step checkout flow (address, shipping, payment, review)
- Payment renderers: offline methods, PayPal Express Checkout (in-context smart button and redirect flow), Braintree cards (Hosted Fields, 3D Secure, device data), Braintree PayPal (untested) and stored payment tokens (Magento Vault). Gateway renderers are loaded on demand and the gateway SDK only after the shopper picks one of its methods. How to add a renderer: `docs/checkout.md` in the main repo
- Signals-based store (`@lit-labs/signals` + `signal-polyfill`)
- REST API client typed against Magento's checkout endpoints
- i18n catalogs (`src/i18n/en_US.json`, `it_IT.json`) that the build writes into the Magento module's `i18n/en_US.csv` and `it_IT.csv`
- Vitest + Playwright test scaffolding in the repository (not in the tarball)

## Links

- Website: <https://hyperionfront.dev>
- Live demo: <https://demo.hyperionfront.dev>
- Repository: <https://github.com/magentofullstackdev/hyperion>
- Changelog: [`CHANGELOG.md`](https://github.com/magentofullstackdev/hyperion/blob/main/CHANGELOG.md) in the main repo
- Issues: <https://github.com/magentofullstackdev/hyperion/issues>
- Documentation: `docs/checkout.md` and `docs/child-themes.md` in the main repo

## License

MIT, see [LICENSE](./LICENSE).
