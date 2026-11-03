# Third-party notices

The committed build assets under `app/design/frontend/Magentofullstackdev/hyperion/web/`
and `app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/` bundle the
libraries below. Their full licence texts ship inside the two Composer packages
that carry a bundle, in a file the frontend build writes next to the assets
(`rollup-plugin-license` through `frontend/build/third-party-licenses.ts`), so a
Composer consumer never needs the npm packages:

- `app/design/frontend/Magentofullstackdev/hyperion/web/THIRD_PARTY_LICENSES.txt`
  (theme bundle: lit, lit-html, lit-element, @lit/reactive-element, htmx.org, photoswipe)
- `app/code/Magentofullstackdev/HyperionCheckout/view/frontend/web/THIRD_PARTY_LICENSES.txt`
  (checkout bundle: lit, lit-html, lit-element, @lit/reactive-element, @lit-labs/signals, signal-polyfill)

| Library | Licence | Use |
|---|---|---|
| lit, lit-html, lit-element, @lit/reactive-element | BSD-3-Clause | Web components |
| htmx.org | 0BSD | HTML over the wire |
| photoswipe | MIT | Product gallery lightbox |
| @lit-labs/signals | BSD-3-Clause | Checkout state |
| signal-polyfill | Apache-2.0 | Checkout state |

Build-time tools (never part of a shipped asset; their licences are in the npm
packages of the `frontend/` workspace):

| Tool | Licence | Use |
|---|---|---|
| tailwindcss, @tailwindcss/typography, postcss, autoprefixer | MIT | CSS |
| vite, rollup-plugin-license | MIT | Build |
| vitest, happy-dom, jsdom, @playwright/test, axe-core | MIT / MIT / MIT / Apache-2.0 / MPL-2.0 | Tests and checks |

Sample data patches reference product images of the Magento Luma sample data,
which stay under their own licence and are not distributed here.
