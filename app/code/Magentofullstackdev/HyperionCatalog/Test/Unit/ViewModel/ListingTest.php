<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\ViewModel;

use Magento\Catalog\Block\Product\ListProduct;
use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\Layer;
use Magento\Catalog\Model\Layer\Filter\AbstractFilter;
use Magento\Catalog\Model\Layer\Filter\Item;
use Magento\Catalog\Model\Layer\Search as SearchLayer;
use Magento\Catalog\Model\Layer\State;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Search\Model\Query;
use Magento\Search\Model\QueryFactory;
use Magento\Theme\Block\Html\Pager;
use Magentofullstackdev\HyperionCatalog\Model\FilterGuard;
use Magentofullstackdev\HyperionCatalog\Model\InfiniteScroll;
use Magentofullstackdev\HyperionCatalog\Model\Listing\ListingUrl;
use Magentofullstackdev\HyperionCatalog\ViewModel\Listing;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCatalog\ViewModel\Listing
 */
class ListingTest extends TestCase
{
    private const CATEGORY_FRAGMENT = 'https://shop.test/hyperion/category/filter/?id=23';
    private const SEARCH_FRAGMENT = 'https://shop.test/hyperion/catalog/search/?q=jacket';

    private DegradedResponse $degradedResponse;

    protected function setUp(): void
    {
        $this->degradedResponse = new DegradedResponse();
    }

    public function testAListingWithoutFiltersKeepsTheBareFragmentUrl(): void
    {
        $block = $this->listBlock($this->categoryLayer([]));

        self::assertSame(self::CATEGORY_FRAGMENT, $this->listing()->getStateFragmentUrl($block));
    }

    public function testEveryActiveFilterTravelsInTheFragmentUrl(): void
    {
        // Core's price filter keeps the parsed pair in the state; the request holds the form the filter reads.
        $block = $this->listBlock($this->categoryLayer([
            $this->item('color', '49'),
            $this->item('price', ['10', '20']),
        ]));

        self::assertSame(
            self::CATEGORY_FRAGMENT . '&color=49&price=10-20',
            $this->listing(['price' => '10-20'])->getStateFragmentUrl($block)
        );
    }

    public function testAFilterThatSitsTwiceInTheStateYieldsOnePair(): void
    {
        $block = $this->listBlock($this->categoryLayer([
            $this->item('color', '49'),
            $this->item('size', '168'),
            $this->item('color', '49'),
            $this->item('size', '168'),
        ]));

        self::assertSame(self::CATEGORY_FRAGMENT . '&color=49&size=168', $this->listing()->getStateFragmentUrl($block));
    }

    public function testAStateItemTheGuardWouldNotAcceptIsLeftOut(): void
    {
        $block = $this->listBlock($this->categoryLayer([
            $this->item('rating_summary', '4'),
            $this->item('', '1'),
            $this->item('color', '49'),
        ]));

        self::assertSame(self::CATEGORY_FRAGMENT . '&color=49', $this->listing()->getStateFragmentUrl($block));
    }

    public function testTheValuesAControlSetsItselfAreAppendedAfterTheFilters(): void
    {
        $block = $this->listBlock($this->categoryLayer([$this->item('color', '49')]));
        $listing = $this->listing();

        self::assertSame(
            self::CATEGORY_FRAGMENT . '&color=49&product_list_mode=list',
            $listing->getStateFragmentUrl($block, ['product_list_mode' => 'list'])
        );
        self::assertSame(self::CATEGORY_FRAGMENT . '&color=49&p=3', $listing->getStateFragmentUrl($block, ['p' => 3]));
        self::assertSame(
            self::CATEGORY_FRAGMENT . '&color=49',
            $listing->getStateFragmentUrl($block, ['p' => null, 'id' => '99']),
            'an empty value is dropped and the category id of the endpoint cannot be replaced'
        );
    }

    public function testAFilterValueIsUrlEncoded(): void
    {
        $block = $this->listBlock($this->categoryLayer([$this->item('color', 'dark blue&red')]));

        self::assertSame(self::CATEGORY_FRAGMENT . '&color=dark+blue%26red', $this->listing()->getStateFragmentUrl($block));
    }

    public function testAMultiValueItemTheRequestDoesNotCarryIsJoinedWithCommas(): void
    {
        $block = $this->listBlock($this->categoryLayer([$this->item('size', ['166', '167'])]));

        self::assertSame(self::CATEGORY_FRAGMENT . '&size=166%2C167', $this->listing()->getStateFragmentUrl($block));
    }

    public function testAStateItemThatThrowsIsLoggedAndSkipped(): void
    {
        $broken = new Item($this->createStub(UrlInterface::class), $this->createStub(Pager::class), ['value' => '1']);
        $block = $this->listBlock($this->categoryLayer([$this->item('color', '49'), $broken, $this->item('size', '168')]));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('active filter skipped'));

