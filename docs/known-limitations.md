# Known limitations

State of 0.9.0-beta.5: 187 native storefront features of Magento Open
Source were checked one by one against the theme, and the list below is
what is left.
Every default-configuration flow exercised by the end-to-end suite works
(guest and customer journeys, every product type, orders, account pages),
with the explicit exceptions documented below: multishipping is enabled by
core but only reachable by URL and renders core markup. What follows is
the long tail. Items are grouped by how they affect a store.

Payment sign-off perimeter: only the methods marked "verified" in the
"Payment methods" table of `docs/checkout.md` were verified live (offline methods, PayPal Express
sandbox, Braintree card with vault and 3D Secure against a Braintree
sandbox; the two gateway verifications were made on platforms that are now
in the "Previously tested" table of `docs/compatibility.md`). There is no
general sign-off on 3D Secure for other gateways, wallets, Payment Services
or the remaining PayPal variants; a gateway not named there has not been
tested with this checkout.

## Not supported in this release

- **HTML minification (`dev/template/minify_html`).** Keep it off. Magento's
  template minifier joins a template into one line, which breaks PHP heredoc
  and nowdoc blocks, and seven Hyperion templates use them (the head scripts
  of every page among them): with the option on, every page answers an
  error. JS and CSS minification (`dev/js/minify_files`,
  `dev/css/minify_files`) are supported, see
  [Install](./install.md#production-checklist).

## Not available (planned, architecture exists)

- **Multishipping checkout.** Core enables it by default
  (`multishipping/options/checkout_multiple`), but the entry link lives in a
  cart container the theme removes, so no shopper reaches it; the nine
  `/multishipping/checkout/*` pages render core markup with dead scripts if
  opened directly. A server-rendered HTMX rebuild is planned.
- **In-store pickup (MSI).** The native step is Knockout. With the
  `instore` carrier active the checkout hides the pickup rate, because it
  has no pickup location step; in-store pickup is planned as an optional
  module.

## Should-have features missing for 1.0

1. Image CAPTCHA for the checkout's inline login (core enables it after
   failed logins); the storefront login page has it.
2. Persistent cart ("Remember Me"): renders core markup, never tested.
3. Braintree: PayPal, express buttons on product / cart / mini-cart
   (including the Google Pay ones), Apple Pay, saved payment methods page.
4. Payment Services (Adobe): no renderer, no express buttons, no Pay Later
   message, stored cards list / delete only.
5. Remaining PayPal methods: Hosted Pro, Payflow Pro / Link / Advanced,
   billing agreement method; the billing agreements account page is core
   markup and its create form is rejected.
6. Google Analytics: only GA4 / Google Ads through `google/gtag/*` are
   emitted; the legacy Universal Analytics module (`Magento_GoogleAnalytics`)
   and Google Tag Manager containers are not.

## Nice-to-have gaps

Reorder sidebar ("Recently Ordered"), recently viewed products in the
account dashboard (the widgets and sidebars are client-side, see
[Configuration](./configuration.md)), category and order RSS links, fixed product tax
(FPT / Weee) on the product page and listings (the mini-cart, cart and
checkout show it), custom address attributes beyond the VAT number (the address form
renders a `customer_form_address_user_attributes` child when a module
schedules one), instant purchase, `payflow_express` live verification, PayPal review page without a
coupon form, search term popularity and result
counts written only when the results page is rendered by PHP and not on a
page cache hit (the search terms log block is removed; the autocomplete's
popular terms follow those counters).

- **Fixed Product Tax in cart line prices.** The line price includes the
  FPT when `tax/weee/display_sales` says so, like core, but core's per-child
  sum for dynamic bundles and its row rounding reconciliation are not
  reproduced.
- **Bundle options with both tax displays.** Option labels and the running
  total follow `tax/display/type` including or excluding tax; the "both"
  display shows one amount per option.
- **Left to right only.** The stylesheets use physical direction utilities; a
  right to left store view needs a child theme pass.
- **Home page styling** of the sample data blocks (`.home-main`,
  `.block-promo`, `.categories-menu`) is carried by the theme for the Luma
  sample content; a store with its own home page content styles it in a
  child theme.

## Pages that render core markup without styling

Reachable only with the named feature in use. "Works" means the page
functions without JavaScript.

| Page | Reached from | Works |
|---|---|---|
| `/paypal/billing_agreement/` and `/view/` | account navigation | list only |
| `/rss/feed/index/` | only with RSS enabled | yes |
| `/multishipping/checkout/*` (9 pages) | direct URL only | no |
| "Remember Me" row on login and register | only with persistence enabled | yes |
| Hosted Pro / Payflow iframe pages | unreachable (methods not offered) | n/a |
| Braintree "add a card / PayPal / Google Pay" forms on Stored Payment Methods | Braintree installed | removed (Knockout); the stored tokens still list |

