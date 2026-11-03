<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Model\Suggest;

use Magento\Catalog\Model\Config as CatalogConfig;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory as ProductCollectionFactory;
use Magento\Framework\Api\Filter;
use Magento\Framework\Api\FilterBuilder;
use Magento\Framework\Api\Search\DocumentInterface;
use Magento\Framework\Api\Search\SearchCriteria;
use Magento\Framework\Api\Search\SearchCriteriaBuilder;
use Magento\Framework\Api\Search\SearchCriteriaBuilderFactory;
use Magento\Framework\Api\Search\SearchResultInterface;
use Magento\Framework\Api\SortOrder;
use Magento\Search\Api\SearchInterface;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use Magentofullstackdev\HyperionSearch\Model\Suggest\ProductProvider;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Model\Suggest\ProductProvider
 */
class ProductProviderTest extends TestCase
{
    /** @var SearchInterface&Stub */
    private SearchInterface $search;

    /** @var SearchCriteriaBuilder&Stub */
    private SearchCriteriaBuilder $builder;

    public function testQueryReturnsTheFirstPageIdsAndTheEngineTotal(): void
    {
        $criteria = $this->createMock(SearchCriteria::class);
        $criteria->expects(self::once())->method('setRequestName')->with('quick_search_container');
        $builder = $this->createMock(SearchCriteriaBuilder::class);
        $builder->method('addFilter')->willReturnSelf();
        $builder->method('create')->willReturn($criteria);
        $builder->expects(self::once())->method('setPageSize')->with(4)->willReturnSelf();
        $builder->expects(self::once())->method('setCurrentPage')->with(0)->willReturnSelf();
        $builder->expects(self::once())->method('addSortOrder')->with('relevance', SortOrder::SORT_DESC)->willReturnSelf();
        $search = $this->createMock(SearchInterface::class);
        $search->expects(self::once())->method('search')->with($criteria)
            ->willReturn($this->searchResult([3, 1, 3, 0, 7, 9], 10));

        self::assertSame(['ids' => [3, 1, 7, 9], 'total' => 10], $this->provider($search, $builder)->query('bag', 4));
    }

    public function testTotalIsNeverBelowTheIdsReturned(): void
    {
        $this->search->method('search')->willReturn($this->searchResult([3, 1], 0));
        $provider = $this->provider();

        self::assertSame(['ids' => [3, 1], 'total' => 2], $provider->query('bag', 4));
        self::assertSame([3, 1], $provider->searchIds('bag', 4));
    }

    public function testBlankQueryOrNoLimitNeverReachesTheEngine(): void
    {
        $search = $this->createMock(SearchInterface::class);
        $search->expects(self::never())->method('search');
        $provider = $this->provider($search);

        self::assertSame(['ids' => [], 'total' => 0], $provider->query('  ', 4));
        self::assertSame(['ids' => [], 'total' => 0], $provider->query('bag', 0));
        self::assertSame(['products' => [], 'total' => 0], $provider->searchWithTotal('bag', 0, 1));
        self::assertSame([], $provider->search('bag', 0, 1));
    }

    public function testEngineFailureIsLoggedAndYieldsNothing(): void
    {
        $this->search->method('search')->willThrowException(new \RuntimeException('engine down'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with(self::stringContains('engine down'));

        self::assertSame(['ids' => [], 'total' => 0], $this->provider(null, null, $logger)->query('bag', 4));
    }

    /**
     * @param int[] $ids
     * @return SearchResultInterface&Stub
     */
    private function searchResult(array $ids, int $total): SearchResultInterface
    {
        $items = [];
        foreach ($ids as $id) {
            $document = $this->createStub(DocumentInterface::class);
            $document->method('getId')->willReturn($id);
            $items[] = $document;
        }
        $result = $this->createStub(SearchResultInterface::class);
        $result->method('getItems')->willReturn($items);
        $result->method('getTotalCount')->willReturn($total);

        return $result;
    }

    protected function setUp(): void
    {
        $this->search = $this->createStub(SearchInterface::class);
        $this->builder = $this->createStub(SearchCriteriaBuilder::class);
        $this->builder->method('addFilter')->willReturnSelf();
        $this->builder->method('addSortOrder')->willReturnSelf();
        $this->builder->method('setPageSize')->willReturnSelf();
        $this->builder->method('setCurrentPage')->willReturnSelf();
        $this->builder->method('create')->willReturn($this->createStub(SearchCriteria::class));
    }

    /**
     * The engine, the criteria builder and the logger are stubs unless the
     * test hands in a mock whose calls it verifies.
     */
    private function provider(
        ?SearchInterface $search = null,
        ?SearchCriteriaBuilder $builder = null,
        ?LoggerInterface $logger = null
    ): ProductProvider {
        $builderFactory = $this->createStub(SearchCriteriaBuilderFactory::class);
        $builderFactory->method('create')->willReturn($builder ?? $this->builder);
        $filterBuilder = $this->createStub(FilterBuilder::class);
        $filterBuilder->method('setField')->willReturnSelf();
        $filterBuilder->method('setValue')->willReturnSelf();
        $filterBuilder->method('create')->willReturn($this->createStub(Filter::class));

        return new ProductProvider(
            $search ?? $this->search,
            $builderFactory,
            $filterBuilder,
            $this->createStub(ProductCollectionFactory::class),
            $this->createStub(CatalogConfig::class),
            $this->createStub(ProductSummary::class),
            $logger ?? $this->createStub(LoggerInterface::class)
        );
    }
}
