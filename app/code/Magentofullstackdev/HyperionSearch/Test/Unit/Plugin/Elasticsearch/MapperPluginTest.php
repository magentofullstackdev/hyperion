<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Plugin\Elasticsearch;

use Magento\Catalog\Model\ResourceModel\Product as ProductResource;
use Magento\Elasticsearch\ElasticAdapter\SearchAdapter\Mapper;
use Magento\Framework\Search\RequestInterface;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Magentofullstackdev\HyperionSearch\Plugin\Elasticsearch\MapperPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Plugin\Elasticsearch\MapperPlugin
 */
class MapperPluginTest extends TestCase
{
    public function testTheSearchQueryIsWrappedInAFunctionScoreOfThePromotedSkus(): void
    {
        $plugin = $this->plugin(['24-MB01', '24-MB02'], 10.0);
        $built = ['body' => ['query' => ['bool' => ['must' => []]], 'size' => 5]];

        $result = $plugin->afterBuildQuery($this->createStub(Mapper::class), $built, $this->request('quick_search_container'));

        self::assertSame(5, $result['body']['size']);
        $score = $result['body']['query']['function_score'];
        self::assertSame(['bool' => ['must' => []]], $score['query'], 'the original query is the one that selects documents');
        self::assertSame(10.0, $score['functions'][0]['weight']);
        self::assertSame(['ids' => ['values' => [2, 5]]], $score['functions'][0]['filter'], 'documents are selected by product id');
        self::assertSame('multiply', $score['boost_mode']);
    }

    public function testCategoryListingsNoSkusUnknownSkusAndNeutralWeightLeaveTheQueryAlone(): void
    {
        $built = ['body' => ['query' => ['bool' => []]]];
        $mapper = $this->createStub(Mapper::class);
        self::assertSame($built, $this->plugin(['NO-SUCH'], 10.0)->afterBuildQuery($mapper, $built, $this->request('quick_search_container')));

        self::assertSame($built, $this->plugin(['24-MB01'], 10.0)->afterBuildQuery($mapper, $built, $this->request('catalog_view_container')));
        self::assertSame($built, $this->plugin([], 10.0)->afterBuildQuery($mapper, $built, $this->request('quick_search_container')));
        self::assertSame($built, $this->plugin(['24-MB01'], 1.0)->afterBuildQuery($mapper, $built, $this->request('quick_search_container')));
    }

    /**
     * @param string[] $skus
     */
    private function plugin(array $skus, float $boost): MapperPlugin
    {
        $config = $this->createStub(Config::class);
        $config->method('getPromotedSkus')->willReturn($skus);
        $config->method('getPromotedBoost')->willReturn($boost);
        $resource = $this->createStub(ProductResource::class);
        $resource->method('getProductsIdsBySkus')->willReturnCallback(static fn (array $list): array => array_filter(['24-MB01' => '2', '24-MB02' => '5'], static fn (string $sku): bool => in_array($sku, $list, true), ARRAY_FILTER_USE_KEY));

        return new MapperPlugin($config, $resource, $this->createStub(LoggerInterface::class));
    }

    private function request(string $name): RequestInterface
    {
        $request = $this->createStub(RequestInterface::class);
        $request->method('getName')->willReturn($name);

        return $request;
    }
}
