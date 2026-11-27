<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Eav\Model\Config as EavConfig;
use Magento\Eav\Model\Entity\Attribute as EavAttribute;
use Magento\Eav\Model\Entity\Attribute\Source\AbstractSource;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\AddressFields;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionPool;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionPool
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\AddressFields
 */
class ExtensionPoolTest extends TestCase
{
    private const BASE = 'https://shop.example/static/version1/';

    /** @var string[] */
    private array $logged = [];

    /**
     * @param array<string, mixed> $extensions
     * @param array<string, mixed> $addressFields
     * @param array<string, object> $classes
     * @param array<string, EavAttribute> $attributes
     */
    private function pool(
        array $extensions,
        array $addressFields = [],
        array $classes = [],
        array $attributes = []
    ): ExtensionPool {
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willReturnCallback(
            static fn (string $class) => $classes[$class] ?? throw new \RuntimeException('no class ' . $class)
        );
        $assets = $this->createStub(AssetRepository::class);
        $assets->method('getUrlWithParams')->willReturnCallback(
            static fn (string $id) => self::BASE . 'frontend/Magento/luma/en_US/' . str_replace('::', '/', $id)
        );
        $store = $this->createStub(Store::class);
        $store->method('isCurrentlySecure')->willReturn(true);
        $store->method('getBaseUrl')->willReturn('https://shop.example/');
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $unknown = $this->createStub(EavAttribute::class);
        $unknown->method('getId')->willReturn(null);
        $eav = $this->createStub(EavConfig::class);
        $eav->method('getAttribute')->willReturnCallback(
            static fn (string $type, string $code) => $attributes[$code] ?? $unknown
        );

        $logger = $this->createStub(LoggerInterface::class);
        $logger->method('log')->willReturnCallback(function ($level, $message): void {
            $this->logged[] = (string) $message;
        });
        $logger->method('error')->willReturnCallback(function ($message): void {
            $this->logged[] = (string) $message;
        });
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        $logOnce = new LogOnce($logger, $cache);
        $rules = new EntryRules($objectManager, $assets, $storeManager, $logOnce);

        return new ExtensionPool(
            $rules,
            new AddressFields($eav, $rules, $logOnce, $logger),
            $logOnce,
            $logger,
            $extensions,
            $addressFields
        );
    }

    /**
     * @param array<int, array{value: string, label: string}> $options
     */
    private function attribute(string $label, string $input = 'text', array $options = []): EavAttribute
    {
        $attribute = $this->createStub(EavAttribute::class);
        $attribute->method('getId')->willReturn(321);
        $attribute->method('getStoreLabel')->willReturn($label);
        $attribute->method('getFrontendInput')->willReturn($input);
        $attribute->method('usesSource')->willReturn($options !== []);
        $source = $this->createStub(AbstractSource::class);
        $source->method('getAllOptions')->willReturn($options);
        $attribute->method('getSource')->willReturn($source);
        return $attribute;
    }

    private function quote(): CartInterface
    {
        return $this->createStub(CartInterface::class);
    }

    public function testAModuleEntryWithDeclarativeSlotsIsEmitted(): void
    {
        $config = $this->pool(['vendor_vat_check' => [
            'module' => 'Vendor_Vat::js/hyperion/vat-check.js',
            'required' => true,
            'slots' => [
                'later' => ['slot' => 'summary-after-totals', 'tag' => 'vendor-vat-total', 'sort_order' => 20],
                'notice' => ['slot' => 'after-shipping-address', 'tag' => 'vendor-vat-notice'],
            ],
            'options' => ['strict' => true],
            'phrases' => ['invalid' => 'The VAT number is not valid.'],
        ]])->buildExtensions($this->quote());

        self::assertEquals([[
            'name' => 'vendor_vat_check',
            'moduleUrl' => self::BASE . 'frontend/Magento/luma/en_US/Vendor_Vat/js/hyperion/vat-check.js',
            'builtin' => null,
            'apiVersion' => '1',
            'required' => true,
            'slots' => [
                ['slot' => 'after-shipping-address', 'tag' => 'vendor-vat-notice', 'sortOrder' => 0],
                ['slot' => 'summary-after-totals', 'tag' => 'vendor-vat-total', 'sortOrder' => 20],
            ],
            'options' => (object) ['strict' => true],
            'phrases' => (object) ['The VAT number is not valid.' => 'The VAT number is not valid.'],
        ]], $config);
        self::assertSame([], $this->logged);
    }

