<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model;

use Magentofullstackdev\HyperionCheckout\Model\Checkout\TranslationCatalog;
use Magentofullstackdev\HyperionCheckout\Model\Config\Source\RateFields;
use Magentofullstackdev\HyperionCheckout\Model\Config\Source\ShippingPreselect;
use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Customer\Model\Url as CustomerUrl;
use Magento\Directory\Helper\Data as DirectoryHelper;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\Url\EncoderInterface;
use Magento\Framework\UrlInterface;
use Magento\Quote\Model\Quote\Address\Total\Collector as TotalsCollector;
use Magento\Quote\Model\Quote\Validator\MinimumOrderAmount\ValidationMessage;
use Magento\Store\Model\ScopeInterface;

/**
 * Hyperion extension of the Magento `checkoutConfig` composite payload.
 *
 * Registered in `etc/frontend/di.xml` under
 * `Magento\Checkout\Model\CompositeConfigProvider`. The resulting
 * `getConfig()` array is merged into the `#checkout-config` JSON island
 * rendered by Magentofullstackdev\HyperionCheckout\Block\Checkout -- the bundle reads it at
 * boot time (`frontend/packages/module-checkout/src/bootstrap.ts`).
 *
 * What this provider contributes today:
 *
 * - `hyperion.checkoutVersion` -- module semver, surfaced to the bundle so
 *   client-side checks can assert "I'm compatible with >= 2.x" when a
 *   future gateway SDK depends on a specific payload shape.
 * - `hyperion.enabled` -- mirrors the admin feature flag.
 * - `hyperion.extensionApi` -- the version of the public extension
 *   contracts (`EXTENSION_API`); an extension element compares its major
 *   with it before it is used.
 * - `giftMessage`, `isOrderLevelGiftOptionsEnabled`,
 *   `isItemLevelGiftOptionsEnabled` -- core's gift message checkout config,
 *   relayed through `GiftMessageBridge` when `Magento_GiftMessage` is present
 *   (core registers its provider on a composite the Lit checkout never reads).
 * - `hyperion.baseUrl` -- the store's web base URL (scheme, host and the
 *   install path when Magento runs under a sub directory). The bundle builds
 *   every REST and storefront URL on it; core's `staticBaseUrl` points at the
 *   static files host, which is a CDN on many stores and never carries the
 *   application path.
 * - `hyperion.locale` -- the locale Magento resolved for the request
 *   (`de_DE`, `it_IT`, ...). The bundle uses it to pick its fallback catalog.
 * - `hyperion.translations` -- every checkout string of
 *   `i18n/en_US.csv`, keyed by the English text, rendered through `__()`
 *   (`Model\Checkout\TranslationCatalog`), so the module's `i18n/<locale>.csv`
 *   files, a merchant's CSV and language packs translate the checkout like
 *   any other Magento string. The bundle merges it over its static catalog.
 * - `hyperion.guestCheckoutLoginEnabled` -- core's
 *   `checkout/options/enable_guest_checkout_login`: only then does the email
 *   availability check tell a registered address from a new one.
 * - `hyperion.rateFields`, `hyperion.shippingPreselect`,
 *   `hyperion.persistDrafts` -- the module's own settings
 *   (`hyperion_checkout/shipping/rate_fields`, `.../shipping/preselect`,
 *   `hyperion_checkout/general/persist_drafts`).
 * - `hyperion.loginUrl`, `hyperion.cartUrl`, `hyperion.forgotPasswordUrl` --
 *   the pages the checkout links to. The sign in URL carries the checkout
 *   page as its `referer`, encoded the way `Magento\Customer\Model\Url`
 *   does, so the customer comes back to the checkout.
 * - `hyperion.topDestinations` -- `general/country/destinations`, the
 *   countries listed first in the country select.
 * - `hyperion.minimumOrder` -- the minimum order rule in numbers
 *   (`sales/minimum_order/*`), so the bundle evaluates it again from every
 *   totals answer; null while the rule is off.
 * - `hyperion.errorPhrases` -- the store's wording of the core refusals the
 *   bundle recognizes by their text (`ERROR_PHRASES`), keyed by the English
 *   phrase; only the phrases the locale translates, absent when none is.
 * - `hyperion.totalsSort` -- the totals sort order of the store
 *   (`sales/totals_sort`), total code to position, so the summary orders
 *   its rows by the rule of the cart page (`Model\Cart\TotalRowPool`);
 *   only the numeric entries, absent when there is none.
 * - `directoryData` -- country dictionary the address form needs to render
 *   the country select and decide whether the region field is a populated
 *   `<select>` or a free-text input. Stock Magento ships this data through
 *   `customerData('directory-data')` (an async section endpoint) which the
 *   Lit checkout cannot use before the user starts editing -- exposing it
 *   through the JSON island makes the form usable on first paint.
 * - `optionalZipCountries` -- postcode-not-required ISO codes from
 *   `general/country/optional_zip_countries`. Drives the address form's
 *   `postcodeRequired` decision per country selection.
 * - `streetLines` / `companyConfig` / `telephoneConfig` / `faxConfig` /
 *   `vatFrontendVisibility` -- customer-attribute visibility flags that
 *   drive which optional fields the address form exposes.
 */
