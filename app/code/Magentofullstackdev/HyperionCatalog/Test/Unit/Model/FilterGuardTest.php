<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model;

use Magento\Catalog\Model\ResourceModel\Product\Attribute\Collection as AttributeCollection;
use Magento\Catalog\Model\ResourceModel\Product\Attribute\CollectionFactory as AttributeCollectionFactory;
use Laminas\Stdlib\Parameters;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\DataObject;
use Magento\Framework\Serialize\Serializer\Json;
use Magento\Search\Model\Search\PageSizeProvider;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCatalog\Model\FilterGuard;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCatalog\Model\FilterGuard
 */
class FilterGuardTest extends TestCase
{
    /** @var array<string, string> */
    private array $cacheStore = [];
    private int $collectionLoads = 0;

    public function testTheAllowlistComesFromTheFilterableAttributesOnceAndIsCached(): void
    {
        $guard = $this->guard(['color', 'size'], ['color', 'material'], '5');

        self::assertSame(['cat', 'price', 'color', 'material', 'size'], $guard->getFilterableCodes());
        self::assertSame(['cat', 'price', 'color', 'material', 'size'], $guard->getFilterableCodes(), 'memoized');
        self::assertSame(2, $this->collectionLoads, 'one collection per flag, loaded once');
        self::assertCount(1, $this->cacheStore);

        $fresh = $this->guard(['should', 'not', 'load'], [], '5');
        self::assertSame(['cat', 'price', 'color', 'material', 'size'], $fresh->getFilterableCodes(), 'served from the cache');
        self::assertSame(2, $this->collectionLoads);
    }

    public function testActiveFiltersAndUnknownParamsAreToldApart(): void
    {
        $guard = $this->guard(['color', 'size'], [], '5');
        $params = ['id' => '12', 'color' => '49', 'size' => '168', 'p' => '2', 'product_list_order' => 'name', 'utm_source' => 'x', 'gclid' => 'y', 'filtro1' => 'x', 'filtro2' => 'y'];

        self::assertSame(['color', 'size'], $guard->activeFilters($params));
        self::assertSame(['filtro1', 'filtro2'], $guard->unknownParams($params));
    }

    public function testStripUnknownRemovesThemFromTheRequest(): void
    {
        $guard = $this->guard(['color'], [], '5');
        $query = new Parameters(['color' => '49', 'filtro1' => 'x']);
        $request = $this->createMock(HttpRequest::class);
        $request->method('getParams')->willReturn(['id' => '12', 'color' => '49', 'filtro1' => 'x']);
        $request->method('getQuery')->willReturn($query);
        $request->expects(self::once())->method('setParam')->with('filtro1', null);

        self::assertSame(['filtro1'], $guard->stripUnknown($request));
        self::assertSame(['color' => '49'], $query->toArray());
    }

    public function testAPageBeyondTheEngineWindowIsClampedToTheLastReachableOne(): void
    {
        $guard = $this->guard([], [], '5');
        $query = new Parameters(['p' => '5000', 'product_list_limit' => '24']);
        $request = $this->createMock(HttpRequest::class);
        $request->method('getParam')->willReturnCallback(self::params(['p' => '5000', 'product_list_limit' => '24']));
        $request->method('getQuery')->willReturn($query);
        $request->expects(self::once())->method('setParam')->with('p', '416');

        self::assertSame(416, $guard->clampPage($request), '10000 / 24');
        self::assertSame('416', $query['p']);
    }

    public function testWithoutARequestedLimitTheLargerConfiguredPageSizeClamps(): void
    {
        $guard = $this->guard([], [], '5', ['catalog/frontend/grid_per_page' => '12', 'catalog/frontend/list_per_page' => '10']);
        $query = new Parameters(['p' => '900']);
        $request = $this->createMock(HttpRequest::class);
        $request->method('getParam')->willReturnCallback(self::params(['p' => '900', 'product_list_limit' => 'all']));
        $request->method('getQuery')->willReturn($query);
        $request->expects(self::once())->method('setParam')->with('p', '833');

        self::assertSame(833, $guard->clampPage($request), '10000 / 12, the non numeric limit is ignored');
    }

