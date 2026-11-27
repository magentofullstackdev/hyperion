<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Model\Payment;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\ObjectManagerInterface;
use Magento\Framework\Phrase;
use Magento\Framework\Phrase\RendererInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCheckout\Api\ExpressButtonProviderInterface;
use Magentofullstackdev\HyperionCheckout\Api\SkipExtensionException;
use Magentofullstackdev\HyperionCheckout\Model\Extension\EntryRules;
use Magentofullstackdev\HyperionCheckout\Model\Payment\Express\ReservedHeightProviderInterface;
use Magentofullstackdev\HyperionCheckout\Model\Payment\ExpressButtonPool;
use Magentofullstackdev\HyperionCheckout\Model\Payment\LogOnce;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\AbstractLogger;
use Psr\Log\LoggerInterface;

/**
 * The express button pool validates its di.xml items, asks the providers
 * lazily and answers the buttons of one placement in the shape the express slot reads.
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Model\Payment\ExpressButtonPool
 */
class ExpressButtonPoolTest extends TestCase
{
    private const STORE = 'https://shop.test/';
    private const STATIC = 'https://static.shop.test/static/';

    /** @var array<string, object> */
    private array $providers = [];

    private ?RendererInterface $renderer = null;

    /** @var array<int, array{0: string, 1: string}> level and message of every line written */
    private array $lines = [];

    /** @var array<int, array{0: string, 1: int, 2: string|null}> level, count (-1: at least one), text */
    private array $expectedLines = [];

    /**
     * A logger that records every line (the pool writes through LogOnce, which calls `log()`).
     */
    private function recorder(): LoggerInterface
    {
        $record = function (string $level, string $message): void {
            $this->lines[] = [$level, $message];
        };

        return new class ($record) extends AbstractLogger {
            /** @var callable */
            private $record;

            public function __construct(callable $record)
            {
                $this->record = $record;
            }

            public function log($level, string|\Stringable $message, array $context = []): void
            {
                ($this->record)((string) $level, (string) $message);
            }
        };
    }

    /**
     * Expect `$count` lines of `$level` (containing `$text` when given) by the end of the test.
     */
    private function expectLines(string $level, int $count, ?string $text = null): void
    {
        $this->expectedLines[] = [$level, $count, $text];
    }

    protected function assertPostConditions(): void
    {
        foreach ($this->expectedLines as [$level, $count, $text]) {
            $found = count(array_filter(
                $this->lines,
                static fn (array $line): bool => $line[0] === $level && ($text === null || str_contains($line[1], $text))
            ));
            $label = $level . ($text === null ? '' : ' containing ' . $text) . ': ' . json_encode($this->lines);
            if ($count < 0) {
                self::assertGreaterThan(0, $found, $label);
            } else {
                self::assertSame($count, $found, $label);
            }
        }
    }

    protected function setUp(): void
    {
        $this->renderer = Phrase::getRenderer();
        $translator = $this->createStub(RendererInterface::class);
        $translator->method('render')->willReturnCallback(
            static fn (array $source): string => ['Pay now' => 'Paga ora'][$source[0]] ?? $source[0]
        );
        Phrase::setRenderer($translator);
    }

    protected function tearDown(): void
    {
        if ($this->renderer !== null) {
            Phrase::setRenderer($this->renderer);
        }
    }

    public function testAThirdPartyEntryIsEmittedInTheSlotShapeWithItsPhrasesTranslatedNow(): void
    {
        $buttons = $this->pool(['vendor_psp_express' => $this->item([
            'options' => ['brand' => 'PSP'],
            'phrases' => ['pay_now' => 'Pay now', 'cancel' => 'Cancel'],
            'redirect_hosts' => ['pay.vendor-psp.example'],
        ])])->getButtons('cart');

        self::assertSame([[
            'id' => 'vendor_psp_express',
            'tag' => 'vendor-psp-express',
            'moduleUrl' => self::STATIC . 'frontend/Vendor/theme/en_US/Vendor_Psp/js/hyperion/express.js',
            'builtin' => null,
            'apiVersion' => '1',
            'reservedHeight' => 45,
            'sortOrder' => 20,
            'options' => ['brand' => 'PSP'],
            'phrases' => ['Pay now' => 'Paga ora', 'Cancel' => 'Cancel'],
            'redirectHosts' => ['pay.vendor-psp.example'],
        ]], $buttons);
    }

