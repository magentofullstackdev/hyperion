## What changes

<!-- One topic per pull request. Describe the user-visible behaviour that changes, not the diff. -->

## Checklist

- [ ] One topic, described above in terms of what a merchant or shopper sees.
- [ ] No RequireJS, jQuery or Knockout; storefront behaviour is a `hyperion-*` Lit component, HTMX or a few lines of vanilla JavaScript.
- [ ] Templates escape with the engine-provided `$escaper`, every `catch` block logs, theme layout files `referenceBlock` core blocks instead of re-declaring them.
- [ ] New source files start with the `SPDX-License-Identifier: MIT` header.
- [ ] Frontend change: `pnpm -r build` was run from `frontend/` and the committed assets (`web/assets`, the manifests) are part of this pull request.
- [ ] `pnpm -r test`, `pnpm -r typecheck` and `pnpm -r lint` pass; phpstan level 5 and phpcs (Magento2 standard) report no errors for PHP changes.
- [ ] Session-bound flows (cart, mini-cart, wishlist, compare, checkout, account) were checked as a guest AND as a logged-in customer.
- [ ] Documentation under `docs/` and `CHANGELOG.md` updated when behaviour or configuration paths change.
- [ ] If an AI assistant wrote part of this change, say so below and list the checks you ran yourself; the guidance in `CLAUDE.md` / `AGENTS.md` was followed.

## How it was tested

<!-- Magento or Mage-OS version, PHP version, Varnish in front or not, which end-to-end scripts ran. -->
