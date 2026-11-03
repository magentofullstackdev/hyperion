<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Plugin\Elasticsearch;

use Magento\Elasticsearch\Model\Adapter\FieldMapper\Product\AttributeAdapter;
use Magento\Elasticsearch\Model\Adapter\FieldMapper\Product\AttributeProvider;
use Magento\Elasticsearch\Model\Adapter\FieldMapper\Product\FieldProvider\FieldType\ResolverInterface;
use Magento\Elasticsearch\SearchAdapter\Query\Builder\MatchQuery;
use Magento\Framework\Search\Request\Query\MatchQuery as RequestMatchQuery;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Magentofullstackdev\HyperionSearch\Plugin\Elasticsearch\MatchQueryPlugin;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Plugin\Elasticsearch\MatchQueryPlugin
 */
class MatchQueryPluginTest extends TestCase
{
    /** @var Config&Stub */
    private Config $config;
    private MatchQueryPlugin $plugin;

    protected function setUp(): void
    {
        $this->config = $this->createStub(Config::class);
        $this->config->method('getFuzzyMinQueryLength')->willReturn(4);
        $attributeProvider = $this->createStub(AttributeProvider::class);
        $attributeProvider->method('getByAttributeCode')->willReturn($this->createStub(AttributeAdapter::class));
        $resolver = $this->createStub(ResolverInterface::class);
        // every field is text except the date one
        $resolver->method('getFieldType')->willReturnCallback(static fn () => 'string');
        $this->plugin = new MatchQueryPlugin($this->config, $attributeProvider, $resolver, $this->createStub(LoggerInterface::class));
    }

    public function testFuzzinessAndSkuWeightDecorateOnlyTheClausesTheBuilderAdded(): void
    {
        $this->config->method('getFuzziness')->willReturn('AUTO');
        $this->config->method('getSkuBoost')->willReturn(3.0);
        $before = ['bool' => ['should' => [['match' => ['_search' => ['query' => 'old', 'boost' => 1]]]]]];
        $after = $before;
        $after['bool']['should'][] = ['match' => ['_search' => ['query' => 'joust dufle', 'boost' => 2]]];
        $after['bool']['should'][] = ['match_phrase_prefix' => ['sku' => ['query' => 'joust dufle', 'boost' => 2]]];
        $after['bool']['should'][] = ['match_phrase_prefix' => ['name' => ['query' => 'joust dufle', 'boost' => 2]]];

        $result = $this->plugin->afterBuild($this->subject(), $after, $before, $this->requestQuery('joust dufle'), 'should');

        self::assertSame(['query' => 'old', 'boost' => 1], $result['bool']['should'][0]['match']['_search'], 'existing clauses untouched');
        self::assertSame(
            ['query' => 'joust dufle', 'boost' => 2, 'fuzziness' => 'AUTO', 'prefix_length' => 1],
            $result['bool']['should'][1]['match']['_search']
        );
        self::assertSame(['query' => 'joust dufle', 'boost' => 6.0], $result['bool']['should'][2]['match_phrase_prefix']['sku'], 'sku weight, no fuzziness on the prefix clause');
        self::assertSame(['query' => 'joust dufle', 'boost' => 2], $result['bool']['should'][3]['match_phrase_prefix']['name']);
    }

    public function testShortAndQuotedQueriesAndOffStayExact(): void
    {
        $this->config->method('getFuzziness')->willReturn('AUTO');
        $this->config->method('getSkuBoost')->willReturn(1.0);
        $clauses = ['bool' => ['must' => [['match' => ['_search' => ['query' => 'bag', 'boost' => 1]]]]]];

        self::assertSame($clauses, $this->plugin->afterBuild($this->subject(), $clauses, ['bool' => []], $this->requestQuery('bag'), 'must'));
        self::assertSame($clauses, $this->plugin->afterBuild($this->subject(), $clauses, ['bool' => []], $this->requestQuery('"joust duffle"'), 'must'));

        $off = $this->createStub(Config::class);
        $off->method('getFuzziness')->willReturn(null);
        $off->method('getSkuBoost')->willReturn(1.0);
        $plugin = new MatchQueryPlugin($off, $this->createStub(AttributeProvider::class), $this->createStub(ResolverInterface::class), $this->createStub(LoggerInterface::class));
        self::assertSame($clauses, $plugin->afterBuild($this->subject(), $clauses, ['bool' => []], $this->requestQuery('joust dufle'), 'must'));
    }

    public function testNonTextFieldsNeverGetFuzziness(): void
    {
        $this->config->method('getFuzziness')->willReturn('1');
        $this->config->method('getSkuBoost')->willReturn(1.0);
        $resolver = $this->createStub(ResolverInterface::class);
        $resolver->method('getFieldType')->willReturn('date');
        $attributeProvider = $this->createStub(AttributeProvider::class);
        $attributeProvider->method('getByAttributeCode')->willReturn($this->createStub(AttributeAdapter::class));
        $plugin = new MatchQueryPlugin($this->config, $attributeProvider, $resolver, $this->createStub(LoggerInterface::class));
        $clauses = ['bool' => ['must' => [['match' => ['news_from_date' => ['query' => '2026-01-01', 'boost' => 1]]]]]];

        self::assertSame($clauses, $plugin->afterBuild($this->subject(), $clauses, ['bool' => []], $this->requestQuery('2026-01-01'), 'must'));
    }

    private function subject(): MatchQuery
    {
        return $this->createStub(MatchQuery::class);
    }

    private function requestQuery(string $value): RequestMatchQuery
    {
        $query = $this->createStub(RequestMatchQuery::class);
        $query->method('getValue')->willReturn($value);

        return $query;
    }
}
