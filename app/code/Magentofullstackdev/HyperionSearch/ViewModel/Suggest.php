<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\ViewModel;

use Magento\Framework\App\RequestInterface;
use Magento\Framework\Escaper;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Search\Model\QueryFactory;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Magentofullstackdev\HyperionSearch\Model\QueryText;
use Magentofullstackdev\HyperionSearch\Model\Suggest\CategoryProvider;
use Magentofullstackdev\HyperionSearch\Model\Suggest\ProductProvider;
use Magentofullstackdev\HyperionSearch\Model\Suggest\TermProvider;

/**
 * The three sections of the autocomplete dropdown for the current request's
 * query, computed once per request; the controller reads the cache tags of
 * what was rendered. The product section also knows the engine's total, so
 * the template can show "Products (10)" and "View All (+6)".
 */
class Suggest implements ArgumentInterface
{
    public const MIN_QUERY_LENGTH = 2;
    public const HIGHLIGHT_OPEN = '<strong class="font-bold text-primary">';
    public const HIGHLIGHT_CLOSE = '</strong>';

    /** @var array<string, mixed>|null */
    private ?array $sections = null;

    public function __construct(
        private readonly RequestInterface $request,
        private readonly StoreManagerInterface $storeManager,
        private readonly UrlInterface $urlBuilder,
        private readonly Escaper $escaper,
        private readonly Config $config,
        private readonly QueryText $queryText,
        private readonly ProductProvider $products,
        private readonly CategoryProvider $categories,
        private readonly TermProvider $terms
    ) {
    }

    public function getQuery(): string
    {
        return $this->queryText->normalize((string) $this->request->getParam(QueryFactory::QUERY_VAR_NAME, ''));
    }

    public function isQueryLongEnough(): bool
    {
        return mb_strlen($this->getQuery()) >= self::MIN_QUERY_LENGTH;
    }

    /**
     * @return array<int, array{title: string, num_results: int, url: string}>
     */
    public function getTerms(): array
    {
        return $this->sections()['terms'];
    }

    /**
     * @return array<int, array{id: int, name: string, path: string, url: string}>
     */
    public function getCategories(): array
    {
        return $this->sections()['categories'];
    }

    /**
     * @return array<int, array<string, mixed>> ProductSummary records
     */
    public function getProducts(): array
    {
        return $this->sections()['products'];
    }

    /**
     * Products matching the query in the search engine (the dropdown shows a slice).
     */
    public function getTotalProductCount(): int
    {
        return $this->sections()['total'];
    }

    /**
     * Matching products the dropdown does not show: the "+N" of "View All (+N)".
     */
    public function getRemainingProductCount(): int
    {
        return max(0, $this->getTotalProductCount() - count($this->getProducts()));
    }

    public function hasResults(): bool
    {
        return $this->getTerms() !== [] || $this->getCategories() !== [] || $this->getProducts() !== [];
    }

    /**
     * The product's SKU contains the query: the dropdown shows the SKU badge.
     *
     * @param array<string, mixed> $product
     */
    public function isSkuMatch(array $product): bool
    {
        $sku = mb_strtolower((string) ($product['sku'] ?? ''));

        return $sku !== '' && $this->getQuery() !== '' && str_contains($sku, $this->getQuery());
    }

    public function getSearchResultUrl(): string
    {
        return $this->urlBuilder->getUrl('catalogsearch/result', ['_query' => ['q' => $this->getQuery()]]);
    }

    /**
     * HTML of a text with every occurrence of the query (the whole phrase and
     * each of its words, case-insensitive) wrapped in a bold `<strong>`. Every
     * segment of the text is escaped: the result is safe to print as is.
     *
     * @param string|null $query defaults to the request's query
     */
    public function highlight(string $text, ?string $query = null): string
    {
        $query = $query === null ? $this->getQuery() : $this->queryText->normalize($query);
        $needles = $this->highlightNeedles($query);
        if ($text === '' || $needles === []) {
            return $this->escaper->escapeHtml($text);
        }
        $alternatives = implode('|', array_map(static fn (string $needle): string => preg_quote($needle, '/'), $needles));
        $parts = preg_split('/(' . $alternatives . ')/iu', $text, -1, PREG_SPLIT_DELIM_CAPTURE);
        if ($parts === false) {
            return $this->escaper->escapeHtml($text);
        }
        $html = '';
        foreach ($parts as $index => $part) {
            if ($part === '') {
                continue;
            }
            $escaped = $this->escaper->escapeHtml($part);
            // Odd indexes are the captured delimiters, the matches.
            $html .= $index % 2 === 1 ? self::HIGHLIGHT_OPEN . $escaped . self::HIGHLIGHT_CLOSE : $escaped;
        }

        return $html;
    }

    /**
     * @return string[] page cache tags of the rendered suggestions
     */
    public function getCacheTags(): array
    {
        $tags = [];
        foreach ($this->getProducts() as $product) {
            $tags[] = 'cat_p_' . (int) ($product['id'] ?? 0);
        }
        foreach ($this->getCategories() as $category) {
            $tags[] = 'cat_c_' . (int) $category['id'];
        }

        return $tags;
    }

    /**
     * The phrase and its words of at least two characters, longest first (the
     * regex alternation then prefers the longest match), without duplicates.
     *
     * @return string[]
     */
    private function highlightNeedles(string $query): array
    {
        $needles = $query === '' ? [] : [$query];
        foreach (preg_split('/\s+/u', $query) ?: [] as $word) {
            if (mb_strlen($word) >= self::MIN_QUERY_LENGTH) {
                $needles[] = $word;
            }
        }
        $needles = array_values(array_unique($needles));
        usort($needles, static fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));

        return $needles;
    }

    /**
     * @return array{terms: array<int, array<string, mixed>>, categories: array<int, array<string, mixed>>, products: array<int, array<string, mixed>>, total: int}
     */
    private function sections(): array
    {
        if ($this->sections !== null) {
            return $this->sections;
        }
        $query = $this->getQuery();
        if (!$this->isQueryLongEnough()) {
            return $this->sections = ['terms' => [], 'categories' => [], 'products' => [], 'total' => 0];
        }
        $storeId = (int) $this->storeManager->getStore()->getId();
        $products = $this->products->searchWithTotal($query, $this->config->getSuggestProducts($storeId), $storeId);

        return $this->sections = [
            'terms' => $this->terms->get($this->config->getSuggestTerms($storeId)),
            'categories' => $this->categories->search($query, $this->config->getSuggestCategories($storeId)),
            'products' => $products['products'],
            'total' => $products['total'],
        ];
    }
}
