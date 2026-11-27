<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Shipping;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Quote\Api\Data\CartInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExtensionOptionsProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\ShippingExtensionValueProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use Magentofullstackdev\HyperionCheckout\Model\Shipping\ExtensionPool;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Shipping\ExtensionPool
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules
 */
class ExtensionPoolTest extends TestCase
{
    private const BASE = 'https://shop.example/';
    private const STATIC = 'https://static.example/static/';

    /** @var string[] */
    private array $logged = [];

    /**
     * @return array<string, mixed>
     */
    private static function locker(array $override = []): array
    {
        return array_replace([
            'match' => ['carrier' => 'vendorcarrier', 'method' => '/^locker_/'],
            'slot' => 'below-method',
            'tag' => 'vendor-locker-picker',
            'module' => 'Vendor_Lockers::js/hyperion/locker-picker.js',
            'required' => true,
            'sort_order' => 10,
        ], $override);
    }

    /**
     * @param array<string, mixed> $extensions
     * @param array<string, object> $classes
     */
    private function pool(array $extensions, array $classes = [], string $moduleBase = self::BASE): ExtensionPool
    {
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willReturnCallback(
            static fn (string $class) => $classes[$class] ?? throw new \RuntimeException('no class ' . $class)
        );
        $assets = $this->createStub(AssetRepository::class);
        $assets->method('getUrlWithParams')->willReturnCallback(
            static fn (string $id) => $moduleBase . 'frontend/Magento/luma/en_US/' . str_replace('::', '/', $id)
        );
        $store = $this->createStub(Store::class);
        $store->method('isCurrentlySecure')->willReturn(true);
        $store->method('getBaseUrl')->willReturnCallback(
            static fn (string $type) => $type === 'static' ? self::STATIC : self::BASE
        );
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

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

        return new ExtensionPool(
            new EntryRules($objectManager, $assets, $storeManager, $logOnce),
            $logOnce,
            $logger,
            $extensions
        );
    }

    private function quote(): CartInterface
    {
        return $this->createStub(CartInterface::class);
    }

