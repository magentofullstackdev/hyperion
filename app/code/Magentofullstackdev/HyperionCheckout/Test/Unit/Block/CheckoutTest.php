<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCheckout\Test\Unit\Block;

use Magento\Checkout\Model\CompositeConfigProvider;
use Magento\Framework\Component\ComponentRegistrarInterface;
use Magento\Framework\Exception\RuntimeException;
use Magento\Framework\Filesystem\Driver\File as FileDriver;
use Magento\Framework\Locale\ResolverInterface as LocaleResolver;
use Magento\Framework\Serialize\Serializer\Json as JsonSerializer;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Asset\Repository as AssetRepository;
use Magento\Framework\View\Element\Template\Context;
use Magentofullstackdev\HyperionCheckout\Block\Checkout;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * The checkout block: the module preload list read from the Vite manifest
 * (the application chunk with its static imports and the locale catalog, an
 * empty list whenever the manifest does not allow it) and the serialization
 * of the checkout configuration (invalid UTF-8 substituted, a value that
 * cannot be encoded logged under its top-level key).
 *
 * @covers \Magentofullstackdev\HyperionCheckout\Block\Checkout
 */
class CheckoutTest extends TestCase
{
    private const MODULE_PATH = '/srv/module';
    private const MODULE_MANIFEST = self::MODULE_PATH . '/view/frontend/web/.vite/manifest.json';
    private const STATIC_URL = 'https://shop.test/static/';

    /** The shape of a real build: the entry only has dynamic imports, the application chunk imports the entry back. */
    private const MANIFEST = [
        'src/main.ts' => [
            'file' => 'assets/checkout-AAAAAAAA.js',
            'name' => 'checkout',
            'isEntry' => true,
            'dynamicImports' => ['src/i18n/it_IT.json', '_checkout-app-BBBBBBBB.js'],
            'css' => ['assets/checkout-CCCCCCCC.css'],
        ],
        '_checkout-app-BBBBBBBB.js' => [
            'file' => 'assets/checkout-app-BBBBBBBB.js',
            'name' => 'checkout-app',
            'isDynamicEntry' => true,
            'imports' => ['src/main.ts', '_quote-DDDDDDDD.js'],
            'dynamicImports' => ['src/store/login-action.ts'],
        ],
        '_quote-DDDDDDDD.js' => [
            'file' => 'assets/quote-DDDDDDDD.js',
            'name' => 'quote',
            'imports' => ['src/main.ts', '_missing-EEEEEEEE.js'],
        ],
        'src/store/login-action.ts' => [
            'file' => 'assets/login-action-FFFFFFFF.js',
            'name' => 'login-action',
            'isDynamicEntry' => true,
            'imports' => ['src/main.ts'],
        ],
        'src/i18n/it_IT.json' => [
            'file' => 'assets/it_IT-GGGGGGGG.js',
            'name' => 'it_IT',
            'isDynamicEntry' => true,
        ],
    ];

    protected function setUp(): void
    {
        Checkout::resetManifestCacheForTests();
    }

    protected function tearDown(): void
    {
        Checkout::resetManifestCacheForTests();
    }

    public function testThePreloadListIsTheApplicationChunkWithItsStaticImports(): void
    {
        $block = $this->block(self::MANIFEST);

        self::assertSame(
            [
                self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/checkout-app-BBBBBBBB.js',
                self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/quote-DDDDDDDD.js',
            ],
            $block->getPreloadUrls(),
            'neither the entry, nor a lazy chunk, nor the catalog of another locale'
        );
    }

