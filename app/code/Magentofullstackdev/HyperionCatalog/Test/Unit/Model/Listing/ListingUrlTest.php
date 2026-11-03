<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model\Listing;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\Layer;
use Magento\Catalog\Model\Layer\Search as SearchLayer;
use Magento\Framework\UrlInterface;
use Magento\Search\Model\Query;
use Magento\Search\Model\QueryFactory;
use Magentofullstackdev\HyperionCatalog\Model\Listing\ListingUrl;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ListingUrlTest extends TestCase
{
    private const CATEGORY_URL = 'https://shop.test/women/tops-women.html';

    private function subject(string $queryText = 'jacket'): ListingUrl
    {
        $urlBuilder = $this->createStub(UrlInterface::class);
        $urlBuilder->method('getUrl')->willReturnCallback(
            static fn (string $route, array $params = []): string => 'https://shop.test/' . $route . '/?' . http_build_query($params['_query'] ?? [])
        );
        $query = $this->createStub(Query::class);
        $query->method('getQueryText')->willReturn($queryText);
        $queryFactory = $this->createStub(QueryFactory::class);
        $queryFactory->method('get')->willReturn($query);

        return new ListingUrl($urlBuilder, $queryFactory, $this->createStub(LoggerInterface::class));
    }

    private function categoryLayer(): Layer
    {
        $category = $this->createStub(Category::class);
        $category->method('getUrl')->willReturn(self::CATEGORY_URL);
        $category->method('getId')->willReturn(21);
        $layer = $this->createStub(Layer::class);
        $layer->method('getCurrentCategory')->willReturn($category);

        return $layer;
    }

    private function searchLayer(): SearchLayer
    {
        return $this->createStub(SearchLayer::class);
    }

    /**
     * @return array<string, array{string, array<string, mixed>, string}>
     */
    public static function withQueryProvider(): array
    {
        return [
            'toolbar state appended to a category URL' => [
                self::CATEGORY_URL,
                ['product_list_order' => 'name', 'product_list_mode' => 'grid', 'product_list_limit' => '12'],
                self::CATEGORY_URL . '?product_list_order=name&product_list_mode=grid&product_list_limit=12',
            ],
            'internal keys and empty values are dropped' => [
                self::CATEGORY_URL,
                ['id' => '21', 'append' => '1', '_current' => true, '_use_rewrite' => true, '_escape' => true, '_nocache' => '1', 'form_key' => 'abc', 'q' => 'x', 'size' => '', 'color' => null, 'price' => '20-30'],
                self::CATEGORY_URL . '?price=20-30',
            ],
            'no query at all leaves the base URL alone' => [
                self::CATEGORY_URL,
                ['id' => '21'],
                self::CATEGORY_URL,
            ],
            'the base URL keeps its own keys (the search query)' => [
                'https://shop.test/catalogsearch/result/?q=jacket',
                ['q' => 'other', 'cat' => '3', 'product_list_order' => 'price'],
                'https://shop.test/catalogsearch/result/?q=jacket&cat=3&product_list_order=price',
            ],
            'a fragment identifier survives' => [
                self::CATEGORY_URL . '#grid',
                ['p' => '2'],
                self::CATEGORY_URL . '?p=2#grid',
            ],
            'a relative base URL stays relative' => [
                '/women/tops-women.html',
                ['color' => '49'],
                '/women/tops-women.html?color=49',
            ],
            'an empty base URL stays empty' => ['', ['color' => '49'], ''],
        ];
    }

    /**
     * @param array<string, mixed> $query
     * @dataProvider withQueryProvider
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('withQueryProvider')]
    public function testWithQuery(string $base, array $query, string $expected): void
    {
        self::assertSame($expected, $this->subject()->withQuery($base, $query));
    }

    public function testQueryOfDecodesEscapedSeparators(): void
    {
        $query = $this->subject()->queryOf('https://shop.test/hyperion/category/filter/?id=21&amp;price=20-30&amp;color=49');

        self::assertSame(['id' => '21', 'price' => '20-30', 'color' => '49'], $query);
        self::assertSame([], $this->subject()->queryOf('https://shop.test/women.html'));
    }

    public function testPageAndFragmentUrlsOfACategory(): void
    {
        $subject = $this->subject();
        $layer = $this->categoryLayer();

        self::assertSame(self::CATEGORY_URL, $subject->getPageUrl($layer));
        self::assertSame('https://shop.test/hyperion/category/filter/?id=21', $subject->getFragmentUrl($layer));
    }

    public function testPageAndFragmentUrlsOfASearch(): void
    {
        $subject = $this->subject('red jacket');
        $layer = $this->searchLayer();

        self::assertSame('https://shop.test/catalogsearch/result/?q=red+jacket', $subject->getPageUrl($layer));
        self::assertSame('https://shop.test/hyperion/catalog/search/?q=red+jacket', $subject->getFragmentUrl($layer));
    }

    public function testASearchWithoutAQueryHasNoUrls(): void
    {
        $subject = $this->subject('  ');

        self::assertSame('', $subject->getPageUrl($this->searchLayer()));
        self::assertSame('', $subject->getFragmentUrl($this->searchLayer()));
        self::assertSame('/some/url?color=49', $subject->toPublic($this->searchLayer(), '/some/url?color=49'));
        self::assertSame('', $subject->toFragment($this->searchLayer(), '/some/url?color=49'));
    }

    public function testACoreUrlBuiltOnTheFragmentRouteIsRewrittenToThePage(): void
    {
        $subject = $this->subject();
        $layer = $this->categoryLayer();
        $coreUrl = 'https://shop.test/hyperion/category/filter/?id=21&amp;price=20-30&amp;color=49&amp;p=2';

        self::assertSame(self::CATEGORY_URL . '?price=20-30&color=49&p=2', $subject->toPublic($layer, $coreUrl));
        self::assertSame(
            'https://shop.test/hyperion/category/filter/?id=21&price=20-30&color=49',
            $subject->toFragment($layer, $coreUrl),
            'the fragment URL carries the filters, never the page'
        );
    }

    public function testAPublicUrlOfThePageIsLeftAsItIs(): void
    {
        $subject = $this->subject();
        $layer = $this->categoryLayer();

        self::assertSame(self::CATEGORY_URL . '?color=49', $subject->toPublic($layer, self::CATEGORY_URL . '?color=49'));
        self::assertSame(self::CATEGORY_URL, $subject->toPublic($layer, self::CATEGORY_URL));
    }

    public function testASearchRemoveUrlKeepsTheQueryOnce(): void
    {
        $subject = $this->subject('jacket');
        $layer = $this->searchLayer();
        $coreUrl = 'https://shop.test/hyperion/catalog/search/?q=jacket&amp;cat=3';

        self::assertSame('https://shop.test/catalogsearch/result/?q=jacket&cat=3', $subject->toPublic($layer, $coreUrl));
        self::assertSame('https://shop.test/hyperion/catalog/search/?q=jacket&cat=3', $subject->toFragment($layer, $coreUrl));
    }
}
