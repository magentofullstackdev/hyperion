<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\ViewModel;

use Magento\AdvancedSearch\Model\SuggestedQueries;
use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory as CategoryCollectionFactory;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Search\Model\QueryFactory;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Magentofullstackdev\HyperionSearch\Model\QueryText;
use Magentofullstackdev\HyperionSearch\Model\Suggest\CategoryProvider;
use Magentofullstackdev\HyperionSearch\Model\Suggest\ProductProvider;
use Psr\Log\LoggerInterface;

/**
 * What the search results page shows instead of a dead end when the current
 * search query (Magento's search term model) has no result: the products of the longest word of the query that does match
 * (one engine request per word, longest first, until one answers), the
 * categories whose name matches a word, and the top-level categories of the
 * store. Computed only when the template asks, on the zero-results branch.
 */
class ZeroResults implements ArgumentInterface
{
    private const PRODUCT_LIMIT = 8;
    private const CATEGORY_LIMIT = 4;
    private const POPULAR_LIMIT = 6;

    /** @var array<string, mixed>|null */
    private ?array $fallback = null;

    public function __construct(
        private readonly Config $config,
        private readonly QueryText $queryText,
        private readonly ProductProvider $products,
        private readonly CategoryProvider $categories,
        private readonly CategoryCollectionFactory $categoryCollectionFactory,
        private readonly StoreManagerInterface $storeManager,
        private readonly UrlInterface $urlBuilder,
        private readonly QueryFactory $queryFactory,
        // The concrete class: core declares no preference for its interface, it configures the class per engine.
        private readonly SuggestedQueries $suggestedQueries,
        private readonly LoggerInterface $logger
    ) {
    }

    public function isEnabled(): bool
    {
        return $this->config->isZeroResultsFallbackEnabled();
    }

    /**
     * @return array{term: string, products: array<int, array<string, mixed>>}|null the word that matched and its products
     */
    public function getSimilar(): ?array
    {
        return $this->fallback()['similar'];
    }

    /**
     * @return array<int, array{id: int, name: string, path: string, url: string}>
     */
    public function getCategories(): array
    {
        return $this->fallback()['categories'];
    }

    /**
     * @return array<int, array{name: string, url: string}>
     */
    public function getPopularCategories(): array
    {
        try {
            $store = $this->storeManager->getStore();
            $rootId = $store instanceof Store ? (int) $store->getRootCategoryId() : 0;
            if ($rootId < 1) {
                return [];
            }
            $collection = $this->categoryCollectionFactory->create();
            $collection->setStoreId((int) $store->getId())
                ->addAttributeToSelect(['name', 'url_key', 'url_path', 'include_in_menu'])
                ->addAttributeToFilter('include_in_menu', ['eq' => 1])
                ->addIsActiveFilter()
                ->addFieldToFilter('parent_id', $rootId)
                ->setOrder('position', 'ASC')
                ->setPageSize(self::POPULAR_LIMIT);
            $result = [];
            foreach ($collection as $category) {
                /** @var Category $category */
                $result[] = ['name' => (string) $category->getName(), 'url' => (string) $category->getUrl()];
            }

            return $result;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: popular categories failed: ' . $e->getMessage());
            return [];
        }
    }

    public function getSearchUrl(string $term): string
    {
        return $this->urlBuilder->getUrl('catalogsearch/result', ['_query' => ['q' => $term]]);
    }

    /**
     * @return array{similar: array{term: string, products: array<int, array<string, mixed>>}|null, categories: array<int, array<string, mixed>>}
     */
    private function fallback(): array
    {
        if ($this->fallback !== null) {
            return $this->fallback;
        }
        $this->fallback = ['similar' => null, 'categories' => []];
        if (!$this->isEnabled()) {
            return $this->fallback;
        }
        try {
            $storeId = (int) $this->storeManager->getStore()->getId();
            $query = $this->queryFactory->get();
            $words = $this->queryText->words((string) $query->getQueryText(), $storeId);
            $candidates = $this->spellingSuggestions();
            if (count($words) >= 2) {
                $candidates = array_merge($candidates, array_filter($words, static fn (string $w): bool => mb_strlen($w) >= 3));
            }
            foreach (array_values(array_unique($candidates)) as $candidate) {
                $products = $this->products->search($candidate, self::PRODUCT_LIMIT, $storeId);
                if ($products !== []) {
                    $this->fallback['similar'] = ['term' => $candidate, 'products' => $products];
                    break;
                }
            }
            foreach ($words as $word) {
                if (mb_strlen($word) < 3) {
                    continue;
                }
                $categories = $this->categories->search($word, self::CATEGORY_LIMIT);
                if ($categories !== []) {
                    $this->fallback['categories'] = $categories;
                    break;
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: zero results fallback failed: ' . $e->getMessage());
        }

        return $this->fallback;
    }

    /**
     * The engine's "did you mean" terms for the current query, best first.
     *
     * @return string[]
     */
    private function spellingSuggestions(): array
    {
        try {
            $terms = [];
            foreach ($this->suggestedQueries->getItems($this->queryFactory->get()) as $item) {
                $term = $this->queryText->normalize((string) $item->getQueryText());
                if ($term !== '' && $term !== $this->queryText->normalize((string) $this->queryFactory->get()->getQueryText())) {
                    $terms[] = $term;
                }
            }

            return array_slice($terms, 0, 2);
        } catch (\Throwable $e) {
            $this->logger->warning('Hyperion search: engine suggestions unavailable: ' . $e->getMessage());
            return [];
        }
    }
}