    public function testOnlyTheEntriesOfThePlacementAreReturnedInSortOrder(): void
    {
        $pool = $this->pool([
            'zeta' => $this->item(['sort_order' => 5, 'tag' => 'vendor-zeta']),
            'alpha' => $this->item(['sort_order' => 30, 'tag' => 'vendor-alpha']),
            'beta' => $this->item(['sort_order' => 5, 'tag' => 'vendor-beta']),
            'product_only' => $this->item(['placements' => ['product' => 'product'], 'tag' => 'vendor-product']),
        ]);

        self::assertSame(['beta', 'zeta', 'alpha'], array_column($pool->getButtons('cart'), 'id'));
        self::assertSame(['product_only'], array_column($pool->getButtons('product'), 'id'));
        self::assertSame([], $pool->getButtons('checkout-top'));
        self::assertSame([], $pool->getButtons('nowhere'));
    }

    /**
     * @return array<string, array{0: array<string, mixed>}>
     */
    public static function invalidItems(): array
    {
        return [
            'reserved tag prefix' => [['tag' => 'hyperion-psp']],
            'not a custom element name' => [['tag' => 'psp']],
            'height too small' => [['reserved_height' => 10]],
            'height too large' => [['reserved_height' => 400]],
            'height not an integer' => [['reserved_height' => '44.5']],
            'no placement' => [['placements' => ['header' => 'header']]],
            'builtin without internal' => [['module' => null, 'builtin' => 'hyperion-paypal-buttons']],
            'builtin outside the first-party list' => [
                ['module' => null, 'internal' => true, 'builtin' => 'vendor-chunk', 'tag' => 'hyperion-vendor'],
            ],
            'neither module nor builtin' => [['module' => null]],
            'module not an asset id' => [['module' => 'https://cdn.example/express.js']],
            'module climbing directories' => [['module' => 'Vendor_Psp::../../secret.js']],
            'redirect host with a scheme' => [['redirect_hosts' => ['https://pay.example']]],
            'redirect host with a wildcard' => [['redirect_hosts' => ['*.pay.example']]],
            'unsupported api version' => [['api_version' => '2']],
        ];
    }

    /**
     * @param array<string, mixed> $override
     */
    #[DataProvider('invalidItems')]
    public function testAnInvalidEntryIsDroppedAndLogged(array $override): void
    {
        $logger = $this->recorder();
        $this->expectLines('error', -1);

        $pool = $this->pool([
            'broken' => $this->item($override),
            'fine' => $this->item(['tag' => 'vendor-fine']),
        ], $logger);

        self::assertSame(['fine'], array_column($pool->getButtons('cart'), 'id'));
    }

    public function testInternalClaimedByAThirdPartyModuleIsRefusedAndTheEntryStaysThirdParty(): void
    {
        $logger = $this->recorder();
        $this->expectLines('error', 2, '"internal" is reserved');
        $this->expectLines('error', 1, 'the tag prefix "hyperion-" is reserved');
        $this->expectLines('error', 3);
        $pool = $this->pool([
            'claims' => $this->item(['internal' => true, 'tag' => 'vendor-claims']),
            'claims_theme_tag' => $this->item(['internal' => true, 'tag' => 'hyperion-claims']),
        ], $logger);

        self::assertSame(['claims'], array_column($pool->getButtons('cart'), 'id'));
    }

    public function testABuiltinNextToAModuleIsIgnoredAndTheModuleIsUsed(): void
    {
        $logger = $this->recorder();
        $this->expectLines('error', 1, '"builtin" needs');
        $this->expectLines('error', 1);
        $buttons = $this->pool(['both' => $this->item(['builtin' => 'hyperion-paypal-buttons'])], $logger)
            ->getButtons('cart');

        self::assertNull($buttons[0]['builtin']);
        self::assertStringEndsWith('Vendor_Psp/js/hyperion/express.js', (string) $buttons[0]['moduleUrl']);
    }

    public function testAProviderThatSkipsDropsItsButtonWithoutALogLine(): void
    {
        $this->providers['Vendor\Skip\Provider'] = $this->provider(static function (): bool {
            throw new SkipExtensionException('not for this page');
        });
        $logger = $this->recorder();
        $this->expectLines('error', 0);
        $pool = $this->pool([
            'skip' => $this->item(['provider' => 'Vendor\Skip\Provider', 'tag' => 'vendor-skip']),
            'fine' => $this->item(['tag' => 'vendor-fine']),
        ], $logger);

        self::assertSame(['fine'], array_column($pool->getButtons('cart'), 'id'));
    }

