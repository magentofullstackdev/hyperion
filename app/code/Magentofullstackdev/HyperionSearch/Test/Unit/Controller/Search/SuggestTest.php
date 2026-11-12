<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Test\Unit\Controller\Search;

use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Element\AbstractBlock;
use Magento\Framework\View\LayoutInterface;
use Magento\Framework\View\Result\Page;
use Magento\Framework\View\Result\PageFactory;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\CacheHeaders;
use Magentofullstackdev\HyperionSearch\Controller\Search\Suggest;
use Magentofullstackdev\HyperionSearch\Model\Suggest\Cache as SuggestCache;
use Magentofullstackdev\HyperionSearch\ViewModel\Suggest as SuggestViewModel;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionSearch\Controller\Search\Suggest
 */
class SuggestTest extends TestCase
{
    /** @var array<string, string> */
    private array $headers = [];
    private string $contents = '';
    private DegradedResponse $degradedResponse;

    protected function setUp(): void
    {
        $this->headers = [];
        $this->contents = '';
        $this->degradedResponse = new DegradedResponse();
    }

    public function testAnAnsweredQueryIsStoredInTheApplicationCacheAndSentPublic(): void
    {
        $cache = $this->createMock(SuggestCache::class);
        $cache->method('key')->willReturn('key');
        $cache->method('load')->willReturn(null);
        $cache->expects(self::once())->method('save')->with('key', '<ul>suggestions</ul>', ['cat_p_7']);

        $this->controller($cache, false)->execute();

        self::assertSame('<ul>suggestions</ul>', $this->contents);
        self::assertSame('public, max-age=3600, s-maxage=3600', $this->headers['Cache-Control']);
        self::assertSame(SuggestCache::TAG . ',cat_p_7', $this->headers['X-Magento-Tags']);
    }

    public function testAnAnswerComputedWhileTheEngineFailedIsNeitherStoredNorPublic(): void
    {
        $cache = $this->createMock(SuggestCache::class);
        $cache->method('key')->willReturn('key');
        $cache->method('load')->willReturn(null);
        $cache->expects(self::never())->method('save');

        $this->controller($cache, true)->execute();

        self::assertSame('<ul>suggestions</ul>', $this->contents, 'the shopper still gets the terms and categories');
        self::assertStringContainsString('no-store', $this->headers['Cache-Control']);
        self::assertArrayNotHasKey('X-Hyperion-Public-Cache', $this->headers);
    }

    /**
     * @param bool $engineFails the product section marks the request as degraded while the block renders
     */
    private function controller(SuggestCache $cache, bool $engineFails): Suggest
    {
        $raw = $this->createStub(Raw::class);
        $raw->method('setHeader')->willReturnCallback(function (string $name, string $value) use ($raw): Raw {
            $this->headers[$name] = $value;

            return $raw;
        });
        $raw->method('setContents')->willReturnCallback(function (string $contents) use ($raw): Raw {
            $this->contents = $contents;

            return $raw;
        });
        $raw->method('setHttpResponseCode')->willReturn($raw);
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($raw);

        $block = $this->createStub(AbstractBlock::class);
        $block->method('toHtml')->willReturnCallback(function () use ($engineFails): string {
            if ($engineFails) {
                $this->degradedResponse->mark();
            }

            return '<ul>suggestions</ul>';
        });
        $layout = $this->createStub(LayoutInterface::class);
        $layout->method('getBlock')->willReturn($block);
        $page = $this->createStub(Page::class);
        $page->method('getLayout')->willReturn($layout);
        $pageFactory = $this->createStub(PageFactory::class);
        $pageFactory->method('create')->willReturn($page);

        $viewModel = $this->createStub(SuggestViewModel::class);
        $viewModel->method('isQueryLongEnough')->willReturn(true);
        $viewModel->method('getQuery')->willReturn('bag');
        $viewModel->method('getCacheTags')->willReturn(['cat_p_7']);
        $httpContext = $this->createStub(HttpContext::class);
        $httpContext->method('getVaryString')->willReturn('vary');
        $store = $this->createStub(StoreInterface::class);
        $store->method('getId')->willReturn(1);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);

        return new Suggest(
            $pageFactory,
            $rawFactory,
            new CacheHeaders($this->degradedResponse),
            $cache,
            $viewModel,
            $httpContext,
            $storeManager,
            $this->createStub(LoggerInterface::class),
            $this->degradedResponse
        );
    }
}
