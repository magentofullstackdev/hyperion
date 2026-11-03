<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Plugin;

use Magento\Framework\App\ActionInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Controller\Result\Raw;
use Magento\Framework\Controller\Result\RawFactory;
use Magento\Framework\View\Page\Config as PageConfig;
use Magento\Framework\View\Result\Page;
use Magentofullstackdev\HyperionCatalog\Model\FilterGuard;
use Magentofullstackdev\HyperionCatalog\Plugin\Framework\App\Action\FilterGuardPlugin;
use Magentofullstackdev\HyperionCore\Model\Security\RateLimiter;
use Magentofullstackdev\HyperionCore\Model\Security\TooManyRequests;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\MockObject\Stub;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * @covers \Magentofullstackdev\HyperionCatalog\Plugin\Framework\App\Action\FilterGuardPlugin
 */
class FilterGuardPluginTest extends TestCase
{
    /** @var FilterGuard&Stub */
    private FilterGuard $guard;
    /** @var RateLimiter&Stub */
    private RateLimiter $limiter;
    /** @var HttpRequest&Stub */
    private HttpRequest $request;
    /** @var Raw&Stub */
    private Raw $refusal;
    private FilterGuardPlugin $plugin;

    protected function setUp(): void
    {
        $this->guard = $this->createStub(FilterGuard::class);
        $this->guard->method('getMaxActiveFilters')->willReturn(5);
        $this->limiter = $this->createStub(RateLimiter::class);
        $this->request = $this->createStub(HttpRequest::class);
        $this->refusal = $this->createStub(Raw::class);
        $this->plugin = $this->plugin();
    }

    /**
     * The guard, the limiter and the 400 result are stubs unless the test
     * hands in a mock whose calls it verifies.
     */
    private function plugin(?FilterGuard $guard = null, ?RateLimiter $limiter = null, ?Raw $badRequest = null): FilterGuardPlugin
    {
        $tooMany = $this->createStub(TooManyRequests::class);
        $tooMany->method('create')->willReturn($this->refusal);
        $rawFactory = $this->createStub(RawFactory::class);
        $rawFactory->method('create')->willReturn($badRequest ?? $this->createStub(Raw::class));

        return new FilterGuardPlugin(
            $guard ?? $this->guard,
            $limiter ?? $this->limiter,
            $tooMany,
            $rawFactory,
            $this->request,
            $this->createStub(LoggerInterface::class),
            ['catalog_category_view', 'hyperion_category_filter', 'catalogsearch_result_index']
        );
    }

    /**
     * @return FilterGuard&MockObject
     */
    private function guardMock(): FilterGuard
    {
        $guard = $this->createMock(FilterGuard::class);
        $guard->method('getMaxActiveFilters')->willReturn(5);

        return $guard;
    }

    public function testUnknownParamsAreStrippedAndACategoryPageWithThemIsCounted(): void
    {
        $this->route('catalog_category_view');
        $guard = $this->guardMock();
        $guard->expects(self::once())->method('stripUnknown')->willReturn(['filtro1', 'filtro2']);
        $guard->method('activeFilters')->willReturn([]);
        $limiter = $this->createMock(RateLimiter::class);
        $limiter->expects(self::once())->method('hit')->with('category_filter')->willReturn(true);

        self::assertSame('page', $this->plugin($guard, $limiter)->aroundExecute($this->action(), static fn () => 'page'));
    }

    public function testThePageNumberIsClampedOnEveryGuardedRoute(): void
    {
        $this->route('catalogsearch_result_index');
        $guard = $this->guardMock();
        $guard->method('stripUnknown')->willReturn([]);
        $guard->method('activeFilters')->willReturn([]);
        $guard->expects(self::once())->method('clampPage')->with($this->request)->willReturn(416);

        self::assertSame('page', $this->plugin($guard)->aroundExecute($this->action(), static fn () => 'page'));
    }

    public function testACleanCategoryPageIsNeitherCountedNorMarked(): void
    {
        $this->route('catalog_category_view');
        $this->guard->method('stripUnknown')->willReturn([]);
        $this->guard->method('activeFilters')->willReturn([]);
        $limiter = $this->createMock(RateLimiter::class);
        $limiter->expects(self::never())->method('hit');
        $page = $this->createMock(Page::class);
        $page->expects(self::never())->method('setHeader');

        self::assertSame($page, $this->plugin(null, $limiter)->aroundExecute($this->action(), static fn () => $page));
    }

    public function testTooManyFiltersIsABadRequestBeforeTheActionRuns(): void
    {
        $this->route('hyperion_category_filter');
        $this->guard->method('stripUnknown')->willReturn([]);
        $this->guard->method('activeFilters')->willReturn(['a', 'b', 'c', 'd', 'e', 'f']);
        $badRequest = $this->createMock(Raw::class);
        $badRequest->expects(self::once())->method('setHttpResponseCode')->with(400)->willReturnSelf();
        $badRequest->method('setHeader')->willReturnSelf();
        $badRequest->method('setContents')->willReturnSelf();
        $calls = 0;

        $result = $this->plugin(null, null, $badRequest)->aroundExecute($this->action(), function () use (&$calls) {
            $calls++;
            return 'page';
        });

        self::assertSame($badRequest, $result);
        self::assertSame(0, $calls);
    }