    public function testAnUnknownKeyIsIgnoredWithANotice(): void
    {
        $logger = $this->recorder();
        $this->expectLines('notice', 1, '"colour"');
        $this->expectLines('notice', 1);
        $pool = $this->pool(['psp' => $this->item(['colour' => 'gold'])], $logger);

        self::assertSame(['psp'], array_column($pool->getButtons('cart'), 'id'));
    }

    public function testAFirstPartyEntryMayUseABuiltinAndTheThemePrefix(): void
    {
        $buttons = $this->pool(['paypal_express' => $this->item([
            'module' => null,
            'internal' => true,
            'builtin' => 'hyperion-paypal-buttons',
            'tag' => 'hyperion-paypal-buttons',
        ])])->getButtons('minicart');

        self::assertSame('hyperion-paypal-buttons', $buttons[0]['builtin']);
        self::assertNull($buttons[0]['moduleUrl']);
    }

    public function testAProviderDecidesAvailabilityAndAddsOptions(): void
    {
        $this->providers['Vendor\Psp\Provider'] = $this->provider(
            static fn (string $placement): bool => $placement === 'product',
            ['clientId' => 'abc', 'brand' => 'Dynamic']
        );
        $product = $this->createStub(ProductInterface::class);
        $pool = $this->pool(['psp' => $this->item([
            'placements' => ['cart' => 'cart', 'product' => 'product'],
            'provider' => 'Vendor\Psp\Provider',
            'options' => ['brand' => 'Static', 'size' => 'large'],
        ])]);

        self::assertSame([], $pool->getButtons('cart'));
        $buttons = $pool->getButtons('product', $product);
        self::assertSame(['brand' => 'Dynamic', 'size' => 'large', 'clientId' => 'abc'], $buttons[0]['options']);
    }

    public function testAFailingProviderCostsOnlyItsOwnButton(): void
    {
        $this->providers['Vendor\Broken\Provider'] = $this->provider(static function (): bool {
            throw new \RuntimeException('gateway down');
        });
        $this->providers['Vendor\Wrong\Provider'] = new \stdClass();
        $logger = $this->recorder();
        $this->expectLines('error', 3);

        $pool = $this->pool([
            'broken' => $this->item(['provider' => 'Vendor\Broken\Provider', 'tag' => 'vendor-broken']),
            'wrong' => $this->item(['provider' => 'Vendor\Wrong\Provider', 'tag' => 'vendor-wrong']),
            'missing' => $this->item(['provider' => 'Vendor\Missing\Provider', 'tag' => 'vendor-missing']),
            'fine' => $this->item(['tag' => 'vendor-fine']),
        ], $logger);

        self::assertSame(['fine'], array_column($pool->getButtons('cart'), 'id'));
    }

    public function testAHeightProviderOverridesTheFixedHeightWithinTheRange(): void
    {
        $this->providers['Tall'] = new class implements ExpressButtonProviderInterface, ReservedHeightProviderInterface {
            public function isAvailable(string $placement, ?ProductInterface $product): bool
            {
                return true;
            }

            public function getOptions(string $placement, ?ProductInterface $product): array
            {
                return ['rows' => $placement === 'cart' ? 3 : 9];
            }

            public function getReservedHeight(string $placement, array $options): int
            {
                return 45 * $options['rows'] + 14 * ($options['rows'] - 1);
            }
        };
        $pool = $this->pool(['tall' => $this->item([
            'placements' => ['cart' => 'cart', 'minicart' => 'minicart'],
            'provider' => 'Tall',
        ])]);

        self::assertSame(163, $pool->getButtons('cart')[0]['reservedHeight']);
        self::assertSame(ExpressButtonPool::MAX_HEIGHT, $pool->getButtons('minicart')[0]['reservedHeight']);
    }

