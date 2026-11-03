<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Model\Product;
use Magento\Framework\Escaper;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCatalog\Model\OpenGraph;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class OpenGraphTest extends TestCase
{
    private OpenGraph $openGraph;

    protected function setUp(): void
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
        $this->openGraph = new OpenGraph($imageHelper, $summary, $storeManager, $escaper, $this->createStub(LoggerInterface::class));
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
