<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Checkout;

use Magento\Checkout\Model\Session as CheckoutSession;
use Magento\Eav\Model\Config as EavConfig;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Quote\Model\Quote;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\AddressFields;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionPool;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionsConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Checkout\ShippingExtensionsConfigProvider;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use Magentofullstackdev\HyperionCheckout\Model\Shipping\ExtensionPool as ShippingExtensionPool;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The JSON both providers print for a stock install and for an install with
 * one sample entry in each pool.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\ExtensionsConfigProvider
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Checkout\ShippingExtensionsConfigProvider
 */
class ExtensionsConfigProvidersTest extends TestCase
{
    private const LOCKER = [
        'match' => ['carrier' => 'vendorcarrier', 'method' => '/^locker_/'],
        'slot' => 'below-method',
        'tag' => 'vendor-locker-picker',
        'module' => 'Vendor_Lockers::js/hyperion/locker-picker.js',
        'required' => true,
        'sort_order' => 10,
        'options' => ['mapZoom' => 14],
        'phrases' => ['choose' => 'Choose a locker'],
    ];

    private const VAT = [
        'module' => 'Vendor_Vat::js/hyperion/vat-check.js',
        'required' => true,
        'slots' => ['notice' => ['slot' => 'after-shipping-address', 'tag' => 'vendor-vat-notice']],
    ];

    private const SDI = [
        'label' => 'SDI code',
        'type' => 'text',
        'target' => 'extension_attributes',
        'forms' => ['billing' => 'billing'],
        'required' => true,
        'pattern' => '^[A-Z0-9]{7}$',
        'countries' => ['it' => 'IT'],
        'sort_order' => 200,
    ];

    private function rules(): EntryRules
    {
        $assets = $this->createStub(AssetRepository::class);
        $assets->method('getUrlWithParams')->willReturnCallback(
            static fn (string $id) => 'https://shop.example/static/version1/frontend/Magentofullstackdev/hyperion/en_US/'
                . str_replace('::', '/', $id)
        );
        $store = $this->createStub(Store::class);
        $store->method('isCurrentlySecure')->willReturn(true);
        $store->method('getBaseUrl')->willReturn('https://shop.example/');
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        return new EntryRules(
            $this->createStub(ObjectManagerInterface::class),
            $assets,
            $storeManager,
            $this->logOnce()
        );
    }

    private function logOnce(): LogOnce
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn(false);
        return new LogOnce($this->createStub(LoggerInterface::class), $cache);
    }

    private function session(bool $virtual = false): CheckoutSession
    {
        $quote = $this->createStub(Quote::class);
        $quote->method('getIsVirtual')->willReturn($virtual);
        $session = $this->createStub(CheckoutSession::class);
        $session->method('getQuote')->willReturn($quote);
        return $session;
    }

    private function scopeConfig(bool $enabled = true): ScopeConfigInterface
    {
        $config = $this->createStub(ScopeConfigInterface::class);
        $config->method('isSetFlag')->willReturn($enabled);
        return $config;
    }

    /**
     * @param array<string, mixed> $extensions
     */
    private function shipping(array $extensions, bool $virtual = false, bool $enabled = true): string
    {
        $provider = new ShippingExtensionsConfigProvider(
            new ShippingExtensionPool($this->rules(), $this->logOnce(), $this->createStub(LoggerInterface::class), $extensions),
            $this->session($virtual),
            $this->scopeConfig($enabled),
            $this->createStub(LoggerInterface::class)
        );
        return (string) json_encode($provider->getConfig(), JSON_UNESCAPED_SLASHES);
    }

    /**
     * @param array<string, mixed> $extensions
     * @param array<string, mixed> $fields
     */
    private function generic(array $extensions, array $fields, bool $enabled = true): string
    {
        $rules = $this->rules();
        $logger = $this->createStub(LoggerInterface::class);
        $provider = new ExtensionsConfigProvider(
            new ExtensionPool(
                $rules,
                new AddressFields($this->createStub(EavConfig::class), $rules, $this->logOnce(), $logger),
                $this->logOnce(),
                $logger,
                $extensions,
                $fields
            ),
            $this->session(),
            $this->scopeConfig($enabled),
            $logger
        );
        return (string) json_encode($provider->getConfig(), JSON_UNESCAPED_SLASHES);
    }

    public function testAStockInstallPrintsEmptyLists(): void
    {
        self::assertSame('{"hyperion":{"shippingExtensions":[]}}', $this->shipping([]));
        self::assertSame('{"hyperion":{"extensions":[],"addressFields":[]}}', $this->generic([], []));
    }

    public function testOneShippingExtensionIsPrinted(): void
    {
        self::assertSame(
            '{"hyperion":{"shippingExtensions":[{"id":"vendor_lockers",'
            . '"match":{"carrier":"vendorcarrier","method":"/^locker_/"},"slot":"below-method",'
            . '"tag":"vendor-locker-picker",'
            . '"moduleUrl":"https://shop.example/static/version1/frontend/Magentofullstackdev/hyperion/en_US/'
            . 'Vendor_Lockers/js/hyperion/locker-picker.js",'
            . '"kit":null,"apiVersion":"1","required":true,"sortOrder":10,"options":{"mapZoom":14},'
            . '"phrases":{"Choose a locker":"Choose a locker"},"value":null}]}}',
            $this->shipping(['vendor_lockers' => self::LOCKER])
        );
    }

    public function testAVirtualQuoteOrADisabledCheckoutPrintsNoShippingExtension(): void
    {
        self::assertSame('{"hyperion":{"shippingExtensions":[]}}', $this->shipping(['vendor_lockers' => self::LOCKER], true));
        self::assertSame(
            '{"hyperion":{"shippingExtensions":[]}}',
            $this->shipping(['vendor_lockers' => self::LOCKER], false, false)
        );
    }

    public function testOneGenericExtensionAndOneAddressFieldArePrinted(): void
    {
        self::assertSame(
            '{"hyperion":{"extensions":[{"name":"vendor_vat_check",'
            . '"moduleUrl":"https://shop.example/static/version1/frontend/Magentofullstackdev/hyperion/en_US/'
            . 'Vendor_Vat/js/hyperion/vat-check.js",'
            . '"builtin":null,"apiVersion":"1","required":true,'
            . '"slots":[{"slot":"after-shipping-address","tag":"vendor-vat-notice","sortOrder":0}],'
            . '"options":{},"phrases":{}}],'
            . '"addressFields":[{"code":"sdi_code","label":"SDI code","type":"text",'
            . '"target":"extension_attributes","forms":["billing"],"required":true,"pattern":"^[A-Z0-9]{7}$",'
            . '"maxLength":null,"options":[],"countries":["IT"],"autocomplete":null,"hint":null,"sortOrder":200}]}}',
            $this->generic(['vendor_vat_check' => self::VAT], ['sdi_code' => self::SDI])
        );
    }

    public function testADisabledCheckoutPrintsNoGenericExtension(): void
    {
        self::assertSame(
            '{"hyperion":{"extensions":[],"addressFields":[]}}',
            $this->generic(['vendor_vat_check' => self::VAT], ['sdi_code' => self::SDI], false)
        );
    }
}
