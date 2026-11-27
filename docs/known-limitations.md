# Known limitations

State of 0.9.0-beta.7: 187 native storefront features of Magento Open
Source were checked one by one against the theme, and the list below is
what is left.
Every default-configuration flow exercised by the end-to-end suite works
(guest and customer journeys, every product type, orders, account pages),
with the explicit exceptions documented below: multishipping is enabled by
core but only reachable by URL and renders core markup. What follows is
the long tail. Items are grouped by how they affect a store.

Payment sign-off perimeter: only the methods with a record in the "Payment
methods" and "Braintree" tables of `docs/checkout.md` were verified live:
the offline methods, PayPal Express in a sandbox (on a platform that is now
in the "Previously tested" table of `docs/compatibility.md`), and the
Braintree card with 3D Secure, the stored card and Braintree PayPal
against a Braintree sandbox on Magento 2.4.9. Saving a PayPal account
through Braintree, a Google Pay payment and a card stored through Google
Pay have no completed sandbox payment. There is no
general sign-off on 3D Secure for other gateways, wallets, Payment Services
or the remaining PayPal variants; a gateway not named there has not been
tested with this checkout.

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

1. Persistent cart ("Remember Me"): the "Remember Me" row renders core
   markup. A visitor the persistent cookie remembers, who is not signed in,
   checks out as a guest on the remembered cart. For a cart that belongs to
   a customer, none of the customer's email, name, date of birth or
   addresses reach that visitor through the checkout page, the shipping
   estimator of the cart page, core's GraphQL endpoint, or the guest cart
   reads of the web API over REST and SOAP (`GET /V1/guest-carts/:cartId`
   and its `billing-address`, `quoteGuestCartRepositoryV1Get`,
   `quoteGuestBillingAddressManagementV1Get`)
   ([Checkout](./checkout.md#persistent-shopping-cart)). What stays readable
   with the cart id is core's guest cart contract: the items, quantities,
   prices, totals, shipping rates and payment methods of the cart, its gift
   messages with their sender and recipient names and the id of the customer
   who wrote them (`GET /V1/guest-carts/:cartId/gift-message` and
   `/gift-message/:itemId`, the SOAP services of `Magento_GiftMessage`) and,
   while a Payment Services payment is under way, that payment's card
   summary (`GET /V1/guest-carts/:cartId/payment-order/:id`, which also
   needs the PayPal order id of the payment). The remembered visitor sees
   the cart as the customer left it: its items, its gift messages, and
   totals whose shipping and tax were computed for the customer's
   destination until the visitor enters one. Core's `customer/section/load`
   still answers the remembered customer's name to that browser (core's "Not
   you?" data, which Hyperion does not print), and the PayPal Express
   buttons of the cart page and the mini-cart carry the cart's customer id,
   as core's buttons do. There is no "Not you?" link:
   `persistent/index/unsetCookie` forgets the cart.
2. Braintree: express buttons on product / cart / mini-cart
   (including the Google Pay ones), Apple Pay, Venmo, ACH and local payment
   methods in the checkout, the "add a card / PayPal / Google Pay" forms of
   the saved payment methods page. Saving a PayPal account through
   Braintree has a renderer and no completed sandbox record yet
   ([Checkout](./checkout.md#braintree)).
3. Payment Services (Adobe): no renderer, no express buttons, no Pay Later
   message, stored cards list / delete only.
4. Remaining PayPal methods: Hosted Pro, Payflow Pro / Link / Advanced,
   billing agreement method; the billing agreements account page is core
   markup and its create form is rejected. The image CAPTCHA form of
   Payflow Pro (`co-payment-form`) is not rendered either: Payflow Pro has
   no renderer.
5. Google Analytics: only GA4 / Google Ads through `google/gtag/*` are
   emitted; the legacy Universal Analytics module (`Magento_GoogleAnalytics`)
   and Google Tag Manager containers are not.

## Nice-to-have gaps

The Fixed Product Tax
(FPT / Weee) lines of a configurable product following the variant picked
(the product page and the listings show the FPT of the product itself),
instant purchase, `payflow_express` live verification, PayPal review page without a
coupon form, search term popularity and result
counts written only when the results page is rendered by PHP and not on a
page cache hit (the search terms log block is removed; the autocomplete's
popular terms follow those counters).

- **Custom customer and address attributes.** The registration, account
  edit and address forms render the visible, user-defined attributes
  assigned to the form (text, text area, date, yes / no, dropdown, multiple
  select, multiline). File and image attributes are not rendered, and
  neither is a system attribute the forms do not already show.
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
enable-cookies, account pages, the RSS feed list (`/rss/`).

## Third-party extensions

Extensions that ship a Knockout, RequireJS or jQuery storefront (payment
gateways, search overlays, sliders, pop-ups, GDPR tools) do not run on
Hyperion: there is no RequireJS and no `x-magento-init` / `data-mage-init`
processing. Each such extension needs a Hyperion adapter (a template
override plus a Lit component or HTMX wiring). Server-side extensions
(pricing, shipping, tax, ERP connectors, admin modules) are unaffected.
Payment methods without a renderer are not shown in the checkout; a
module can register one ([Extending Hyperion](./extensions.md#payment-renderers)),
and developer mode, `?hyperion_debug_payments=1`,
`bin/magento hyperion:checkout:payments` and an admin message list what is
hidden.

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
styling, and parts that need RequireJS do not run. The order pages show the
"Withdraw from purchase" link of `MageOS_RMA` among the order actions (for
an order that module accepts), and it leads to that unstyled return form. `MageOS_Seo` is
supported: it owns Open Graph and the JSON-LD structured data, and by its
own default setting it removes the theme's microdata from product pages
([Compatibility](./compatibility.md#mage-os-40-seo-module)).

## Checkout and cart behavior to know

- **An order placed in another tab** leaves the first tab on the cart page.
  When the same session orders in one tab while another tab still shows the
  checkout, the second tab finds the cart ordered and leaves for the success
  page; core shows that page once per order, so it sends the second tab on
  to the empty cart without a message.
- **An order whose outcome cannot be read** (the answer was lost and the
  cart cannot be read either) keeps Place Order locked and offers "Check
  again"; the checkout keeps reading the cart for a minute and whenever the
  connection comes back, then waits for the shopper. It never sends the
  order a second time by itself.
- **An authorization of a failed order is voided only when the order was
  not saved.** When the order submission fails after the order row was
  written (an observer of the success event or the cart save threw),
  Hyperion leaves the order and its authorization alone and logs a warning;
  what happens next is the payment module's business (the Braintree module
  cancels such an order and voids it, core's offline and PayPal Express
  methods do nothing). A payment that was captured at once ("authorize and
  capture") is not refunded: the warning names the transaction. A PHP
  `Error` (not an `Exception`) inside the submission skips core's failure
  event, so nothing is voided. Adobe Payment Services methods are skipped,
  that module releases the authorization of its own failed orders. The
  observer acts through the payment method's own void command; it was
  exercised against a Braintree sandbox with a new card (guest and
  customer) and with a stored card, and not with PayPal Express or a
  Braintree wallet.
- **Google Pay needs a second press after an edit that was still saving.**
  A browser only lets the Google Pay sheet open inside the click itself, so
  the click cannot wait for pending saves: it saves them and says so, and
  the next click opens the sheet.
- **Google Pay stored cards and CVV.** A card stored through Google Pay
  (`braintree_googlepay_vault`) is ordered without a CVV step, as the
  Braintree module's own script does. This path has not been verified
  against a sandbox.
- **A single offered shipping rate is selected**, and among several the one
  `hyperion_checkout/shipping/preselect` names (the cheapest by default); a
  carrier's error rate is listed as a notice and never selected.
- **Typed checkout data is kept in the browser tab** (`sessionStorage`)
  while `hyperion_checkout/general/persist_drafts` is on, see
  [Checkout](./checkout.md#drafts-typed-data-kept-in-the-browser).
- **The typed address after a pickup point and a reload.** A shipping
  extension that puts a pickup point in place of the address writes the
  point's address to the cart. When the shopper reloads and then chooses a
  home delivery rate, the address typed before comes back only from the
  draft of the tab: with `persist_drafts` off the shopper types it again.
  Without a reload nothing is lost.
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

- **Add to Cart with "After Adding a Product Redirect to Shopping Cart".**
  With `checkout/cart/redirect_to_cart` on Yes, a successful htmx add
  answers with a redirect to the cart page, where the success message
  shows. That add sends no GA4 `add_to_cart` event and dispatches no
  `hyperion_htmx_action_response` event. An add that is only partly
  successful (the product added, a related product refused) stays on the
  page and shows the error message, as does a refused add. An add made by
  an express button of the product page (the PayPal button, any button that
  adds through `context.addCurrentProductToCart()`) is never redirected: it
  gets the answer of an ordinary add, and the button goes on with its own
  flow.
- **The cart coupon form reserves its message line.** While the form is
  open it keeps room for two lines of message on a phone and one line from
  the `sm` breakpoint; a longer message grows the form and moves the
  content below it.
- **A checkout order comment that core's validation refuses** (for example
  one that contains a `<script>` tag) is answered with core's own sentence,
  which names the internal field (`"hyperion_order_comment" does not
  contains valid value.`). The order is not placed and the shopper can
  correct the comment.

## Other notes

- **Wish list sidebar.** The sidebar lists the three newest in-stock items
  of the wish list, while its count covers every item.
- **Recently viewed on the account dashboard.** The history lives in the
  browser (`localStorage`), so the server cannot reserve space for the
  block: it renders nothing with an empty history and appears at the end
  of the dashboard content once the history is read, which can move the
  footer on a short dashboard.
- **Checkout testing harness.** The harness page of the testing kit mounts
  payment, shipping and express elements, and slot elements whose module
  defines the tag when it is imported. An element whose tag is defined only
  inside the module's `register(api)` (the slot elements of a checkout
  extension, the built-in order comment and newsletter opt-in) cannot be
  mounted by it ([Extending Hyperion](./extensions.md#testing-and-the-sample-modules)).

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
