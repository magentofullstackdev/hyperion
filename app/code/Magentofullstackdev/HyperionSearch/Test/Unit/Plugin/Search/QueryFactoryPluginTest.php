<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Plugin\Search;

use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Search\Model\QueryFactory;
use Magentofullstackdev\HyperionSearch\Model\Config;
use Magentofullstackdev\HyperionSearch\Model\QueryText;
use Magentofullstackdev\HyperionSearch\Plugin\Search\QueryFactoryPlugin;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Plugin\Search\QueryFactoryPlugin
 */
class QueryFactoryPluginTest extends TestCase
{
    public function testTheRequestQueryLosesItsStopWordsOnce(): void
    {
        $request = $this->createMock(HttpRequest::class);
        $request->method('getParam')->with('q')->willReturn('the bag for men');
        $request->expects(self::once())->method('setParam')->with('q', 'bag men');
        $plugin = $this->plugin($request, ['the', 'for']);

        $plugin->beforeGet($this->createStub(QueryFactory::class));
        $plugin->beforeGet($this->createStub(QueryFactory::class));
    }

    public function testAQueryWithoutStopWordsIsNotRewritten(): void
    {
        $request = $this->createMock(HttpRequest::class);
        $request->method('getParam')->with('q')->willReturn('joust bag');
        $request->expects(self::never())->method('setParam');

        $this->plugin($request, ['the'])->beforeGet($this->createStub(QueryFactory::class));
    }

    /**
     * @param string[] $stopWords
     */
    private function plugin(HttpRequest $request, array $stopWords): QueryFactoryPlugin
    {
        $config = $this->createStub(Config::class);
        $config->method('getStopWords')->willReturn($stopWords);

        return new QueryFactoryPlugin($request, new QueryText($config), $this->createStub(LoggerInterface::class));
    }
}
