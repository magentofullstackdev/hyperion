# Copilot instructions

This repository is Hyperion, a Magento 2 storefront theme and module suite built with Tailwind CSS, Lit Web Components and HTMX. Read `CLAUDE.md` at the repository root for the full guidance; the rules below are the ones that matter most in a diff.

- Build outputs are committed: after any change under `frontend/`, run `pnpm -r build` from `frontend/` and include the rebuilt `web/assets` and manifests. Never add them to `.gitignore`, never hand edit them.
- Storefront behaviour is a `hyperion-*` Lit component (extend `HyperionLightElement` from `@magentofullstackdev/hyperion-shared`), HTMX, or a few lines of vanilla JavaScript. No RequireJS, jQuery or Knockout. HTMX runs with `allowEval` and `allowScriptTags` off: no `hx-on`, no `js:` values, no scripts in swapped fragments.
- Listing and fragment requests never carry `hx-push-url="true"`; the fragment controllers push the public URL through `HX-Push-Url`.
- The header makes ONE session request (`hyperion/header/state`); never add another `hx-trigger="load"` request to it. Pages that render session data need a `cacheable="false"` block.
- Templates escape with the engine provided `$escaper`, never `$block->escape*()`; inline `<script>` tags carry a `type`; theme layout files `referenceBlock` core blocks and never re-declare them.
- Keep Tailwind class names literal (no string built classes). Optional Magento modules are reached through `Module\Manager` and string class names only.
- A new user facing phrase goes into `i18n/en_US.csv` AND every locale CSV of the module or theme, same row position; checkout phrases also into `src/i18n/en_US.json` and `it_IT.json`.
- Every TS/JS file starts with `// SPDX-License-Identifier: MIT` and the copyright line of its siblings. Unit tests must run on PHPUnit 9, 10 and 12 (annotation plus attribute on data providers, `public static` providers).
- Comments explain the code, not the task. No em dash or en dash in code, comments, docs or commit messages. Conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`).
- Before proposing a change as done: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` green; phpstan level 5 and phpcs clean on PHP changes; `docs/` and the `Unreleased` section of `CHANGELOG.md` updated when behaviour changes.
