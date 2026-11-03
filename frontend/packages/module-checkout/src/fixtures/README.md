# checkoutConfig fixtures

Live captures of a Magento storefront's `checkoutConfig`, used by the dev
harness and by the TypeScript types in `src/types/config.ts` to pin the
shapes against a real installation.

| File | Scenario | Captured against |
|---|---|---|
| `checkoutConfig.guest.json` | Guest cart, one physical configurable (MH01 Chaz Kangeroo Hoodie, S + Black). | Magento CE 2.4.7-p9 with the Luma sample data |
| `checkoutConfig.customer.json` | Logged-in sample data customer (Veronica Costello), one saved address, same physical cart. | Magento CE 2.4.7-p9 with the Luma sample data |
| `checkoutConfig.virtual.json` | Guest, downloadable-only cart (Beginner's Yoga, SKU 240-LV04). `quoteData.is_virtual === 1`. Total segments: subtotal, tax, grand_total (no shipping). | Magento CE 2.4.7-p9 with the Luma sample data |

`payment.braintree.json` is NOT a live capture (it was written without
Braintree merchant credentials). It is a partial config (`payment`,
`vault`, `paymentMethods`) written by hand from the PHP providers of
PayPal_Braintree 4.6.1 (`Model/Ui/ConfigProvider.php`,
`Model/Ui/PayPal/ConfigProvider.php`, `Model/Ui/ThreeDeeSecure/ConfigProvider.php`,
`Model/Ui/Vault/ConfigProvider.php`, `Model/Ui/TokenUiComponentProvider.php`)
and Magento_Vault (`TokensConfigProvider`, `VaultConfigProvider`). The
renderer tests merge it over the customer fixture. Replace it with a real
capture once a sandbox account is configured.

## How to re-capture

When Magento is patched or store config changes (new payment method,
new customer attribute, etc.), regenerate the fixtures by:

1. Seed the matching cart state via CLI / REST / admin.
2. `curl -sk -b <cookie-jar> https://shop.example/checkout | \
      grep -oP 'id="checkout-config">\K[^<]*' \
      | python3 -m json.tool --sort-keys > <fixture>.json`
3. Commit, and update the "Captured against" column above.

## Known gaps

- `checkoutConfig.customer.json` has only ONE saved address because the
  stock sample data Veronica account ships with one. A capture with two or
  more addresses (seed a second one through
  `POST /rest/V1/customers/:id/addresses`) would exercise the address
  picker; it is not required for type-pinning, the TypeScript `Address`
  shape is the same whether there are one or ten.
