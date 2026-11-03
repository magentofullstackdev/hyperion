# Known limitations

State of 0.9.0-beta.2: 187 native storefront features of Magento Open
Source were checked one by one against the theme, and the list below is
what is left.
Every default-configuration flow exercised by the end-to-end suite works
(guest and customer journeys, every product type, orders, account pages),
with the explicit exceptions documented below: multishipping is enabled by
core but only reachable by URL and renders core markup. What follows is
the long tail. Items are grouped by how they affect a store.

Payment sign-off perimeter: only the methods marked "verified" in the
"Payment methods" table of `docs/checkout.md` were verified live (offline methods, PayPal Express
sandbox, Braintree card with vault and 3D Secure on 2.4.7). There is no
general sign-off on 3D Secure for other gateways, wallets, Payment Services
or the remaining PayPal variants; a gateway not named there has not been
tested with this checkout.

## Not available (planned, architecture exists)

- **Multishipping checkout.** Core enables it by default
  (`multishipping/options/checkout_multiple`), but the entry link lives in a
  cart container the theme removes, so no shopper reaches it; the nine
  `/multishipping/checkout/*` pages render core markup with dead scripts if
  opened directly. A server-rendered HTMX rebuild is planned.
- **In-store pickup (MSI).** The native step is Knockout; a Lit
  implementation on the existing REST API is planned. The `instore` carrier
  is not offered.

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
coupon form, footer links limited to Contact, Order status, Privacy and Terms, advanced search reachable only by URL, search term popularity and result
counts written only when the results page is rendered by PHP and not on a
page cache hit (the search terms log block is removed; the autocomplete's
popular terms follow those counters).

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
| Guest invoice / shipment / credit memo tabs (wrappers) | guest order lookup | yes |
| `/rss/feed/index/` | only with RSS enabled | yes |
| `/multishipping/checkout/*` (9 pages) | direct URL only | no |
| "Remember Me" row on login and register | only with persistence enabled | yes |
| Hosted Pro / Payflow iframe pages | unreachable (methods not offered) | n/a |
| Braintree "add a card / PayPal / Google Pay" forms on Stored Payment Methods | Braintree installed | removed (Knockout); the stored tokens still list |

Pages checked and found fully styled: home, category, product, quick and
advanced search, login, register, forgot password, contact, guest order
form, cart, checkout, reviews list, single review, stored payment methods,
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
