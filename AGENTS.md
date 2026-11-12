# Repository Guidelines

Instructions for AI coding agents working in this repository. Paths below are relative to the repository root.

## Read First

Read [CLAUDE.md](./CLAUDE.md) for architecture rules and conventions; it is tool agnostic despite its name. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/development.md](./docs/development.md) for setup, quality gates and release procedures. Consult [ARCHITECTURE.md](./ARCHITECTURE.md) when a change crosses module boundaries.

## Project Structure

- `app/code/Magentofullstackdev/Hyperion*`: Magento PHP modules, including module templates and tests.
- `app/design/frontend/Magentofullstackdev/hyperion/`: theme templates, layouts and generated assets.
- `frontend/packages/`: `shared`, `theme-default` and `module-checkout`; `frontend/e2e/` contains browser checks.
- `docs/`: public documentation; `.github/`: workflows and contribution templates.

Edit repository sources, not installed copies under a Magento application's `vendor/`. A running Magento or Mage-OS installation is separate from this checkout; follow [docs/install.md](./docs/install.md).

## Development Commands

Use Node.js 22+ and the pnpm version pinned in `frontend/package.json`. Run from `frontend/`, the only pnpm workspace:

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r lint
pnpm lint:e2e
pnpm -r test
pnpm -r build
```

These install dependencies, check types/style, run Vitest and rebuild Magento assets. Use pnpm rather than `npm install` here because dependencies use `workspace:^`.

## Implementation Rules

- Match surrounding code, generally four-space indentation. Follow Magento2 PHP standards and the shared ESLint configuration. New TS/JS sources use the existing MIT SPDX and copyright header.
- Storefront interactions use Lit, HTMX or vanilla JavaScript; no RequireJS, jQuery or Knockout. Escape template output with `$escaper`. Preserve CSRF checks, cache context isolation and the separation of public content from session data.
- After frontend source, template, layout or generated class-name changes, rebuild and include generated assets, manifests and license files in the change. Never hand-edit build output; CI checks reproducibility.
- Comments explain code, not task history. Use plain hyphens, not em or en dashes.

## Validation and Pull Requests

Place frontend tests in adjacent `__tests__/` directories (`*.test.ts` or `*.test.js`); PHP tests belong in each module's `Test/` directory. For PHP changes, run PHPStan level 5, PHPCS Magento2 with no errors, and relevant PHPUnit tests from a Magento installation loading the changed sources. Use PHPUnit `--no-extensions`; data providers use the `#[DataProvider]` attribute only (PHPUnit 10 and 12) and are `public static`. Run `.github/scripts/check-plugin-targets.php` after adding or renaming a plugin method. See the development guide for full commands.

Run relevant browser checks on a disposable test store; the suite can place orders and change customer data. A script that changes configuration restores it through `frontend/e2e/lib/config-snapshot.mjs`. Verify session-dependent changes as both guest and customer. Report unavailable checks explicitly. Documentation-only changes need link and content checks, not an application rebuild.

Keep PRs focused, use descriptive conventional commit prefixes (`fix:`, `feat:`, `docs:`), and report validation and tested platform versions. Include screenshots for visual changes. Update `docs/` and `CHANGELOG.md` under `Unreleased` when behavior, configuration or limitations change. Follow the PR template, including AI assistance disclosure where applicable.
