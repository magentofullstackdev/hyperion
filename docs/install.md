# Install

This is the procedure that was verified on a clean Magento Open Source
2.4.8-p5 with the Luma sample data (2,040 products), then repeated on Magento
2.4.7-p10, 2.4.9, Mage-OS 2.3.0, 3.6.0 and 4.0.0. See [Compatibility](./compatibility.md).

## Prerequisites

| Requirement | Value |
|---|---|
| PHP | 8.3, 8.4 or 8.5, with `ext-gd` (`ext-imagick` recommended for catalogs with 1000+ products) |
| Magento | Open Source 2.4.6+ or Mage-OS 2.x / 3.x / 4.0 (`magento/framework ^103.0.6`); tested on 2.4.7, 2.4.8, 2.4.9, Mage-OS 2.3.0, 3.6.0 and 4.0.0 |
| Core modules | `Magento_PageBuilder`, `Magento_ReCaptchaUi`, `Magento_Swatches`, `Magento_Review`, `Magento_Wishlist`, `Magento_MessageQueue`, `Magento_Elasticsearch`, `Magento_AdvancedSearch`, `Magento_Backend`, `Magento_Ui`, `Magento_Widget` must be present (they are in every Open Source and Mage-OS install) |
| Search engine | Elasticsearch or OpenSearch (the only engines Magento 2.4 supports): the search module queries the engine for the autocomplete and the relevance tuning |
| Full page cache | Varnish 6 or 7 recommended (all test runs used Varnish); without it the ESI fragments render inline |
| Cron | running (`bin/magento cron:run`): the image consumer `hyperion.image.convert` is started by cron |
| Node.js | not needed for a Composer install |

Optional core modules that Hyperion detects at runtime and uses when they are
enabled (Composer `suggest`, never required): `Magento_Msrp`,
`Magento_GiftMessage`, `Magento_Paypal`, `Magento_OrderCancellation` (2.4.7+),
`Magento_LoginAsCustomer`.

## 1. Composer