    public function testAValidEntryIsEmittedInTheShippingExtensionShape(): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker(['phrases' => ['pick' => 'Choose a locker']])])
            ->build($this->quote());

        self::assertCount(1, $config);
        $entry = $config[0];
        self::assertSame('vendor_lockers', $entry['id']);
        self::assertSame(['carrier' => 'vendorcarrier', 'method' => '/^locker_/'], $entry['match']);
        self::assertSame('below-method', $entry['slot']);
        self::assertSame('vendor-locker-picker', $entry['tag']);
        self::assertSame(
            self::BASE . 'frontend/Magento/luma/en_US/Vendor_Lockers/js/hyperion/locker-picker.js',
            $entry['moduleUrl']
        );
        self::assertNull($entry['kit']);
        self::assertSame('1', $entry['apiVersion']);
        self::assertTrue($entry['required']);
        self::assertSame(10, $entry['sortOrder']);
        self::assertEquals((object) [], $entry['options']);
        self::assertEquals((object) ['Choose a locker' => 'Choose a locker'], $entry['phrases']);
        self::assertNull($entry['value']);
        self::assertSame([], $this->logged);
    }

    /**
     * @return array<string, array{0: array<string, string>}>
     */
    public static function validMatches(): array
    {
        return [
            'exact carrier and method' => [['carrier' => 'flatrate', 'method' => 'flatrate']],
            'any method of a carrier' => [['carrier' => 'tablerate', 'method' => '*']],
            'carrier only' => [['carrier' => 'vendorcarrier']],
            'method only, as an expression' => [['method' => '/^(locker|pickup)_[0-9]+$/']],
            'expression with a slash inside' => [['method' => '/^a\/b$/']],
        ];
    }

    /**
     * @param array<string, string> $match
     */
    #[DataProvider('validMatches')]
    public function testEveryMatchFormIsAccepted(array $match): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker(['match' => $match])])->build($this->quote());

        self::assertCount(1, $config);
        self::assertSame($match['carrier'] ?? null, $config[0]['match']['carrier']);
        self::assertSame($match['method'] ?? null, $config[0]['match']['method']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidEntries(): array
    {
        return [
            'expression that does not compile' => [
                ['match' => ['carrier' => 'vendorcarrier', 'method' => '/^locker_(/']],
                'not a valid regular expression',
            ],
            'code with spaces' => [['match' => ['carrier' => 'vendor carrier']], 'must be a code'],
            'empty match on a method slot' => [['match' => null], 'needs a "match"'],
            'unknown slot' => [['slot' => 'above-everything'], 'the slot must be one of'],
            'reserved tag prefix' => [['tag' => 'shipping-locker'], 'the tag prefix "shipping-" is reserved'],
            'tag without a hyphen' => [['tag' => 'locker'], 'not a valid custom element name'],
            'module that is not an asset id' => [['module' => 'https://cdn.example/x.js'], 'asset id'],
            'unsupported api version' => [['api_version' => '2'], '"api_version" "2" is not supported'],
            'module without a tag' => [['tag' => ''], '"module" and "tag" are required'],
        ];
    }

    /**
     * @param array<string, mixed> $override
     */
    #[DataProvider('invalidEntries')]
    public function testAnInvalidEntryIsDroppedAndLogged(array $override, string $reason): void
    {
        $config = $this->pool([
            'vendor_lockers' => self::locker($override),
            'vendor_slots' => self::locker(['match' => null, 'slot' => 'after-methods', 'tag' => 'vendor-slots']),
        ])->build($this->quote());

        self::assertSame(['vendor_slots'], array_column($config, 'id'));
        self::assertCount(1, $this->logged);
        self::assertStringContainsString('"vendor_lockers" dropped', $this->logged[0]);
        self::assertStringContainsString($reason, $this->logged[0]);
    }

    public function testInternalClaimedByAForeignModuleIsIgnoredAndTheEntryStays(): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker(['internal' => true])])->build($this->quote());

        self::assertSame(['vendor_lockers'], array_column($config, 'id'));
        self::assertCount(1, $this->logged);
        self::assertStringContainsString('"internal" is reserved to the Hyperion modules and is ignored', $this->logged[0]);
    }

    public function testAForeignModuleClaimingInternalStillObeysTheTagPrefixes(): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker(['internal' => true, 'tag' => 'hc-locker'])])
            ->build($this->quote());

        self::assertSame([], $config);
        self::assertStringContainsString('the tag prefix "hc-" is reserved', $this->logged[1]);
    }

    public function testAnUnknownKeyIsIgnoredWithANoticeAndTheEntryStays(): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker(['map_style' => 'dark'])])->build($this->quote());

        self::assertSame(['vendor_lockers'], array_column($config, 'id'));
        self::assertCount(1, $this->logged);
        self::assertStringContainsString('the key "map_style" is not known and is ignored', $this->logged[0]);
    }

    public function testARequiredFlagWrittenAsTheStringFalseIsFalse(): void
    {
        $config = $this->pool([
            'a' => self::locker(['required' => 'false', 'tag' => 'vendor-a']),
            'b' => self::locker(['required' => 'true', 'tag' => 'vendor-b']),
        ])->build($this->quote());

        self::assertSame([false, true], array_column($config, 'required'));
    }

    public function testAnApiVersionWithMajorOneAndASuffixIsAccepted(): void
    {
        $config = $this->pool([
            'a' => self::locker(['api_version' => '1-beta', 'tag' => 'vendor-a']),
            'b' => self::locker(['api_version' => '1.0-beta', 'tag' => 'vendor-b']),
            'c' => self::locker(['api_version' => 1, 'tag' => 'vendor-c']),
        ])->build($this->quote());

        self::assertSame(['1-beta', '1.0-beta', '1'], array_column($config, 'apiVersion'));
    }

    public function testAMatchExpressionTheBrowserCannotCompileDropsTheEntry(): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker(['match' => ['method' => '/^locker_\\d++$/']])])
            ->build($this->quote());

        self::assertSame([], $config);
        self::assertStringContainsString('not a valid regular expression', $this->logged[0]);
    }

    public function testAnEntryWithoutMatchIsAllowedOnlyAfterTheMethodsOrInPlaceOfTheAddress(): void
    {
        $config = $this->pool([
            'vendor_slots' => self::locker(['match' => null, 'slot' => 'after-methods', 'tag' => 'vendor-slots']),
            'vendor_pickup' => self::locker(['match' => null, 'slot' => 'replaces-address', 'tag' => 'vendor-pickup']),
        ])->build($this->quote());

        self::assertSame([null, null], array_column($config, 'match'));
        self::assertSame([], $this->logged);
    }

    public function testAKitEntryIsDroppedBecauseKitsAreNotAvailable(): void
    {
        $config = $this->pool([
            'vendor_kit' => ['kit' => 'pickup_points', 'slot' => 'replaces-address'],
        ])->build($this->quote());

        self::assertSame([], $config);
        self::assertStringContainsString('kits are not available in this version', $this->logged[0]);
    }

    public function testAKitNextToAModuleIsRefused(): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker(['kit' => 'pickup_points'])])->build($this->quote());

        self::assertSame([], $config);
        self::assertStringContainsString('either "kit" or "module" and "tag"', $this->logged[0]);
    }

    public function testEntriesAreSortedBySortOrder(): void
    {
        $config = $this->pool([
            'second' => self::locker(['sort_order' => 20, 'tag' => 'vendor-second']),
            'first' => self::locker(['sort_order' => 5, 'tag' => 'vendor-first']),
        ])->build($this->quote());

        self::assertSame(['first', 'second'], array_column($config, 'id'));
    }

    public function testFirstPartyEntriesMayUseReservedTagPrefixes(): void
    {
        $config = $this->pool(['hyperion_pickup' => self::locker([
            'internal' => true,
            'tag' => 'hc-pickup',
            'module' => 'Magentofullstackdev_HyperionCheckout::js/pickup.js',
        ])])->build($this->quote());

        self::assertSame('hc-pickup', $config[0]['tag']);
    }

    public function testProvidersFillOptionsAndTheStoredValue(): void
    {
        $options = $this->createStub(ExtensionOptionsProviderInterface::class);
        $options->method('getOptions')->willReturn(['country' => 'IT', 'radius' => 5]);
        $value = $this->createStub(ShippingExtensionValueProviderInterface::class);
        $value->method('getValue')->willReturn([
            'address' => ['vendor_locker_id' => 'L-12'],
            'summary' => ['label' => 'Locker', 'lines' => ['Via Roma 1', 'Milano', '20100', 'too many']],
            'unknown' => 'dropped',
        ]);

        $config = $this->pool(
            ['vendor_lockers' => self::locker([
                'options' => ['radius' => 2, 'map' => true],
                'options_provider' => 'Vendor\\Options',
                'value_provider' => 'Vendor\\Value',
            ])],
            ['Vendor\\Options' => $options, 'Vendor\\Value' => $value]
        )->build($this->quote());

        self::assertEquals((object) ['radius' => 5, 'map' => true, 'country' => 'IT'], $config[0]['options']);
        self::assertSame([
            'address' => ['vendor_locker_id' => 'L-12'],
            'summary' => ['label' => 'Locker', 'lines' => ['Via Roma 1', 'Milano', '20100']],
        ], $config[0]['value']);
    }

    public function testAThrowingProviderDropsOnlyItsEntryAndIsLogged(): void
    {
        $options = $this->createStub(ExtensionOptionsProviderInterface::class);
        $options->method('getOptions')->willThrowException(new \RuntimeException('down'));

        $config = $this->pool(
            [
                'broken' => self::locker(['options_provider' => 'Vendor\\Options', 'tag' => 'vendor-broken']),
                'fine' => self::locker(['tag' => 'vendor-fine']),
            ],
            ['Vendor\\Options' => $options]
        )->build($this->quote());

        self::assertSame(['fine'], array_column($config, 'id'));
        self::assertStringContainsString('provider failed', $this->logged[0]);
    }

    public function testASkippingProviderDropsItsEntryWithoutALogLine(): void
    {
        $options = $this->createStub(ExtensionOptionsProviderInterface::class);
        $options->method('getOptions')->willThrowException(new SkipExtensionException('off'));

        $config = $this->pool(
            ['vendor_lockers' => self::locker(['options_provider' => 'Vendor\\Options'])],
            ['Vendor\\Options' => $options]
        )->build($this->quote());

        self::assertSame([], $config);
        self::assertSame([], $this->logged);
    }

    public function testAProviderOfTheWrongTypeDropsItsEntry(): void
    {
        $config = $this->pool(
            ['vendor_lockers' => self::locker(['options_provider' => 'Vendor\\Options'])],
            ['Vendor\\Options' => new \stdClass()]
        )->build($this->quote());

        self::assertSame([], $config);
        self::assertStringContainsString('does not implement', $this->logged[0]);
    }

    public function testAModuleOnTheStaticOriginReportsThatOrigin(): void
    {
        $origins = [];
        $config = $this->pool(['vendor_lockers' => self::locker()], [], self::STATIC)
            ->build($this->quote(), $origins);

        self::assertCount(1, $config);
        self::assertSame(['https://static.example'], $origins);
    }

    public function testAModuleOnAForeignOriginIsDropped(): void
    {
        $config = $this->pool(['vendor_lockers' => self::locker()], [], 'https://evil.example/')
            ->build($this->quote());

        self::assertSame([], $config);
        self::assertStringContainsString('is not served from the store or its static files origin', $this->logged[0]);
    }

    public function testAStockInstallHasNoEntries(): void
    {
        $pool = $this->pool([]);

        self::assertFalse($pool->hasEntries());
        self::assertSame([], $pool->build($this->quote()));
    }
}