    public function testAnOptionalSectionTheStoreShowsIsPreloadedWithItsOwnImports(): void
    {
        $manifest = self::MANIFEST;
        $manifest['src/main.ts']['dynamicImports'][] = 'src/components/checkout-gift-message.ts';
        $manifest['src/main.ts']['dynamicImports'][] = 'src/components/checkout-agreements.ts';
        $manifest['src/components/checkout-gift-message.ts'] = [
            'file' => 'assets/checkout-gift-message-IIIIIIII.js',
            'isDynamicEntry' => true,
            'imports' => ['src/main.ts', '_checkout-app-BBBBBBBB.js', '_gift-JJJJJJJJ.js'],
        ];
        $manifest['_gift-JJJJJJJJ.js'] = ['file' => 'assets/gift-JJJJJJJJ.js'];
        $manifest['src/components/checkout-agreements.ts'] = [
            'file' => 'assets/checkout-agreements-KKKKKKKK.js',
            'isDynamicEntry' => true,
            'imports' => ['src/main.ts'],
        ];
        $base = self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/';

        self::assertSame(
            [
                $base . 'checkout-app-BBBBBBBB.js',
                $base . 'quote-DDDDDDDD.js',
                $base . 'checkout-gift-message-IIIIIIII.js',
                $base . 'gift-JJJJJJJJ.js',
            ],
            $this->block($manifest)->getPreloadUrls(['gift-options', 'unknown-section']),
            'the section that was asked for, not the other one'
        );
        Checkout::resetManifestCacheForTests();
        self::assertCount(2, $this->block($manifest)->getPreloadUrls(), 'no section without the store using it');
        Checkout::resetManifestCacheForTests();
        self::assertCount(
            2,
            $this->block(self::MANIFEST)->getPreloadUrls(['gift-options']),
            'a build without the chunk preloads nothing for it'
        );
    }

    public function testTheRecaptchaClientIsPreloadedForAStoreThatProtectsAnAction(): void
    {
        $manifest = self::MANIFEST;
        $manifest['_checkout-app-BBBBBBBB.js']['dynamicImports'][] = 'src/components/hyperion-recaptcha.ts';
        $manifest['src/components/hyperion-recaptcha.ts'] = [
            'file' => 'assets/hyperion-recaptcha-LLLLLLLL.js',
            'isDynamicEntry' => true,
            'imports' => ['_checkout-app-BBBBBBBB.js', 'src/main.ts'],
        ];
        $base = self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/';

        self::assertSame(
            [$base . 'checkout-app-BBBBBBBB.js', $base . 'quote-DDDDDDDD.js', $base . 'hyperion-recaptcha-LLLLLLLL.js'],
            $this->block($manifest)->getPreloadUrls(['recaptcha'])
        );
        Checkout::resetManifestCacheForTests();
        self::assertCount(2, $this->block($manifest)->getPreloadUrls(), 'not for a store without it');
    }

    public function testTheSectionsOfTheConfigurationArePreloadedWithoutWhatTheHeadAlreadyLists(): void
    {
        $manifest = self::MANIFEST;
        $manifest['_checkout-app-BBBBBBBB.js']['dynamicImports'][] = '_payment-host-MMMMMMMM.js';
        $manifest['_payment-host-MMMMMMMM.js'] = [
            'file' => 'assets/payment-host-MMMMMMMM.js',
            'name' => 'mount',
            'isDynamicEntry' => true,
            'imports' => ['src/main.ts', '_checkout-app-BBBBBBBB.js', '_context-NNNNNNNN.js'],
        ];
        $manifest['_context-NNNNNNNN.js'] = ['file' => 'assets/context-NNNNNNNN.js', 'imports' => ['src/main.ts']];
        $manifest['src/components/address-fields.ts'] = [
            'file' => 'assets/address-fields-OOOOOOOO.js',
            'isDynamicEntry' => true,
            'imports' => ['_quote-DDDDDDDD.js'],
        ];
        $base = self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/';

        self::assertSame(
            [$base . 'payment-host-MMMMMMMM.js', $base . 'context-NNNNNNNN.js', $base . 'address-fields-OOOOOOOO.js'],
            $this->block($manifest)->getSectionPreloadUrls(['payment-host', 'address-fields', 'unknown-section'])
        );
        Checkout::resetManifestCacheForTests();
        self::assertSame([], $this->block($manifest)->getSectionPreloadUrls([]), 'nothing without a section');
        Checkout::resetManifestCacheForTests();
        self::assertSame(
            [],
            $this->block(self::MANIFEST)->getSectionPreloadUrls(['payment-host']),
            'a build without the chunk preloads nothing for it'
        );
    }

    public function testAMissingManifestPreloadsNoSection(): void
    {
        self::assertSame([], $this->block(null)->getSectionPreloadUrls(['payment-host']));
    }

