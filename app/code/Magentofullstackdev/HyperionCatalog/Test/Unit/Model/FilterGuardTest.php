<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Test\Unit\Model;

use Magento\Catalog\Model\Config as CatalogConfig;
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
use Magentofullstackdev\HyperionCore\Model\Http\MarketingParameters;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * @covers \Magentofullstackdev\HyperionCatalog\Model\FilterGuard
 */
class FilterGuardTest extends TestCase
{
    /** The toolbar configuration of a store with both view modes, as the sample data sets it. */
    private const TOOLBAR_CONFIG = [
        'catalog/frontend/list_mode' => 'grid-list',
        'catalog/frontend/grid_per_page_values' => '12,24,36',
        'catalog/frontend/grid_per_page' => '12',
        'catalog/frontend/list_per_page_values' => '5,10,15,20,25',
        'catalog/frontend/list_per_page' => '10',
        'catalog/frontend/list_allow_all' => '0',
        'catalog/frontend/remember_pagination' => '0',
    ];

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

    /**
     * @param array<string, string> $params
     * @param array<string, string> $config
     */
    #[DataProvider('pageSizes')]
    public function testThePageIsClampedByThePageSizeTheToolbarWillUse(array $params, array $config, int $expectedPage): void
    {
        $guard = $this->guard([], [], '5', $config);
        $request = $this->createMock(HttpRequest::class);
        $request->method('getParam')->willReturnCallback(self::params($params + ['p' => '9000']));
        $request->method('getQuery')->willReturn(new Parameters(['p' => '9000']));
        $request->expects(self::once())->method('setParam')->with('p', (string) $expectedPage);

        self::assertSame($expectedPage, $guard->clampPage($request));
    }

