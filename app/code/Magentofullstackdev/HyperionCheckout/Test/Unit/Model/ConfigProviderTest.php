<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model;

use Magento\Directory\Helper\Data as DirectoryHelper;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\DataObject;
use Magento\Framework\Locale\ResolverInterface;
use Magento\Framework\Phrase;
use Magento\Framework\Phrase\RendererInterface;
use Magento\Framework\Url\EncoderInterface;
use Magento\Framework\UrlInterface;
use Magento\Quote\Model\Quote\Validator\MinimumOrderAmount\ValidationMessage;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\TranslationCatalog;
use Magentofullstackdev\HyperionCheckout\Model\Config\Source\RateFields;
use Magentofullstackdev\HyperionCheckout\Model\Config\Source\ShippingPreselect;
use Magentofullstackdev\HyperionCheckout\Model\ConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\GiftMessageBridge;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\ConfigProvider
 */
class ConfigProviderTest extends TestCase
{
    /**
     * The client's phrase lists, relative to this file inside the repository.
     */
    private const ERROR_KINDS_SOURCE = '/../../../../../../../frontend/packages/module-checkout/src/api/error-kinds.ts';

    private const PHRASE_CONSTANTS = [
        'CART_LOCKED_PHRASE',
        'SHIPPING_METHOD_REJECTED_PHRASES',
        'STOCK_PHRASES',
        'CAPTCHA_PHRASES',
    ];

    private RendererInterface $originalRenderer;

    protected function setUp(): void
    {
        $this->originalRenderer = Phrase::getRenderer();
    }

    protected function tearDown(): void
    {
        Phrase::setRenderer($this->originalRenderer);
    }

    /**
     * @param array<string, mixed> $values configuration values by path
     * @param array<string, mixed> $directory `required`, `showAll`, `top`
     */
    private function provider(array $values = [], array $directory = []): ConfigProvider
    {
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(static fn (string $path) => $values[$path] ?? null);
        $scopeConfig->method('isSetFlag')->willReturnCallback(
            static fn (string $path): bool => !empty($values[$path]) && $values[$path] !== 'false'
        );

        $directoryHelper = $this->createStub(DirectoryHelper::class);
        $directoryHelper->method('getRegionData')->willReturn([
            'config' => ['show_all_regions' => true],
            'US' => [57 => ['code' => 'TX', 'name' => 'Texas']],
        ]);
        $directoryHelper->method('getCountriesWithStatesRequired')->willReturn($directory['required'] ?? ['US']);
        $directoryHelper->method('isShowNonRequiredState')->willReturn($directory['showAll'] ?? false);
        $directoryHelper->method('getTopCountryCodes')->willReturn($directory['top'] ?? []);
        $directoryHelper->method('getCountriesWithOptionalZip')->willReturn(['IE']);
        $directoryHelper->method('getCountryCollection')->willReturn([
            new DataObject(['country_id' => 'US', 'name' => 'United States']),
            new DataObject(['country_id' => 'IT', 'name' => 'Italy']),
        ]);

        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getBaseUrl')->willReturn('https://store.test/');
        $urlBuilder->method('getUrl')->willReturnCallback(
            static function (?string $route = null, ?array $params = null): string {
                $url = 'https://store.test/' . trim((string)$route, '/') . '/';
                foreach ($params ?? [] as $key => $value) {
                    if ($key[0] !== '_') {
                        $url .= $key . '/' . $value . '/';
                    }
                }
                return $url;
            }
        );
        $urlEncoder = $this->createStub(EncoderInterface::class);
        $urlEncoder->method('encode')->willReturnCallback(
            static fn (string $url): string => strtr(base64_encode($url), '+/=', '-_~')
        );

        $giftMessages = $this->createStub(GiftMessageBridge::class);
        $giftMessages->method('getCheckoutConfig')->willReturn([]);
        $locale = $this->createStub(ResolverInterface::class);
        $locale->method('getLocale')->willReturn('it_IT');
        $translations = $this->createStub(TranslationCatalog::class);
        $translations->method('getTranslations')->willReturn(['Place Order' => 'Effettua ordine']);
        $minimumOrderMessage = $this->createStub(ValidationMessage::class);
        $minimumOrderMessage->method('getMessage')->willReturn(new Phrase('Minimum order amount is %1', ['€50.00']));

        return new ConfigProvider(
            $scopeConfig,
            $directoryHelper,
            $urlBuilder,
            $giftMessages,
            $locale,
            $translations,
            $urlEncoder,
            $minimumOrderMessage,
            new RateFields(),
            new ShippingPreselect()
        );
    }