    public function testStaticImportsOfTheEntryComeFirst(): void
    {
        $manifest = self::MANIFEST;
        $manifest['src/main.ts']['imports'] = ['_vendor-HHHHHHHH.js'];
        $manifest['_vendor-HHHHHHHH.js'] = ['file' => 'assets/vendor-HHHHHHHH.js', 'name' => 'vendor'];

        self::assertSame(
            [
                self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/vendor-HHHHHHHH.js',
                self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/checkout-app-BBBBBBBB.js',
                self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/quote-DDDDDDDD.js',
            ],
            $this->block($manifest)->getPreloadUrls()
        );
    }

    /**
     * @param string $locale
     * @param bool $expected
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('localeProvider')]
    public function testTheLocaleCatalogIsPreloadedWhenTheBuildHasOne(string $locale, bool $expected): void
    {
        $urls = $this->block(self::MANIFEST, $locale)->getPreloadUrls();

        self::assertSame(
            $expected,
            in_array(self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/it_IT-GGGGGGGG.js', $urls, true)
        );
        self::assertCount($expected ? 3 : 2, $urls);
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function localeProvider(): array
    {
        return [
            'the exact locale' => ['it_IT', true],
            'another region of the language' => ['it_CH', true],
            'the source language is part of the entry' => ['en_GB', false],
            'a language without a catalog' => ['de_DE', false],
        ];
    }

    public function testTheApplicationChunkIsRecognizedByItsFileNameToo(): void
    {
        $manifest = self::MANIFEST;
        $manifest['_checkout-app-BBBBBBBB.js']['name'] = 'index';

        self::assertCount(2, $this->block($manifest)->getPreloadUrls());
    }

    /**
     * @param array<string, mixed> $manifest
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('unusableManifestProvider')]
    public function testAManifestWithoutTheApplicationChunkYieldsAnEmptyList(array $manifest): void
    {
        self::assertSame([], $this->block($manifest, 'it_IT')->getPreloadUrls());
    }

    /**
     * @return array<string, array{array<string, mixed>}>
     */
    public static function unusableManifestProvider(): array
    {
        $noDynamicImports = self::MANIFEST;
        unset($noDynamicImports['src/main.ts']['dynamicImports']);

        $chunkNotListed = self::MANIFEST;
        unset($chunkNotListed['_checkout-app-BBBBBBBB.js']);

        $otherChunksOnly = self::MANIFEST;
        $otherChunksOnly['src/main.ts']['dynamicImports'] = ['src/i18n/it_IT.json'];

        $malformed = self::MANIFEST;
        $malformed['src/main.ts']['dynamicImports'] = 'checkout-app';

        return [
            'the entry lists no dynamic import' => [$noDynamicImports],
            'the dynamic import points at a chunk the manifest does not have' => [$chunkNotListed],
            'only other chunks are dynamic imports' => [$otherChunksOnly],
            'the dynamic imports are not a list' => [$malformed],
            'no entry at all' => [['src/other.ts' => ['file' => 'assets/other-AAAAAAAA.js']]],
        ];
    }

    public function testAMissingManifestYieldsAnEmptyList(): void
    {
        self::assertSame([], $this->block(null)->getPreloadUrls());
    }

    public function testTheEntryAndItsStylesheetAreResolvedFromTheModuleManifest(): void
    {
        $block = $this->block(self::MANIFEST);

        self::assertSame(
            self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/checkout-AAAAAAAA.js',
            $block->getBundleUrl()
        );
        self::assertSame(
            self::STATIC_URL . 'Magentofullstackdev_HyperionCheckout::assets/checkout-CCCCCCCC.css',
            $block->getStylesUrl()
        );
    }

    public function testAMissingModuleManifestNamesThePathItLookedAt(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage(self::MODULE_MANIFEST);

        $this->block(null)->getBundleUrl();
    }

