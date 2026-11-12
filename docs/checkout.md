# Checkout

Hyperion replaces the Knockout checkout with a single-page Lit application
served by the `HyperionCheckout` module. The application source is the npm
package `@magentofullstackdev/hyperion-checkout`; the built bundle is
committed in the module (`view/frontend/web/`) so a Composer install needs
no Node.

## Enabling it

```bash
bin/magento config:set hyperion_checkout/general/enabled 1
bin/magento cache:flush
```

The flag defaults to 0 and can be set per website or store view. With 0 the
`/checkout` page keeps the stock `Magento_Checkout` layout, which needs
RequireJS and therefore does not work on the Hyperion theme; enable the flag
before you assign the theme to a store view that takes orders. Rolling back
is the same one flag plus a cache flush.

The controller for `/checkout` applies core's guards: guest checkout
disabled, quote errors, minimum order amount. A guest who may not check out
is sent to the login page with a notice and returns to the checkout after
signing in (core sends to the cart).

## What it renders

One page, in this order:

1. Email with inline sign-in for guests, or the customer's saved addresses
   for logged-in customers. The inline sign-in goes through the storefront's
   own AJAX login (`customer/ajax/login`): the customer session starts, core
   merges the guest cart into the customer's cart, and the checkout reloads
   as the logged-in customer. The email check that
   reveals the password field answers only when Stores > Configuration >
   Sales > Checkout > Checkout Options > "Enable Guest Checkout Login"
   (`checkout/options/enable_guest_checkout_login`) is Yes; it is No by
   default, and then guests simply check out as guests. A guest's email and
   addresses survive a reload: the quote's data is emitted as
   `checkoutConfig.hyperion.guestQuote` and hydrates the form at boot, the
   way a customer's quote does.
2. Shipping address (`<address-form>` with country / region selection,
   company, telephone, fax and VAT according to the `customer/address/*`
   settings, name prefix / middle name / suffix according to
   `customer/address/prefix_show`, `middlename_show`, `suffix_show`) and
   shipping methods. A postcode is required unless the country is in
   `general/country/optional_zip_countries`; the format patterns of
   `zip_codes.xml` only produce a warning with the examples under the field
   (like core's checkout), the address stays complete and the value is sent
   as typed. A carrier's error rate is listed as a disabled notice (carrier
   title and message) and never selected; the first available rate is
   preselected when the quote has no method yet; the in-store pickup rate
   (`instore` / `pickup`) is not listed, because the checkout has no pickup
   location step. The whole section is skipped for virtual quotes
   (downloadable and virtual products only).
3. Payment methods, billing address, coupon form, checkout agreements.
4. Order summary with items (options and downloadable links as text), totals
   and the Place Order button.

Messages entered in the cart (gift messages, coupons) are kept; the checkout
offers its own gift message editor (see Gift messages) and no coupon form on
the PayPal review page. When the merchant enables the shipping policy
(`shipping/shipping_policy/*`) the shipping step shows a "See our shipping
policy" button that opens the text in a dialog.

## Order safety

Place Order never sends an order the server has not confirmed the inputs of:

- **The form and the quote must agree.** An edit of the shipping address or
  of the method marks the shipping step as ahead of the quote until the
  estimate and the shipping save for the current values came back. A press
  of Place Order first waits for that pending work (the typing pause is cut
  short, the requests in flight are awaited) and only then reads whether the
  order can be placed; while something is still missing the button says what
  (the hint names the address, the shipping method, the payment or the
  purchase order number). A press after a failed estimate or shipping save
  sends it again, once; there is no background retry.
- **One order.** From the server's answer to the order request until the
  success page loads, the overlay stays and the button stays locked; a
  checkout page restored from the browser's back / forward cache reloads.
- **A lost answer is resolved, not guessed.** The order request has a 60
  second limit and is never retried automatically. When its answer does not
  arrive, the checkout reads the cart: the cart is gone or inactive (the
  order was placed: the shopper goes to the success page), the cart is still
  active after a connection failure (not placed: the error says so and the
  button opens again), or the outcome cannot be told (the message says so,
  and the next press reads the cart again before it sends anything). A
  timeout with a cart that is still active is reported as unknown, because
  the server may still be working on the order.