class ConfigProvider implements ConfigProviderInterface
{
    public const VERSION = '2.0.0';

    /**
     * Version of the public extension contracts of the checkout bundle
     * (`extension-api.d.ts`), emitted as `hyperion.extensionApi`. Kept equal
     * to `EXTENSION_API` of `frontend/packages/module-checkout/src/extension/version.ts`.
     */
    public const EXTENSION_API = '1.0-beta';

    public const CONFIG_ENABLED = 'hyperion_checkout/general/enabled';

    public const CONFIG_PERSIST_DRAFTS = 'hyperion_checkout/general/persist_drafts';

    /**
     * The core refusals the checkout bundle classifies by their text. Keep
     * in sync with `CART_LOCKED_PHRASE`, `SHIPPING_METHOD_REJECTED_PHRASES`,
     * `STOCK_PHRASES` and `CAPTCHA_PHRASES` of
     * `frontend/packages/module-checkout/src/api/error-kinds.ts`: a phrase
     * missing here is not recognized on a store whose language pack
     * translates it.
     */
    public const ERROR_PHRASES = [
        'The cart is locked for processing. Please try again later.',
        'Carrier with such method not found: %1, %2',
        'The shipping method is missing. Select the shipping method and try again.',
        'Some of the products are out of stock.',
        'This product is out of stock.',
        'Product %name is out of stock.',
        'Please correct the quantity for some products.',
        'The requested qty. is not available',
        'Not enough items for sale',
        'Only %1 of %2 available',
        'The fewest you may purchase is %1.',
        'The requested qty exceeds the maximum qty allowed in shopping cart',
        'You cannot use decimal quantity for this product.',
        'You can buy %1 only in quantities of %2 at a time.',
        'You can buy this product only in quantities of %1 at a time.',
        'There are no source items with the in stock status',
        'The requested sku is not assigned to given stock',
        'The requested sku is not assigned to given stock.',
        'Incorrect CAPTCHA',
        'Incorrect CAPTCHA.',
        'CAPTCHA is required.',
        'Please provide CAPTCHA code and try again',
        'Too many coupon code requests, please try again later.',
    ];

    private const GUEST_CHECKOUT_LOGIN_PATH = 'checkout/options/enable_guest_checkout_login';
    private const MINIMUM_ORDER_ACTIVE_PATH = 'sales/minimum_order/active';
    private const MINIMUM_ORDER_AMOUNT_PATH = 'sales/minimum_order/amount';
    private const MINIMUM_ORDER_INCLUDE_DISCOUNT_PATH = 'sales/minimum_order/include_discount_amount';
    private const MINIMUM_ORDER_INCLUDE_TAX_PATH = 'sales/minimum_order/tax_including';