    public function testAnInvalidUtf8ByteInAnAddressFieldIsSubstituted(): void
    {
        $block = $this->block(self::MANIFEST, 'en_US', [
            'customerData' => ['addresses' => [['city' => "Z\xFCrich", 'street' => ['</script>']]]],
        ]);

        $json = $block->getCheckoutConfigJson();
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

        self::assertSame("Z\u{FFFD}rich", $decoded['customerData']['addresses'][0]['city']);
        self::assertStringNotContainsString('</script>', $json);
    }

    public function testAValueThatCannotBeEncodedIsLoggedUnderItsKeyAndYieldsNoConfig(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())
            ->method('critical')
            ->with(self::stringContains('cannot be serialized'), ['keys' => ['totalsData']]);
        $block = $this->block(
            self::MANIFEST,
            'en_US',
            ['quoteData' => ['entity_id' => '7'], 'totalsData' => ['grand_total' => NAN], 'storeCode' => 'default'],
            $logger
        );

        self::assertSame('', $block->getCheckoutConfigJson());
    }

    public function testTheStaticHostDecidesTheCrossOriginAttribute(): void
    {
        self::assertFalse($this->block(self::MANIFEST)->isStaticCrossOrigin());
        self::assertTrue(
            $this->block(self::MANIFEST, 'en_US', [], null, 'https://cdn.shop.test/static/')->isStaticCrossOrigin()
        );
    }

    /**
     * @param array<string, mixed>|null $manifest null: the module has no manifest file
     * @param string $locale
     * @param array<string, mixed> $config
     * @param LoggerInterface|null $logger
     * @param string $staticBaseUrl
     */
    private function block(
        ?array $manifest,
        string $locale = 'en_US',
        array $config = [],
        ?LoggerInterface $logger = null,
        string $staticBaseUrl = self::STATIC_URL
    ): Checkout {
        $registrar = $this->createStub(ComponentRegistrarInterface::class);
        $registrar->method('getPath')->willReturn(self::MODULE_PATH);

        $driver = $this->createStub(FileDriver::class);
        $driver->method('isExists')->willReturnCallback(
            static fn (string $path): bool => $manifest !== null && $path === self::MODULE_MANIFEST
        );
        $driver->method('fileGetContents')
            ->willReturn(json_encode($manifest ?? [], JSON_THROW_ON_ERROR));

        $configProvider = $this->createStub(CompositeConfigProvider::class);
        $configProvider->method('getConfig')->willReturn($config);

        $localeResolver = $this->createStub(LocaleResolver::class);
        $localeResolver->method('getLocale')->willReturn($locale);

        $assetRepository = $this->createStub(AssetRepository::class);
        $assetRepository->method('getUrlWithParams')
            ->willReturnCallback(static fn (string $fileId): string => self::STATIC_URL . $fileId);

        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getBaseUrl')->willReturnCallback(
            static fn (array $params = []): string => ($params['_type'] ?? '') === UrlInterface::URL_TYPE_STATIC
                ? $staticBaseUrl
                : 'https://shop.test/'
        );

        return new Checkout(
            $this->templateContext([
                'assetRepo' => $assetRepository,
                'urlBuilder' => $urlBuilder,
                'logger' => $logger ?? $this->createStub(LoggerInterface::class),
            ]),
            new JsonSerializer(),
            $configProvider,
            $registrar,
            $driver,
            $localeResolver
        );
    }

    /**
     * The block context with a stub for every constructor argument but the given ones.
     *
     * @param array<string, object> $overrides
     */
    private function templateContext(array $overrides): Context
    {
        $arguments = [];
        foreach ((new \ReflectionClass(Context::class))->getConstructor()?->getParameters() ?? [] as $parameter) {
            $type = $parameter->getType();
            if (isset($overrides[$parameter->getName()])) {
                $arguments[$parameter->getName()] = $overrides[$parameter->getName()];
            } elseif ($type instanceof \ReflectionNamedType && !$type->isBuiltin()) {
                /** @var class-string $class */
                $class = $type->getName();
                $arguments[$parameter->getName()] = $this->createStub($class);
            } elseif ($parameter->isDefaultValueAvailable()) {
                $arguments[$parameter->getName()] = $parameter->getDefaultValue();
            } else {
                self::fail(sprintf('No stub for the context argument $%s.', $parameter->getName()));
            }
        }

        return new Context(...$arguments);
    }
}
