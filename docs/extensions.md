# Extending Hyperion

How a module adds a payment method, an express button, a shipping option,
a checkout field or storefront content to a Hyperion store without forking
the theme or the checkout bundle. Everything here goes through DI pools,
layout containers, DOM events and plain custom elements: an extension
imports nothing from the checkout's source.

**Status: beta.** The browser contract is API version `1.0-beta`
(`checkoutConfig.hyperion.extensionApi`). It may still change before 1.0;
the changes will be listed in the [changelog](../CHANGELOG.md) under the
upgrade notes of the release that makes them. The types are published in
`@magentofullstackdev/hyperion-checkout/extension-api`
(`frontend/packages/module-checkout/extension-api.d.ts`), which is the
reference for every name below.

## Which extension point

| You want to | Use | Section |
|---|---|---|
| render a payment method in the checkout | an entry of `Model\Payment\RendererPool` | [Payment renderers](#payment-renderers) |
| a wallet button on the product page, cart, mini-cart or above the checkout | an entry of `Model\Payment\ExpressButtonPool` | [Express buttons](#express-buttons) |
| a pickup point picker, a delivery slot, anything tied to a shipping rate | an entry of `Model\Shipping\ExtensionPool` | [Shipping extensions](#shipping-extensions) |
| a checkbox, a notice, a gate or extra request data anywhere in the checkout | an entry of `Model\Checkout\ExtensionPool` (`extensions`) | [Checkout extensions](#checkout-extensions-and-slots) |
| an extra address field (fiscal code, SDI code) | an entry of `Model\Checkout\ExtensionPool` (`address_fields`) | [Address fields](#address-fields) |
| a row of your own in the cart totals (the checkout summary prints the total as a plain row) | a renderer in `Model\Cart\TotalRowPool` | [Total rows](#total-rows) |
| a block on the product page, a tile, the cart, the account pages, the header | a layout container | [Storefront containers](#storefront-containers) |
| out of band markup in an htmx answer or in the header state answer | the events `hyperion_htmx_action_response`, `hyperion_header_state_render_after` | [Events of the storefront](#events-of-the-storefront) |

All class names in this document are relative to
`Magentofullstackdev\HyperionCheckout` unless they name another module.

## Rules common to every pool

These rules are shared by every pool above (`Model\Extension\EntryRules`).

- **Declare in `etc/frontend/di.xml`.** The pools exist in the frontend
  area only. An item declared in a global `etc/di.xml` is lost on the
  storefront, because the area configuration replaces an array argument of
  the same name. Class names inside items (`options_provider`,
  `value_provider`, `provider`) are strings, resolved when the page
  configuration is built and checked with `instanceof`: one broken class
  costs its own entry, never the page.
- **Item names** are snake_case (`^[a-z][a-z0-9_]*$`).
- **Custom element tags** follow the custom element rule
  (`^[a-z][a-z0-9]*(-[a-z0-9]+)+$`) and may not start with a prefix the
  checkout or the theme owns: `hyperion-`, `hc-`, `checkout-`, `payment-`,
  `shipping-`, `address-`, `order-`, `summary-`, `place-`, `coupon-`,
  `loading-`, `error-`. Use your vendor name (`vendor-card`).
- **`module`** is an asset id, `Vendor_Module::js/file.js`. The URL is
  resolved for the current theme, locale and request scheme, and must be on
  the store's web origin or its static files origin; any other origin drops
  the entry. The browser checks the same rule again before it imports. The
  file is an ordinary static file: with "Minify JavaScript Files" on
  (outside developer mode) its URL gets the `.min.js` name and Magento's
  minifier processes it, so a relative `import` inside it names a file that
  is published under another name. Keep the module self-contained, or add a
  `dev/js/minify_exclude` entry for its directory in your module's
  `etc/config.xml` to serve it as written, as Hyperion does for its own
  build ([Child themes](./child-themes.md#minification)).
- **`internal` and `builtin` are reserved** for the first-party entries of
  Hyperion. `internal` is honored only for a `module` of a
  `Magentofullstackdev_Hyperion*` module or for a `builtin` of the closed
  list each pool ships; anywhere else the key is refused with one error
  line and the entry is judged as third party (the tag prefixes apply).
  Claiming a first-party `builtin` only renders that first-party element.
- **Patterns match the whole value**, in PHP and in the browser alike: the
  checkout anchors every pattern as `^(?:pattern)$`. A prefix pattern such
  as `^vendor_` matches only the code `vendor_`, not `vendor_card`; write
  `vendor_.*` or `vendor_\w+`. Patterns are written without delimiters
  (except the shipping `match` parts, see below) and must compile in both
  PCRE and the browser's `RegExp`: syntax only PCRE knows (possessive
  quantifiers, atomic groups, `(?P<name>)`, recursion, conditionals, inline
  flags such as `(?i)`, backtracking verbs, POSIX classes, `\A`, `\z`, `\h`,
  `\R`, `\p{..}`, `\x{..}` and the like) is refused.
- **Boolean items** should be `xsi:type="boolean"`. A string is read as
  true only for `1`, `true`, `on` or `yes` (any case); `"false"`, `"0"`,
  `"no"`, `"off"` and an empty string are false.
- **`api_version`** (default `"1"`): the major of the contract the code was
  written for. `1`, `1.2`, `1-beta` and `1.0-beta` are accepted; another
  major drops the entry.
- **Unknown keys are ignored**, with one `notice` line naming the item and
  the key; the entry stays valid. An entry is dropped only for an invalid or
  missing required key; an invalid optional value falls back to its default
  with one `error` line. Each line is written once per configuration cache
  lifetime (`bin/magento cache:clean config` writes them again), to
  `var/log/system.log`.
- **Labels and phrases are English source text.** Magento's DI does not
  translate `translate="true"` items (the attribute only lets
  `bin/magento i18n:collect-phrases` find them), so the pools translate at
  emit time: `phrases` reach the browser as `{ "English source":
  "translation" }` in the locale of the request, form and address field
  labels through `__()`. Declare English text and ship the translations in
  your module's `i18n/*.csv`. In the browser, `context.t('English source',
  { name: value })` returns the translation and fills `{name}`
  placeholders. The item names inside `phrases` are only DI keys.
- **Providers.** An `options_provider` implements
  `Api\ExtensionOptionsProviderInterface::getOptions(\Magento\Quote\Api\Data\CartInterface $quote): array`
  (merged over the static `options`). Throwing `Api\SkipExtensionException`
  (a plain `\RuntimeException`: `throw new SkipExtensionException();`, a
  message is optional) from an options, value or express button provider
  means "not for this page" (a feature switched off): the entry is left out
  without a log line. Any other exception drops the entry for that page and
  is logged. Options are printed into the page: never put a secret there.
  The provider interfaces are `Api\ExtensionOptionsProviderInterface`,
  `Api\ShippingExtensionValueProviderInterface`
  ([Shipping extensions](#shipping-extensions)),
  `Api\ExpressButtonProviderInterface` ([Express buttons](#express-buttons))
  and `Api\Cart\TotalRowRendererInterface` ([Total rows](#total-rows)), all
  under `Magentofullstackdev\HyperionCheckout`.
- **The checkout pools emit nothing while the Lit checkout is off**
  (`hyperion_checkout/general/enabled` = 0). The express buttons of the
  product page, the cart and the mini-cart do not depend on that flag.

## Loading and failure behavior

| What | Limit | When it is exceeded |
|---|---|---|
| import of a module | 8 s | the entry counts as failed |
| the tag defined after the import | 8 s | the entry counts as failed |
| a generic extension's default export | 8 s | the entry counts as failed |
| every generic extension started, before an order | 20 s | a required entry still loading keeps Place Order closed until it settles |
| `canMakePayment()` | 3 s | the row is hidden |
| `hyperion-payment:ready` of an `awaits_ready` element | 15 s | the row shows "This payment method could not be loaded." with "Try again" |
| `validate()` of a payment, slot or shipping element | 5 s | the order does not start |
| `getPaymentData()` | 120 s, restarted by every `hyperion-payment:busy` report, never past 15 minutes | the order does not start, the message is shown |
| `afterPlaceOrder()` | 10 s | the shopper continues on the success page (the order exists) |

Every failure is logged once in the browser console with the entry id, the
tag, the module URL and both API versions. A failed import is forgotten, so
"Try again" imports the module again, with `?hyperion_retry=<n>` appended
(a browser may keep a failed module fetch for the life of the page). Every
element class (payment, shipping, slot and express) declares
`static hyperionApi = '1'`: a class without it, or with another major, is
not used and the console names the version mismatch.

What the shopper sees:

- A payment method whose renderer cannot load is not shown (see
  [Methods without a renderer](#methods-without-a-renderer)); a failure of
  the selected row after it was shown puts "This payment method could not
  be loaded." with "Try again" in the row.
- A required shipping extension that cannot load closes Place Order with
  "This delivery option could not be loaded." and shows the same text with
  "Try again" in its place.
- A required generic extension that cannot load closes Place Order with "A
  required part of the checkout could not be loaded. Reload the page."; an
  optional one is left out.
- A throwing gate closes Place Order with "A part of the checkout could not
  check your order. Reload the page."; a throwing request filter stops the
  request with "The checkout could not prepare your request. Reload the
  page."
- A thrown error with a message keeps that message (plain text, at most
  500 characters); anything else is "This step could not be completed.
  Please try again."

The checkout never shows a raw response body, an HTTP status or a stack.

## Calling a controller of your module

`storefront(path, init)` of the checkout contexts and of the express
context calls a same-origin controller of your module, the same way in
both:

- `path` is relative to the store base URL (`vendor/route/action`, a query
  string allowed); a leading slash is dropped, and a scheme, `//` or `..`
  rejects the call.
- `init.method` is `GET` (the default) or `POST`; any other value is sent
  as `POST`. A GET carries no body. A POST carries `init.body` as JSON
  (`{}` when there is none) with `Content-Type: application/json`, and the
  form key as the query parameter `form_key`. Every request carries
  `X-Requested-With: XMLHttpRequest`; `init.signal` aborts it.
- The controller reads the body with `$this->getRequest()->getContent()`
  and checks the form key itself with
  `Magento\Framework\Data\Form\FormKey\Validator`: core's CSRF check lets an
  `XMLHttpRequest` POST through without looking at it.
- The answer must be JSON; an empty one resolves with null. A non-2xx
  answer, or one that is not JSON, rejects with a `CheckoutError` whose
  `kind` and `status` tell what happened and whose message is generic (the
  controller's own text never reaches the element): answer 200 with a
  message in the JSON body when the element must show it.

## Payment renderers

### Entries

An entry tells the checkout which element, generic renderer or form
serves a payment method code. From the sample payment module
(`dev/modules/Magentofullstackdev/HyperionSamplePsp/etc/frontend/di.xml`):

```xml
<type name="Magentofullstackdev\HyperionCheckout\Model\Payment\RendererPool">
    <arguments>
        <argument name="renderers" xsi:type="array">
            <item name="hyperion_sample_card" xsi:type="array">
                <item name="method" xsi:type="string">hyperion_sample_card</item>
                <item name="type" xsi:type="string">element</item>
                <item name="tag" xsi:type="string">sample-psp-card</item>
                <item name="module" xsi:type="string">Magentofullstackdev_HyperionSamplePsp::js/hyperion/card.js</item>
                <item name="api_version" xsi:type="string">1</item>
                <item name="awaits_ready" xsi:type="boolean">true</item>
                <item name="sort_order" xsi:type="number">900</item>
                <item name="options_provider" xsi:type="string">Magentofullstackdev\HyperionSamplePsp\Model\Hyperion\CardOptions</item>
                <item name="phrases" xsi:type="array">
                    <item name="card_number" xsi:type="string" translate="true">Card number</item>
                    <item name="incomplete" xsi:type="string" translate="true">Enter a complete card number.</item>
                </item>
            </item>
        </argument>
    </arguments>
</type>
```

| Key | Meaning |
|---|---|
| `method` or `pattern` | the exact method code, or a pattern for the whole code. An exact `method` wins over any pattern; among patterns the lowest `sort_order` wins (then the item name). A shadowed entry is logged once. |
| `type` | `element` (your custom element), `redirect` (order first, then the browser goes to a page of your module), `redirect-before-order` (your page first: Place Order saves the method and billing address, the order is created by your controller), `form` (declared fields, no JavaScript) |
| `tag`, `module` | `element` only: the tag and the module that defines it |
| `redirect_route` or `redirect_config_path` | `redirect`: exactly one; a store route (`vendor/redirect/start`) or a dot path into the checkout configuration (`payment.vendor_psp.redirectUrl`). `redirect-before-order` needs a route. |
| `redirect_hosts` | bare lower-case host names the shopper may be sent to besides the store |
| `fields` | `form`: one item per field, see below |
| `owns_place_order` | the element completes the order with a control of its own; the checkout's Place Order button is not rendered while it is selected |
| `eager` | the module is imported as soon as the method is offered, and `canMakePayment()` of the element class may hide the row |
| `awaits_ready` | the row shows a placeholder until the element reports `hyperion-payment:ready` |
| `saves_on_selection` | default true; false writes the method to the quote only at Place Order (a method the server refuses without its data) |
| `sort_order`, `options`, `options_provider`, `phrases`, `api_version` | as in the common rules |

A `form` field (`fields` item, the item name is the field name,
`^[a-z][a-z0-9_]*$`): `label`, `type` (`text`, `tel`, `date`, `select`
with `options`), `required`, `pattern`, `target` (`additional_data`, or
`po_number` for at most one field) and `sort_order`. From the sample:

```xml
<item name="hyperion_sample_form" xsi:type="array">
    <item name="method" xsi:type="string">hyperion_sample_form</item>
    <item name="type" xsi:type="string">form</item>
    <item name="saves_on_selection" xsi:type="boolean">false</item>
    <item name="fields" xsi:type="array">
        <item name="reference" xsi:type="array">
            <item name="label" xsi:type="string" translate="true">Sample invoice reference</item>
            <item name="type" xsi:type="string">text</item>
            <item name="required" xsi:type="boolean">true</item>
            <item name="pattern" xsi:type="string">^[A-Z]{2}-[0-9]{4,8}$</item>
            <item name="target" xsi:type="string">additional_data</item>
        </item>
    </item>
</item>
```

The browser receives the winning entry of each active method as
`checkoutConfig.hyperion.paymentRenderers` (`PaymentRendererConfig`).
Hyperion's own entries (offline methods, purchase order, Braintree,
PayPal Express) are in `HyperionCheckout/etc/frontend/di.xml`.

### The element contract

The checkout creates the element, sets `context`, `options`, `method`,
`config` (`checkoutConfig.payment[<code>]`, `{}` when absent) and `token`
(stored payment rows only) BEFORE it connects the element, and never
replaces them. The element is kept for the life of the page, so a switch
to another method and back keeps its state. Members (all optional except
`hyperionApi`):

| Member | Called | Contract |
|---|---|---|
| `static hyperionApi` | load | `'1'`, the major the element was written for |
| `static canMakePayment(args)` | eager entries, when the method is offered, once per page load | false hides the row; the answer is kept until the page is loaded again, so do not base it on a total that can change in the checkout |
| `static describeToken(token)` | stored payment rows of eager entries | `{ label }`, the row title |
| `validate()` | every order attempt, once the gates are open, first of all the elements asked (then the shipping extension and slot elements), before `getPaymentData()` | show what is missing, return a boolean (or a promise of one); `false`, a throw or no answer within 5 s stops the order |
| `getPaymentData(signal)` | Place Order, on the settled quote | tokenize, run 3D Secure; return `PaymentData` (`method`, `po_number`, `additional_data`, `extension_attributes`; `agreement_ids` is refused). A rejection aborts the order and its message is shown. |
| `placeOrder({ signal, data })` | instead of the order request | the order is created elsewhere; resolve a `PlaceOrderOutcome` (`placed`, `redirect`, `canceled`, `failed`) |
| `afterPlaceOrder(order)` | the order exists | where to continue: `success` (default), `redirect`, `post` (an auto-submitted form), `reload` |
| `orderFailed(error)` | the order request failed | drop single use state (a nonce) |
| `ownsPlaceOrder` | after connection and after every event | overrides the entry's `owns_place_order` |

Events, dispatched by the element with `bubbles: true, composed: true`:
`hyperion-payment:ready`, `:valid`, `:invalid` (`{ message }`), `:busy`
(`{ busy, label }`, a heartbeat that keeps a long step alive), `:error`
(`{ message, fatal }`; `fatal` retires the row) and `:request-place-order`
(an element that owns Place Order asks for the order).

The `PaymentContext` gives the element `snapshot()` / `subscribe()` (a
frozen view of the checkout: effective addresses, the selected methods,
items, display and BASE totals, `isSettling`, `blocker`), `rest()` and
`cartPath()` for Magento's web API, `storefront()` for a same-origin
controller of your module ([Calling a controller of your module](#calling-a-controller-of-your-module)), `t()`, `formatPrice()`, `sanitizeHtml()`, `loadScript()`,
`cspNonce`, `designTokens` (resolved colors and font for hosted field
iframes), `urls`, and the order actions `placeOrder(data)` (the same
pipeline as the button), `requestCheckoutValidation()` (the checkout's
gate plus `validate()` of the active shipping extension elements and the
slot elements, so a wallet learns before it opens its sheet what the order
attempt would find; the attempt asks them again),
`savePaymentInformation(data)`, `refreshTotals()` and `setError()`.

A skeleton from the sample card (`HyperionSamplePsp/view/frontend/web/js/hyperion/card.js`):

```js
class SamplePspCard extends HTMLElement {
    static hyperionApi = '1';

    #complete = false; // set when the card field reports a complete number
    #nonce = null;

    validate() {
        if (!this.#complete) {
            // show the error under the field and focus it, then:
            this.#emit('hyperion-payment:invalid', { message: this.context.t('Enter a complete card number.') });
        }
        return this.#complete;
    }

    async getPaymentData(signal) {
        const base = this.context.snapshot().totals.base;
        // tokenize for base.grandTotal in base.currency, run 3D Secure ...
        this.#nonce = `sample-${base.grandTotal.toFixed(2)}-${base.currency}`;
        return { additional_data: { sample_nonce: this.#nonce } };
    }

    orderFailed() { this.#nonce = null; }

    #emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    }
}
if (!customElements.get('sample-psp-card')) customElements.define('sample-psp-card', SamplePspCard);
```

Charge the BASE amount (`snapshot().totals.base`): it is what Magento
records and what a gateway is asked for; the display amounts may be in
another currency.

### The order pipeline

Every order goes the same way, whether the shopper pressed Place Order, an
element asked for it, or an element called `context.placeOrder(data)`:

1. The cancelable `hyperion:checkout:before-place-order` event, the order
   latch, every pending edit put on the quote, the extensions still loading
   awaited, every gate evaluated on what the server confirmed. Something
   missing: the errors are revealed and nothing is sent.
2. `validate()` of the payment element, then of the shipping extension
   elements active for the selected rate (none when no extension is active
   for it), then of every slot element that defines one (5 s each; the
   elements of one kind are asked together, so each shows its own errors).
   `false`, a throw or no answer in time from any of them stops the order
   before any request.
3. `getPaymentData(signal)`, unless the data was handed in. A method that
   leaves the offer meanwhile aborts the signal.
4. The element's `placeOrder()` when it has one, else the checkout's order
   request with the data (`paymentMethod` with `method`, `po_number`,
   `additional_data`, and `extension_attributes` next to the accepted
   agreements).
5. No order: `orderFailed()` once, the latch is given back.
6. Order placed: `afterPlaceOrder()` says where to continue; redirects are
   followed only to the store's origin or a host of `redirect_hosts`.

An element never writes to the quote on its own: it goes through
`context.savePaymentInformation()` or `context.placeOrder()`, which use the
checkout's write queue. When an element's own `placeOrder()` times out, the
checkout reads the cart to learn whether an order exists before it lets the
shopper try again.

The method behind an entry is an ordinary Magento payment method
(`etc/config.xml` with `can_use_checkout` 1, a gateway facade or an
`AbstractMethod` model). `additional_data` reaches core's `assignData()`:
copy what the gateway needs to the payment's `additional_information` in an
observer of `payment_method_assign_data_<code>`; its values arrive as
strings (`PaymentInterface::getAdditionalData()` is `string[]`). The page
of a `redirect` entry finds the order as the checkout session's last order
(`Magento\Checkout\Model\Session::getLastRealOrder()`); on a cancel it
cancels the order and gives the cart back with `restoreQuote()`. The sample
payment module does both (`Observer/CardDataAssignObserver.php`,
`Controller/Redirect/ReturnAction.php`).

### Stored payment methods (vault)

The vault method code (`<code>_vault`) needs an entry of its own; it may
name the same tag and module, and the element tells the rows apart by its
`token` property (`publicHash`, `paymentMethodCode`, `details`). The tokens
come from core's `Magento\Vault\Model\Ui\TokensConfigProvider`
(`checkoutConfig.payment.vault`), so register a
`TokenUiComponentProviderInterface` for your method as for any Magento
checkout. Each token is a row of its own, ahead of the other methods; its
title is `describeToken()` of the element class when the entry is `eager`,
else built from the token details. A stored card is ordered with its public hash in `additional_data`.

### Methods without a renderer

An active payment method that no entry serves is not shown to shoppers:
it is never listed and never preselected, so an order can never reach a
gateway without that gateway's data. When the store offers no method at
all, the list says "No payment method is available for this order."

To see what is hidden:

- **On the storefront:** in developer mode, or in any mode with
  `?hyperion_debug_payments=1` on the checkout URL, every hidden method
  shows as a disabled row with its code and the reason (no renderer, could
  not be loaded, written for another checkout version, stopped with an
  error), with "Try again" for a failed load.
- **On the command line:** `bin/magento hyperion:checkout:payments
  [--store=<code>]` lists every active method of each store view with the
  entry, type and renderer that serve it, or `no renderer`, or `not offered
  in checkout`.
- **In the admin:** a system message names the hidden methods, and Stores >
  Configuration > Hyperion Theme > Checkout > Payment methods > "Hidden
  payment methods" lists them per store view with the time of the last
  check. The checkout page checks at most once an hour per store view and
  writes one warning to `var/log/system.log` when something is hidden;
  saving the payment configuration clears the report.

## Express buttons

An entry of `Model\Payment\ExpressButtonPool` renders a button in one or
more placements. From the sample payment module:

```xml
<type name="Magentofullstackdev\HyperionCheckout\Model\Payment\ExpressButtonPool">
    <arguments>
        <argument name="buttons" xsi:type="array">
            <item name="hyperion_sample_express" xsi:type="array">
                <item name="placements" xsi:type="array">
                    <item name="cart" xsi:type="string">cart</item>
                    <item name="product" xsi:type="string">product</item>
                    <item name="checkout_top" xsi:type="string">checkout-top</item>
                </item>
                <item name="tag" xsi:type="string">sample-psp-express</item>
                <item name="module" xsi:type="string">Magentofullstackdev_HyperionSamplePsp::js/hyperion/express.js</item>
                <item name="reserved_height" xsi:type="number">45</item>
                <item name="sort_order" xsi:type="number">90</item>
                <item name="provider" xsi:type="string">Magentofullstackdev\HyperionSamplePsp\Model\Hyperion\ExpressButton</item>
                <item name="phrases" xsi:type="array">
                    <item name="pay" xsi:type="string" translate="true">Pay with Sample</item>
                </item>
            </item>
        </argument>
    </arguments>
</type>
```

Keys: `placements`, `tag`, `module`, `reserved_height` (the height in
pixels the button takes once rendered, 24 to 200), `sort_order`,
`provider`, `options`, `phrases`, `redirect_hosts`, `api_version`. The keys
`client_gate` and `max_buttons` are reserved for a later release (accepted,
ignored, one notice). A `provider` implements
`Api\ExpressButtonProviderInterface`:
`isAvailable(string $placement, ?\Magento\Catalog\Api\Data\ProductInterface $product): bool`
and `getOptions(string $placement, ?\Magento\Catalog\Api\Data\ProductInterface $product): array`
(merged over the static `options`). `$product` is the page's product on the
`product` placement and null on the others. On the product placement the
page is cached at the edge and in the block cache: decide from
configuration and the product only, never from the session.

| Placement | Where | Layout |
|---|---|---|
| `product` | under Add to Cart (not on the cart line edit page) | container `hyperion.express.product` (alias `express`) in `catalog_product_view` |
| `cart` | under Proceed to Checkout | container `hyperion.express.cart` in `hyperion_cart_extensions` |
| `minicart` | under the mini-cart checkout link | container `hyperion.express.minicart` in `hyperion_checkout_minicart` |
| `checkout-top` | above the checkout | block `hyperion.express.checkout` in `hyperion_checkout_index` |

Each container holds a slot block (`Magentofullstackdev_HyperionCheckout::express/slot.phtml`)
that prints `<hyperion-express-slot>` with one box per available button at
its reserved height, so nothing moves when a button arrives. Nothing is
printed for a visitor who may not buy (catalog mode), and the cart and
mini-cart placements are left out while the cart cannot go to the checkout.
Another block placed in the same container renders next to the slot.

The element receives `context` (`ExpressContext`), `options` and
`placement` before it is connected. The context offers `t()`,
`storefront()` ([Calling a controller of your module](#calling-a-controller-of-your-module)),
`addCurrentProductToCart()` (product placement: posts the page's own add to
cart form, options and quantity validated, with the request header
`X-Hyperion-Express: 1`, so the server never answers that add with the
redirect to the cart, whatever `checkout/cart/redirect_to_cart` says; a
button that posts the add itself as an htmx request sends the same header,
any non-empty value), `getCart()` (the visitor's
cart from `GET hyperion/cart/summary`: masked id for a shopper who is not
signed in, item count, display and base totals; never an email or an
address), `notify()`, `loadScript()`, `cspNonce`, `redirect()` (same
origin or a host of `redirect_hosts`) and the loading policy. The context
has no order call: after the click the button runs its own flow, calls a
controller of its module with `storefront()` and sends the shopper to that
module's review page or to the checkout with `redirect()`, as core's PayPal
Express does with its own controllers.

**Loading policy.** The slot imports a module only once its box is near the
viewport or touched. A button must not load a payment SDK before one of
`context.whenWanted()` (near the viewport and the page loaded),
`context.whenEngaged()` (a first real interaction: pointer, scroll, touch,
key or focus move) or `context.whenPageIdle()` resolves: a page nobody uses
never downloads a wallet SDK.

**Events** (bubbling, composed): `hyperion-express:ready` (marks the box
ready), `hyperion-express:unavailable` (the box collapses, only when that
cannot move what the shopper sees) and `hyperion-express:error`
(`{ message }`, shown in the page toast). A module that fails to load
counts as unavailable. The cart and the mini-cart are re-rendered by htmx
swaps: a new slot creates new elements, so an element must tolerate being
created again. The cart summary route is rate limited per client
(`hyperion/security/cart_summary_limit`, 20 requests per 10 seconds by
default, an admin field of the Anti-Abuse Shield group:
[Configuration](./configuration.md#hyperion-theme-hyperion)).

The first-party PayPal smart buttons are an entry of the same pool
(`paypal_express`, product, cart and mini-cart placements).

## Shipping extensions

An entry of `Model\Shipping\ExtensionPool` attaches an element to a
shipping rate, under the rate list, or in place of the address. From the
sample extension module
(`dev/modules/Magentofullstackdev/HyperionSampleExtension/etc/frontend/di.xml`):

```xml
<type name="Magentofullstackdev\HyperionCheckout\Model\Shipping\ExtensionPool">
    <arguments>
        <argument name="extensions" xsi:type="array">
            <item name="hyperion_sample_locker" xsi:type="array">
                <item name="match" xsi:type="array">
                    <item name="carrier" xsi:type="string">hyperionlocker</item>
                    <item name="method" xsi:type="string">*</item>
                </item>
                <item name="slot" xsi:type="string">below-method</item>
                <item name="tag" xsi:type="string">sample-locker-picker</item>
                <item name="module" xsi:type="string">Magentofullstackdev_HyperionSampleExtension::js/hyperion/locker-picker.js</item>
                <item name="required" xsi:type="boolean">true</item>
                <item name="sort_order" xsi:type="number">10</item>
                <item name="options_provider" xsi:type="string">Magentofullstackdev\HyperionSampleExtension\Model\Hyperion\LockerOptions</item>
                <item name="value_provider" xsi:type="string">Magentofullstackdev\HyperionSampleExtension\Model\Hyperion\LockerValue</item>
                <item name="phrases" xsi:type="array">
                    <item name="choose" xsi:type="string" translate="true">Choose a pickup point.</item>
                </item>
            </item>
        </argument>
    </arguments>
</type>
```

| Key | Meaning |
|---|---|
| `match` | `carrier` and / or `method`: an exact code, `*`, or a regular expression between slashes (`/locker_\w+/`) that must match the whole code. Required for `below-method`; without it the entry is always active (`after-methods`, `replaces-address`). An invalid `match` drops the entry. |
| `slot` | `below-method` (inside the row of the selected rate), `after-methods` (under the rate list), `replaces-address` (in place of the address editor) |
| `tag`, `module` | the element and its module |
| `required` | Place Order waits until the element reports valid |
| `value_provider` | `Api\ShippingExtensionValueProviderInterface::getValue(\Magento\Quote\Api\Data\CartInterface $quote): ?array`, what the quote already holds, so a reload restores the choice: null, or an array with the keys of `hyperion-shipping:data` (`address`, `information`, `summary` with `label` and up to three `lines`, `state`); other keys are dropped, a malformed value drops the entry for that page |
| `kit` | reserved for a later release: an entry that uses it is dropped |
| `sort_order`, `options`, `options_provider`, `phrases`, `api_version` | as in the common rules |

Nothing is emitted for a virtual quote. An entry is active when it has no
`match` or its `match` fits the SELECTED rate; its element is created on
first activation, once per entry and rate, and kept. It receives
`context` (`ShippingContext`, with `extensionId`), `options`, `method` (the
matched rate, null without `match`) and `value` (its last reported value,
else what the quote holds, else the tab's draft) before it is connected;
`method` and `value` are set again when they change.

**Events** (bubbling, composed):

| Event | Detail | Effect |
|---|---|---|
| `hyperion-shipping:data` | `{ address?, information?, summary?, state? }` | `address` is merged into `shipping_address.extension_attributes` and `information` into `addressInformation.extension_attributes` of the next shipping save; `summary` (`label` and up to three `lines`, plain text) shows under the shipping row of the order summary; `state` is handed back in `value` and never sent. A NEW value marks the step as ahead of the quote and saves after 300 ms; the same value reported again changes nothing. |
| `hyperion-shipping:valid` / `:invalid` | `{ message }` for invalid | the gate of a required entry |
| `hyperion-shipping:address-override` | `{ address, keepContact, separateBilling }` | puts `address` in place of the typed one (`keepContact` keeps the shopper's name and telephone, `separateBilling` asks for a billing address of its own); `null` gives the address back. The rates and the save follow at once. |
| `hyperion-shipping:rates-refresh` | `{}` | asks the carriers again |

**A new value resets validity: report validity after every data event.**
A required entry is valid only once it reported `:valid` after its last new
value. While a required entry active for the selected rate is not valid,
the shipping information is not saved (the carrier would refuse the rate
without the extension's data) and Place Order shows the element's message.
An element may also define `validate()`, returning `true` or `false` or a
promise of one: every order attempt asks the elements active for the
selected rate, after the payment element and before the slot elements, once
per press (also when the press finds the order blocked). Anything but
`true`, a throw or no answer within 5 seconds stops the order before any
request and counts as not valid, so the element shows its own errors before
it answers. A pick (value, validity and address override reported
together) sends one shipping save, 300 ms later. The held save goes out
as soon as the element reports valid.

When the shipping extension code of the checkout cannot be loaded (it is
tried twice), a rate that a required entry may apply to stays held and
Place Order says "This delivery option could not be loaded."; a `match`
written as a pattern counts as applying then. Every other rate is saved and
ordered as usual.

The keys of an entry that is no longer active (another rate) leave the
quote with the next save, and an override goes with its entry. Declare
your extension attribute codes on `Magento\Quote\Api\Data\AddressInterface`
or `Magento\Checkout\Api\Data\ShippingInformationInterface` in
`etc/extension_attributes.xml`, and validate and store them in your
module, for example with a plugin on
`Magento\Checkout\Model\ShippingInformationManagement::saveAddressInformation`
declared in the GLOBAL `etc/di.xml` (the checkout's requests run in the
`webapi_rest` area). The sample module does exactly that and copies the
value to the order address.

## Checkout extensions and slots

An entry of the `extensions` argument of `Model\Checkout\ExtensionPool`
loads a module whose default export receives the extension API, and may
declare elements for the checkout's slots. From the sample extension
module:

```xml
<type name="Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionPool">
    <arguments>
        <argument name="extensions" xsi:type="array">
            <item name="hyperion_sample_checkout" xsi:type="array">
                <item name="module" xsi:type="string">Magentofullstackdev_HyperionSampleExtension::js/hyperion/checkout-extension.js</item>
                <item name="required" xsi:type="boolean">true</item>
                <item name="slots" xsi:type="array">
                    <item name="confirmation" xsi:type="array">
                        <item name="slot" xsi:type="string">after-agreements</item>
                        <item name="tag" xsi:type="string">sample-checkout-confirmation</item>
                    </item>
                </item>
                <item name="phrases" xsi:type="array">
                    <item name="gate" xsi:type="string" translate="true">Tick the sample confirmation</item>
                </item>
            </item>
        </argument>
    </arguments>
</type>
```

Keys: `module`, `required` (Place Order waits for the module; a failed load
blocks the order), `slots` (items with `slot`, `tag`, `sort_order`),
`options`, `options_provider`, `phrases`, `api_version`. An item needs a
`module` or `slots`.

**Slots:** `after-email`, `after-shipping-address`, `after-shipping-methods`,
`before-payment-methods`, `after-agreements`, `before-place-order`,
`summary-after-totals`. A slot takes no space while it is empty. A slot
element receives `context`, `options` (the entry's static `options` merged
with its `options_provider` result, the same values as `api.options`) and
`slot` before it is connected. It
may define `validate()`, returning `true` or `false` or a promise of one:
the checkout calls it on every order attempt, once the gates are open and
the payment element and the active shipping extension elements validated,
before the payment data is collected and before any order request. `false`, a throw or no answer within 5 seconds
stops the order like a closed gate, so the element shows its own errors
before it answers. A gate (below) keeps Place Order closed beforehand.

**The module** exports `hyperionApi` (`'1'`) and a default function. It is
imported after the first render, on idle; nothing of it is in the page's
first frame. A shortened `checkout-extension.js` of the sample (the
element and the gate share one state object):

```js
export const hyperionApi = '1';

const TAG = 'sample-checkout-confirmation';
const state = { confirmed: false, listeners: new Set() };

class SampleCheckoutConfirmation extends HTMLElement {
    static hyperionApi = '1';

    connectedCallback() {
        if (this.firstChild) return;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = state.confirmed;
        box.addEventListener('change', () => {
            state.confirmed = box.checked;
            for (const listener of state.listeners) listener();
        });
        const label = document.createElement('label');
        label.append(box, ' ', this.context.t('I confirm this is a sample order'));
        this.append(label);
    }

    validate() { return state.confirmed; }
}

export default function register(api) {
    if (!customElements.get(TAG)) customElements.define(TAG, SampleCheckoutConfirmation);

    const gate = api.registerGate(() => (state.confirmed ? null : api.context.t('Tick the sample confirmation')));
    state.listeners.add(() => gate.refresh());

    api.filter('paymentInformation', (payload) => ({
        ...payload,
        paymentMethod: {
            ...payload.paymentMethod,
            extension_attributes: { ...(payload.paymentMethod.extension_attributes ?? {}), hyperion_sample_confirmation: 'confirmed' },
        },
    }));
}
```

The API (`CheckoutExtensionApi`):

- `registerSlot(slot, tag, { sortOrder })`: an element for a slot, from code.
- `registerGate(fn)`: `fn(snapshot)` returns a translated reason that keeps
  Place Order closed, or null. It is evaluated on every snapshot change, on
  `refresh()` and at Place Order. When nothing of the checkout's own is
  missing, the reason of the first closed gate is the hint under the
  button.
- `filter(name, fn)`: `shippingInformation`, `paymentInformation` (the
  order request and `set-payment-information`) or `billingAddress`. `fn`
  receives a deep copy of the request body and the snapshot and returns the
  body to send. It must be synchronous and pure; the checkout's own keys
  are restored after it.
- `context`, `options`, `name`, `apiVersion`.

**DOM events** on `<checkout-app>` (bubbling, composed, no personal data in
the details): `hyperion:checkout:ready`, `:shipping-method-applied`,
`:payment-method-selected`, `:totals-updated`, `:before-place-order`
(cancelable: `preventDefault()` stops the order; pair it with a gate so the
shopper is told why), `:order-placed` and `:error` (`{ kind, section }`).

The first-party order comment and newsletter opt-in
([Checkout](./checkout.md#order-comment-and-newsletter-opt-in)) are entries
of this pool too.

### Address fields

Items of the `address_fields` argument of the same pool add fields to the
shipping and / or billing form. The item name is the field code. From the
sample:

```xml
<argument name="address_fields" xsi:type="array">
    <item name="hyperion_sample_tax_code" xsi:type="array">
        <item name="label" xsi:type="string" translate="true">Sample tax code</item>
        <item name="type" xsi:type="string">text</item>
        <item name="target" xsi:type="string">extension_attributes</item>
        <item name="forms" xsi:type="array">
            <item name="billing" xsi:type="string">billing</item>
        </item>
        <item name="required" xsi:type="boolean">true</item>
        <item name="pattern" xsi:type="string">^[A-Z0-9]{6,16}$</item>
        <item name="max_length" xsi:type="number">16</item>
        <item name="countries" xsi:type="array">
            <item name="it" xsi:type="string">IT</item>
        </item>
        <item name="hint" xsi:type="string" translate="true">Six to sixteen letters or digits.</item>
        <item name="sort_order" xsi:type="number">200</item>
    </item>
</argument>
```

| Key | Meaning |
|---|---|
| `target` | `custom_attributes` (the code must be a `customer_address` EAV attribute; label and options default to the attribute's) or `extension_attributes` (a label is required) |
| `type` | `text` (default), `tel`, `email`, `date`, `select` (needs `options`), `checkbox` |
| `forms` | `shipping` and / or `billing` (default both) |
| `required`, `pattern`, `max_length` | a missing value, a pattern mismatch (whole value) or a longer value blocks Place Order; an invalid pattern is ignored with an error line |
| `options` | `value => label`, or items with `value` and `label` |
| `countries` | ISO codes the field is shown for (default every country) |
| `autocomplete`, `hint`, `sort_order` | the HTML autocomplete token, a help line, the position (after the built-in fields by default) |

Hyperion renders the field, validates it with the address and carries the
value in the address of the requests (and back from the quote after a
reload); saving it on the quote address and the order is the declaring
module's job. With `target` `extension_attributes`, declare the code for
`Magento\Quote\Api\Data\AddressInterface` in your module's
`etc/extension_attributes.xml`, as for the keys of a shipping extension:
the web API refuses an address that carries an undeclared key.

While "My billing and shipping address are the same" is ticked (a quote
that ships), the shipping address is the billing address too: the shipping
form then shows the fields of both forms, a `billing` only field included
(for its countries), and a required one is part of the shipping address:
the shipping save and Place Order wait for it.

### Total rows

A total your module collects already shows in the cart and the checkout
summary as a plain row with its title and value (none while the value is
zero; a negative value prints like a discount). For a row of your own in
the cart, implement `Api\Cart\TotalRowRendererInterface`,
`render(\Magento\Quote\Model\Quote\Address\Total $total, \Magento\Quote\Model\Quote $quote): array`,
which returns a list of rows (none to show nothing). Each row is an array
of strings:

- `code`: identifies the row (the total code, or a variant of it);
- `label`: the text in front of the amount, already translated;
- `value`: the amount as it prints, already formatted; quote totals are in
  the quote currency, so format them without converting
  (`PriceCurrencyInterface::format()` with the quote's store and currency,
  as the sample's `Model/Cart/SampleFeeRow.php` does);
- `note` (optional): a short text printed after the label in parentheses;
- `kind` (optional, default `regular`): `regular`, `detail` (a smaller
  breakdown line), `discount` (the discount color; the value prints as
  given, sign included) or `grand` (the grand total style).

A row without a string `code`, `label` or `value` is skipped and logged.
Register the class name for the total code:

```xml
<type name="Magentofullstackdev\HyperionCheckout\Model\Cart\TotalRowPool">
    <arguments>
        <argument name="renderers" xsi:type="array">
            <item name="hyperion_sample_fee" xsi:type="string">Magentofullstackdev\HyperionSampleExtension\Model\Cart\SampleFeeRow</item>
        </argument>
    </arguments>
</type>
```

The renderer is built the first time a quote carries its total. An
unusable one (unknown class, wrong interface, a throw) is logged and the
total prints as the plain row. The renderer may read the quote, never write
it. Its rows show where the server renders the totals: the cart page and
its htmx updates, and the summary of the PayPal review page. The checkout
summary builds its rows in the browser from the REST totals: it prints the
total as the plain row with its title and value, whatever renderer it has.

## Storefront containers

Containers have no HTML tag: an empty one prints nothing. Add a block with
`<referenceContainer name="...">` in your module's layout, or move a block
there with `<move>`.

| Container or block | Page (handle) | Where, and what it is for |
|---|---|---|
| `hyperion.product.media.after` | product (`catalog_product_view`) | under the gallery |
| `hyperion.product.info.top` | product | under the title |
| `hyperion.product.info.after_price` | product | under the price |
| `hyperion.product.info.before_addtocart` | product | above Add to Cart |
| `hyperion.product.form.additional` | product | inside the add to cart form: its inputs post with the cart add |
| `hyperion.express.product` | product | the express buttons, under Add to Cart |
| `hyperion.product.info.after_addtocart` | product | under Add to Cart (not on the cart line edit page) |
| `hyperion.product.info.extra` | product | end of the info column |
| `hyperion.product.tabs` | product | a child with a `title` argument that prints something becomes a tab |
| `product.info.bundle.options.top` (core) | bundle product (`catalog_product_view_type_bundle`) | above the bundle options |
| `category.product.list.additional` (core) | category (`catalog_category_view`) | above the toolbar, first render of the grid only (not on "Load more") |
| `category.product.type.details.renderers` (core) | category, search (`catalogsearch_result_index`, `catalogsearch_advanced_result`) | per tile under the price: register a renderer under a product type alias (core's own `default` child exists) |
| `category.product.addto`, `catalogsearch.product.addto` (core) | category, search | per tile, end of the tile actions |
| `hyperion.cart.totals.before` | cart and its htmx fragment (`hyperion_cart_extensions`) | top of the summary card |
| `hyperion.cart.totals.after` | cart and its fragment | after the totals rows, before the checkout link |
| `hyperion.express.cart` | cart and its fragment | the express buttons, under the checkout link |
| `hyperion.express.minicart` | mini-cart (`hyperion_checkout_minicart`) | the express buttons |
| `top.links` (core) | every page (`default`) | header links: the account dropdown and the phone drawer. Core's own children (welcome, account, register, sign in, wish list, compare) are removed; the header renders those itself. A child is a link block (`Magento\Framework\View\Element\Html\Link` or a subclass, one `<li>` each, rendered through core's `Html\Links::renderLink()`); the list prints twice, in the dropdown and in the drawer, so a child carries no `id`. |
| `footer_links` (core) | every page | the service links of the footer (link blocks with a label and `getHref()`) |
| `hyperion.account.sidebar` | account pages (`customer_account`) | under the account menu; Hyperion's own children are the wish list and compare sidebars and `hyperion.reorder.sidebar` (Recently Ordered, `ifconfig="sales/reorder/allow"`, `cacheable="false"`), each removable by name |
| `hyperion.dashboard.recently_viewed` (block) | account dashboard (`customer_account_index`) | the recently viewed products, filled from the browser's history; remove it by name |
| `customer_account_dashboard_top` (core block) | account dashboard (`customer_account_index`) | its children print above the recent orders |
| `customer.account.dashboard.info.extra` (child alias) | account dashboard | end of the contact card |
| `customer.account.dashboard.info.blocks` (core) | account dashboard | under the contact and address cards |
| `sales.order.history.extra.column.header`, `sales.order.history.extra.container` (core) | order history (`sales_order_history`) | an extra column, shown only when something prints in it |
| `sales.order.info.buttons` (core) | order view, invoice, shipment, credit memo; customer and guest | its children print next to the order actions |
| `customer.login.container` (core) | sign in (`customer_account_login`) | under the sign in form (social sign in, notices) |
| `login-as-customer-notice-links` (core name) | the Login as Customer banner (`hyperion_customer_lac_notice`) | next to the "Close Session" form, only in the banner of an impersonated session |
| `paypal.additional.actions` (core block) | PayPal review (`paypal_express_review`, `paypal_payflowexpress_review`, and the Braintree PayPal and Google Pay review pages) | under the address, shipping and payment cards; core's coupon child is never printed (a discount is applied in the cart) |

The cache contract of each place:

- **Product page, listings, header, footer, sign in page:** the pages are
  cached at the edge and `hyperion.product.view`, `category.products.list`
  and `search_result_list` are block cached. A child must be session
  agnostic and must NOT be `cacheable="false"` (that would make every such
  page uncacheable). Content that depends on the visitor renders client side
  or through an htmx fragment. The cache identities of blocks placed in the
  product page containers and the tile hooks are added to the cache tags of
  their parent block (`HyperionCore\Model\Cache\ContainerIdentities`), so a
  product save purges them.
- **Cart, mini-cart, account and order pages, the PayPal review page and
  the Login as Customer banner:** private. A child may read the session
  and the quote. The banner is the header state fragment of an
  impersonated session (its block is `cacheable="false"`): a child of
  `login-as-customer-notice-links` there never reaches a cached page. The cart containers are rendered again for
  every cart change (they are part of the swapped summary card): declare a
  block once in your module's `hyperion_cart_extensions.xml` and it shows
  on the page and after every htmx update. No inline script (htmx drops it)
  and no id that something outside the card points at.
- A child that needs RequireJS, Knockout or `x-magento-init` does not run
  on Hyperion.

Core's `login-as-customer-notice-links` container of the `default` handle
is not printed (it would end up on cached pages): declare the block in the
`hyperion_customer_lac_notice` handle instead. The PayPal review page has no
totals container of its own: a total your module collects shows in its
summary through the cart total rows ([Total rows](#total-rows)).

### Events of the storefront

Two `HyperionCore` events let a module add markup to answers without a
plugin on a Hyperion class:

- `hyperion_htmx_action_response`, dispatched for every htmx action answer
  (cart add, update, delete, coupon, wish list and compare add / remove,
  move to wish list). Data: `action` (`cart_add`, `cart_update`,
  `cart_delete`, `coupon`, `wishlist_add`, `wishlist_remove`,
  `wishlist_fromcart`, `compare_add`, `compare_remove`), `messages` (read
  only) and `transport` (a `DataObject` with `additional_html`). An add
  that answers with a redirect to the cart (`checkout/cart/redirect_to_cart`
  on Yes, never for an add marked `X-Hyperion-Express`) has no body and
  dispatches no event.
- `hyperion_header_state_render_after`, dispatched once per
  `hyperion/header/state` answer. Data: `fragments` (the header state pool
  list) and `transport` (`additional_html`).

Append to `additional_html` so the markup of other observers stays:
`$transport->setData('additional_html', $transport->getData('additional_html') . $html)`.
The markup is appended to the answer as given: out of band elements
(`hx-swap-oob` and the id of their target), no `<script>`. The target must
exist on every page that receives the answer (htmx logs
`htmx:oobErrorNoTarget` as a console error when it does not); the header
state answer reaches every page, so put its target in a session agnostic
block of your own in core's `after.body.start` container. Both answers are
private, so an observer may read the session. An observer that throws is
logged and the answer goes out without the added markup; the answer itself
is never lost.

### Custom customer and address attributes

The registration, account edit and address forms print the visible,
user-defined customer and address attributes assigned to the form
(`customer_account_create`, `customer_account_edit`,
`customer_address_edit`, `customer_register_address`) through a generic
renderer, `Magentofullstackdev_HyperionCustomer::form/user-attributes.phtml`
with the view model `HyperionCustomer\ViewModel\UserAttributes`. Saving
needs nothing more: core's form extraction reads and validates every
attribute of the form code. Supported inputs: text, text area, date, yes /
no, dropdown, multiple select and multiline; other input types (file,
image) are skipped.

A module that renders an attribute itself has two ways to keep the generic
renderer out of the way:

- A hook block. A child `customer_form_user_attributes` of the registration
  or account edit form, or `customer_form_address_user_attributes` of the
  address forms, wins: when it prints something the generic renderer does
  not run on that form. On the registration and account edit forms the
  generic renderer also skips a field whose name already appears in the
  output of `fieldset_create_info_additional` / `fieldset_edit_info_additional`.
- The `excludedAttributes` argument, in `etc/frontend/di.xml`, for one
  attribute:

```xml
<type name="Magentofullstackdev\HyperionCustomer\ViewModel\UserAttributes">
    <arguments>
        <argument name="excludedAttributes" xsi:type="array">
            <item name="vendor_loyalty_id" xsi:type="string">vendor_loyalty_id</item>
        </argument>
    </arguments>
</type>
```

The form pages are private (core's form blocks are not cacheable), so a
field may print the customer's own value.

### Theme scope

Code that should act only under the Hyperion theme (or a child of it) asks
`HyperionCore\Model\Design\ThemeScope::isHyperionActive()`, which also
decides whether Hyperion's registry replaces a `$viewModels` that another
module set (`$hyperionViewModels` is the Hyperion registry in every
template). A theme that is not a child of Hyperion but reuses its
templates is added in `etc/frontend/di.xml`, to the `themes` argument of
`ThemeScope` and, to keep the PageBuilder template rewrite, to the
`enabledThemes` argument of `HyperionCms\PageBuilder\Filter\TemplateFilterPlugin`,
which keeps a list of its own:

```xml
<type name="Magentofullstackdev\HyperionCore\Model\Design\ThemeScope">
    <arguments>
        <argument name="themes" xsi:type="array">
            <item name="vendor_theme" xsi:type="string">Vendor/theme</item>
        </argument>
    </arguments>
</type>
<type name="Magentofullstackdev\HyperionCms\PageBuilder\Filter\TemplateFilterPlugin">
    <arguments>
        <argument name="enabledThemes" xsi:type="array">
            <item name="vendor_theme" xsi:type="string">Vendor/theme</item>
        </argument>
    </arguments>
</type>
```

## Styling an element

Every element is light DOM in the page. The theme stylesheet reaches it
everywhere; inside `<checkout-app>` the checkout's own Tailwind build
(scoped to `checkout-app`, no preflight) applies as well. Each build holds
only the utility classes its own sources use, so a utility class that only
your module writes may not exist. Style an element with CSS of your own (a
stylesheet your module adds to the page in its layout, or styles the
element sets) built on the theme's custom properties, for example
`rgb(var(--color-primary))` (the tokens of
`@magentofullstackdev/hyperion-shared/tokens/*`), so a child theme's colors
reach it too.

## Content Security Policy

- Modules are ES modules imported from the store's own origin or its static
  files origin. When static files are served from another host (a CDN),
  that origin must be allowed for scripts by the store's policy, as for
  every other static file.
- A gateway SDK, an iframe host or an API host your element talks to goes
  into your module's `etc/csp_whitelist.xml` (`script-src`, `frame-src`,
  `connect-src`), as for any Magento module. Hyperion's own list is empty:
  the checkout itself is same origin.
- Load third-party scripts with `context.loadScript(url, attributes)`: it
  loads each URL once, adds the page's CSP nonce, and forgets a failed load
  so a retry can succeed. The nonce is also available as `context.cspNonce`.
- No inline script, no `eval`, no inline event handler attributes.

## Testing and the sample modules

**The testing kit.** `@magentofullstackdev/hyperion-checkout/testing` is a
dependency free set of helpers for unit tests of your elements: mock
contexts (`createMockPaymentContext()`, `createMockShippingContext()`,
`createMockCheckoutContext()`, `createMockExpressContext()`, with recorded
calls and canned REST and storefront answers), `createSnapshot()`, mount
helpers (`mountPaymentElement()`, `mountShippingElement()`,
`mountSlotElement()`, `mountExpressElement()`), `recordEvents()`, and two
contract suites that run in any test runner:

```js
import { describe, it, expect } from 'vitest';
import { runPaymentRendererContract } from '@magentofullstackdev/hyperion-checkout/testing';
import '../view/frontend/web/js/hyperion/card.js';

describe('sample-psp-card', () => {
    runPaymentRendererContract({ tag: 'sample-psp-card', it, expect, options: { awaitsReady: true } });
});
```

`runShippingExtensionContract()` does the same for a shipping element. The
kit also ships a harness page (`testing/harness.html`, `pnpm --filter
@magentofullstackdev/hyperion-checkout dev:harness` in a checkout of this
repository) that mounts an element with a panel to change the snapshot and
logs every event and context call. Open it with
`/harness.html?module=<module URL>&tag=<element tag>&type=payment|shipping|slot|express`;
a module outside the package is passed as a same-origin path
(`/@fs/<absolute path>/card.js`). The dev server (port 5176) reads only the
package, the working directory it was started from, the sample modules of a
repository checkout (`dev/modules/`) and the directories listed in
`HYPERION_HARNESS_ALLOW` (separated like `PATH`); any other path answers 403.
In a project of your own that installed the package, install `vite` too
(the package lists it as a development dependency only) and start the
same server from the project root:
`npx vite --config node_modules/@magentofullstackdev/hyperion-checkout/testing/vite.config.js`,
then open `http://localhost:5176/harness.html?module=/@fs/<absolute path>/card.js&tag=<tag>&type=payment`.
The harness imports the module and waits for the tag to be defined: it
mounts payment, shipping and express elements and slot elements whose
module defines the tag on import, not an element defined only inside a
checkout extension's `register(api)`
([Known limitations](./known-limitations.md#other-notes)).

**The sample modules** are worked examples of every point above, written
against the public contract only:

- `dev/modules/Magentofullstackdev/HyperionSamplePsp`: a fake payment
  provider with a card (hosted field iframe, 3D Secure challenge, stored
  cards), a hosted page redirect, a declarative form and an express button.
- `dev/modules/Magentofullstackdev/HyperionSampleExtension`: a pickup locker
  carrier with its picker, a generic extension (slot, gate, request filter),
  an address field, a cart total with its row renderer, and marker blocks in
  every storefront container and both events.

They are development and test aids: they are not part of the Composer
packages or of a release archive, and every feature in them is off by
default (`hyperion_sample/general/enabled`,
`hyperion_sample_extension/general/enabled`). In a checkout of this
repository, `node frontend/e2e/install-dev-modules.mjs <slotDir>` copies
them into a Magento install and enables them, and the end to end scripts
`pw-payment-api.mjs`, `pw-shipping-extensions.mjs` and
`pw-extension-points.mjs` drive them ([Development](./development.md#end-to-end-suite)).