        self::assertSame(
            self::CATEGORY_FRAGMENT . '&color=49&size=168',
            $this->listing([], $logger)->getStateFragmentUrl($block)
        );
    }

    public function testTheSearchListingKeepsItsQueryAndAddsTheCategoryFilter(): void
    {
        $block = $this->listBlock($this->layer(SearchLayer::class, [$this->item('cat', '5')]));

        self::assertSame(self::SEARCH_FRAGMENT . '&cat=5', $this->listing()->getStateFragmentUrl($block));
    }

    public function testTheAppendUrlCarriesThePageTheFiltersAndTheAppendMarker(): void
    {
        $block = $this->listBlock($this->categoryLayer([$this->item('size', '168')]));

        self::assertSame(self::CATEGORY_FRAGMENT . '&size=168&p=2&append=1', $this->listing()->getAppendFragmentUrl($block, 2));
    }

    public function testWithoutALayerThereIsNoFragmentUrl(): void
    {
        $listing = $this->listing();

        self::assertSame('', $listing->getStateFragmentUrl(null));
        self::assertSame('', $listing->getStateFragmentUrl($this->createStub(AbstractBlock::class)));
        self::assertSame('', $listing->getAppendFragmentUrl(null, 2));
    }

    public function testAListBlockThatCouldNotLoadMarksTheRequestAsDegraded(): void
    {
        $failed = $this->createStub(ListProduct::class);
        $failed->method('getData')->willReturnCallback(
            static fn (string $key = '', mixed $index = null): mixed => $key === 'has_error' ? true : null
        );
        $loaded = $this->createStub(ListProduct::class);
        $loaded->method('getData')->willReturn(null);
        $listing = $this->listing();

        self::assertFalse($listing->isLoadFailed(null));
        self::assertFalse($listing->isLoadFailed($loaded));
        self::assertFalse($this->degradedResponse->isDegraded(), 'an empty listing is not a failure');
        self::assertTrue($listing->isLoadFailed($failed));
        self::assertTrue($this->degradedResponse->isDegraded());
    }

    /**
     * @param array<string, mixed> $requestParams
     */
    private function listing(array $requestParams = [], ?LoggerInterface $logger = null): Listing
    {
        $logger ??= $this->createStub(LoggerInterface::class);
        $request = $this->createStub(RequestInterface::class);
        $request->method('getParam')->willReturnCallback(
            static fn (string $key, mixed $default = null): mixed => $requestParams[$key] ?? $default
        );
        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willReturnCallback(
            static fn (?string $route = null, ?array $params = null): string
                => 'https://shop.test/' . $route . '/?' . http_build_query($params['_query'] ?? [])
        );
        $query = $this->createStub(Query::class);
        $query->method('getQueryText')->willReturn('jacket');
        $queryFactory = $this->createStub(QueryFactory::class);
        $queryFactory->method('get')->willReturn($query);
        $filterGuard = $this->createStub(FilterGuard::class);
        $filterGuard->method('getFilterableCodes')->willReturn(['cat', 'price', 'color', 'size']);

        return new Listing(
            $request,
            new ListingUrl($urlBuilder, $queryFactory, $logger),
            $this->createStub(InfiniteScroll::class),
            $logger,
            $filterGuard,
            $this->degradedResponse
        );
    }

    private function listBlock(Layer $layer): ListProduct
    {
        $block = $this->createStub(ListProduct::class);
        $block->method('getLayer')->willReturn($layer);

        return $block;
    }

    /**
     * @param Item[] $items
     */
    private function categoryLayer(array $items): Layer
    {
        return $this->layer(Layer::class, $items);
    }

    /**
     * @param class-string<Layer> $class
     * @param Item[] $items
     */
    private function layer(string $class, array $items): Layer
    {
        $state = $this->createStub(State::class);
        $state->method('getFilters')->willReturn($items);
        $category = $this->createStub(Category::class);
        $category->method('getId')->willReturn(23);
        $layer = $this->createStub($class);
        $layer->method('getState')->willReturn($state);
        $layer->method('getCurrentCategory')->willReturn($category);

        return $layer;
    }

    /**
     * A layer state item as core builds it: a data object holding the filter and the applied value.
     */
    private function item(string $requestVar, mixed $value): Item
    {
        $filter = $this->createStub(AbstractFilter::class);
        $filter->method('getRequestVar')->willReturn($requestVar);

        return new Item(
            $this->createStub(UrlInterface::class),
            $this->createStub(Pager::class),
            ['filter' => $filter, 'value' => $value]
        );
    }
}