    public function testAFirstPartyBuiltinEntryCarriesNoModuleUrl(): void
    {
        $config = $this->pool(['hyperion_order_comment' => [
            'internal' => true,
            'builtin' => 'order-comment',
        ]])->buildExtensions($this->quote());

        self::assertNull($config[0]['moduleUrl']);
        self::assertSame('order-comment', $config[0]['builtin']);
        self::assertSame([], $config[0]['slots']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidExtensions(): array
    {
        return [
            'nothing to load or render' => [['required' => true], 'needs a "module", a "builtin" or "slots"'],
            'builtin without internal' => [['builtin' => 'order-comment'], 'needs a "module", a "builtin" or "slots"'],
            'internal builtin outside the first-party list' => [
                ['internal' => true, 'builtin' => 'vendor-widget'],
                'needs a "module", a "builtin" or "slots"',
            ],
            'unknown slot' => [
                ['slots' => ['a' => ['slot' => 'header', 'tag' => 'vendor-banner']]],
                'unknown checkout slot',
            ],
            'reserved tag prefix in a slot' => [
                ['slots' => ['a' => ['slot' => 'after-email', 'tag' => 'checkout-banner']]],
                'the tag prefix "checkout-" is reserved',
            ],
            'unsupported api version' => [['module' => 'Vendor_A::a.js', 'api_version' => '2.0'], 'is not supported'],
        ];
    }

    /**
     * @param array<string, mixed> $item
     */
    #[DataProvider('invalidExtensions')]
    public function testAnInvalidExtensionIsDroppedAndLogged(array $item, string $reason): void
    {
        $config = $this->pool(['vendor_entry' => $item])->buildExtensions($this->quote());

        self::assertSame([], $config);
        $dropped = (string) end($this->logged);
        self::assertStringContainsString('"vendor_entry" dropped', $dropped);
        self::assertStringContainsString($reason, $dropped);
    }

    public function testABuiltinNextToAModuleIsIgnoredAndTheModuleServesTheEntry(): void
    {
        $config = $this->pool(['hyperion_widget' => [
            'internal' => true,
            'builtin' => 'order-comment',
            'module' => 'Magentofullstackdev_HyperionCheckout::js/widget.js',
        ]])->buildExtensions($this->quote());

        self::assertNull($config[0]['builtin']);
        self::assertNotNull($config[0]['moduleUrl']);
        self::assertStringContainsString('"builtin" needs "internal" and no "module"', $this->logged[0]);
    }

    public function testAThirdPartyItemClaimingAFirstPartyBuiltinOnlyGetsThatFirstPartyChunk(): void
    {
        $config = $this->pool(['vendor_copy' => [
            'internal' => true,
            'builtin' => 'newsletter-optin',
            'slots' => ['a' => ['slot' => 'after-email', 'tag' => 'hc-newsletter-optin']],
        ]])->buildExtensions($this->quote());

        self::assertSame('newsletter-optin', $config[0]['builtin']);
        self::assertNull($config[0]['moduleUrl']);
    }

    public function testInternalWithoutAFirstPartyModuleOrBuiltinDoesNotOpenTheReservedTags(): void
    {
        $config = $this->pool(['vendor_slots' => [
            'internal' => true,
            'slots' => ['a' => ['slot' => 'after-email', 'tag' => 'hc-banner']],
        ]])->buildExtensions($this->quote());

        self::assertSame([], $config);
        self::assertStringContainsString('the tag prefix "hc-" is reserved', (string) end($this->logged));
    }

    public function testUnknownKeysOfAnEntryAndOfASlotAreIgnoredWithANotice(): void
    {
        $config = $this->pool(['vendor_vat' => [
            'module' => 'Vendor_Vat::js/vat.js',
            'priority' => 3,
            'slots' => ['a' => ['slot' => 'after-email', 'tag' => 'vendor-vat', 'width' => 'full']],
        ]])->buildExtensions($this->quote());

        self::assertSame(['vendor_vat'], array_column($config, 'name'));
        self::assertCount(2, $this->logged);
        self::assertStringContainsString('the key "priority" is not known', $this->logged[0]);
        self::assertStringContainsString('slot "a": the key "width" is not known', $this->logged[1]);
    }

    public function testASkippingOptionsProviderLeavesTheEntryOutSilently(): void
    {
        $provider = $this->createStub(ExtensionOptionsProviderInterface::class);
        $provider->method('getOptions')->willThrowException(new SkipExtensionException('off'));

        $pool = $this->pool(
            ['hyperion_order_comment' => ['internal' => true, 'builtin' => 'order-comment', 'options_provider' => 'P']],
            [],
            ['P' => $provider]
        );

        self::assertTrue($pool->hasExtensions());
        self::assertSame([], $pool->buildExtensions($this->quote()));
        self::assertSame([], $this->logged);
    }

    public function testAnExtensionAttributeFieldIsEmittedWithItsDefaults(): void
    {
        $fields = $this->pool([], ['sdi_code' => [
            'label' => 'SDI code',
            'target' => 'extension_attributes',
            'pattern' => '^[A-Z0-9]{7}$',
            'countries' => ['it' => 'it'],
        ]])->getAddressFields();

        self::assertSame([[
            'code' => 'sdi_code',
            'label' => 'SDI code',
            'type' => 'text',
            'target' => 'extension_attributes',
            'forms' => ['shipping', 'billing'],
            'required' => false,
            'pattern' => '^[A-Z0-9]{7}$',
            'maxLength' => null,
            'options' => [],
            'countries' => ['IT'],
            'autocomplete' => null,
            'hint' => null,
            'sortOrder' => 1000,
        ]], $fields);
    }

    public function testACustomAttributeFieldTakesItsLabelAndOptionsFromTheAttribute(): void
    {
        $fields = $this->pool([], ['customer_kind' => [
            'target' => 'custom_attributes',
            'forms' => ['billing' => 'billing'],
            'required' => true,
            'sort_order' => 200,
        ]], [], ['customer_kind' => $this->attribute('Customer kind', 'select', [
            ['value' => '', 'label' => ' '],
            ['value' => 1, 'label' => 'Private'],
            ['value' => 2, 'label' => 'Company'],
        ])])->getAddressFields();

        self::assertSame('Customer kind', $fields[0]['label']);
        self::assertSame('select', $fields[0]['type']);
        self::assertSame(['billing'], $fields[0]['forms']);
        self::assertSame([
            ['value' => '1', 'label' => 'Private'],
            ['value' => '2', 'label' => 'Company'],
        ], $fields[0]['options']);
        self::assertSame(200, $fields[0]['sortOrder']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidFields(): array
    {
        return [
            'custom attribute that does not exist' => [
                ['target' => 'custom_attributes'],
                'no customer address attribute "fiscal_code"',
            ],
            'extension attribute without a label' => [['target' => 'extension_attributes'], 'a label is required'],
            'unknown target' => [['target' => 'quote', 'label' => 'X'], 'the target must be'],
            'select without options' => [
                ['target' => 'extension_attributes', 'label' => 'X', 'type' => 'select'],
                'a select field needs options',
            ],
            'unknown type' => [['target' => 'extension_attributes', 'label' => 'X', 'type' => 'color'], 'the type must be'],
            'unknown form' => [
                ['target' => 'extension_attributes', 'label' => 'X', 'forms' => ['account']],
                'forms must list',
            ],
            'country that is not a code' => [
                ['target' => 'extension_attributes', 'label' => 'X', 'countries' => ['Italy']],
                'ISO 3166-1',
            ],
        ];
    }

    /**
     * @param array<string, mixed> $item
     */
    #[DataProvider('invalidFields')]
    public function testAnInvalidAddressFieldIsDroppedAndLogged(array $item, string $reason): void
    {
        $fields = $this->pool([], ['fiscal_code' => $item])->getAddressFields();

        self::assertSame([], $fields);
        self::assertStringContainsString('address field "fiscal_code" dropped', $this->logged[0]);
        self::assertStringContainsString($reason, $this->logged[0]);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function patternsTheBrowserCannotUse(): array
    {
        return [
            'does not compile' => ['^[A-Z'],
            'possessive quantifier' => ['^[A-Z]++$'],
            'end of subject anchor' => ['^[A-Z0-9]{7}\\z'],
            'inline flag' => ['(?i)^[a-z]{7}$'],
        ];
    }

    #[DataProvider('patternsTheBrowserCannotUse')]
    public function testAnUnusablePatternIsIgnoredAndTheFieldStays(string $pattern): void
    {
        $fields = $this->pool([], ['sdi_code' => [
            'target' => 'extension_attributes',
            'label' => 'SDI code',
            'pattern' => $pattern,
        ]])->getAddressFields();

        self::assertNull($fields[0]['pattern']);
        self::assertStringContainsString('the value of "pattern" is invalid', $this->logged[0]);
    }

    public function testRequiredFlagsWrittenAsTheStringFalseAreFalse(): void
    {
        $pool = $this->pool(
            ['vendor_vat' => ['module' => 'Vendor_Vat::js/vat.js', 'required' => 'false']],
            ['sdi_code' => ['target' => 'extension_attributes', 'label' => 'SDI code', 'required' => 'false']]
        );

        self::assertFalse($pool->buildExtensions($this->quote())[0]['required']);
        self::assertFalse($pool->getAddressFields()[0]['required']);
    }

    public function testFieldCodesAreGroupedByTarget(): void
    {
        $codes = $this->pool([], [
            'fiscal_code' => ['target' => 'custom_attributes'],
            'sdi_code' => ['target' => 'extension_attributes', 'label' => 'SDI code'],
        ], [], ['fiscal_code' => $this->attribute('Fiscal code')])->getAddressFieldCodes();

        self::assertSame(['custom_attributes' => ['fiscal_code'], 'extension_attributes' => ['sdi_code']], $codes);
    }
}
