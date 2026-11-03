# Hyperion Centralized Frontend Workspace

Single pnpm workspace holding every TypeScript/Lit/Tailwind/Vite source tree for the Hyperion Magento 2 suite. Builds in this workspace write hashed asset bundles directly into the matching Composer packages inside this repo (`../app/design/...` and `../app/code/...`). Those compiled assets are committed, so Composer consumers never need Node.

## Packages

| Package | Role | Build output target (relative to the package) |
|---|---|---|
| `@magentofullstackdev/hyperion-shared` | Design tokens, Tailwind preset, base Lit element + mixins | none (source-only, consumed as TypeScript by the sibling packages) |
| `@magentofullstackdev/hyperion-theme` | Theme JS/CSS, HTMX wiring, `hyperion-*` Lit components | `../../../app/design/frontend/Magentofullstackdev/hyperion/web/` |
| `@magentofullstackdev/hyperion-checkout` | Lit + Tailwind one-step checkout app | `../../../app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/` |

## Common commands

Dependencies are installed with pnpm from the workspace root that contains `pnpm-workspace.yaml` (the packages use the `workspace:^` protocol, which npm cannot install).

```bash
pnpm install                                                # one install for the whole suite
pnpm -r build                                               # builds shared, then theme, then checkout
pnpm --filter @magentofullstackdev/hyperion-theme build     # theme only
pnpm --filter @magentofullstackdev/hyperion-checkout build  # checkout only
pnpm --filter @magentofullstackdev/hyperion-theme dev       # Vite HMR for theme (:5173)
pnpm --filter @magentofullstackdev/hyperion-checkout dev    # Vite HMR for checkout (:5175)
pnpm -r test                                                # all packages' Vitest suites
pnpm -r typecheck                                           # tsc --noEmit across all packages
```

The `npm run build`, `build:theme`, `test`, ... scripts in this directory's `package.json` are thin wrappers over the same per-package scripts and keep working once the pnpm install is in place.

## After a build

The hashed assets and the Vite manifest land inside the matching Magento Composer package. In a Magento install, flush the cache and redeploy static content so `pub/static/...` mirrors the new files:

```bash
bin/magento cache:flush
bin/magento setup:static-content:deploy -f en_US
```

## What ships to npm

The npm packages publish **source only**: `src/`, `tailwind.config.ts`, `README.md`, `LICENSE`. `vite.config.ts`, `postcss.config.js`, `vitest.config.ts`, the `scripts/` helpers and the dev harness `index.html` are internal build tooling for this repo and are deliberately kept out of the tarballs (see each package's `files` whitelist). Developers consuming the packages build their own child theme with their own Vite/PostCSS setup; the Composer packages already carry the compiled assets for everyone else.
