<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model\Suggest;

use Magento\Catalog\Model\Config as CatalogConfig;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Attribute\Source\Status;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory as ProductCollectionFactory;
use Magento\Framework\Api\FilterBuilder;
use Magento\Framework\Api\Search\SearchCriteriaBuilderFactory;
use Magento\Framework\Api\SortOrder;
use Magento\Search\Api\SearchInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use Psr\Log\LoggerInterface;

/**
 * Products for a query, from the store's search engine: the same
 * `quick_search_container` request the search results page runs (so typo
 * tolerance, SKU weight, promoted SKUs, synonyms and stop words apply), the
 * ids hydrated in one collection load and returned in relevance order as
 * ProductSummary records. An engine failure is logged and yields nothing:
 * the storefront never breaks because the engine is down. It also marks the
 * request as degraded, so "nothing" is shown once and no cache keeps it as
 * the answer for the query.
 */
class ProductProvider
{
    private const REQUEST_NAME = 'quick_search_container';
    private const IMAGE_ID = 'search_suggest_thumbnail';

    public function __construct(
        private readonly SearchInterface $search,
        private readonly SearchCriteriaBuilderFactory $criteriaBuilderFactory,
        private readonly FilterBuilder $filterBuilder,
        private readonly ProductCollectionFactory $productCollectionFactory,
        private readonly CatalogConfig $catalogConfig,
        private readonly ProductSummary $productSummary,
        private readonly LoggerInterface $logger,
        private readonly DegradedResponse $degradedResponse
    ) {
    }

    /**
     * The engine's answer for a query: the ids of the first page in relevance
     * order and the total number of matching products (the dropdown shows
     * "View All (+N)" from the difference).
     *
     * @return array{ids: int[], total: int}
     */
    public function query(string $query, int $limit): array
    {
        if ($limit < 1 || trim($query) === '') {
            return ['ids' => [], 'total' => 0];
        }
        try {
            $builder = $this->criteriaBuilderFactory->create();
            $builder->addFilter($this->filterBuilder->setField('search_term')->setValue($query)->create());
            $builder->addFilter(
                $this->filterBuilder->setField('visibility')
                    ->setValue([Visibility::VISIBILITY_IN_SEARCH, Visibility::VISIBILITY_BOTH])
                    ->create()
            );
            // Relevance order, as the search results page; without a sort order
            // the engine adapter emits an empty direction the engine rejects.
            $builder->addSortOrder('relevance', SortOrder::SORT_DESC);
            // The framework computes the offset as page * size: the first page is 0.
            $builder->setPageSize($limit)->setCurrentPage(0);
            $criteria = $builder->create();
            $criteria->setRequestName(self::REQUEST_NAME);
            $result = $this->search->search($criteria);
            $ids = [];
            foreach ($result->getItems() as $document) {
                $ids[] = (int) $document->getId();
            }
            $ids = array_values(array_unique(array_filter($ids)));

            return ['ids' => $ids, 'total' => max((int) $result->getTotalCount(), count($ids))];
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: engine query failed: ' . $e->getMessage());
            $this->degradedResponse->mark();
            return ['ids' => [], 'total' => 0];
        }
    }

    /**
     * @return int[] product ids in relevance order
     */
    public function searchIds(string $query, int $limit): array
    {
        return $this->query($query, $limit)['ids'];
    }

    /**
     * @param int[] $ids
     * @return array<int, array<string, mixed>> ProductSummary records in the order of $ids
     */
    public function load(array $ids, int $storeId): array
    {
        if ($ids === []) {
            return [];
        }
        try {
            $collection = $this->productCollectionFactory->create();
            $collection->setStoreId($storeId)
                ->addAttributeToSelect($this->catalogConfig->getProductAttributes())
                ->addAttributeToSelect(['thumbnail', 'small_image'])
                ->addAttributeToFilter('status', ['eq' => Status::STATUS_ENABLED])
                ->setVisibility([Visibility::VISIBILITY_IN_SEARCH, Visibility::VISIBILITY_BOTH])
                ->addIdFilter($ids)
                ->addMinimalPrice()
                ->addFinalPrice()
                ->addTaxPercents()
                ->addUrlRewrite();
            $byId = [];
            foreach ($collection as $product) {
                /** @var Product $product */
                $byId[(int) $product->getId()] = $this->productSummary->fromProduct($product, self::IMAGE_ID);
            }
            $ordered = [];
            foreach ($ids as $id) {
                if (isset($byId[$id])) {
                    $ordered[] = $byId[$id];
                }
            }

            return $ordered;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: product hydration failed: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function search(string $query, int $limit, int $storeId): array
    {
        return $this->searchWithTotal($query, $limit, $storeId)['products'];
    }

    /**
     * The hydrated first page and the engine's total for the query.
     *
     * @return array{products: array<int, array<string, mixed>>, total: int}
     */
    public function searchWithTotal(string $query, int $limit, int $storeId): array
    {
        $result = $this->query($query, $limit);

        return ['products' => $this->load($result['ids'], $storeId), 'total' => $result['total']];
    }
}