    public function testEmitsTheModuleSettingsWithTheirFallbacks(): void
    {
        $hyperion = $this->provider()->getConfig()['hyperion'];

        self::assertFalse($hyperion['enabled']);
        self::assertSame(['country_id', 'region', 'postcode'], $hyperion['rateFields']);
        self::assertSame('cheapest', $hyperion['shippingPreselect']);
        self::assertFalse($hyperion['persistDrafts']);
        self::assertSame('it_IT', $hyperion['locale']);
        self::assertSame('https://store.test/', $hyperion['baseUrl']);
        self::assertSame(['Place Order' => 'Effettua ordine'], $hyperion['translations']);
    }

    public function testEmitsTheConfiguredRateFieldsPreselectionAndDraftSwitch(): void
    {
        $hyperion = $this->provider([
            'hyperion_checkout/general/enabled' => '1',
            'hyperion_checkout/shipping/rate_fields' => 'country_id,region,postcode,city',
            'hyperion_checkout/shipping/preselect' => 'none',
            'hyperion_checkout/general/persist_drafts' => '1',
        ])->getConfig()['hyperion'];

        self::assertTrue($hyperion['enabled']);
        self::assertSame(['country_id', 'region', 'postcode', 'city'], $hyperion['rateFields']);
        self::assertSame('none', $hyperion['shippingPreselect']);
        self::assertTrue($hyperion['persistDrafts']);
        self::assertStringContainsString(
            '"rateFields":["country_id","region","postcode","city"]',
            (string)json_encode($hyperion)
        );
    }

    #[DataProvider('guestLoginOption')]
    public function testTheGuestCheckoutLoginOptionIsAJsonBoolean(?string $stored, bool $expected, string $json): void
    {
        $hyperion = $this->provider(['checkout/options/enable_guest_checkout_login' => $stored])
            ->getConfig()['hyperion'];

        self::assertSame($expected, $hyperion['guestCheckoutLoginEnabled']);
        self::assertStringContainsString('"guestCheckoutLoginEnabled":' . $json, (string)json_encode($hyperion));
    }

    /**
     * @return array<string, array{?string, bool, string}>
     */
    public static function guestLoginOption(): array
    {
        return ['on' => ['1', true, 'true'], 'off' => ['0', false, 'false'], 'unset' => [null, false, 'false']];
    }

    public function testTheLoginUrlReturnsToTheCheckoutPage(): void
    {
        $hyperion = $this->provider()->getConfig()['hyperion'];
        $referer = strtr(base64_encode('https://store.test/checkout/'), '+/=', '-_~');

        self::assertSame('https://store.test/customer/account/login/referer/' . $referer . '/', $hyperion['loginUrl']);
        self::assertSame('https://store.test/checkout/cart/', $hyperion['cartUrl']);
        self::assertSame('https://store.test/customer/account/forgotpassword/', $hyperion['forgotPasswordUrl']);
    }

    /**
     * @param string[] $configured
     * @param string[] $expected
     */
    #[DataProvider('topDestinations')]
    public function testEmitsTheTopDestinationsAsAListOfCountryCodes(array $configured, array $expected): void
    {
        $hyperion = $this->provider([], ['top' => $configured])->getConfig()['hyperion'];

        self::assertSame($expected, $hyperion['topDestinations']);
        self::assertTrue(array_is_list($hyperion['topDestinations']));
    }

    /**
     * @return array<string, array{string[], string[]}>
     */
    public static function topDestinations(): array
    {
        return [
            'none' => [[], []],
            'two' => [['IT', 'DE'], ['IT', 'DE']],
            'blank and repeated entries dropped' => [['it', '', ' DE ', 'IT'], ['IT', 'DE']],
        ];
    }

    public function testNoMinimumOrderWhileTheRuleIsOff(): void
    {
        $config = $this->provider(['sales/minimum_order/amount' => '50'])->getConfig();

        self::assertArrayHasKey('minimumOrder', $config['hyperion']);
        self::assertNull($config['hyperion']['minimumOrder']);
    }

    public function testEmitsTheMinimumOrderRuleInNumbers(): void
    {
        $minimum = $this->provider([
            'sales/minimum_order/active' => '1',
            'sales/minimum_order/amount' => '50.5',
            'sales/minimum_order/include_discount_amount' => '1',
            'sales/minimum_order/tax_including' => '0',
        ])->getConfig()['hyperion']['minimumOrder'];

        self::assertSame(
            [
                'amount' => 50.5,
                'includeDiscount' => true,
                'includeTax' => false,
                'description' => 'Minimum order amount is €50.00',
            ],
            $minimum
        );
    }

