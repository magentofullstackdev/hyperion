<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Plugin\Elasticsearch;

use Magento\Catalog\Model\ResourceModel\Product as ProductResource;
use Magento\Elasticsearch\ElasticAdapter\SearchAdapter\Mapper;
use Magento\Framework\Search\RequestInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Psr\Log\LoggerInterface;

/**
 * Promoted SKUs: the assembled search query is wrapped in a `function_score`
 * whose single function multiplies the score of the promoted products. The
 * products are selected by document id (the product id, resolved from the
 * configured SKUs with one query per request), so the analyzer of the `sku`
 * field plays no part. A promoted product still has to match the query (the
 * function filters the matches, it never adds documents), it only moves to
 * the top. Applied to the storefront search requests only, never to the
 * category listing.
 */
class MapperPlugin
{
    private const REQUESTS = ['quick_search_container', 'advanced_search_container'];

    /** @var array<string, int[]> */
    private array $resolved = [];

    public function __construct(
        private readonly Config $config,
        private readonly ProductResource $productResource,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param Mapper $subject
     * @param array<string, mixed> $result
     * @param RequestInterface $request
     * @return array<string, mixed>
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterBuildQuery(Mapper $subject, array $result, RequestInterface $request): array
    {
        try {
            if (!in_array((string) $request->getName(), self::REQUESTS, true) || !isset($result['body']['query'])) {
                return $result;
            }
            $skus = $this->config->getPromotedSkus();
            $boost = $this->config->getPromotedBoost();
            if ($skus === [] || $boost === 1.0) {
                return $result;
            }
            $ids = $this->productIds($skus);
            if ($ids === []) {
                return $result;
            }
            $result['body']['query'] = [
                'function_score' => [
                    'query' => $result['body']['query'],
                    'functions' => [
                        ['filter' => ['ids' => ['values' => $ids]], 'weight' => $boost],
                    ],
                    'score_mode' => 'max',
                    'boost_mode' => 'multiply',
                ],
            ];
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: promoted SKU boost skipped: ' . $e->getMessage());
        }

        return $result;
    }

    /**
     * @param string[] $skus
     * @return int[]
     */
    private function productIds(array $skus): array
    {
        $key = implode("\0", $skus);
        if (!isset($this->resolved[$key])) {
            $this->resolved[$key] = array_values(array_map('intval', $this->productResource->getProductsIdsBySkus($skus)));
        }

        return $this->resolved[$key];
    }
}