    /**
     * @return array<string, array{array<string, string>, array<string, string>, int}>
     */
    public static function pageSizes(): array
    {
        return [
            'a limit the store does not offer is ignored: the grid default pages' => [['product_list_limit' => '1'], [], 833],
            'no limit: the default of the first mode' => [[], [], 833],
            'a grid limit' => [['product_list_limit' => '36'], [], 277],
            'list mode pages by the list default' => [['product_list_mode' => 'list'], [], 1000],
            'a list limit in list mode' => [['product_list_mode' => 'list', 'product_list_limit' => '25'], [], 400],
            'a list only limit in grid mode is ignored' => [['product_list_limit' => '25'], [], 833],
            'a mode the store does not offer falls back to the first one' => [
                ['product_list_mode' => 'list', 'product_list_limit' => '25'],
                ['catalog/frontend/list_mode' => 'grid'],
                833,
            ],
            'list first store' => [[], ['catalog/frontend/list_mode' => 'list-grid'], 1000],
            'a default outside the list: the first value' => [[], ['catalog/frontend/grid_per_page' => '9'], 833],
            'all products on one page' => [['product_list_limit' => 'all'], ['catalog/frontend/list_allow_all' => '1'], 1],
            'all while not allowed is ignored' => [['product_list_limit' => 'all'], [], 833],
            'remembered pagination: the largest value of both lists' => [
                ['product_list_limit' => '5', 'product_list_mode' => 'list'],
                ['catalog/frontend/remember_pagination' => '1'],
                277,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $params
     * @param array<string, string> $config
     * @param string[] $dropped
     */
    #[DataProvider('toolbarValues')]
    public function testToolbarValuesTheToolbarWouldNotActOnAreDropped(array $params, array $config, array $dropped): void
    {
        $guard = $this->guard([], [], '5', $config);
        $query = new Parameters($params);
        $removed = [];
        $request = $this->createStub(HttpRequest::class);
        $request->method('getParam')->willReturnCallback(self::params($params));
        $request->method('getQuery')->willReturn($query);
        $request->method('setParam')->willReturnCallback(function (string $name, mixed $value) use (&$removed, $request) {
            self::assertNull($value, 'a dropped parameter is removed, never rewritten');
            $removed[] = $name;

            return $request;
        });

        self::assertSame($dropped, $guard->normalizeToolbar($request));
        self::assertSame($dropped, $removed);
        self::assertSame(array_values(array_diff(array_keys($params), $dropped)), array_keys($query->toArray()));
    }

    /**
     * @return array<string, array{array<string, mixed>, array<string, string>, string[]}>
     */
    public static function toolbarValues(): array
    {
        $allowAll = ['catalog/frontend/list_allow_all' => '1'];

        return [
            'limit 1 is not offered' => [['product_list_limit' => '1'], [], ['product_list_limit']],
            'limit 7 is not offered' => [['product_list_limit' => '7'], [], ['product_list_limit']],
            'a numeric string that is not the offered text' => [['product_list_limit' => '1e3'], [], ['product_list_limit']],
            'a grid limit' => [['product_list_limit' => '24'], [], []],
            'a list only limit is kept whatever the mode' => [['product_list_limit' => '25', 'product_list_mode' => 'grid'], [], []],
            'all while allowed' => [['product_list_limit' => 'all'], $allowAll, []],
            'all while not allowed' => [['product_list_limit' => 'all'], [], ['product_list_limit']],
            'a configured sort order' => [['product_list_order' => 'price'], [], []],
            'relevance, the search order' => [['product_list_order' => 'relevance'], [], []],
            'an unknown sort order' => [['product_list_order' => 'zzz9'], [], ['product_list_order']],
            'direction in upper case' => [['product_list_dir' => 'ASC'], [], []],
            'an unknown direction' => [['product_list_dir' => 'up'], [], ['product_list_dir']],
            'list mode' => [['product_list_mode' => 'list'], [], []],
            'an unknown mode' => [['product_list_mode' => 'table'], [], ['product_list_mode']],
            'append 1' => [['append' => '1'], [], []],
            'append 2' => [['append' => '2'], [], ['append']],
            'page 3' => [['p' => '3'], [], []],
            'a negative page' => [['p' => '-1'], [], ['p']],
            'a page that is not a number' => [['p' => 'abc'], [], ['p']],
            'page 0' => [['p' => '0'], [], ['p']],
            'an array value' => [['product_list_order' => ['price']], [], ['product_list_order']],
            'filters and other parameters are not touched' => [
                ['color' => '49', 'product_list_dir' => 'sideways', 'p' => '2', 'append' => 'yes'],
                [],
                ['product_list_dir', 'append'],
            ],
            'nothing to normalize' => [['color' => '49'], [], []],
        ];
    }

    public function testTheMarketingParametersAreSystemParameters(): void
    {
        $guard = $this->guard(['color'], [], '5');

        foreach (['gad_source', 'gbraid', 'wbraid', 'srsltid', 'gclid', 'fbclid', 'msclkid', 'utm_source', 'mc_cid', '_bta_tid'] as $name) {
            self::assertTrue($guard->isSystemParam($name), $name);
        }
        self::assertTrue($guard->isSystemParam('product_list_order'));
        self::assertFalse($guard->isSystemParam('filtro1'));
        self::assertSame(
            ['filtro1'],
            $guard->unknownParams(['id' => '4', 'gad_source' => '1', 'gbraid' => 'x', 'srsltid' => 'y', 'filtro1' => 'z'])
        );
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
     * @param array<string, mixed> $params
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
        $config += self::TOOLBAR_CONFIG;
        $scopeConfig = $this->createStub(ScopeConfigInterface::class);
        $scopeConfig->method('getValue')->willReturnCallback(
            static fn (string $path) => $path === FilterGuard::XML_PATH_MAX_ACTIVE_FILTERS ? $max : ($config[$path] ?? null)
        );
        $scopeConfig->method('isSetFlag')->willReturnCallback(static fn (string $path): bool => !empty($config[$path]));
        $catalogConfig = $this->createStub(CatalogConfig::class);
        $catalogConfig->method('getAttributeUsedForSortByArray')
            ->willReturn(['position' => 'Position', 'name' => 'Product Name', 'price' => 'Price']);
        $pageSize = $this->createStub(PageSizeProvider::class);
        $pageSize->method('getMaxPageSize')->willReturn(10000);

        return new FilterGuard(
            $factory,
            $cache,
            new Json(),
            $storeManager,
            $scopeConfig,
            $pageSize,
            $catalogConfig,
            new MarketingParameters()
        );
    }
}
