<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\ViewModel;

use Magento\Framework\App\RequestInterface;
use Magento\Framework\Escaper;
use Magento\Framework\UrlInterface;
use Magento\Search\Model\QueryFactory;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Magentofullstackdev\HyperionSearch\Model\QueryText;
use Magentofullstackdev\HyperionSearch\Model\Suggest\CategoryProvider;
use Magentofullstackdev\HyperionSearch\Model\Suggest\ProductProvider;
use Magentofullstackdev\HyperionSearch\Model\Suggest\TermProvider;
use Magentofullstackdev\HyperionSearch\ViewModel\Suggest;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionSearch\ViewModel\Suggest
 */
class SuggestTest extends TestCase
{
    private const OPEN = '<strong class="font-bold text-primary">';
    private const CLOSE = '</strong>';

    /** @var ProductProvider&Stub */
    private ProductProvider $products;

    /** @var CategoryProvider&Stub */
    private CategoryProvider $categories;

    /** @var TermProvider&Stub */
    private TermProvider $terms;

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function highlightProvider(): array
    {
        return [
            'prefix of a word, case kept' => ['ear', 'Youth Earphones', 'Youth ' . self::OPEN . 'Ear' . self::CLOSE . 'phones'],
            'every occurrence' => ['bag', 'Bag in a bag', self::OPEN . 'Bag' . self::CLOSE . ' in a ' . self::OPEN . 'bag' . self::CLOSE],
            'phrase first, then its words' => [
                'duffle bag',
                'Joust Duffle Bag, a bag',
                'Joust ' . self::OPEN . 'Duffle Bag' . self::CLOSE . ', a ' . self::OPEN . 'bag' . self::CLOSE,
            ],
            'category path' => ['bag', 'Gear / Bags', 'Gear / ' . self::OPEN . 'Bag' . self::CLOSE . 's'],
            'text is escaped around and inside the match' => [
                'a&b',
                '<b>A&B</b> & a&b',
                '&lt;b&gt;' . self::OPEN . 'A&amp;B' . self::CLOSE . '&lt;/b&gt; &amp; ' . self::OPEN . 'a&amp;b' . self::CLOSE,
            ],
            'regex characters in the query are literal' => ['c++ (x)', 'C++ (x) and c', self::OPEN . 'C++ (x)' . self::CLOSE . ' and c'],
            'one letter words are skipped, the phrase still matches' => ['a bag', 'a bag, a Bag, a', self::OPEN . 'a bag' . self::CLOSE . ', ' . self::OPEN . 'a Bag' . self::CLOSE . ', a'],
            'no match' => ['zzz', 'Hoodie <3', 'Hoodie &lt;3'],
            'no query' => ['', 'Hoodie <3', 'Hoodie &lt;3'],
            'multibyte' => ['élé', 'Téléphone', 'T' . self::OPEN . 'élé' . self::CLOSE . 'phone'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('highlightProvider')]
    public function testHighlightWrapsTheMatchesAndEscapesEverything(string $query, string $text, string $expected): void
    {
        self::assertSame($expected, $this->suggest($query)->highlight($text));
        self::assertSame($expected, $this->suggest('other')->highlight($text, $query));
    }

    public function testTotalAndRemainingComeFromTheEngineTotal(): void
    {
        $products = [['id' => 1, 'sku' => 'BAG-01', 'name' => 'Bag 1'], ['id' => 2, 'sku' => 'X', 'name' => 'Bag 2']];
        $provider = $this->createMock(ProductProvider::class);
        $provider->expects(self::once())->method('searchWithTotal')->with('bag', 4, 7)
            ->willReturn(['products' => $products, 'total' => 10]);
        $this->categories->method('search')->willReturn([['id' => 5, 'name' => 'Bags', 'path' => 'Gear / Bags', 'url' => '/bags']]);
        $this->terms->method('get')->willReturn([]);
        $suggest = $this->suggest('bag', $provider);

        self::assertSame(10, $suggest->getTotalProductCount());
        self::assertSame(8, $suggest->getRemainingProductCount());
        self::assertSame($products, $suggest->getProducts());
        self::assertTrue($suggest->hasResults());
        self::assertSame(['cat_p_1', 'cat_p_2', 'cat_c_5'], $suggest->getCacheTags());
        self::assertTrue($suggest->isSkuMatch($products[0]));
        self::assertFalse($suggest->isSkuMatch($products[1]));
    }

    public function testRemainingNeverGoesBelowZero(): void
    {
        $this->products->method('searchWithTotal')->willReturn(['products' => [['id' => 1], ['id' => 2]], 'total' => 1]);
        $this->categories->method('search')->willReturn([]);
        $this->terms->method('get')->willReturn([]);

        self::assertSame(0, $this->suggest('bag')->getRemainingProductCount());
    }

    public function testShortQueryComputesNothing(): void
    {
        $provider = $this->createMock(ProductProvider::class);
        $provider->expects(self::never())->method('searchWithTotal');
        $suggest = $this->suggest(' B ', $provider);

        self::assertSame('b', $suggest->getQuery());
        self::assertFalse($suggest->isQueryLongEnough());
        self::assertFalse($suggest->hasResults());
        self::assertSame(0, $suggest->getTotalProductCount());
        self::assertSame(0, $suggest->getRemainingProductCount());
    }

    protected function setUp(): void
    {
        $this->products = $this->createStub(ProductProvider::class);
        $this->categories = $this->createStub(CategoryProvider::class);
        $this->terms = $this->createStub(TermProvider::class);
    }

    /**
     * @param (ProductProvider&MockObject)|null $products a mock when the test verifies the provider calls
     */
    private function suggest(string $query, ?ProductProvider $products = null): Suggest
    {
        $request = $this->createStub(RequestInterface::class);
        $request->method('getParam')->willReturnCallback(
            static fn (string $name, $default = null) => $name === QueryFactory::QUERY_VAR_NAME ? $query : $default
        );
        $store = $this->createStub(StoreInterface::class);
        $store->method('getId')->willReturn(7);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $config = $this->createStub(Config::class);
        $config->method('getSuggestProducts')->willReturn(4);
        $config->method('getSuggestTerms')->willReturn(4);
        $config->method('getSuggestCategories')->willReturn(3);
        $config->method('getStopWords')->willReturn([]);

        return new Suggest(
            $request,
            $storeManager,
            $this->createStub(UrlInterface::class),
            new Escaper(),
            $config,
            new QueryText($config),
            $products ?? $this->products,
            $this->categories,
            $this->terms
        );
    }
}
