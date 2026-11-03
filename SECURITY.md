# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 0.9.x (beta) | yes |

## Reporting a vulnerability

Please do not open a public issue for security problems. Send a report to
the maintainer through GitHub's private vulnerability reporting on this
repository (Security tab, "Report a vulnerability"). You will get an
acknowledgement within a few days; fixes for confirmed issues are released
as patch versions and credited in the changelog unless you prefer otherwise.

## Scope

Everything under `app/` and `frontend/` of this repository. Magento itself,
Mage-OS and third-party extensions are out of scope; report those upstream.

## Notes for reviewers

- Hyperion controllers implement `ActionInterface` directly. Magento's
  `FrontController` runs its request validators (form key / CSRF on
  frontend POST requests, the secret key in the admin) for every action
  before `execute()`, not only for `AbstractAction` subclasses, so the POST
  endpoints of the modules are covered without a per-controller check.
- The npm workspace under `frontend/` is a build and test toolchain; nothing
  of it ships to a store except the compiled assets. `pnpm audit --prod`
  must be clean on every release; advisories in test-only packages are
  evaluated per release and recorded in the changelog.