    private const STREET_LINES_PATH = 'customer/address/street_lines';
    private const COMPANY_SHOW_PATH = 'customer/address/company_show';
    private const TELEPHONE_SHOW_PATH = 'customer/address/telephone_show';
    private const FAX_SHOW_PATH = 'customer/address/fax_show';
    private const VAT_FRONTEND_VISIBILITY_PATH = 'customer/create_account/vat_frontend_visibility';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly DirectoryHelper $directoryHelper,
        private readonly UrlInterface $urlBuilder,
        private readonly GiftMessageBridge $giftMessageBridge,
        private readonly ResolverInterface $localeResolver,
        private readonly TranslationCatalog $translationCatalog,
        private readonly EncoderInterface $urlEncoder,
        private readonly ValidationMessage $minimumOrderMessage,
        private readonly RateFields $rateFields,
        private readonly ShippingPreselect $shippingPreselect
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        $hyperion = [
            'checkoutVersion' => self::VERSION,
            'extensionApi' => self::EXTENSION_API,
            'enabled' => $this->flag(self::CONFIG_ENABLED),
            'baseUrl' => $this->urlBuilder->getBaseUrl(['_type' => UrlInterface::URL_TYPE_WEB]),
            'locale' => (string)$this->localeResolver->getLocale(),
            'translations' => $this->translationCatalog->getTranslations(),
            'guestCheckoutLoginEnabled' => $this->flag(self::GUEST_CHECKOUT_LOGIN_PATH),
            'rateFields' => $this->rateFields->resolve($this->value(RateFields::CONFIG_PATH)),
            'shippingPreselect' => $this->shippingPreselect->resolve($this->value(ShippingPreselect::CONFIG_PATH)),
            'persistDrafts' => $this->flag(self::CONFIG_PERSIST_DRAFTS),
            'loginUrl' => $this->buildLoginUrl(),
            'cartUrl' => $this->urlBuilder->getUrl('checkout/cart'),
            'forgotPasswordUrl' => $this->urlBuilder->getUrl('customer/account/forgotpassword'),
            'topDestinations' => $this->buildTopDestinations(),
            'minimumOrder' => $this->buildMinimumOrder(),
        ];
        $errorPhrases = $this->buildErrorPhrases();
        if ($errorPhrases !== []) {
            $hyperion['errorPhrases'] = $errorPhrases;
        }

        $totalsSort = $this->buildTotalsSort();
        if ($totalsSort !== []) {
            $hyperion['totalsSort'] = $totalsSort;
        }