    public function testAModuleUrlOnAnotherOriginIsRefused(): void
    {
        $assets = $this->createStub(AssetRepository::class);
        $assets->method('getUrlWithParams')->willReturnCallback(static fn (string $id): string => str_contains($id, 'Evil')
            ? 'https://cdn.evil.example/express.js'
            : self::STORE . 'static/' . str_replace('::', '/', $id));
        $pool = $this->pool([
            'evil' => $this->item(['module' => 'Vendor_Evil::express.js', 'tag' => 'vendor-evil']),
            'own' => $this->item(['module' => 'Vendor_Own::express.js', 'tag' => 'vendor-own']),
        ], null, $assets);

        $buttons = $pool->getButtons('cart');
        self::assertSame(['own'], array_column($buttons, 'id'));
        self::assertSame(self::STORE . 'static/Vendor_Own/express.js', $buttons[0]['moduleUrl']);
    }

    public function testTheReservedKeysAreIgnoredWithOneNotice(): void
    {
        $logger = $this->recorder();
        $this->expectLines('notice', 1, 'client_gate');
        $this->expectLines('notice', 1);
        $this->expectLines('error', 0);
        $pool = $this->pool(['gated' => $this->item(['client_gate' => 'apple-pay'])], $logger);

        self::assertSame(['gated'], array_column($pool->getButtons('cart'), 'id'));
        self::assertSame(['gated'], array_column($pool->getButtons('cart'), 'id'));
    }

    public function testAProblemLoggedBeforeIsNotLoggedAgain(): void
    {
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturn('1');
        $logger = $this->recorder();
        $this->expectLines('error', 0);

        $pool = $this->pool(['broken' => $this->item(['reserved_height' => 1])], $logger, null, $cache);

        self::assertSame([], $pool->getButtons('cart'));
    }

    /**
     * @param array<string, mixed> $override
     * @return array<string, mixed>
     */
    private function item(array $override = []): array
    {
        $item = array_replace([
            'placements' => ['cart' => 'cart', 'minicart' => 'minicart'],
            'tag' => 'vendor-psp-express',
            'module' => 'Vendor_Psp::js/hyperion/express.js',
            'reserved_height' => '45',
            'sort_order' => '20',
        ], $override);

        return array_filter($item, static fn ($value): bool => $value !== null);
    }

    /**
     * @param callable $available
     * @param array<string, mixed> $options
     */
    private function provider(callable $available, array $options = []): ExpressButtonProviderInterface
    {
        return new class ($available, $options) implements ExpressButtonProviderInterface {
            /** @var callable */
            private $available;

            /**
             * @param callable $available
             * @param array<string, mixed> $options
             */
            public function __construct(callable $available, private readonly array $options)
            {
                $this->available = $available;
            }

            public function isAvailable(string $placement, ?ProductInterface $product): bool
            {
                return ($this->available)($placement, $product);
            }

            public function getOptions(string $placement, ?ProductInterface $product): array
            {
                return $this->options;
            }
        };
    }

    /**
     * @param array<string, mixed> $buttons
     */
    private function pool(
        array $buttons,
        ?LoggerInterface $logger = null,
        ?AssetRepository $assets = null,
        ?CacheInterface $cache = null
    ): ExpressButtonPool {
        if ($assets === null) {
            $assets = $this->createStub(AssetRepository::class);
            $assets->method('getUrlWithParams')->willReturnCallback(
                static fn (string $id): string => self::STATIC . 'frontend/Vendor/theme/en_US/' . str_replace('::', '/', $id)
            );
        }
        $objectManager = $this->createStub(ObjectManagerInterface::class);
        $objectManager->method('get')->willReturnCallback(function (string $class): object {
            if (!isset($this->providers[$class])) {
                throw new \ReflectionException('Class "' . $class . '" does not exist');
            }
            return $this->providers[$class];
        });
        $store = $this->createStub(Store::class);
        $store->method('isCurrentlySecure')->willReturn(true);
        $store->method('getBaseUrl')->willReturnCallback(
            static fn (string $type): string => $type === UrlInterface::URL_TYPE_STATIC ? self::STATIC : self::STORE
        );
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        if ($cache === null) {
            $cache = $this->createStub(CacheInterface::class);
            $cache->method('load')->willReturn(false);
        }

        $log = new LogOnce($logger ?? $this->createStub(LoggerInterface::class), $cache);

        return new ExpressButtonPool(
            new EntryRules($objectManager, $assets, $storeManager, $log),
            $log,
            $objectManager,
            $buttons
        );
    }
}
