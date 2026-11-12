# Contributing to Hyperion

Thank you for taking the time. Hyperion is a solo-maintained project in beta,
so small, focused pull requests are the ones that get merged fastest.

## Ground rules

- One topic per pull request, with a short description of the user-visible
  behavior it changes.
- No RequireJS, jQuery or Knockout. Storefront behavior is Lit light-DOM
  components (`hyperion-*`), HTMX or a few lines of vanilla JavaScript.
- Templates escape with the engine-provided `$escaper`; every `catch` block
  logs; theme layout files reference core blocks instead of re-declaring them.
- Every TS/JS source file starts with the `SPDX-License-Identifier: MIT`
  header used by the existing files.
- Committed build assets (`web/assets`, the manifests) are part of the change:
  rebuild before you commit, CI fails when they are stale.
- US English in every text: comments, docblocks, docs, the changelog, commit
  messages, UI strings (`behavior`, `color`, `initialize`, `normalize`,
  `center`, `license`). Older files may still carry British spellings: fix
  the ones in a file you touch as part of your change, and do not open a
  spelling-only pull request.

## Development setup

Requirements: Node 22, pnpm 10, and an install of one of the supported
platforms: see the support policy and the matrix in
[docs/compatibility.md](./docs/compatibility.md) (develop against a Tier 1
platform when you can).

```
cd frontend
pnpm install --frozen-lockfile
pnpm -r build        # writes the assets into app/design/... and app/code/...
pnpm -r test
pnpm -r typecheck
pnpm -r lint
```

The end-to-end suite (`frontend/e2e/`, Playwright) runs against an
installed store: `pnpm exec playwright install chromium`, then
`pnpm e2e https://your-store.example`; see
[docs/development.md](./docs/development.md#end-to-end-suite). Run it
before a pull request that touches templates, layout or components.

Install the theme into your Magento through a Composer path repository
(`"symlink": true` for live edits), then follow the install steps in the
README.

PHP checks (run from the Magento root, the tools come with Magento's
`require-dev`):

```
vendor/bin/phpcs --standard=Magento2 --extensions=php,phtml path/to/hyperion/app
vendor/bin/phpstan analyse --level=5 path/to/hyperion/app/code/Magentofullstackdev
for t in path/to/hyperion/app/code/Magentofullstackdev/*/Test; do vendor/bin/phpunit --no-extensions -c dev/tests/unit/phpunit.xml.dist "$t"; done
php path/to/hyperion/.github/scripts/check-plugin-targets.php . path/to/hyperion
```

Unit tests run on PHPUnit 10 and 12: data providers carry the
`#[DataProvider]` attribute only. The last command checks that every plugin
method targets an existing public method; details in
[docs/development.md](./docs/development.md#php-quality-gate).

Please read the [Code of Conduct](./CODE_OF_CONDUCT.md); it applies to
issues, pull requests and discussions.

## Reporting bugs

Use the issue templates. Always include the Magento or Mage-OS version, the
PHP version, whether Varnish is in front, and the steps to reproduce on a
store with the Luma sample data.
