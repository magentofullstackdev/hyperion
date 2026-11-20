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

The controller for `/checkout`
(`HyperionCheckout\Controller\Index\Index`) extends core's checkout
controller and lets it run, so core's guards apply (one-page checkout
enabled, a cart with items, no quote error, the minimum order amount) and so
does every plugin a module declares on
`Magento\Checkout\Controller\Index\Index`. The layout handle of the Lit
checkout (`hyperion_checkout_index`) is added by an observer of
`layout_load_before` (`Observer\AddCheckoutHandle`) while the flag is 1.
Two things differ from core: a guest who may not check out is sent to the
login page with a notice and returns to the checkout after signing in (core
sends to the cart), and a shopper core sends back to the cart for a quote
error or the minimum order amount gets the reason as a notice there.

## What it renders

One page, in this order:

1. Email with inline sign-in for guests, or the customer's saved addresses
   for logged-in customers. The inline sign-in goes through the storefront's
   own AJAX login (`customer/ajax/login`): the customer session starts, core
   merges the guest cart into the customer's cart, and the checkout reloads
   as the logged-in customer (see [Inline sign-in](#inline-sign-in)). The
   email check behind it runs only when Stores > Configuration >
   Sales > Checkout > Checkout Options > "Enable Guest Checkout Login"
   (`checkout/options/enable_guest_checkout_login`) is Yes; it is No by
   default, and then guests simply check out as guests and no availability
   request is sent. A guest's email and
   addresses survive a reload: the quote's data is emitted as
   `checkoutConfig.hyperion.guestQuote` and hydrates the form at boot, the
   way a customer's quote does, and what was typed but not saved yet comes
   back from the draft (see [Drafts](#drafts-typed-data-kept-in-the-browser)).
2. Shipping address (`<address-form>` with country / region selection,
   company, telephone, fax and VAT according to the `customer/address/*`
   settings, name prefix / middle name / suffix according to
   `customer/address/prefix_show`, `middlename_show`, `suffix_show`) and
   shipping methods. A postcode is required unless the country is in
   `general/country/optional_zip_countries`; the format patterns of
   `zip_codes.xml` only produce a warning with the examples under the field
   (like core's checkout), the address stays complete and the value is sent
   as typed. A region is required for the countries of
   `general/region/state_required` and shown for the others only when
   `general/region/display_all` is on; the countries of
   `general/country/destinations` are listed first in the country select.
   A carrier's error rate is listed as a disabled notice (carrier
   title and message) and never selected; when the shopper has not chosen a
   method, a single offered rate is selected and among several the one
   `hyperion_checkout/shipping/preselect` names (the cheapest by default);
   the in-store pickup rate
   (`instore` / `pickup`) is not listed, because the checkout has no pickup
   location step. The whole section is skipped for virtual quotes
   (downloadable and virtual products only).
3. Payment methods, billing address, checkout agreements, the security
   checks of the order when the store requires one, and the Place Order
   button, whose label carries the amount once the totals are settled.
4. Order summary with items (options and downloadable links as text), the
   coupon form and the totals. On a wide screen it is a rail beside the
   steps, always open. On a narrow screen it is the first block of the page:
   a bar that shows the number of items and the grand total at all times and
   opens to the same content, and the total is repeated beside Place Order.
   A total the checkout has no row of its own for (one a third party
   collector adds) is listed as a plain row with its title and value, in
   the cart and in the checkout summary alike; rows that are empty or zero
   are left out.

Messages entered in the cart (gift messages, coupons) are kept; the checkout
offers its own gift message editor (see Gift messages) and no coupon form on
the PayPal review page. When the merchant enables the shipping policy
(`shipping/shipping_policy/*`) the shipping step shows a "See our shipping
policy" button that opens the text in a dialog.

## Order safety

Place Order never sends an order the server has not confirmed the inputs of:

- **The form and the quote must agree.** An edit of the shipping address or
  of the method marks the shipping step as ahead of the quote until the
  save for the current values came back. A press of Place Order first puts
  every pending edit on the quote (the typing pauses are cut short, the
  requests in flight are awaited) and only then reads whether the order can
  be placed; while something is still missing the press says what: every
  form shows its errors, one hint line names the first missing piece (the
  address, the shipping method, the payment, the purchase order number, the
  terms, the security check) and the keyboard focus moves to the first
  invalid field.
- **One order.** From the press until the success page loads the button
  stays locked; a double click, Enter held down or a second press send
  nothing. An overlay covers the page while the order request is out, while
  its outcome is being confirmed and once the order exists; it is not shown
  during the payment method's own step, so a 3D Secure challenge or a wallet
  sheet stays reachable. A checkout page restored from the browser's back /
  forward cache reloads.
- **A lost answer is resolved, not guessed.** See
  [When the answer to the order is lost](#when-the-answer-to-the-order-is-lost).
- **An HTML error body is never shown.** A response that is not JSON (a
  proxy or web server error page) is neither data nor a message; the
  checkout prints its own text for the kind of failure.
- **Wallets use the same gate.** PayPal Express, Braintree PayPal and Google
  Pay check what the checkout's own button checks before they start
  (`payment-renderers/checkout-gate.ts`). The PayPal buttons wait for the
  pending saves inside the click. A Google Pay sheet can only open inside
  the click itself, so when an edit was still being saved the click saves
  it and says so, and the next click pays.

- **A failed order does not keep an authorization open.** When the store
  fails to create the order after the gateway authorized the payment (the
  order could not be saved), Magento reports the failure and leaves the
  authorization at the gateway until it expires; the shopper's next attempt
  authorizes again. `Observer\VoidPaymentOnSubmitFailureObserver` listens to
  `sales_model_service_quote_submit_failure` (every area, so the REST order
  requests of the checkout are covered) and asks the payment method to void
  the authorization, for any gateway method whose `canVoid()` says yes
  (Adobe Payment Services methods are left to that module, which does the
  same for its own orders). The
  outcome goes to `var/log/system.log`: info for a void, warning when
  nothing was voided on purpose (the order row exists, the payment was
  already captured, the method cannot void), error when the void failed.
  The shopper sees the original error either way.

What this recovery does not cover is listed in
[Known limitations](./known-limitations.md#checkout-and-cart-behavior-to-know).

## The flow engine

How the checkout talks to the store, in the terms a merchant or an
integrator needs. The code is `src/store/flow-actions.ts` and the modules
it names.

**One queue for everything that changes the cart.** Shipping information,
the billing address of a virtual cart, the payment method, coupons and gift
messages go through one serialized queue (`store/write-queue.ts`): one
request in flight at any time, first in first out, and a waiting request
replaced by a newer one of the same kind. The payment methods and totals on
screen are taken from the last request of a run; when that request does not
answer with them, the queue reads them once. Place Order empties the queue,
lets the payment method do its step (a card tokenization, a 3D Secure
challenge) and sends the order with the queue closed, so nothing can change
the cart under an order.

**What starts a request.**

| The shopper | The checkout |
|---|---|
| edits a field the shipping rates depend on (country, state, postcode, plus what `hyperion_checkout/shipping/rate_fields` adds) | asks the carriers for rates after a 300 ms pause, as soon as the address has a country, a postcode where the country needs one and a state where it is required; a complete address is saved with the selected method |
| edits any other field (name, street, telephone) | asks for no rates; the address is saved when the form loses the focus, after 1.5 seconds without typing, or at Place Order, whichever comes first |
| picks a shipping method | shows the expected totals at once, saves the method, then shows the totals the store answered |
| edits a separate billing address | on a physical cart it travels with the shipping information (one request); on a virtual cart it has a request of its own after a 500 ms pause |
| selects a payment method | saves it on the cart after 250 ms, so a cart price rule on the payment method shows in the totals before the order |
| applies or removes a coupon | sends it, then reads the shipping rates again (a coupon can make shipping free) |
| types an email | when "Enable Guest Checkout Login" is on, one availability check per value, on leaving the field or after a pause |

An answer is applied only when it still describes what is on screen: rates
are tied to a rate key (the values of the rate fields, trimmed, the postcode
in upper case), and a late answer for another key is dropped. A guest who
types an email and an address with the telephone last causes at most three
requests before the payment methods show: the email check (when enabled),
one rate request and one shipping save.

**The page starts with what the cart already holds.** When the cart has a
shipping address with a method, the page is rendered with the stored rates,
the payment methods and the applied method
(`checkoutConfig.hyperion.initial`, `Model\Checkout\InitialStateConfigProvider`;
nothing is computed for it: no carrier is asked, no total is collected). A
returning shopper, or a shopper who reloads, gets a checkout whose Place
Order is usable as soon as the page paints, with no request before it. Core keeps
only the chosen carrier's rates on a saved cart, so about 200 ms after the
first paint the checkout asks for the full rate list once, in the
background: Place Order stays open meanwhile, the rows on screen keep their
place and a failure of that request is not shown. For a logged-in customer
the addresses of the cart win over the default addresses: a saved address
that is not the default stays selected after a reload.

**Time limits and automatic retries** (`api/client.ts`). Every request has a
limit: 15 seconds for a read, 20 for a save, 60 for the order. A read that
got no answer (connection failure or timeout) is repeated after 1 and 3
seconds, and a read answered 502 / 503 / 504 once after 2 seconds. A request
that can be sent again without harm (a rate request, the shipping
information, the billing address, the payment method, a coupon) is repeated
once after 1 second when it got no answer. Only then is the failure shown.
The order request is never sent twice by anything, and nothing is repeated
while the browser is offline or after a rate limit answer.

## Errors and recovery

Every failure is classified in one place (`api/error-kinds.ts`) and has one
translated message and one way out. The message appears in the section it
belongs to (shipping, payment, coupon, gift message, order), next to the
controls, with a "Try again" button where trying again makes sense; a
failure of something the checkout did on its own never takes the keyboard
focus out of a field. The banner at the top is left for an order the store
refused and for the message of a payment method's own step. Nothing the
shopper entered is cleared by a failure.

| Situation | What the shopper sees | What happens |
|---|---|---|
| The device is offline | "You appear to be offline. Check your connection and try again." | Nothing is lost. When the connection is back the note goes away and the saves that failed are sent again without a click. |
| The store cannot be reached (connection dropped) | "We could not reach the store. Please try again." with "Try again" | The request was already repeated automatically (see the time limits above). The button repeats it; a background save is sent again when the connection comes back. |
| The store takes too long | "The store is taking too long to answer. Please try again." with "Try again" | As above. |
| The customer session expired | A dialog: "Your session has expired. Sign in again to continue. What you entered has been kept." | The dialog cannot be dismissed. "Sign in again" opens the sign-in page, which returns to the checkout, where the typed address is put back from the draft. If an order request was under way the dialog says the outcome is not known yet. |
| The cart changed or expired (ordered in another tab, removed by the store) | Either the page moves on (see the two-tab case below) or "Your cart has changed or expired." with "Return to cart" | The checkout stops sending requests. Nothing is reloaded by itself. |
| Too many requests (HTTP 429) | "Too many requests. Please wait N seconds." (the wait the store asked for) | A request the checkout made on its own is sent again once after the wait. For a request the shopper started, "Try again" becomes usable after the wait. |
| The store is unavailable (a 5xx answer, a proxy error page) | "The store is temporarily unavailable. Please try again in a moment." with "Try again" | The body of the error page is never shown. |
| The request was blocked (a firewall, HTTP 403 without a message of the store) | "Your request was blocked. Reload the page or contact us." with "Reload the page" | Retrying the same request would be refused again, so the way out is a reload. |
| An item is out of stock or its quantity is no longer available | The store's own stock message, with "Review your cart" | The order is not placed; the link leads to the cart, where the line carries the message. |
| A CAPTCHA answer was wrong or is now required | The message under the security code field, with a new image | The typed code is single use: after any attempt the checkout asks the store whether a code is required and shows a fresh image. |
| The store refused a value (an unknown coupon, an address a carrier rejects, a payment method that is not available) | The store's own message, translated by the store, at the field or in the section | The shopper corrects the value. A refused coupon stays in the field. |
| Anything else | "Something went wrong. Please try again." | A technical text (a JavaScript error, a data model phrase such as "No such entity") is never shown. |

Core's refusals are recognized by their English phrase, and the page carries
the store's own wording of those phrases (`checkoutConfig.hyperion.errorPhrases`)
so a store with a language pack classifies them the same way.

## When the answer to the order is lost

The order request has a 60 second limit and is never repeated. When its
answer does not arrive (the connection dropped, a timeout, a proxy error in
front of a PHP process that may still be working, or core's "The cart is
locked for processing"), the cart itself tells what happened:

1. The overlay changes to "Confirming your order..." and the checkout reads
   the cart: a guest cart that answers as no longer active was ordered; a
   customer's cart that is gone, or replaced by a new one, was ordered; the
   same active cart was not.
2. **Ordered:** the shopper goes to the success page, with no second click
   and no second order request.
3. **Not ordered:** "We could not reach the store. Your order was not
   placed. Please try again." appears above Place Order, the button opens
   again and every field is as it was. After a timeout, a proxy error or a
   locked cart the store may still be working on the order, so a cart that
   is still active is read again (up to five times, three seconds apart)
   before it counts as not ordered.
4. **Cannot be told** (the cart cannot be read either): "We could not
   confirm whether your order was placed. Please do not pay again yet."
   with "Check again". Place Order stays locked. The checkout reads the cart
   again every five seconds for a minute and whenever the connection comes
   back; "Check again" does it at once. Each read ends in one of the three
   ways above.

Wallets that place the order through an endpoint of their own (PayPal
Express in-context) hand a lost answer to the same check.

**Two tabs.** When the order is placed in one tab while a second tab of the
same session still shows the checkout, the next request of the second tab
is answered "this cart does not exist". The checkout reads the cart, finds
it ordered and leaves for the success page. Core shows the success page
once per order, so if the first tab already displayed it, core sends the
second tab on to the (empty) cart page without a message. No error text is
shown in either case.

## Drafts: typed data kept in the browser

So that a reload, a sign-in in the middle of the checkout or an expired
session does not lose what was typed, the checkout keeps a draft in the
`sessionStorage` of the browser tab (`store/drafts.ts`). Stores >
Configuration > Hyperion Theme > Checkout > General > "Keep Typed Checkout
Data in the Browser" (`hyperion_checkout/general/persist_drafts`, on by
default) switches it off: nothing is then written, and a reload shows what
the cart itself holds.

Privacy: this is personal data at rest in the shopper's browser, and a
store's privacy notice should say so where that is required.

- **What is stored:** a guest's email; the shipping and billing address as
  typed (name, company, street, city, state, postcode, country, telephone,
  fax, VAT number) or, for a saved address of a customer, only its id; the
  "same as shipping" choice; the selected shipping method; the code of the
  selected payment method; a coupon code typed but not applied; gift
  message texts not saved yet.
- **What is never stored:** a password; anything of a payment (card or bank
  data, nonces, tokens, device data, a purchase order number, a stored card
  or account selection); a CAPTCHA or reCAPTCHA answer; the accepted terms;
  the form key; a customer's email and the content of the address book.
- **Where and for how long:** `sessionStorage`, so it is per tab, is not
  sent to the server and goes away with the tab. One entry per store view
  and cart, removed 60 minutes after its last change, when the order is
  placed, and when the shopper leaves for the cart from a notice of the
  checkout. Entries of other carts are cleaned up at the next visit.
- **Sign-in:** a sign-in replaces the guest cart with the customer's, so
  the draft is copied to a second entry first, accepted once within 10
  minutes by the checkout of the same store view. An address restored that
  way is saved to the cart before an order can be placed.

## Inline sign-in

With "Enable Guest Checkout Login" on, the email field checks whether the
address belongs to an account. When it does, a one-line notice ("An account
exists for this email.") with a "Sign in" control appears in a line that is
reserved under the field, and the password form opens when the shopper
presses it. It does not open by itself: the answer of the check arrives on
its own time, well after the last keystroke, and a block that opens then
would push the rest of the checkout down under the shopper's pointer (a
layout shift). The reserved line and the click keep the page still. The
form has a "Forgot your password?" link; a successful sign-in reloads the
checkout as the customer with the merged cart, and the typed address comes
back from the draft. The image CAPTCHA and the reCAPTCHA of the login form
apply (see [reCAPTCHA and CAPTCHA](#recaptcha-and-captcha)).

## Billing address

"My billing and shipping address are the same" is ticked by default on a
physical cart, also for a customer whose default billing address differs
from the default shipping address: the order then uses the shipping address
as the billing address, as core's checkout does for a cart that has no
billing address yet. The customer's default billing address is the one
selected when the box is unticked. A cart that already carries a separate
billing address (from an earlier visit) starts with the box unticked and
that address. Customers pick the billing address from their address book or
add a new one; guests type it. On a virtual cart there is no box: the
billing address is always asked.

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
therefore visible to the checkout. The `hyperion` slice carries, among
others, `baseUrl`, `locale`, `translations`, `errorPhrases`, `rateFields`,
`shippingPreselect`, `persistDrafts`, `minimumOrder`, `topDestinations`,
`totalsSort` (the store's totals sort order, so the summary lists the rows
in the cart's order), `loginUrl`, `cartUrl`, `guestQuote`, `initial` (the state the page starts
with, see [The flow engine](#the-flow-engine)), `nameFields`, `paypalExpress`,
`recaptcha` and `captcha`.

The page itself is server rendered first: `checkout.phtml` prints a skeleton
with the geometry of the application (the contact card, the shipping card,
the payment card, the summary), the head preloads the entry module and its
application chunk (`modulepreload`) and links the stylesheet, and messages
have a reserved line under their field, so mounting the application and
showing an error do not move the page. Without JavaScript a `<noscript>`
note says the checkout needs it and links back to the cart.

## Payment methods

| Method code | Renderer | Status |
|---|---|---|
| `checkmo`, `banktransfer`, `cashondelivery`, `free` | `payment-offline`: the method's instructions (`banktransfer`, `cashondelivery`), and for `checkmo` the "Make Check payable to" and "Send Check to" details | orders verified as a guest and as a customer; the instructions under the selected method and on the order pages verified by `pw-orders-widgets-ga4.mjs` on 2026-11-11 (Magento 2.4.9) |
| `purchaseorder` | `payment-offline` with a required PO number field; the number travels as `paymentMethod.po_number` | verified by `pw-orders-widgets-ga4.mjs` on 2026-11-11 (Magento 2.4.9): Place Order stays closed without the number, a guest order is placed and the order carries the typed number |
| `paypal_express`, in-context (`payment/paypal_express/in_context = 1`) | `payment-paypal-express`: smart button, Pay Later message, owns Place Order | verified with real sandbox payments (guest, customer, from the cart, mini-cart and product page) on a platform now in "Previously tested" ([Compatibility](./compatibility.md#previously-tested)) |
| `paypal_express` redirect flow (`in_context = 0`), `payflow_express` | same renderer, redirect flow | reaches PayPal with the token; completion of the payment not verified; `payflow_express` unit tested only |
| `braintree`, `braintree_cc_vault`, `braintree_paypal`, `braintree_paypal_vault`, `braintree_googlepay`, `braintree_googlepay_vault` | the Braintree renderers | see [Braintree](#braintree) below |
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

When the store offers no payment method for the cart, the list says so
("No payment method is available for this order. Please contact us.")
instead of staying empty. At a zero grand total only the `free`
method is listed when the store offers it; the whole list is back as soon
as there is something to pay. When the display currency differs from the base
currency, a notice under the total names the amount the card will be
charged in the base currency. PayPal Express offers the billing agreement
checkbox to a logged-in customer when the store asks for it
(`payment/paypal_express/allow_ba_signup`), in both flows.

### Braintree

The renderers follow the storefront scripts of the `PayPal_Braintree` module
4.8 and load the Braintree web SDK 3.123.1, the version that module pins.
"Last sandbox record" is the last payment made against a Braintree sandbox
with this checkout on a supported platform; a row without one has unit
tests only for this release.

Two plugins of `HyperionCheckout` (frontend area, inert without the
Braintree module) keep the Braintree module from slowing the checkout page
down. `Plugin\Braintree\ClientTokenCachePlugin` wraps
`BraintreeAdapter::generate()`: the module's config providers each ask the
gateway for a client token with the same parameters, so the token is
requested once per page and, when it is not asked for a customer, kept in
the application cache for 30 minutes (tag `config`) per store, environment
and merchant account. `Plugin\Braintree\PayPalIconPlugin` answers
`getPayPalIcon()` from the module's own image file instead of an HTTP
request to the store's public URL.

| Method code | Renderer | Last sandbox record |
|---|---|---|
| `braintree` | `payment-braintree-card`: hosted fields, device data, 3D Secure (frictionless and challenge), the `braintree` reCAPTCHA form when the store protects it | 2026-11-18, Magento 2.4.9, SDK 3.123.1: card order placed as a guest and as a customer with 3D Secure off; with 3D Secure on, the challenge completed and the order placed (guest, and customer with "save card"). A frictionless 3D Secure authentication was not seen in that run (both test cards were challenged), a declined card was not tried. |
| `braintree_cc_vault` | `payment-braintree-vault`: the stored cards (`vault-tokens.ts`), the hosted CVV field when "CVV re-verification" is on, a nonce per order, 3D Secure under the rules of a new card | 2026-11-18, Magento 2.4.9: a card stored at a 3D Secure order, then an order with it and CVV re-verification on, and one with it off (3D Secure challenge instead); 2026-11-19: an order with a stored card, CVV re-verification on, 3D Secure off |
| `braintree_paypal` | `payment-braintree-paypal`: PayPal button, approval kept until Place Order, dropped when the total or the shipping address changes; line items in the base currency when the method is configured to send them | 2026-11-18, Magento 2.4.9: approved in PayPal's window and order placed as a guest and as a customer; with a display currency other than the base one the amount and the lines were sent in the base currency and the lines summed to the charged amount; a virtual cart (no shipping address sent); after an approval, a change of the shipping address withdrew it and locked Place Order; 2026-11-19: a guest order again on the final build |
| `braintree_paypal_vault` | the default vault flow (a nonce for the stored account) | not completed on 2026-11-18: saving the account (billing agreement with the purchase) ended on the PayPal sandbox's own error page after the consent step, with a physical and with a virtual cart; no order with a stored account |
| `braintree_googlepay` | `payment-braintree-googlepay`: Google Pay button (Braintree `google-payment` + Google's `pay.js`, loaded on selection), owns Place Order, 3D Secure for cards that are not network tokenized, vault choice | 2026-11-18, Magento 2.4.9: the row loads its scripts after selection without a Content Security Policy violation, the button renders and a click opens Google's window, the request is in the base currency also with another display currency; a Google Pay payment was not made (it needs a Google account in a real browser) |
| `braintree_googlepay_vault` | the card vault adapter without the CVV step (a card stored through Google Pay has no CVV to type; the module's own script asks for none) | not verified in the sandbox for this release |

Stored PayPal, Venmo and ACH Direct Debit accounts of Braintree are listed
on the customer's Stored Payment Methods page with their delete action
(theme templates under `PayPal_Braintree/templates/`). Checked on
2026-11-18 with a stored card of the sandbox and with test rows for the
three account types: the rows render and the delete with its confirmation
works.

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
    recaptchaAction?: () => RecaptchaAction | null;
    savesOnSelection?: boolean;
}

registerPaymentRenderer(renderer);
```

| Hook | When it runs | Contract |
|---|---|---|
| `code` | | Magento method code (`checkoutConfig.paymentMethods[].method`). |
| `component` | selection | Tag of the custom element rendered inside `<payment-method-row>` when the method is selected. Light DOM, Tailwind classes available. |
| `isAvailable(cfg)` | listing | Optional runtime gate on top of the method appearing in the available methods (for example "no saved agreements"). Omitted = available. |
| `isReady()` | continuously | Optional gate read by the `canPlaceOrder` selector. It must read signals only, so the Place Order button follows it (PayPal stays locked until the shopper authorized the payment). |
| `beforePlaceOrder()` | after every pending edit is on the quote and the gate is open, before the order request | Returns the `additional_data` object for the payment (nonce, device data, PO number). It sees the settled totals, so a tokenization or a 3D Secure challenge runs for the final amount. A rejection gives the order latch back and its (translated) message lands in the global error banner. Runs even when `placeOrder` is set. |
| `notReadyMessage()` | while `isReady()` is false | Optional text for the Place Order hint (the purchase order renderer names its missing number); without it the hint is the generic payment one. |
| `afterPlaceOrderFailed()` | after a failed order POST | For renderers holding single-use gateway state (a consumed nonce) that must be reset before a retry. |
| `ownsPlaceOrder()` | render | `true` when the renderer completes the order with a control of its own (the PayPal smart button). The checkout's Place Order button is not rendered while that method is selected. |
| `placeOrder()` | instead of the order POST | For methods whose order is placed elsewhere (redirect gateways). Resolves with the same-origin URL the shopper continues on, or `null` when it failed and already reported why in the global error. Redirect targets are validated against the store origin (`safe-redirect.ts`). |
| `recaptchaAction()` | at the order request | Which reCAPTCHA form protects the order of this method: `place_order` when the hook is absent, another form (`braintree` for the Braintree card) or `null` for none (wallets whose order is confirmed by the gateway). |
| `savesOnSelection` | selection | `false` when the method must not be saved on the quote at the moment the shopper selects it (a method that cannot be saved without its payment data). Omitted = saved on selection. |

**The order pipeline and the queue.** A renderer never writes to the quote
on its own. The checkout's button runs `prepareOrder()` (the latch, every
pending edit on the quote, the gate), then the renderer's `beforePlaceOrder`,
then `submitOrder()` or the renderer's `placeOrder`. A renderer that owns
Place Order calls `prepareCheckout()` of `payment-renderers/checkout-gate.ts`
from its click handler, which does the first step and answers with the
translated reason when something is missing, and `getCheckoutBlocker()` for
rendering. A renderer whose order is placed by an endpoint of its own and
gets no answer calls `flowActions().resolveLostOrder()`, which runs the
check of [When the answer to the order is lost](#when-the-answer-to-the-order-is-lost).
A failed save is reported in its section; read it with `failureMessage()`
of `store/section-status.ts` instead of printing a second message.

Methods with no renderer fall through to `payment-generic`. Only the codes
in `SAFE_FOR_GENERIC` (`checkmo`, `banktransfer`, `cashondelivery`, `free`)
may be placed that way; every other unregistered code shows the "not yet
supported" banner and cannot be selected, so a missing renderer never sends
an order to a gateway without its data.

**Optional chunks.** The gift options editor, the agreements list and the
image CAPTCHA field are separate chunks (`checkout-gift-message`,
`checkout-agreements`, `captcha-field`): the page loads and preloads each one
only when the store's settings use it.

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
replaces the line in place and returns to the cart.

**Lines.** The name and the thumbnail link to the page of the product by
core's cart rule: the page of the parent for the child of a grouped product,
no link at all for a product that is not visible in the store. The thumbnail
of a configurable or grouped line follows
`checkout/cart/configurable_product_image` and
`checkout/cart/grouped_product_image` (the image of the product itself or of
its parent). Hyperion sets the default of the first one to the product
itself, so a configurable line shows the image of the selected variant (the
parent's when the variant has none); core's default is the parent's image.
Item options print as label and value pairs.

**Quantities update by themselves.** A change of a quantity field, typed or
through the minus / plus buttons, posts the cart after a short pause: one
request for a burst of changes, a newer change replaces a request in
flight, the list of lines is dimmed while it runs and the keyboard focus
returns to the edited line. "Update Cart" remains as the fallback without
JavaScript. The mini-cart lines carry a quantity stepper (minus, input,
plus) that posts to core's `checkout/cart/updatePost` like the cart page. A
quantity the stock refuses is saved by core all the same (its controller
swallows the validation exception, Luma validates client side): the HTMX
answer carries the quote item's error as the error toast, and the cart page
and the drawer print the same message under the line. The quantity inputs
of the cart and of the mini-cart carry the product's `min`, `max` and `step`
(quantity increments, decimal quantities), the mini-cart stepper sends one
update after a short pause instead of one per tap, and the header count
follows `checkout/cart_link/use_qty`.

**Totals.** The summary card lists the totals the quote really collected
(`HyperionCheckout\Model\Cart\TotalRowPool`), in the order of Stores >
Configuration > Sales > Checkout Totals Sort Order (`sales/totals_sort/*`).
Subtotal, Fixed Product Tax, discount, shipping, tax and grand total have a
row renderer each; any other total, such as one a third party module
collects, prints as a plain row with its title and value. To give a total a
row of your own, register a `Model\Cart\TotalRow\RendererInterface` for its
code in the `renderers` argument of `TotalRowPool` (`etc/frontend/di.xml`).
The discount row names what gave the discount: the description core builds
from the price rules (their labels, or the coupon code for a rule without a
label). Fixed Product Tax lines render under the items (mini-cart, cart,
checkout summary) and as an "FPT" totals row when it is not included in the
subtotal. Each cart line prints a unit price and a row total in the tax
display of `tax/cart_display/price` (including, excluding, or both with an
"Excl. Tax" line); the mini-cart row total follows the same setting.

**When the cart cannot go to the checkout.** While the total is below the
minimum order amount (`sales/minimum_order/*`) or the quote carries an
error (an item out of stock, a quantity that is not available), the summary
card lists the reasons, the checkout link of the cart and of the mini-cart
is disabled and points at them, and the express buttons are left out. The
card is swapped with every cart change, so a quantity or a coupon that
crosses the amount opens the link without a reload. A direct visit to
`/checkout` comes back to the cart with the reason as a notice. Core's own
cart messages block (`checkout.cart.validationmessages`) is removed: it
would repeat the same reasons. Inside the checkout the rule is evaluated
again from every totals answer: a coupon applied there that takes the total
below the amount closes Place Order with the reason.

**Phone.** Below the wide layout a bar with the grand total and the checkout
link stays at the bottom of the screen for the height of the cart, in the
same state as the card's link.

**Coupon.** A refused code keeps the form open with the code in the field
and the message under it. The form carries the `coupon_code` reCAPTCHA and
the image CAPTCHA of the form `sales_rule_coupon_request` when the store
enables them (see [reCAPTCHA and CAPTCHA](#recaptcha-and-captcha)).

**Estimate Shipping and Tax.** The summary card carries the estimator:
country, region and postcode go to `hyperion/cart/estimate`, which puts
them on the quote's shipping address, collects the rates and applies the
chosen one, so the totals show shipping and destination taxes before the
checkout. The rates are shown in the display currency and follow
`tax/display/shipping` (including, excluding or both); a carrier's error
rate is a text notice without a radio button and cannot be posted, and
choosing another method replaces the stored one. The page itself never asks
the carriers: a logged-in customer whose quote has no destination yet gets
the rates of the default shipping address when the panel is opened, not
before (nothing is written to the quote until a rate is picked). A virtual
cart has no estimator. The route is rate limited per client
(`hyperion/security/cart_estimate_limit`, 10 requests per 10 seconds by
default, HTTP 429 with `Retry-After` above it), because every estimate asks
the carriers.

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

## reCAPTCHA and CAPTCHA

Both of Magento's mechanisms work inside the checkout and on the cart's
coupon form. Core's backend modules validate as they always do; the
checkout only supplies the token or the typed code with the request.
`HyperionCheckout\Model\Checkout\CaptchaConfigProvider` emits the
configuration of both (`checkoutConfig.hyperion.recaptcha`, one entry per
protected form, and `checkoutConfig.hyperion.captcha`).

**Google reCAPTCHA** (Stores > Configuration > Security > Google reCAPTCHA
Storefront, `recaptcha_frontend/type_for/*`). Each form takes the type the
store selects for it:

| Form (`type_for/...`) | Where in the checkout | reCAPTCHA v3 | reCAPTCHA v2 invisible | reCAPTCHA v2 checkbox |
|---|---|---|---|---|
| `place_order` | the order request | supported | supported | supported: the box sits above Place Order |
| `coupon_code` | the coupon form of the checkout and of the cart | supported | supported | supported: the box sits inside the coupon form |
| `customer_login` | the inline sign-in | supported | supported | supported: the box sits under the password field |
| `braintree` (added by the Braintree module) | the order request of a Braintree card, in place of `place_order` | supported | supported | supported: the box sits above Place Order |

The token travels as the `X-ReCaptcha` header of the REST request (as
`g-recaptcha-response` in the sign-in request and on the cart page).
Nothing from Google loads
with the page: the script is requested by the first token or, for a
checkbox, at the shopper's first interaction with the page; the checkbox
has its space reserved, so nothing moves when it arrives. With a v2
checkbox an unticked box closes the action with a hint ("Please confirm you
are not a robot."), and a token is single use: after a refused order the
shopper ticks the box again. Wallets whose order is confirmed by the
gateway (PayPal Express, Braintree PayPal, Google Pay, the vault methods)
send no `place_order` token. The attribution text Google requires is shown
by `<hc-recaptcha-badge>` (prefixed so it does not collide with the theme's
form bound `<hyperion-recaptcha>`).

Recommendation: prefer reCAPTCHA v3. It asks the shopper for nothing, needs
no reserved space and cannot leave a box to tick again after a failed
attempt. Keep in mind that v3 scores automated browsers low, which is its
purpose: end-to-end tests need the score threshold relaxed
([Development](./development.md#end-to-end-suite)).

**Image CAPTCHA** (Stores > Configuration > Customers > Customer
Configuration > CAPTCHA, `customer/captcha/*`). Three of core's forms can be
met in the checkout and on the cart, and each shows the image and the field
only while Magento requires an answer for it ("Always", or after the
configured number of failed attempts):

| Form (as listed in the admin) | Form id | Where |
|---|---|---|
| Login | `user_login` | under the password field of the inline sign-in |
| Applying coupon code | `sales_rule_coupon_request` | the coupon form of the cart and of the checkout |
| Checkout/Placing Order | `payment_processing_request` | above Place Order |

The typed code travels as the `X-Captcha` header of the REST request (the
field `captcha[<form id>]` on the cart page and in the sign-in request). A
code is single use: after every attempt the checkout asks the store whether
the form requires an answer now and shows a new image; a wrong code comes
back as the field's error. An empty required field closes Place Order with
the hint "Enter the security code before paying.". The image CAPTCHA of
the theme's other forms renders through the same element,
`<hyperion-captcha>` (theme template `Magento_Captcha::default.phtml`).
Core's own CAPTCHA on the request that saves the payment method
(`set-payment-information`) can never be required on a stock store, because
its form is not one a merchant can enable; the checkout sends the code of
the order form with that request and it changes nothing.