Pages checked and found fully styled: home, category, product, quick and
advanced search, login, register, forgot password, contact, guest order
form and the guest order, invoice, shipment and refund tabs, cart, checkout,
reviews list, single review, stored payment methods,
print order / invoice / shipment / credit memo (customer and guest),
tracking popup, Orders and Returns and Recently Viewed / Compared widgets,
popular search terms, Email a Friend, the cart configure page, 404,
enable-cookies, account pages.

## Third-party extensions

Extensions that ship a Knockout, RequireJS or jQuery storefront (payment
gateways, search overlays, sliders, pop-ups, GDPR tools) do not run on
Hyperion: there is no RequireJS and no `x-magento-init` / `data-mage-init`
processing. Each such extension needs a Hyperion adapter (a template
override plus a Lit component or HTMX wiring). Server-side extensions
(pricing, shipping, tax, ERP connectors, admin modules) are unaffected.
Payment methods without a renderer are listed in the checkout as "not
supported by this checkout yet" and cannot be selected.

Head output of other modules does render: the theme keeps `head.additional`
and removes by name only the core children that feed RequireJS. A
third-party head block therefore reaches the page as its module wrote it; a
block that only prints `x-magento-init` is inert here (nothing processes it)
and is best removed by name in a child theme
([Child themes](./child-themes.md#removing-a-head-block)).

Mage-OS 4.0 ships modules with a storefront of their own that Hyperion has
no templates for yet: passkey sign-in (`MageOS_PasskeyAuth`), returns
(`MageOS_RMA`), the FAQ module (`MageOS_Faq`) and the product page blocks of
the shopping feed and stock visualizer modules. Their pages render core markup without
styling, and parts that need RequireJS do not run. `MageOS_Seo` is
supported: it owns Open Graph and the JSON-LD structured data, and by its
own default setting it removes the theme's microdata from product pages
([Compatibility](./compatibility.md#mage-os-40-seo-module)).

## Checkout and cart behavior to know

- **Lost answers.** The order request has a 60 second limit, and when its
  answer is lost (timeout, connection dropped) the checkout reads the cart
  to tell "placed", "not placed" and "unknown" apart. That recovery covers
  the order request only: every other call of the checkout (rates, shipping
  save, totals, coupon, gift message) has no timeout of its own and no
  offline handling yet, and a failed estimate or shipping save is not
  retried in the background: a press of Place Order, an address edit or
  another shipping method sends it again. A shopper who placed the order in
  one tab while a second tab lost its answer is not recognized as such. A
  broader recovery is planned for the next release.
- **The first available shipping rate is preselected** when the quote has no
  method yet; a carrier's error rate is listed as a notice and never
  selected.
- **The purchase order number is required** when the Purchase Order method
  is selected.
- **The cart estimator lists unavailable carriers as notices** (carrier
  title and the carrier's message), without a radio button.
- **Back and Forward reload.** htmx keeps no history snapshot, so Back
  across a listing change (filter, sort, page) or an account page is a full
  document request for the public URL, served from the edge cache when the
  page is cacheable.
- **Search engine outage.** While the engine is down the listing fragments
  and the search autocomplete answer a private "try again" response that
  nothing stores. The full category or search page still answers the
  platform's uncached error page while the engine is fully down.
- **Page past the end with remembered pagination.** With
  `catalog/frontend/remember_pagination` on, the clamp of the page number
  uses the largest "per page" value of both listing modes, so the last
  reachable page of a very large listing can be slightly lower than the
  engine would allow.

## Other notes

- Catalog mode is a storefront policy (templates hide the purchase affordances, the route guard answers the storefront controllers). The web API (`/rest/V1/carts/mine/*`, `/rest/V1/guest-carts/*`, `/graphql`) still accepts cart and order calls from a restricted customer group: it does not disable any REST or GraphQL ACL and is not an access control for integrations.

- The rate limiter counts per client address without a lock, so a few requests can pass under heavy concurrency: it bounds a flood, it is not an exact quota. Behind a proxy it needs `hyperion/security/trusted_proxies`; the unconfigured fallback is a best effort (see [Install](./install.md)).
- Infinite loading keeps the URL of the page the visitor arrived on, so a reload or a shared link opens that page (see [Configuration](./configuration.md)).
- A mega menu group is one tree: a store view can override titles, badges, targets and status, not the structure (see [Configuration](./configuration.md)).
- Without JavaScript the storefront is readable and navigable (the header
  renders a plain search form and the category tree inside `<noscript>`,
  the listings, product pages, login and account pages are server rendered),
  but a POST form on an edge cached page cannot succeed: the page carries
  the form key of the visitor it was rendered for, Hyperion repairs it from
  the cookie with JavaScript before a submit (`lib/form-key.js`), and without
  scripting core refuses the stale key and the redirect's message cookie is
  never shown. Add to Cart, wish list and compare therefore need JavaScript
  on a cached page (the product page says so in a `<noscript>` note); Luma
  on Varnish behaves the same. Checkout needs JavaScript in any case.
- The theme has no parent, so any core template that is not overridden
  renders without CSS. When a page looks unstyled after enabling a feature,
  check this list first and open an issue if it is not here.
