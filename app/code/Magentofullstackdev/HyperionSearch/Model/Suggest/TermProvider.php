<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model\Suggest;

use Magento\Framework\UrlInterface;
use Magento\Search\Model\Query;
use Magento\Search\Model\QueryFactory;
use Psr\Log\LoggerInterface;

/**
 * Popular search terms of the store that start with the query, most popular
 * first, with their result counts (the `search_query` table Magento fills on
 * every search), as links to the search results page. Core's autocomplete
 * pool is not used: with Elasticsearch / OpenSearch it only carries the
 * engine's spelling suggestions.
 */
class TermProvider
{
    public function __construct(
        private readonly QueryFactory $queryFactory,
        private readonly UrlInterface $urlBuilder,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return array<int, array{title: string, num_results: int, url: string}>
     */
    public function get(int $limit): array
    {
        if ($limit < 1) {
            return [];
        }
        try {
            $query = $this->queryFactory->get();
            if (!$query instanceof Query || trim((string) $query->getQueryText()) === '') {
                return [];
            }
            $collection = $query->getSuggestCollection();
            $collection->setPageSize($limit);
            $terms = [];
            foreach ($collection as $item) {
                $title = trim((string) $item->getQueryText());
                if ($title === '') {
                    continue;
                }
                $terms[] = [
                    'title' => $title,
                    'num_results' => (int) $item->getNumResults(),
                    'url' => $this->urlBuilder->getUrl('catalogsearch/result', ['_query' => ['q' => $title]]),
                ];
            }

            return $terms;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: term suggestions failed: ' . $e->getMessage());
            return [];
        }
    }
}
