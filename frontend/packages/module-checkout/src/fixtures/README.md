# checkoutConfig fixtures

Sanitized live captures of a Magento storefront's checkout config (the
`#checkout-config` JSON island of `/checkout/`), used by the dev harness, the
unit tests and the TypeScript types in `src/types/config.ts` to pin the shapes
against a real installation.

| File | Scenario | Captured against |
|---|---|---|
| `checkoutConfig.guest.json` | Guest cart, one physical simple product (Joust Duffle Bag, SKU 24-MB01). | Magento Open Source 2.4.9 with the Luma sample data |
| `checkoutConfig.customer.json` | Logged-in sample data customer (Veronica Costello, Michigan), one saved address, the same physical cart (US tax applied). | Magento Open Source 2.4.9 with the Luma sample data |
| `checkoutConfig.virtual.json` | Guest, virtual-only cart (one virtual product of the Hyperion sample data). `quoteData.is_virtual === 1`. Total segments: subtotal, tax, grand_total (no shipping). | Magento Open Source 2.4.9 with the Luma and Hyperion sample data |

The captures pin what the PLATFORM emits. What Hyperion's own providers add is
left out: `hyperion` is reduced to `{ checkoutVersion, enabled }`, and the
top-level keys `directoryData`, `optionalZipCountries`, `streetLines`,
`companyConfig`, `telephoneConfig`, `faxConfig`, `vatFrontendVisibility`,
`giftMessage`, `isItemLevelGiftOptionsEnabled` and
`isOrderLevelGiftOptionsEnabled` are dropped. Tests set the Hyperion keys they
exercise; `hyperion.initial.json` pins the prefetched state.

Sanitized: the store origin is `https://shop.example`; the form key, quote
ids, captcha timestamps and IP addresses are fixed values; every credential
(Braintree client tokens, merchant ids, PayPal client and merchant ids in the
SDK URL, CSP nonces, Cardinal JWTs, partner attribution ids) is a
`placeholder-*` string. The customer is the public sample data customer.
The `payment` slices of PayPal_Braintree and Adobe Payment Services come from
a sandbox configuration, with those credentials replaced.

`payment.braintree.json` is NOT a live capture (it was written without
Braintree merchant credentials). It is a partial config (`payment`,
`vault`, `paymentMethods`) written by hand from the PHP providers of
PayPal_Braintree 4.6.1 (`Model/Ui/ConfigProvider.php`,
`Model/Ui/PayPal/ConfigProvider.php`, `Model/Ui/ThreeDeeSecure/ConfigProvider.php`,
`Model/Ui/Vault/ConfigProvider.php`, `Model/Ui/TokenUiComponentProvider.php`)
and Magento_Vault (`TokensConfigProvider`, `VaultConfigProvider`). The
renderer tests merge it over the customer fixture. The PayPal slices carry
the keys of PayPal_Braintree 4.8 where they differ (`canSendCartLineItems`,
`cspNonce`). Replace it with a real
capture once a sandbox account is configured.

## How to re-capture

When Magento is patched or store config changes (new payment method,
new customer attribute, etc.), regenerate the fixtures by:

1. Seed the matching cart state via CLI / REST / admin.
2. Read the `#checkout-config` island of `/checkout/` in that session.
3. Apply the sanitizing rules above (origin, fixed ids, `placeholder-*`
   credentials, Hyperion keys left out), sort the keys, and check that
   `pnpm test:kit` (the package content test) is green.
4. Update the "Captured against" column above.

## `hyperion.initial.json`

Not a capture: the `checkoutConfig.hyperion.initial` value the server
provider emits for a guest and for a customer (a saved shipping address, a
typed billing address), as JSON. It is asserted from both sides, so a key or
a type cannot drift between them: `InitialStateConfigProviderTest` of the
`HyperionCheckout` module compares what the provider emits with this file,
and `store/__tests__/hydrate.test.ts` hydrates the store from it. Change it
together with the provider and its test.

## Known gaps

- `checkoutConfig.customer.json` has only ONE saved address because the
  stock sample data Veronica account ships with one. A capture with two or
  more addresses (seed a second one through
  `POST /rest/V1/customers/:id/addresses`) would exercise the address
  picker; it is not required for type-pinning, the TypeScript `Address`
  shape is the same whether there are one or ten.