    public function testAPageInsideTheWindowIsLeftAlone(): void
    {
        $guard = $this->guard([], [], '5');
        $request = $this->createMock(HttpRequest::class);
        $request->method('getParam')->willReturnCallback(self::params(['p' => '416', 'product_list_limit' => '24']));
        $request->expects(self::never())->method('setParam');

        self::assertNull($guard->clampPage($request));
        $first = $this->createMock(HttpRequest::class);
        $first->method('getParam')->willReturnCallback(self::params([]));
        $first->expects(self::never())->method('setParam');
        self::assertNull($guard->clampPage($first));
    }

    public function testTheRobotsDirectiveIsNoindexFromTwoFiltersOnElseTheStoreDefault(): void
    {
        $guard = $this->guard([], [], '5', ['design/search_engine_robots/default_robots' => 'INDEX,FOLLOW']);
        self::assertSame('INDEX,FOLLOW', $guard->getRobots(0));
        self::assertSame('INDEX,FOLLOW', $guard->getRobots(1));
        self::assertSame('NOINDEX,NOFOLLOW', $guard->getRobots(2));
        self::assertSame('NOINDEX,NOFOLLOW', $guard->getRobots(5));

        $store = $this->guard([], [], '5', ['design/search_engine_robots/default_robots' => 'NOINDEX,FOLLOW']);
        self::assertSame('NOINDEX,FOLLOW', $store->getRobots(1), 'the store default is whatever the merchant set');
        self::assertSame('INDEX,FOLLOW', $this->guard([], [], '5')->getRobots(1), 'no configured default: core\'s');
    }

    public function testMaxActiveFiltersFallsBackToTheDefault(): void
    {
        self::assertSame(5, $this->guard([], [], null)->getMaxActiveFilters());
        self::assertSame(3, $this->guard([], [], '3')->getMaxActiveFilters());
        self::assertSame(0, $this->guard([], [], '0')->getMaxActiveFilters());
    }

    /**
     * @param array<string, string> $params
     */
    private static function params(array $params): callable
    {
        return static fn (string $name, mixed $default = null): mixed => $params[$name] ?? $default;
    }

    /**
     * @param string[] $filterable
     * @param string[] $filterableInSearch
     */
    private function guard(array $filterable, array $filterableInSearch, ?string $max, array $config = []): FilterGuard
    {
        $factory = $this->createStub(AttributeCollectionFactory::class);
        $factory->method('create')->willReturnCallback(function () use ($filterable, $filterableInSearch): AttributeCollection {
            $collection = $this->createStub(AttributeCollection::class);
            $items = [];
            $collection->method('addIsFilterableFilter')->willReturnCallback(function () use (&$items, $filterable, $collection) {
                $items = $filterable;
                return $collection;
            });
            $collection->method('addIsFilterableInSearchFilter')->willReturnCallback(function () use (&$items, $filterableInSearch, $collection) {
                $items = $filterableInSearch;
                return $collection;
            });
            $collection->method('getIterator')->willReturnCallback(function () use (&$items): \ArrayIterator {
                $this->collectionLoads++;
                return new \ArrayIterator(array_map(static fn (string $code) => new DataObject(['attribute_code' => $code]), $items));
            });
            return $collection;
        });
        $cache = $this->createStub(CacheInterface::class);
        $cache->method('load')->willReturnCallback(fn (string $id) => $this->cacheStore[$id] ?? false);
        $cache->method('save')->willReturnCallback(function (string $data, string $id): bool {
            $this->cacheStore[$id] = $data;
            return true;
        });
        $store = $this->createStub(StoreInterface::class);
        $store->method('getId')->willReturn(1);
        $storeManager = $this->createStub(StoreManagerInterface::class);
        $storeManager->method('getStore')->willReturn($store);
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(
            static fn (string $path) => $path === FilterGuard::XML_PATH_MAX_ACTIVE_FILTERS ? $max : ($config[$path] ?? null)
        );
        $pageSize = $this->createStub(PageSizeProvider::class);
        $pageSize->method('getMaxPageSize')->willReturn(10000);

        return new FilterGuard($factory, $cache, new Json(), $storeManager, $scopeConfig, $pageSize);
    }
}