    /**
     * @param string[] $required
     */
    #[DataProvider('regionVisibility')]
    public function testARegionIsVisibleWhenRequiredOrWhenEveryRegionIsShown(
        array $required,
        bool $showAll,
        bool $usRequired,
        bool $usVisible,
        bool $itVisible
    ): void {
        $directory = $this->provider([], ['required' => $required, 'showAll' => $showAll])
            ->getConfig()['directoryData'];

        self::assertSame($usRequired, $directory['US']['is_region_required']);
        self::assertSame($usVisible, $directory['US']['is_region_visible']);
        self::assertFalse($directory['IT']['is_region_required']);
        self::assertSame($itVisible, $directory['IT']['is_region_visible']);
        self::assertSame(['57' => ['code' => 'TX', 'name' => 'Texas']], $directory['US']['regions']);
        self::assertArrayNotHasKey('config', $directory);
    }

    /**
     * @return array<string, array{string[], bool, bool, bool, bool}>
     */
    public static function regionVisibility(): array
    {
        return [
            'required, optional ones hidden' => [['US'], false, true, true, false],
            'required, optional ones shown' => [['US'], true, true, true, true],
            'nothing required, hidden' => [[], false, false, false, false],
            'nothing required, shown' => [[], true, false, true, true],
        ];
    }

    public function testNoErrorPhrasesWhenTheLocaleTranslatesNone(): void
    {
        self::assertArrayNotHasKey('errorPhrases', $this->provider()->getConfig()['hyperion']);
    }

    public function testEmitsOnlyTheErrorPhrasesTheLocaleTranslates(): void
    {
        $translations = [
            'This product is out of stock.' => 'Questo prodotto è esaurito.',
            'Only %1 of %2 available' => 'Solo %1 di %2 disponibili',
            'Incorrect CAPTCHA' => 'Incorrect CAPTCHA',
        ];
        $renderer = $this->createStub(RendererInterface::class);
        $renderer->method('render')->willReturnCallback(
            static fn (array $source, array $arguments): string => $translations[end($source)] ?? (string)end($source)
        );
        Phrase::setRenderer($renderer);

        $hyperion = $this->provider()->getConfig()['hyperion'];

        self::assertSame(
            [
                'This product is out of stock.' => 'Questo prodotto è esaurito.',
                'Only %1 of %2 available' => 'Solo %1 di %2 disponibili',
            ],
            $hyperion['errorPhrases']
        );
    }

    public function testNoTotalsSortWhenTheStoreConfiguresNone(): void
    {
        self::assertArrayNotHasKey('totalsSort', $this->provider()->getConfig()['hyperion']);
        self::assertArrayNotHasKey(
            'totalsSort',
            $this->provider(['sales/totals_sort' => ['tax' => '', 'shipping' => 'last']])->getConfig()['hyperion']
        );
    }

    public function testEmitsTheNumericEntriesOfTheTotalsSortOrder(): void
    {
        $hyperion = $this->provider([
            'sales/totals_sort' => [
                'subtotal' => '10',
                'weee_tax' => '35',
                'tax' => 40,
                'grand_total' => '100',
                'shipping' => '',
                'discount' => 'first',
            ],
        ])->getConfig()['hyperion'];

        self::assertSame(
            ['subtotal' => 10.0, 'weee_tax' => 35.0, 'tax' => 40.0, 'grand_total' => 100.0],
            $hyperion['totalsSort']
        );
    }

    public function testThePlaceOrderRecaptchaKeyIsNotEmitted(): void
    {
        $config = $this->provider()->getConfig();

        self::assertArrayNotHasKey('recaptcha_for_place_order', $config);
        self::assertArrayNotHasKey('recaptcha', $config['hyperion']);
    }

    public function testTheErrorPhraseListHasNoRepeatedEntry(): void
    {
        self::assertSame(
            array_values(array_unique(ConfigProvider::ERROR_PHRASES)),
            ConfigProvider::ERROR_PHRASES
        );
        self::assertCount(23, ConfigProvider::ERROR_PHRASES);
    }

    /**
     * Compares the list with the client's phrase constants when the test
     * runs inside the repository (the package installed alone does not
     * carry the frontend sources; the count above is the check there).
     */
    public function testEveryPhraseTheClientClassifiesIsInTheList(): void
    {
        $file = __DIR__ . self::ERROR_KINDS_SOURCE;
        $source = is_file($file) ? (string)file_get_contents($file) : '';
        $clientPhrases = [];
        foreach (self::PHRASE_CONSTANTS as $constant) {
            if (preg_match('/export const ' . $constant . '\b[^=]*=\s*(.*?);\n/s', $source, $declaration) !== 1) {
                continue;
            }
            preg_match_all("/'((?:[^'\\\\]|\\\\.)*)'/", $declaration[1], $literals);
            foreach ($literals[1] as $literal) {
                $clientPhrases[] = stripslashes($literal);
            }
        }
        if ($source !== '') {
            self::assertCount(23, $clientPhrases, 'The phrase constants of error-kinds.ts were not all found.');
        }

        self::assertSame([], array_values(array_diff($clientPhrases, ConfigProvider::ERROR_PHRASES)));
    }
}
