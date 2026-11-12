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
use Magento\Framework\Escaper;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magento\Search\Model\Query;
use Magento\Search\Model\QueryFactory;
use Magentofullstackdev\HyperionCatalog\Model\Listing\FragmentResponse;
use Magentofullstackdev\HyperionCatalog\Model\Listing\ListingUrl;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
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
    private int $status = 0;
    private DegradedResponse $degradedResponse;
    /** @var string[]|\Throwable|null identities of the list block; null: core's tags of the page */
    private array|\Throwable|null $identities = null;
    private ?\Throwable $navigationFailure = null;

    protected function setUp(): void
    {
        $this->degradedResponse = new DegradedResponse();
        $this->identities = null;
        $this->navigationFailure = null;
    }

    /**
     * @param array<string, string> $params
     */
    private function subject(array $params): FragmentResponse
    {
        return $this->prepare($params)[0];
    }

    /**
     * @param array<string, string> $params
     */
    private function build(array $params, ?string $navHtml = self::NAV_HTML): Raw
    {
        [$subject, $layout, $listBlock] = $this->prepare($params, $navHtml);

        return $subject->build($layout, $listBlock, 'catalog.leftnav', 'category-filter', ['cat_c_21']);
    }

    /**
     * @param array<string, string> $params
     * @return array{FragmentResponse, LayoutInterface, ListProduct}
     */
    private function prepare(array $params, ?string $navHtml = self::NAV_HTML): array
    {
        $this->headers = [];
        $this->contents = '';
        $this->status = 0;

        $raw = $this->createStub(Raw::class);
        $raw->method('setHeader')->willReturnCallback(function (string $name, string $value) use ($raw): Raw {
            $this->headers[$name] = $value;

            return $raw;
        });
        $raw->method('setContents')->willReturnCallback(function (string $contents) use ($raw): Raw {
            $this->contents = $contents;

            return $raw;
        });
        $raw->method('setHttpResponseCode')->willReturnCallback(function (int $code) use ($raw): Raw {
            $this->status = $code;

            return $raw;
        });
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($raw);

        // The real class: a degraded answer must leave it private.
        $cacheHeaders = new CacheHeaders($this->degradedResponse);

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
        if ($this->identities instanceof \Throwable) {
            $listBlock->method('getIdentities')->willThrowException($this->identities);
        } else {
            $listBlock->method('getIdentities')->willReturn($this->identities ?? ['cat_c_p_21', 'cat_p_7', 'cat_p_9', 'cat_p_7']);
        }

        $layout = $this->createStub(LayoutInterface::class);
        if ($navHtml === null) {
            $layout->method('getBlock')->willReturn(false);
        } else {
            $navBlock = $this->createStub(AbstractBlock::class);
            if ($this->navigationFailure !== null) {
                $navBlock->method('toHtml')->willThrowException($this->navigationFailure);
            } else {
                $navBlock->method('toHtml')->willReturn($navHtml);
            }
            $layout->method('getBlock')->willReturnMap([['catalog.leftnav', $navBlock]]);
        }

        $escaper = $this->createStub(Escaper::class);
        $escaper->method('escapeHtml')->willReturnCallback(
            static fn ($text): string => htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', false)
        );
        $subject = new FragmentResponse(
            $rawFactory,
            $cacheHeaders,
            $layerResolver,
            $request,
            $listingUrl,
            $logger,
            $this->degradedResponse,
            $escaper
        );

        return [$subject, $layout, $listBlock];
    }

    public function testTheNavigationRidesAlongOutOfBandAndThePageUrlIsPushed(): void
    {
        $this->build(['id' => '21', 'price' => '20-30', 'color' => '49', 'product_list_order' => 'name']);

        self::assertStringStartsWith('<div id="hyperion-product-grid">grid</div>', $this->contents);
        self::assertStringContainsString('<div id="hyperion-layered-nav" data-hyperion-layered-nav hx-swap-oob="outerHTML">', $this->contents);
        self::assertSame(1, substr_count($this->contents, 'hx-swap-oob'), 'only the navigation root carries the marker');
        self::assertSame(self::CATEGORY_URL . '?price=20-30&color=49&product_list_order=name', $this->headers['HX-Push-Url']);
        self::assertSame('cat_c_p_21,cat_p_7,cat_p_9,cat_c_21', $this->headers['X-Magento-Tags']);
        self::assertSame('category-filter', $this->headers['X-Hyperion-Fragment']);
        self::assertSame('public, max-age=3600, s-maxage=3600', $this->headers['Cache-Control']);
    }

    public function testTheTagsStartFromTheListBlockIdentitiesAndCarryTheCategoryProductRelation(): void
    {
        $this->build(['id' => '21']);

        $tags = explode(',', $this->headers['X-Magento-Tags']);
        self::assertSame('cat_c_p_21', $tags[0]);
        self::assertContains('cat_c_21', $tags, 'the caller tags are merged in');
        self::assertSame($tags, array_values(array_unique($tags)));
    }

    public function testTheProductTagsAreCappedAndTheOtherTagsAreKept(): void
    {
        $this->identities = ['cat_c_p_21'];
        for ($id = 1; $id <= FragmentResponse::MAX_PRODUCT_TAGS + 50; $id++) {
            $this->identities[] = 'cat_p_' . $id;
        }
        $this->identities[] = 'cms_b_3';

        $this->build(['id' => '21']);

        $tags = explode(',', $this->headers['X-Magento-Tags']);
        self::assertCount(FragmentResponse::MAX_PRODUCT_TAGS + 3, $tags);
        self::assertContains('cat_c_p_21', $tags);
        self::assertContains('cms_b_3', $tags);
        self::assertContains('cat_c_21', $tags);
        self::assertNotContains('cat_p_' . (FragmentResponse::MAX_PRODUCT_TAGS + 1), $tags);
    }

    public function testWhenTheIdentitiesFailTheProductTagsComeFromTheLoadedCollection(): void
    {
        $this->identities = new \RuntimeException('no category');

        $this->build(['id' => '21']);

        self::assertSame('cat_c_21,cat_p_7,cat_p_9', $this->headers['X-Magento-Tags']);
    }

    public function testADegradedListingIsPrivateAndPushesNoUrl(): void
    {
        // What the grid template does when the list block could not load its products.
        $this->degradedResponse->mark();

        $this->build(['id' => '21', 'color' => '49']);

        self::assertArrayNotHasKey('HX-Push-Url', $this->headers);
        self::assertStringContainsString('no-store', $this->headers['Cache-Control']);
        self::assertArrayNotHasKey('X-Hyperion-Public-Cache', $this->headers);
    }

    public function testANavigationThatCannotRenderLeavesTheGridAloneAndTheAnswerPrivate(): void
    {
        $this->navigationFailure = new \RuntimeException('Could not perform search query.');

        $this->build(['id' => '21', 'color' => '49']);

        self::assertSame('<div id="hyperion-product-grid">grid</div>', $this->contents);
        self::assertTrue($this->degradedResponse->isDegraded());
        self::assertArrayNotHasKey('HX-Push-Url', $this->headers);
        self::assertStringContainsString('no-store', $this->headers['Cache-Control']);
    }

    public function testTheDegradedAnswerReplacesTheGridWithTheTryAgainMessage(): void
    {
        $this->subject(['id' => '21', 'color' => '49'])->buildDegraded('category-filter');

        self::assertSame(200, $this->status);
        self::assertStringStartsWith('<div id="hyperion-product-grid" data-hyperion-product-grid', $this->contents);
        self::assertStringContainsString('data-hyperion-listing-error', $this->contents);
        self::assertStringContainsString('We can&#039;t load the products right now.', $this->contents);
        self::assertTrue($this->degradedResponse->isDegraded());
        self::assertArrayNotHasKey('HX-Push-Url', $this->headers);
        self::assertArrayNotHasKey('X-Magento-Tags', $this->headers);
        self::assertStringContainsString('no-store', $this->headers['Cache-Control']);
        self::assertSame('category-filter', $this->headers['X-Hyperion-Fragment']);
    }

    public function testTheDegradedAnswerOfAnAppendIsOneMoreTileRow(): void
    {
        $this->subject(['id' => '21', 'p' => '2', 'append' => '1'])->buildDegraded('category-filter');

        self::assertStringStartsWith('<li ', $this->contents);
        self::assertStringContainsString('data-hyperion-listing-error', $this->contents);
        self::assertStringNotContainsString('hyperion-product-grid', $this->contents);
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
