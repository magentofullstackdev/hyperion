<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Model\Product;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Escaper;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCatalog\Model\OpenGraph;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class OpenGraphTest extends TestCase
{
    private OpenGraph $openGraph;

    protected function setUp(): void
    {
        $this->openGraph = $this->createOpenGraph(false, false);
    }

    /**
     * @param bool $seoModuleEnabled Whether MageOS_Seo is an enabled module
     * @param bool $seoModuleOpenGraph The module's Open Graph option of the store
     * @return OpenGraph
     */
    private function createOpenGraph(bool $seoModuleEnabled, bool $seoModuleOpenGraph): OpenGraph
    {
        $imageHelper = $this->createStub(ImageHelper::class);
        $imageHelper->method('init')->willReturnSelf();
        $imageHelper->method('getUrl')->willReturn('https://shop.example/media/catalog/product/b/a/bag.jpg');
        $summary = $this->createStub(ProductSummary::class);
        $summary->method('getFinalPrice')->willReturn(34.0);
        $summary->method('getCurrencyCode')->willReturn('EUR');
        $store = $this->createStub(Store::class);
        $store->method('getFrontendName')->willReturn('Hyperion Demo');
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        // The framework Escaper resolves its helpers through the object manager; a stub with the same contract.
        $escaper = $this->createStub(Escaper::class);
        $escaper->method('escapeHtml')->willReturnCallback(static fn ($value) => htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $escaper->method('escapeUrl')->willReturnCallback(static fn ($value) => htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        $moduleManager = $this->createStub(ModuleManager::class);
        $moduleManager->method('isEnabled')->willReturnCallback(
            static fn ($module): bool => $module === 'MageOS_Seo' && $seoModuleEnabled
        );
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('isSetFlag')->willReturnCallback(
            static fn ($path, $scopeType = null): bool => $path === 'mageos_seo_general/og_tags/enabled'
                && $scopeType === ScopeInterface::SCOPE_STORE
                && $seoModuleOpenGraph
        );

        return new OpenGraph(
            $imageHelper,
            $summary,
            $storeManager,
            $escaper,
            $this->createStub(LoggerInterface::class),
            $moduleManager,
            $scopeConfig
        );
    }

    /**
     * @return array<string, array{bool, bool, bool}>
     */
    public static function ownershipProvider(): array
    {
        return [
            'no SEO module: Hyperion owns the tags' => [false, false, false],
            'no SEO module, a leftover option value is ignored' => [false, true, false],
            'SEO module with its Open Graph option on owns the tags' => [true, true, true],
            'SEO module with its Open Graph option off: Hyperion owns the tags' => [true, false, false],
        ];
    }

    #[DataProvider('ownershipProvider')]
    public function testTheSeoModuleOwnsTheTagsOnlyWhileItsOpenGraphOptionIsOn(
        bool $seoModuleEnabled,
        bool $seoModuleOpenGraph,
        bool $expected
    ): void {
        $this->assertSame(
            $expected,
            $this->createOpenGraph($seoModuleEnabled, $seoModuleOpenGraph)->isOwnedExternally()
        );
    }

    public function testTagsOfAProductPage(): void
    {
        $product = $this->createStub(Product::class);
        $product->method('getName')->willReturn('Joust & Duffle <b>Bag</b>');
        $product->method('getProductUrl')->willReturn('https://shop.example/joust-duffle-bag.html');
        $product->method('getData')->willReturnMap([
            ['short_description', null, "<p>The sporty   Joust\nDuffle Bag</p>"],
            ['description', null, 'long'],
        ]);
        $product->method('getImage')->willReturn('/b/a/bag.jpg');
        $product->method('isAvailable')->willReturn(true);

        $tags = $this->openGraph->getTags($product);

        $this->assertSame('product', $tags['og:type']);
        $this->assertSame('Joust & Duffle Bag', $tags['og:title']);
        $this->assertSame('The sporty Joust Duffle Bag', $tags['og:description']);
        $this->assertSame('https://shop.example/media/catalog/product/b/a/bag.jpg', $tags['og:image']);
        $this->assertSame('34.00', $tags['product:price:amount']);
        $this->assertSame('EUR', $tags['product:price:currency']);
        $this->assertSame('instock', $tags['product:availability']);
        $this->assertSame('Hyperion Demo', $tags['og:site_name']);

        $html = $this->openGraph->render($product);
        $this->assertStringContainsString('<meta property="og:title" content="Joust &amp; Duffle Bag"/>', $html);
        $this->assertStringContainsString('<meta property="og:url" content="https://shop.example/joust-duffle-bag.html"/>', $html);
        $this->assertStringNotContainsString('&#x', $html);
    }

    public function testNoImageAndOutOfStock(): void
    {
        $product = $this->createStub(Product::class);
        $product->method('getName')->willReturn('Thing');
        $product->method('getProductUrl')->willReturn('https://shop.example/thing.html');
        $product->method('getData')->willReturn(null);
        $product->method('getImage')->willReturn('no_selection');
        $product->method('isAvailable')->willReturn(false);

        $tags = $this->openGraph->getTags($product);
        $this->assertArrayNotHasKey('og:image', $tags);
        $this->assertArrayNotHasKey('og:description', $tags);
        $this->assertSame('oos', $tags['product:availability']);
    }
}
