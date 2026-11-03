<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\Test\Unit\Plugin\Framework\App\Action;

use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magentofullstackdev\HyperionCore\Model\Security\RateLimiter;
use Magentofullstackdev\HyperionCore\Model\Security\TooManyRequests;
use Magentofullstackdev\HyperionCore\Plugin\Framework\App\Action\RateLimitPlugin;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCore\Plugin\Framework\App\Action\RateLimitPlugin
 */
class RateLimitPluginTest extends TestCase
{
    /** @var RateLimiter&Stub */
    private RateLimiter $limiter;
    /** @var HttpRequest&Stub */
    private HttpRequest $request;
    /** @var Raw&Stub */
    private Raw $refusal;
    private RateLimitPlugin $plugin;

    protected function setUp(): void
    {
        $this->limiter = $this->createStub(RateLimiter::class);
        $this->request = $this->createStub(HttpRequest::class);
        $this->refusal = $this->createStub(Raw::class);
        $this->plugin = $this->plugin($this->limiter);
    }

    /**
     * The limiter is the one dependency a test verifies: a stub by default, a
     * mock when the test hands one in.
     */
    private function plugin(RateLimiter $limiter): RateLimitPlugin
    {
        $tooMany = $this->createStub(TooManyRequests::class);
        $tooMany->method('create')->willReturn($this->refusal);

        return new RateLimitPlugin(
            $limiter,
            $tooMany,
            $this->request,
            $this->createStub(LoggerInterface::class),
            ['hyperion_search_suggest' => 'search_suggest', 'catalogsearch_result_index' => 'search_result']
        );
    }

    public function testAMappedRouteOverItsBudgetGetsTheRefusalAndTheActionNeverRuns(): void
    {
        $this->request->method('getFullActionName')->willReturn('hyperion_search_suggest');
        $limiter = $this->createMock(RateLimiter::class);
        $limiter->expects(self::once())->method('hit')->with('search_suggest')->willReturn(false);
        $calls = 0;

        $result = $this->plugin($limiter)->aroundExecute($this->createStub(ActionInterface::class), function () use (&$calls) {
            $calls++;
            return 'page';
        });

        self::assertSame($this->refusal, $result);
        self::assertSame(0, $calls);
    }

    public function testAMappedRouteWithinItsBudgetRunsOnce(): void
    {
        $this->request->method('getFullActionName')->willReturn('catalogsearch_result_index');
        $this->limiter->method('hit')->willReturn(true);
        $calls = 0;

        $result = $this->plugin->aroundExecute($this->createStub(ActionInterface::class), function () use (&$calls) {
            $calls++;
            return 'page';
        });

        self::assertSame('page', $result);
        self::assertSame(1, $calls);
    }

    public function testUnmappedRoutesAreNotCounted(): void
    {
        $this->request->method('getFullActionName')->willReturn('catalog_product_view');
        $limiter = $this->createMock(RateLimiter::class);
        $limiter->expects(self::never())->method('hit');

        self::assertSame('page', $this->plugin($limiter)->aroundExecute($this->createStub(ActionInterface::class), static fn () => 'page'));
    }

    public function testAFailingLimiterLetsTheRequestThroughAndTheActionExceptionPropagates(): void
    {
        $this->request->method('getFullActionName')->willReturn('hyperion_search_suggest');
        $this->limiter->method('hit')->willThrowException(new \RuntimeException('cache down'));
        self::assertSame('ok', $this->plugin->aroundExecute($this->createStub(ActionInterface::class), static fn () => 'ok'));

        $this->expectException(\LogicException::class);
        $this->plugin->aroundExecute($this->createStub(ActionInterface::class), static function (): never {
            throw new \LogicException('from the action');
        });
    }
}