- **An HTML error body is never shown.** A response that is not JSON (a
  proxy or web server error page) is neither data nor a message; the
  checkout prints its own text for the status.
- **Wallets use the same gate.** PayPal Express and Google Pay refuse to
  start while a shipping save or a totals refresh is in flight
  (`payment-renderers/checkout-gate.ts`), and PayPal saves a billing address
  entered on its own before it opens.

The limits of this recovery are listed in
[Known limitations](./known-limitations.md#checkout-and-cart-behavior-to-know).

## REST API usage

The application talks to Magento's own web API from the browser:
`carts/mine/*` for customers and `guest-carts/<masked id>/*` for guests
(`estimate-shipping-methods`, `shipping-information`, `set-payment-information`,
`payment-information`, `totals`, `coupons`). No custom endpoints are added
for the order flow.

Every call sends `X-Requested-With: XMLHttpRequest`. Core only honors the
storefront session cookie on web API requests that declare themselves AJAX;
without the header `carts/mine/*` answers 401 for a customer who logged in
on the storefront. Keep it if you write your own calls.

The initial state comes from the `#checkout-config` JSON island rendered by
`HyperionCheckout\Block\Checkout`, which is core's `checkoutConfig`
(`Magento\Checkout\Model\CompositeConfigProvider`) plus a `hyperion` slice.
Any `ConfigProviderInterface` registered with the composite provider is
therefore visible to the checkout.

## Payment methods

| Method code | Renderer | Status |
|---|---|---|
| `checkmo`, `banktransfer`, `cashondelivery`, `free` | `payment-offline`: the method's instructions (`banktransfer`, `cashondelivery`), and for `checkmo` the "Make Check payable to" and "Send Check to" details | orders verified as a guest and as a customer; the instructions under the selected method and on the order pages verified by `pw-orders-widgets-ga4.mjs` on 2026-11-11 (Magento 2.4.9) |
| `purchaseorder` | `payment-offline` with a required PO number field; the number travels as `paymentMethod.po_number` | verified by `pw-orders-widgets-ga4.mjs` on 2026-11-11 (Magento 2.4.9): Place Order stays closed without the number, a guest order is placed and the order carries the typed number |
| `paypal_express`, in-context (`payment/paypal_express/in_context = 1`) | `payment-paypal-express`: smart button, Pay Later message, owns Place Order | verified with real sandbox payments (guest, customer, from the cart, mini-cart and product page) on a platform now in "Previously tested" ([Compatibility](./compatibility.md#previously-tested)) |
| `paypal_express` redirect flow (`in_context = 0`), `payflow_express` | same renderer, redirect flow | reaches PayPal with the token; completion of the payment not verified; `payflow_express` unit tested only |
| `braintree` | `payment-braintree-card`: hosted fields, device data, 3D Secure (frictionless and challenge) | verified against a Braintree sandbox: approved, declined, 3D Secure (on a platform now in "Previously tested") |
| `braintree_cc_vault`, `braintree_paypal_vault` | `payment-braintree-vault` and the `*_vault` token list (`vault-tokens.ts`) | vault with and without CVV verified against the same sandbox |
| `braintree_paypal` | `payment-braintree-paypal` | not tested (no PayPal account linked to the sandbox) |
| `braintree_googlepay` | `payment-braintree-googlepay`: Google Pay button (Braintree `google-payment` + Google's `pay.js`, loaded on selection), owns Place Order, 3D Secure for cards that are not network tokenized, vault choice; `braintree_googlepay_vault` tokens through the card vault adapter | button verified against the Braintree sandbox (`TEST` environment, sheet request included); payment not verified (it needs a Google account in a real browser) |
| any other code | `payment-generic` | listed disabled with "Not supported by this checkout yet" |

The renderers are exactly the rows above: the offline methods, PayPal
Express (`paypal_express`, `payflow_express`), Braintree card, Braintree
PayPal, Braintree Google Pay and the three Braintree vault codes
(`braintree_cc_vault`, `braintree_paypal_vault`, `braintree_googlepay_vault`).
Nothing else has a renderer: Hosted Pro, Payflow Pro / Link / Advanced,
PayPal billing agreements, Payment Services (Adobe), Apple Pay, Venmo, ACH
and local payment methods are listed as not supported when a store enables
them. Google Pay is supported through Braintree only. With Hosted Pro active, `payment/hosted_pro/display_ec`
must be 1 for PayPal Express to be offered at all (core rule).

Gateway renderers are loaded on demand: the offline renderer ships in the
main bundle, a gateway module is imported the first time its method code
appears in the available payment methods, and the gateway SDK (Braintree,
PayPal) is fetched only after the shopper selects the method. A store
without PayPal never downloads a byte of PayPal code.

## Writing a payment renderer

The registry is `src/components/payment-renderers/registry.ts` in
`@magentofullstackdev/hyperion-checkout`. A renderer is a plain object
registered by method code:

```ts
export interface PaymentRenderer {
    code: string;
    component: string;
    isAvailable?: (cfg: PaymentMethodConfig) => boolean;
    beforePlaceOrder?: () => Promise<Record<string, unknown>>;
    isReady?: () => boolean;
    afterPlaceOrderFailed?: () => void;
    notReadyMessage?: () => string;
    ownsPlaceOrder?: () => boolean;
    placeOrder?: () => Promise<string | null>;
}

registerPaymentRenderer(renderer);
```

| Hook | When it runs | Contract |
|---|---|---|
| `code` | | Magento method code (`checkoutConfig.paymentMethods[].method`). |
| `component` | selection | Tag of the custom element rendered inside `<payment-method-row>` when the method is selected. Light DOM, Tailwind classes available. |
| `isAvailable(cfg)` | listing | Optional runtime gate on top of the method appearing in the available methods (for example "no saved agreements"). Omitted = available. |
| `isReady()` | continuously | Optional gate read by the `canPlaceOrder` selector. It must read signals only, so the Place Order button follows it (PayPal stays locked until the shopper authorized the payment). |
| `beforePlaceOrder()` | before the payment-information POST | Returns the `additional_data` object for the payment (nonce, device data, PO number). A rejection aborts the order and its (translated) message lands in the global error banner. Runs even when `placeOrder` is set. |
| `notReadyMessage()` | while `isReady()` is false | Optional text for the Place Order hint (the purchase order renderer names its missing number); without it the hint is the generic payment one. |
| `afterPlaceOrderFailed()` | after a failed order POST | For renderers holding single-use gateway state (a consumed nonce) that must be reset before a retry. |
| `ownsPlaceOrder()` | render | `true` when the renderer completes the order with a control of its own (the PayPal smart button). The checkout's Place Order button is not rendered while that method is selected. |
| `placeOrder()` | instead of the order POST | For methods whose order is placed elsewhere (redirect gateways). Resolves with the same-origin URL the shopper continues on, or `null` when it failed and already reported why in the global error. Redirect targets are validated against the store origin (`safe-redirect.ts`). |

Methods with no renderer fall through to `payment-generic`. Only the codes
in `SAFE_FOR_GENERIC` (`checkmo`, `banktransfer`, `cashondelivery`, `free`)
may be placed that way; every other unregistered code shows the "not yet
supported" banner and cannot be selected, so a missing renderer never sends
an order to a gateway without its data.

**Lazy loading.** `lazy-renderers.ts` maps method codes to dynamic imports:

```ts
const LOADERS = {
    braintree: () => import('./braintree/payment-braintree-card.js'),
    paypal_express: () => import('./paypal/payment-paypal-express.js'),
    // ...
};
```

`ensureRenderersFor(codes)` is called with the available method codes; each
module registers itself on import and bumps the `renderersVersion` signal so
the method list re-renders. Add your module to `LOADERS` to get the same
on-demand behavior; a renderer imported statically in `main.ts` works too
but ships in the main bundle.

**Configuration from PHP.** Put server-side values under
`checkoutConfig.hyperion.<yourKey>` with a `ConfigProviderInterface`
registered on `Magento\Checkout\Model\CompositeConfigProvider` in your
module's `etc/frontend/di.xml`, the way
`HyperionCheckout\Model\Checkout\PaypalExpressConfigProvider` adds
`hyperion.paypalExpress` and `NameFieldsConfigProvider` adds
`hyperion.nameFields`. Per-method values that core already provides
(`checkoutConfig.payment[<code>]`, for example Braintree's client token or
the offline instructions) are read from there. Read them through
`getCheckoutConfig()` from `bootstrap-config.ts`; validate the shape, the
PHP side serializes an empty array as `[]` and a filled one as an object.

**Shipping it.** The checkout is one bundle. `HyperionCheckout\Block\Checkout`
resolves the hashed files from Vite's manifest, read from the deployed
static directory of the Hyperion theme
(`pub/static/frontend/Magentofullstackdev/hyperion/Magentofullstackdev_HyperionCheckout/.vite/manifest.json`)
or from the module's `view/frontend/web/.vite/manifest.json`. A custom
renderer is therefore built into the bundle from the package source (a fork
or a copy of this repository, `pnpm --filter @magentofullstackdev/hyperion-checkout build`)
and shipped as the module's `view/frontend/web/` output; it is not something
a child theme file can add. The build first runs `scripts/sync-i18n.mjs`,
which writes every string of the bundle's `src/i18n/en_US.json` into the
module's `i18n/en_US.csv` (and the Italian texts into `it_IT.csv`); the
other eleven locale CSVs of the module are translated by hand from the
English rows.
Its Tailwind build is scoped to the `checkout-app` root and carries no
preflight, so it cannot override the theme's utilities.

**Translations.** At runtime the strings come from Magento, not from the
bundle: `HyperionCheckout\Model\ConfigProvider` renders every string of
`i18n/en_US.csv` through `__()` (`Model\Checkout\TranslationCatalog`) and
emits the result as `checkoutConfig.hyperion.translations` (keyed by the
English text) next to `hyperion.locale`, the locale Magento resolved.
`utils/i18n.ts` looks a `Hyperion_Checkout::` key up by its English text in
that dictionary first and falls back to the static JSON catalog of the locale
(`it_IT`, or `en_US`). The module ships the thirteen locales listed in
[Configuration](./configuration.md#languages); to translate the checkout into
another one, add `HyperionCheckout/i18n/<locale>.csv`, a theme CSV or a
language pack, like for any other module; the `{name}` placeholders must stay
in the translation.
A new string is added to `en_US.json` with a `Hyperion_Checkout::` key, the
build syncs it into the CSV.

Reference implementations to copy: `payment-offline.ts` (simplest, with
the PO number example of `beforePlaceOrder`), `paypal/payment-paypal-express.ts`
(`ownsPlaceOrder`, `placeOrder`, `isReady`), `braintree/payment-braintree-card.ts`
(SDK loading, hosted fields, 3D Secure, `afterPlaceOrderFailed`). Each has
unit tests next to it in `__tests__/`.

## Gift messages

Order-level and per-item gift messages are edited on the cart page
(`sales/gift_options/allow_order`, `allow_items`, per-product
`gift_message_available`; `Magento_GiftMessage` optional) through an HTMX
POST to `hyperion/cart/giftMessage`, which uses core's gift message
repositories so store settings and virtual items are enforced. Inside the
checkout, `<checkout-gift-message>` ("Add gift options", above the payment
section) edits the same messages: one form for the order (physical quotes)
and one per item whose product accepts a message, saved through core's web
API (`carts/mine/gift-message[/:itemId]`, guest carts likewise); an empty
message removes the stored one. The messages entered in the cart are the
initial values. The order view shows them. Core registers its gift message
config provider on a composite of its own that only the Luma checkout reads,
so Hyperion's `ConfigProvider` relays the `giftMessage` and
`is*LevelGiftOptionsEnabled` keys itself when the module is installed.

## Cart page

Every cart line has quantity, remove and, for logged-in customers with the
wishlist enabled, "Move to Wishlist" (core's `wishlist/index/fromcart`,
answered as an HTMX fragment: cart body, header badges and toast). A line
with options (configurable, bundle, custom options, downloadable links) also
has "Edit", in the cart and in the mini-cart: core's `checkout/cart/configure`
renders the product page with the line's options and quantity preselected
(`HyperionCatalog\ViewModel\CartConfigure`, the theme layout
`checkout_cart_configure.xml` keeps the page out of the page cache) and
"Update Cart" posts to core's `checkout/cart/updateItemOptions`, which
replaces the line in place and returns to the cart. The
summary card carries "Estimate Shipping and Tax": country, region and
postcode go to `hyperion/cart/estimate`, which puts them on the quote's
shipping address, collects the rates and applies the chosen one, so the
totals show shipping and destination taxes before the checkout. The rates
are shown in the display currency and follow `tax/display/shipping`
(including, excluding or both); a carrier's error rate is a text notice
without a radio button and cannot be posted, and choosing another method
replaces the stored one. While
the quote has no destination yet, a logged-in customer sees the panel
prefilled with the default shipping address and its rates (collected in
memory, nothing is written to the quote until a rate is picked). The
mini-cart lines carry a quantity stepper (minus, input, plus) that posts
to core's `checkout/cart/updatePost` like the cart page. A quantity the
stock refuses is saved by core all the same (its controller swallows the
validation exception, Luma validates client side): the HTMX answer
carries the quote item's error as the error toast, and the cart page and
the drawer print the same message under the line. Fixed
Product Tax lines render under the items (mini-cart, cart, checkout
summary) and as an "FPT" totals row when it is not included in the
subtotal. Each cart line prints a unit price and a row total in the tax
display of `tax/cart_display/price` (including, excluding, or both with an
"Excl. Tax" line); the mini-cart row total follows the same setting. The
quantity inputs of the cart and of the mini-cart carry the product's `min`,
`max` and `step` (quantity increments, decimal quantities), the mini-cart
stepper sends one update after a short pause instead of one per tap, and
the header count follows `checkout/cart_link/use_qty`.

## Name fields

`NameFieldsConfigProvider` exposes `customer/address/prefix_show`,
`prefix_options`, `middlename_show`, `suffix_show` and `suffix_options` as
`checkoutConfig.hyperion.nameFields`. The address form renders a select
when options are configured and a text input otherwise; `req` makes the
field required (the middle name is never required, as in core). Verified
with guest and customer orders, free text and hidden variants.

## Downloadable and virtual quotes

A quote with only downloadable or virtual items is virtual: the shipping
section is not rendered and only the billing address is collected. That
address is put on the quote as soon as it is complete (the same happens on
a physical quote when "same as shipping" is unchecked) and the payment
methods and totals are read again for it; Place Order waits for that. The cart
and the order summary list downloadable links and bundle selections as
text. Guest checkout with downloadable products follows core's
`catalog/downloadable/disable_guest_checkout` guard through the controller
(on by default in core): the guest is sent to the login page with a notice
that names the downloadable products as the reason.
Verified end to end on Magento 2.4.8 (category, product page, cart, virtual
checkout, order, invoice, download).

## reCAPTCHA

The checkout reads the storefront reCAPTCHA configuration contributed by
`Magento_ReCaptchaCheckout` and `Magento_ReCaptchaUser` from
`checkoutConfig`. When it is present, `<hc-recaptcha-badge>` (prefixed so it
does not collide with the theme's form bound `<hyperion-recaptcha>`) loads Google's
API on first use, runs the v3 invisible flow for the `place_order` action and
sends the token as the `X-ReCaptcha` header of the order request. When it is
absent the component renders nothing. Image CAPTCHA for the inline login is
not implemented (core enables it after failed logins by default); the
storefront login page has it.