    public function testAFilteredCategoryPageOverBudgetGetsTheRefusal(): void
    {
        $this->route('catalog_category_view');
        $this->guard->method('stripUnknown')->willReturn([]);
        $this->guard->method('activeFilters')->willReturn(['color']);
        $this->limiter->method('hit')->willReturn(false);

        self::assertSame($this->refusal, $this->plugin->aroundExecute($this->action(), static fn () => 'never'));
    }

    public function testTwoOrMoreFiltersMarkTheCategoryPageNoindex(): void
    {
        $this->route('catalog_category_view');
        $this->guard->method('stripUnknown')->willReturn([]);
        $this->guard->method('activeFilters')->willReturn(['color', 'size']);
        $this->limiter->method('hit')->willReturn(true);
        $config = $this->createMock(PageConfig::class);
        $config->expects(self::once())->method('setRobots')->with('NOINDEX,NOFOLLOW');
        $page = $this->createMock(Page::class);
        $page->expects(self::once())->method('setHeader')->with('X-Robots-Tag', 'noindex, nofollow', true);
        $page->method('getConfig')->willReturn($config);

        self::assertSame($page, $this->plugin->aroundExecute($this->action(), static fn () => $page));
    }

    public function testTheGridFragmentCarriesTheRobotsDirectiveAsAnHtmxTrigger(): void
    {
        $this->route('hyperion_category_filter');
        $this->guard->method('stripUnknown')->willReturn([]);
        $this->guard->method('activeFilters')->willReturn(['color', 'size']);
        $this->guard->method('getRobots')->willReturnMap([[2, 'NOINDEX,NOFOLLOW'], [1, 'INDEX,FOLLOW']]);
        $fragment = $this->createMock(Raw::class);
        $fragment->expects(self::once())->method('setHeader')
            ->with('HX-Trigger', '{"hyperion:listing-robots":{"robots":"NOINDEX,NOFOLLOW"}}', true)
            ->willReturnSelf();

        self::assertSame($fragment, $this->plugin->aroundExecute($this->action(), static fn () => $fragment));
    }

    public function testTheGridFragmentWithOneFilterCarriesTheStoreDefaultDirective(): void
    {
        $this->route('hyperion_catalog_search');
        $plugin = new FilterGuardPlugin(
            $this->guard,
            $this->limiter,
            $this->createStub(TooManyRequests::class),
            $this->createStub(RawFactory::class),
            $this->request,
            $this->createStub(LoggerInterface::class),
            ['hyperion_catalog_search']
        );
        $this->guard->method('stripUnknown')->willReturn([]);
        $this->guard->method('activeFilters')->willReturn(['cat']);
        $this->guard->method('getRobots')->willReturnMap([[1, 'INDEX,FOLLOW']]);
        $fragment = $this->createMock(Raw::class);
        $fragment->expects(self::once())->method('setHeader')
            ->with('HX-Trigger', '{"hyperion:listing-robots":{"robots":"INDEX,FOLLOW"}}', true)
            ->willReturnSelf();

        self::assertSame($fragment, $plugin->aroundExecute($this->action(), static fn () => $fragment));
    }

    public function testARawResultOfAnUnguardedRouteGetsNoTrigger(): void
    {
        $this->route('catalog_product_view');
        $raw = $this->createMock(Raw::class);
        $raw->expects(self::never())->method('setHeader');

        self::assertSame($raw, $this->plugin->aroundExecute($this->action(), static fn () => $raw));
    }

    public function testOtherRoutesAreNotGuarded(): void
    {
        $this->route('catalog_product_view');
        $guard = $this->guardMock();
        $guard->expects(self::never())->method('stripUnknown');
        self::assertSame('page', $this->plugin($guard)->aroundExecute($this->action(), static fn () => 'page'));
    }

    public function testAFailingGuardLetsTheRequestThrough(): void
    {
        $this->route('catalog_product_view');
        $plugin = new FilterGuardPlugin(
            $this->guard,
            $this->limiter,
            $this->createStub(TooManyRequests::class),
            $this->createStub(RawFactory::class),
            $this->request,
            $this->createStub(LoggerInterface::class),
            ['catalog_product_view']
        );
        $this->guard->method('stripUnknown')->willThrowException(new \RuntimeException('eav down'));
        self::assertSame('page', $plugin->aroundExecute($this->action(), static fn () => 'page'));
    }

    private function route(string $fullActionName): void
    {
        $this->request->method('getFullActionName')->willReturn($fullActionName);
        $this->request->method('getParams')->willReturn([]);
    }

    private function action(): ActionInterface
    {
        return $this->createStub(ActionInterface::class);
    }
}
