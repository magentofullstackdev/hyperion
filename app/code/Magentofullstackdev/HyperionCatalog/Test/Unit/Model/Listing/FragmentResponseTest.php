<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model\Listing;

use Magento\Catalog\Block\Product\ListProduct;
use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\Layer;
use Magento\Catalog\Model\Layer\Resolver as LayerResolver;
use Magento\Catalog\Model\Layer\State;
use Magento\Catalog\Model\Product;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magento\Search\Model\Query;
use Magento\Search\Model\QueryFactory;
use Magentofullstackdev\HyperionCatalog\Model\Listing\FragmentResponse;
use Magentofullstackdev\HyperionCatalog\Model\Listing\ListingUrl;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FragmentResponseTest extends TestCase
{
    private const CATEGORY_URL = 'https://shop.test/women/tops-women.html';
    private const NAV_HTML = "<div id=\"hyperion-layered-nav\" data-hyperion-layered-nav>\n<section>filters</section>\n</div>\n";

    /** @var array<string, string> */
    private array $headers = [];
    private string $contents = '';

    /**
     * @param array<string, string> $params
     */
    private function build(array $params, ?string $navHtml = self::NAV_HTML): Raw
    {
        $this->headers = [];
        $this->contents = '';

        $raw = $this->createStub(Raw::class);
        $raw->method('setHeader')->willReturnCallback(function (string $name, string $value) use ($raw): Raw {
            $this->headers[$name] = $value;

            return $raw;
        });
        $raw->method('setContents')->willReturnCallback(function (string $contents) use ($raw): Raw {
            $this->contents = $contents;

            return $raw;
        });
        $raw->method('setHttpResponseCode')->willReturn($raw);
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($raw);

        $cacheHeaders = $this->createStub(CacheHeaders::class);
        $cacheHeaders->method('applyPublic')->willReturnArgument(0);

        $state = $this->createStub(State::class);
        $state->method('getFilters')->willReturn([]);
        $category = $this->createStub(Category::class);
        $category->method('getUrl')->willReturn(self::CATEGORY_URL);
        $category->method('getId')->willReturn(21);
        $layer = $this->createStub(Layer::class);
        $layer->method('getState')->willReturn($state);
        $layer->method('getCurrentCategory')->willReturn($category);
        $layerResolver = $this->createStub(LayerResolver::class);
        $layerResolver->method('get')->willReturn($layer);

        $request = $this->createStub(RequestInterface::class);
        $request->method('getParams')->willReturn($params);
        $request->method('getParam')->willReturnCallback(static fn (string $key, $default = null) => $params[$key] ?? $default);

        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willReturn('https://shop.test/hyperion/category/filter/?id=21');
        $query = $this->createStub(Query::class);
        $query->method('getQueryText')->willReturn('');
        $queryFactory = $this->createStub(QueryFactory::class);
        $queryFactory->method('get')->willReturn($query);
        $logger = $this->createStub(LoggerInterface::class);
        $listingUrl = new ListingUrl($urlBuilder, $queryFactory, $logger);

        $products = [];
        foreach ([7, 9, 7] as $id) {
            $product = $this->createStub(Product::class);
            $product->method('getId')->willReturn($id);
            $products[] = $product;
        }
        $listBlock = $this->createStub(ListProduct::class);
        $listBlock->method('toHtml')->willReturn('<div id="hyperion-product-grid">grid</div>');
        $listBlock->method('getLayer')->willReturn($layer);
        $listBlock->method('getLoadedProductCollection')->willReturn(new \ArrayIterator($products));

        $layout = $this->createStub(LayoutInterface::class);
        if ($navHtml === null) {
            $layout->method('getBlock')->willReturn(false);
        } else {
            $navBlock = $this->createStub(AbstractBlock::class);
            $navBlock->method('toHtml')->willReturn($navHtml);
            $layout->method('getBlock')->willReturnMap([['catalog.leftnav', $navBlock]]);
        }

        $subject = new FragmentResponse($rawFactory, $cacheHeaders, $layerResolver, $request, $listingUrl, $logger);

        return $subject->build($layout, $listBlock, 'catalog.leftnav', 'category-filter', ['cat_c_21']);
    }

    public function testTheNavigationRidesAlongOutOfBandAndThePageUrlIsPushed(): void
    {
        $this->build(['id' => '21', 'price' => '20-30', 'color' => '49', 'product_list_order' => 'name']);

        self::assertStringStartsWith('<div id="hyperion-product-grid">grid</div>', $this->contents);
        self::assertStringContainsString('<div id="hyperion-layered-nav" data-hyperion-layered-nav hx-swap-oob="outerHTML">', $this->contents);
        self::assertSame(1, substr_count($this->contents, 'hx-swap-oob'), 'only the navigation root carries the marker');
        self::assertSame(self::CATEGORY_URL . '?price=20-30&color=49&product_list_order=name', $this->headers['HX-Push-Url']);
        self::assertSame('cat_c_21,cat_p_7,cat_p_9', $this->headers['X-Magento-Tags']);
        self::assertSame('category-filter', $this->headers['X-Hyperion-Fragment']);
    }

    public function testAnAppendedPageLeavesTheHistoryAlone(): void
    {
        $this->build(['id' => '21', 'p' => '2', 'append' => '1']);

        self::assertArrayNotHasKey('HX-Push-Url', $this->headers);
        self::assertStringContainsString('hx-swap-oob="outerHTML"', $this->contents);
    }

    public function testWithoutANavigationBlockTheGridStillAnswers(): void
    {
        $this->build(['id' => '21'], null);

        self::assertSame('<div id="hyperion-product-grid">grid</div>', $this->contents);
        self::assertSame(self::CATEGORY_URL, $this->headers['HX-Push-Url']);
    }
}
