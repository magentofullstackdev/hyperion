<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Model;

use Magentofullstackdev\HyperionCheckout\Model\Checkout\TranslationCatalog;
use Magentofullstackdev\HyperionCore\ViewModel\Recaptcha;
use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Directory\Helper\Data as DirectoryHelper;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\UrlInterface;
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

    public const CONFIG_ENABLED = 'hyperion_checkout/general/enabled';

    private const STREET_LINES_PATH = 'customer/address/street_lines';
    private const COMPANY_SHOW_PATH = 'customer/address/company_show';
    private const TELEPHONE_SHOW_PATH = 'customer/address/telephone_show';
    private const FAX_SHOW_PATH = 'customer/address/fax_show';
    private const VAT_FRONTEND_VISIBILITY_PATH = 'customer/create_account/vat_frontend_visibility';

    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly DirectoryHelper $directoryHelper,
        private readonly Recaptcha $recaptcha,
        private readonly UrlInterface $urlBuilder,
        private readonly GiftMessageBridge $giftMessageBridge,
        private readonly ResolverInterface $localeResolver,
        private readonly TranslationCatalog $translationCatalog
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        return $this->giftMessageBridge->getCheckoutConfig() + [
            'hyperion' => [
                'checkoutVersion' => self::VERSION,
                'enabled' => $this->scopeConfig->isSetFlag(
                    self::CONFIG_ENABLED,
                    ScopeInterface::SCOPE_STORE
                ),
                'baseUrl' => $this->urlBuilder->getBaseUrl(['_type' => UrlInterface::URL_TYPE_WEB]),
                'locale' => (string)$this->localeResolver->getLocale(),
                'translations' => $this->translationCatalog->getTranslations(),
            ],
            'directoryData' => $this->buildDirectoryData(),
            'optionalZipCountries' => $this->directoryHelper->getCountriesWithOptionalZip(),
            'streetLines' => (int)$this->scopeConfig->getValue(
                self::STREET_LINES_PATH,
                ScopeInterface::SCOPE_STORE
            ) ?: 2,
            'companyConfig' => $this->normaliseShow(self::COMPANY_SHOW_PATH, 'opt'),
            'telephoneConfig' => $this->normaliseShow(self::TELEPHONE_SHOW_PATH, 'req'),
            'faxConfig' => $this->normaliseShow(self::FAX_SHOW_PATH, 'no'),
            'vatFrontendVisibility' => $this->scopeConfig->isSetFlag(
                self::VAT_FRONTEND_VISIBILITY_PATH,
                ScopeInterface::SCOPE_STORE
            ),
            // Site key for the place-order reCAPTCHA (v3). The Knockout
            // checkout received it through a layout processor on
            // `checkout.root`, which Hyperion removes; the Lit checkout reads
            // `recaptcha_for_place_order.rendering.sitekey` from this config
            // and sends the token as the `X-ReCaptcha` header
            // (Magento_ReCaptchaWebapiRest validates it).
            'recaptcha_for_place_order' => $this->recaptcha->getUiConfig('place_order'),
        ];
    }

    /**
     * Build a `country_id => { name, is_region_required, regions }` map
     * scoped to the store's allowed countries. Mirrors the shape stock
     * Magento exposes via `Magento\Checkout\CustomerData\DirectoryData`
     * plus an extra `is_region_required` flag so the address form can
     * gate the region field without a second config lookup.
     *
     * @return array<string, array<string, mixed>>
     */
    private function buildDirectoryData(): array
    {
        $regionsByCountry = $this->directoryHelper->getRegionData();
        // The helper prefixes the array with a `config` envelope that
        // doesn't belong in the per-country lookup.
        unset($regionsByCountry['config']);

        $regionsRequired = $this->directoryHelper->getCountriesWithStatesRequired();
        $output = [];
        foreach ($this->directoryHelper->getCountryCollection() as $country) {
            $countryId = (string)$country->getCountryId();
            if ($countryId === '') {
                continue;
            }
            $entry = [
                'name' => (string)$country->getName(),
                'is_region_required' => in_array($countryId, $regionsRequired, true),
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
     * Translate Magento's customer/address show flags ("", "opt", "req")
     * into the tri-state the address form expects ("no" | "opt" | "req").
     */
    private function normaliseShow(string $path, string $default): string
    {
        $raw = (string)$this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE);
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