Hyperion is distributed through its own Composer repository, built by
[Satis](https://github.com/composer/satis) from every release tag and served
on GitHub Pages at `https://magentofullstackdev.github.io/hyperion/`. It only
contains the `magentofullstackdev/*` packages; Magento itself keeps coming
from `repo.magento.com` or `repo.mage-os.org` as before. Run this once from
the Magento root:

```bash
composer config repositories.hyperion composer https://magentofullstackdev.github.io/hyperion/
composer config minimum-stability beta
composer config prefer-stable true
composer require magentofullstackdev/theme-hyperion:^0.9.0-beta.4
composer require magentofullstackdev/module-hyperion-sample-data:^0.9.0-beta.4   # optional, see below
```

`minimum-stability beta` is needed while the release is a beta: the theme
requires its modules at the exact version `0.9.0-beta.4`, and a stability
flag on the root constraint (`^0.9.0-beta.4`) does not reach those
transitive requirements. `prefer-stable` keeps every other package on its
stable release, and Magento projects already ship with it set. The step
disappears with the first stable release.

`magentofullstackdev/theme-hyperion` requires the ten runtime modules, so
one command installs the suite (11 packages, 12 with the sample data module):

| Package | Type |
|---|---|
| `magentofullstackdev/theme-hyperion` | theme `Magentofullstackdev/hyperion` |
| `magentofullstackdev/module-hyperion-core` | ESI, asset manifest, HTMX plugins, header state, Varnish BAN |
| `magentofullstackdev/module-hyperion-catalog` | listing and product page blocks, fragment endpoints, swatches |
| `magentofullstackdev/module-hyperion-catalog-mode` | catalog mode: purchasing limited to selected customer groups (off by default) |
| `magentofullstackdev/module-hyperion-checkout` | Lit checkout, cart page, mini-cart fragments |
| `magentofullstackdev/module-hyperion-customer` | wishlist, compare, welcome and account fragments, order cancellation, Login as Customer |
| `magentofullstackdev/module-hyperion-navigation` | header, footer and top menu blocks |
| `magentofullstackdev/module-hyperion-cms` | CMS and PageBuilder renderers |
| `magentofullstackdev/module-hyperion-image` | WebP / AVIF generation |
| `magentofullstackdev/module-hyperion-search` | search engine autocomplete (products, popular terms, categories), typo tolerance, SKU and promoted boosts, stop words, zero-results fallback |
| `magentofullstackdev/module-hyperion-mega-menu` | admin menu builder (Content > Menu > Menu Management) rendered by the Hyperion navigation; the category tree stays the menu until a group exists |
| `magentofullstackdev/module-hyperion-sample-data` | optional: rebinds the Luma sample-data widgets to Hyperion, adds a bundle and a virtual test product |

Install `module-hyperion-sample-data` only on a store that has the Luma
sample data: it rebinds the sample widgets and layout links to the Hyperion
theme on every `setup:upgrade` (they are bound to `Magento/luma` and would
never render otherwise) and creates the products `HYP-BUNDLE-TRAVEL-KIT` and
`HYP-VIRTUAL-GIFT-WRAP` for testing. Do not install it on a production store.

## 2. Magento setup

```bash
bin/magento setup:upgrade
bin/magento setup:di:compile
bin/magento setup:static-content:deploy -f
```

`setup:upgrade` registers the theme in the `theme` table and creates the CMS
page `terms-and-conditions` that the footer links as Terms and Conditions
(a visible placeholder asking you to replace it; nothing is created when a
page with that identifier already exists). On the clean 2.4.8
install it took 24 s, `setup:di:compile` 18 s, the static deploy for the
theme alone 2.5 s. To deploy only the Hyperion theme:
`bin/magento setup:static-content:deploy -f --theme Magentofullstackdev/hyperion`.

## 3. Assign the theme

Either in the admin: Content > Design > Configuration, edit the scope
(global, website or store view) and pick "Hyperion by Magentofullstackdev".

Or from the CLI, with the theme id from the `theme` table:

```bash
bin/magento config:set design/theme/theme_id <id>
```

To find the id, query the database (`SELECT theme_id, theme_path FROM theme
WHERE theme_path = 'Magentofullstackdev/hyperion';`). On the clean 2.4.8
install the id was 4; it depends on how many themes the store already had.
`config:set` writes the default scope; add `--scope=stores --scope-code=<code>`
for one store view.

## 3b. Warm the product image cache (optional)

Every product image of the theme is served from `pub/media/catalog/product/cache/`
through Magento's image helper: a size that does not exist yet is resized
during the render of the first page that needs it, exactly as in Luma, so a
fresh install, a media import or a change of the image sizes in `etc/view.xml`
never show a broken image. (Magento's own `get.php` resizes a missing cache
file on demand as well, when the web server routes `/media/` misses to it the
way `nginx.conf.sample` does; the theme does not rely on that routing.)

The first visitor of a product still pays for its gallery sizes (1200 x 1800
and 800 x 1280 per image, a few hundred milliseconds each), so before opening a
store with a large catalog warm the cache once:

```bash
bin/magento catalog:images:resize
```

Images uploaded in the admin afterwards are resized at save time. With many
products, `--async` queues the work for the `media.storage.catalog.image.resize`
consumer that cron runs.

The same command also schedules the WebP / AVIF companions of every cache file
it writes (`HyperionImage` hooks core's resize service, so the admin save and
`get.php` are covered too): in the default `queue` mode the files are encoded
by the `hyperion.image.convert` consumer that cron starts, so the companions
appear within a minute of the next cron tick (`bin/magento
queue:consumers:start hyperion.image.convert` runs it by hand); in `sync` mode
they are written during the command. The storefront is a safety net for a
cache file that still has no companion: the render that finds it missing
schedules the conversion once (one attempt a day per file) and the page is
re-rendered after the consumer invalidated the product's cache tags. To
backfill synchronously in one pass instead, run
`bin/magento hyperion:image:convert --paths=catalog/product/cache` (see
`configuration.md`, Images).

## 4. Enable the Lit checkout

```bash
bin/magento config:set hyperion_checkout/general/enabled 1
```

The flag defaults to 0. With the flag off, `/checkout` renders the stock
Knockout checkout, which depends on RequireJS and does not work on Hyperion.
Enable it before you open the checkout on the Hyperion theme, or keep Luma
assigned until you do. Details: [Checkout](./checkout.md).

## 5. Full page cache on Varnish

```bash
bin/magento config:set system/full_page_cache/caching_application 2
bin/magento setup:config:set --http-cache-hosts=<varnish host>:<port>
bin/magento cache:flush
```

Load `app/code/Magentofullstackdev/HyperionCore/etc/varnish/default.vcl`
(in `vendor/magentofullstackdev/module-hyperion-core/etc/varnish/` after the
Composer install) into Varnish. Before use, set the backend host / port and add
your Magento hosts to the purge ACL: [Varnish](./varnish.md). `http-cache-hosts`
is what lets `cache:flush` and product saves purge Varnish.

When PHP sits behind Varnish, a TLS terminator or a load balancer, tell the
anti-abuse shield which addresses may set `X-Forwarded-For`. Until then the
rate limiter ignores the header when PHP's peer is a public address, and
behind a proxy on a private network it keys its budget on the proxy's address
plus the forwarded address left after skipping the known proxies and at most
one more hop in the proxy's own subnet. That is a guess at your topology, not
a guarantee: list the proxies in production.

```bash
bin/magento config:set hyperion/security/trusted_proxies <varnish ip>,<proxy ip>
```

The limits themselves are in Stores > Configuration > Hyperion Theme >
Anti-Abuse Shield ([Configuration](./configuration.md)).

## 6. Verify

- The home page answers with `x-magento-cache-debug: MISS` on the first
  request and `HIT` on the second
  (`curl -sI -H 'X-Magento-Debug: 1' <url> | grep -i cache-debug`; outside
  developer mode the verdict is delivered only to requests that carry that
  header, see [Varnish](./varnish.md)).
- A category page, a product page, the cart and the checkout render with the
  Hyperion markup, as a guest and as a logged-in customer.
- Stores > Configuration shows the "Hyperion Theme" tab with the sections
  Hyperion Theme, Catalog Mode, Checkout, Images and Search; Content > Menu >
  Menu Management opens the mega menu builder; the category edit form has
  "Infinite Scroll" under Display Settings.
- The header search field opens the autocomplete after two characters
  (products, popular terms, categories), served by `/hyperion/search/suggest`
  with `x-magento-cache-debug: MISS` then `HIT` (same request header).

## Mail on Magento 2.4.8+ and Mage-OS

Magento 2.4.8+ and Mage-OS use Symfony Mailer, which rejects the
`sendmail_path` helper scripts that local stacks (MailHog, Mailpit) often
configure ("Unsupported sendmail command flags"). Configure an SMTP transport
instead: `system/smtp/transport = smtp`, `system/smtp/host`, `system/smtp/port`.
This is a platform behavior, not a Hyperion one, but order emails were the
first place it showed up in the test run.

## Redis session concurrency

The storefront header sends one session-bound request per page
(`hyperion/header/state`). That is within the stock Redis session
`max_concurrency` of 6, but the admin exceeds it on grid-heavy pages. On the
test installs `max_concurrency` was raised to 24:

```bash
bin/magento setup:config:set --session-save-redis-max-concurrency=24
```

## Upgrading

```bash
composer update "magentofullstackdev/*"
bin/magento setup:upgrade
bin/magento setup:di:compile
bin/magento setup:static-content:deploy -f
bin/magento cache:flush
```

All twelve packages (eleven modules and the theme) carry the same version and
require each other with `self.version`, so they always move together. Read the [changelog](../CHANGELOG.md)
for the release you upgrade to. If `pub/static` keeps symlinks to old hashed
assets (developer mode), remove the dangling ones before the deploy:
`find pub/static -xtype l -delete`.

A store that installed a build before the search and mega menu modules
existed receives them with `composer update`: `setup:upgrade` enables
`Magentofullstackdev_HyperionSearch` and `Magentofullstackdev_HyperionMegaMenu`
in `app/etc/config.php`, creates the three `hyperion_megamenu_*` tables and
the `hyperion_infinite_scroll` category attribute. Nothing changes on the
storefront until a menu group is saved or the infinite scroll setting is
turned on; the autocomplete starts querying the engine right away.

## Uninstalling

1. Assign another theme (Content > Design > Configuration, or
   `bin/magento config:set design/theme/theme_id <id of the other theme>`)
   and set `hyperion_checkout/general/enabled` to 0.
2. `bin/magento theme:uninstall --theme frontend/Magentofullstackdev/hyperion`
   removes the theme package and its registration (Composer-installed themes
   only), then `composer remove` the `magentofullstackdev/module-hyperion-*`
   packages.
3. `bin/magento setup:upgrade`, `setup:di:compile`, `cache:flush`.

The Hyperion configuration rows (`hyperion/*`, `hyperion_catalog_mode/*`,
`hyperion_checkout/*`, `hyperion_image/*`, `hyperion_search/*`), the mega menu
tables (`hyperion_megamenu_group`, `hyperion_megamenu_item`,
`hyperion_megamenu_item_store`), the category attribute
`hyperion_infinite_scroll`, the `terms-and-conditions` CMS page and the
generated `.webp` / `.avif` files next to the catalog images stay in place; delete them by hand if you want a clean
database and media directory. Uninstalling was not part of the verified
test run.

## What happens to Luma

Installing and enabling the eleven modules does not change a store that still
runs Luma. On the clean 2.4.8 install the storefront was checked after
`setup:upgrade` and before the theme switch: eight page types answered
HTTP 200, with no new exceptions and no Hyperion markup or asset on any Luma
page. You can therefore install, compile and deploy during normal operation
and switch the theme per store view when you are ready.
