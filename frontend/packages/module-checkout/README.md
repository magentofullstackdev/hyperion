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
- Payment renderers, express buttons, shipping extensions and checkout
  fields of other Magento modules need no rebuild of the bundle: a module
  registers a DI pool entry and ships a custom element in its own static
  files, written against the types of `./extension-api` (API version
  `1.0-beta`, may change before 1.0). See
  [`docs/extensions.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/extensions.md).
  A change to the checkout itself is built from a fork of the repository
  (next section).
- Known gaps (payment methods, flows) are listed in
  [`docs/known-limitations.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/known-limitations.md).
- The checkout's own tests and the Playwright e2e scripts live in the
  repository; the tarball excludes them. It ships the extension types
  (`./extension-api`), a testing kit for extension elements (`./testing`,
  mock contexts, mount helpers, contract suites, a harness page) and the
  sample checkout configurations (`./fixtures/*.json`). The harness runs
  from your own project with `vite` installed:
  `npx vite --config node_modules/@magentofullstackdev/hyperion-checkout/testing/vite.config.js`
  ([`docs/extensions.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/extensions.md#testing-and-the-sample-modules)).
- The package is ESM only, and so are its types. A CommonJS TypeScript
  project (`module` / `moduleResolution` `node16`) imports them with the
  resolution mode attribute:
  `import type { PaymentElement } from '@magentofullstackdev/hyperion-checkout/extension-api' with { 'resolution-mode': 'import' };`

## Install

```bash
npm install @magentofullstackdev/hyperion-checkout
```

The checkout depends on `@magentofullstackdev/hyperion-shared` for the
Tailwind preset and design tokens.

## Build

The npm package ships the TypeScript / Lit / Signals **source** of the
checkout application: read it, get IDE types for the store, the REST client
and the extension contract, or fork it. It is not a build setup: the
Vite config and `scripts/sync-i18n.mjs` live in the Hyperion repository, so
`npx vite build` inside `node_modules` has nothing to build. An extension of
another module does not need a build of this package at all
([`docs/extensions.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/extensions.md)).

The Magento module's assets are rebuilt from a clone or fork of the
repository with `pnpm --filter @magentofullstackdev/hyperion-checkout build`
in `frontend/` (Node 22, pnpm 10). The build first runs
`scripts/sync-i18n.mjs`, which needs the monorepo: it writes the strings of
`src/i18n/en_US.json` and `src/i18n/it_IT.json` into the module's
`i18n/en_US.csv` and `i18n/it_IT.csv` (the other eleven locale CSVs of the
module are hand translated). The bundles land in
`app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/` and are
committed.

The bundled `<checkout-app>` Lit element parses `#checkout-config` (rendered
server-side by the Magento `Magentofullstackdev_HyperionCheckout` module), boots the signal
store, configures the REST client, and mounts the UI.

## What you get

- One-step checkout flow (address, shipping, payment, review)
- Payment renderers: offline methods, PayPal Express Checkout (in-context smart button and redirect flow), Braintree cards (Hosted Fields, 3D Secure, device data), Braintree PayPal (verified against the Braintree sandbox, see `docs/checkout.md`), Braintree Google Pay and stored payment tokens (Magento Vault). Gateway renderers are loaded on demand and the gateway SDK only after the shopper picks one of its methods. An active payment method without a renderer is not shown to shoppers. How to add a renderer from another module: [`docs/extensions.md`](https://github.com/magentofullstackdev/hyperion/blob/main/docs/extensions.md)
- Signals-based store (`@lit-labs/signals` + `signal-polyfill`)
- REST API client typed against Magento's checkout endpoints
- i18n catalogs (`src/i18n/en_US.json`, `it_IT.json`) that the build writes into the Magento module's `i18n/en_US.csv` and `it_IT.csv`
- The extension types (`./extension-api`) and the testing kit (`./testing`) for elements of other modules; the checkout's own Vitest and Playwright tests stay in the repository

## Links

- Website: <https://hyperionfront.dev>
- Live demo: <https://demo.hyperionfront.dev>
- Repository: <https://github.com/magentofullstackdev/hyperion>
- Changelog: [`CHANGELOG.md`](https://github.com/magentofullstackdev/hyperion/blob/main/CHANGELOG.md) in the main repo
- Issues: <https://github.com/magentofullstackdev/hyperion/issues>
- Documentation: `docs/checkout.md` and `docs/child-themes.md` in the main repo

## License

MIT, see [LICENSE](./LICENSE).