        return $this->giftMessageBridge->getCheckoutConfig() + [
            'hyperion' => $hyperion,
            'directoryData' => $this->buildDirectoryData(),
            'optionalZipCountries' => $this->directoryHelper->getCountriesWithOptionalZip(),
            'streetLines' => (int)$this->value(self::STREET_LINES_PATH) ?: 2,
            'companyConfig' => $this->normalizeShow(self::COMPANY_SHOW_PATH, 'opt'),
            'telephoneConfig' => $this->normalizeShow(self::TELEPHONE_SHOW_PATH, 'req'),
            'faxConfig' => $this->normalizeShow(self::FAX_SHOW_PATH, 'no'),
            'vatFrontendVisibility' => $this->flag(self::VAT_FRONTEND_VISIBILITY_PATH),
        ];
    }

    /**
     * Build a `country_id => { name, is_region_required, is_region_visible,
     * regions }` map scoped to the store's allowed countries. Mirrors the
     * shape stock Magento exposes via
     * `Magento\Checkout\CustomerData\DirectoryData` plus the two region
     * flags, so the address form decides about the region field without a
     * second config lookup: the field shows when the country requires a
     * region or `general/region/display_all` is on.
     *
     * @return array<string, array<string, mixed>>
     */
    private function buildDirectoryData(): array
    {
        $regionsByCountry = $this->directoryHelper->getRegionData();
        // The helper prefixes the array with a `config` envelope that
        // doesn't belong in the per-country lookup.
        unset($regionsByCountry['config']);

        $regionsRequired = (array)$this->directoryHelper->getCountriesWithStatesRequired();
        $showOptionalRegions = (bool)$this->directoryHelper->isShowNonRequiredState();
        $output = [];
        foreach ($this->directoryHelper->getCountryCollection() as $country) {
            $countryId = (string)$country->getCountryId();
            if ($countryId === '') {
                continue;
            }
            $regionRequired = in_array($countryId, $regionsRequired, true);
            $entry = [
                'name' => (string)$country->getName(),
                'is_region_required' => $regionRequired,
                'is_region_visible' => $regionRequired || $showOptionalRegions,
            ];
            if (!empty($regionsByCountry[$countryId])) {
                $regionMap = [];
                foreach ($regionsByCountry[$countryId] as $regionId => $region) {
                    $regionMap[(string)$regionId] = [
                        'code' => (string)($region['code'] ?? ''),
                        'name' => (string)($region['name'] ?? ''),
                    ];
                }
                if (!empty($regionMap)) {
                    $entry['regions'] = $regionMap;
                }
            }
            $output[$countryId] = $entry;
        }
        return $output;
    }

    /**
     * The sign in page with the checkout page as the place to return to.
     * The referer is the checkout URL itself, never the current request:
     * the config can be built for a request that is not the checkout page.
     */
    private function buildLoginUrl(): string
    {
        $checkoutUrl = $this->urlBuilder->getUrl('checkout', ['_secure' => true]);
        return $this->urlBuilder->getUrl(
            CustomerUrl::ROUTE_ACCOUNT_LOGIN,
            [CustomerUrl::REFERER_QUERY_PARAM_NAME => $this->urlEncoder->encode($checkoutUrl)]
        );
    }

    /**
     * @return string[]
     */
    private function buildTopDestinations(): array
    {
        $codes = [];
        foreach ((array)$this->directoryHelper->getTopCountryCodes() as $code) {
            $code = strtoupper(trim((string)$code));
            if ($code !== '' && !in_array($code, $codes, true)) {
                $codes[] = $code;
            }
        }
        return $codes;
    }

    /**
     * The minimum order rule the way `Quote\Address::validateMinimumAmount()`
     * reads it: the threshold in the base currency, whether the discount is
     * subtracted and the tax added before the comparison, and the message
     * core shows below the threshold.
     *
     * @return array{amount: float, includeDiscount: bool, includeTax: bool, description: string}|null
     */
    private function buildMinimumOrder(): ?array
    {
        if (!$this->flag(self::MINIMUM_ORDER_ACTIVE_PATH)) {
            return null;
        }
        return [
            'amount' => (float)$this->value(self::MINIMUM_ORDER_AMOUNT_PATH),
            'includeDiscount' => $this->flag(self::MINIMUM_ORDER_INCLUDE_DISCOUNT_PATH),
            'includeTax' => $this->flag(self::MINIMUM_ORDER_INCLUDE_TAX_PATH),
            'description' => (string)$this->minimumOrderMessage->getMessage(),
        ];
    }

    /**
     * @return array<string, string>
     */
    private function buildErrorPhrases(): array
    {
        $translated = [];
        foreach (self::ERROR_PHRASES as $phrase) {
            $text = (string)__($phrase);
            if ($text !== '' && $text !== $phrase) {
                $translated[$phrase] = $text;
            }
        }
        return $translated;
    }

    /**
     * The configured position of each total code, as numbers.
     *
     * @return array<string, float>
     */
    private function buildTotalsSort(): array
    {
        $configured = $this->scopeConfig->getValue(
            TotalsCollector::XML_PATH_SALES_TOTALS_SORT,
            ScopeInterface::SCOPE_STORE
        );
        $positions = [];
        foreach (is_array($configured) ? $configured : [] as $code => $position) {
            if (is_numeric($position)) {
                $positions[(string)$code] = (float)$position;
            }
        }
        return $positions;
    }

    private function flag(string $path): bool
    {
        return $this->scopeConfig->isSetFlag($path, ScopeInterface::SCOPE_STORE);
    }

    private function value(string $path): ?string
    {
        $value = $this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE);
        return $value === null ? null : (string)$value;
    }

    /**
     * Translate Magento's customer/address show flags ("", "opt", "req")
     * into the tri-state the address form expects ("no" | "opt" | "req").
     */
    private function normalizeShow(string $path, string $default): string
    {
        $raw = (string)$this->value($path);
        if ($raw === 'req') {
            return 'req';
        }
        if ($raw === 'opt') {
            return 'opt';
        }
        if ($raw === '' || $raw === '0') {
            return 'no';
        }
        return $default;
    }
}
