<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model;

use Magento\Catalog\Model\Config as CatalogConfig;
use Magento\Catalog\Model\ResourceModel\Product\Attribute\CollectionFactory as AttributeCollectionFactory;
use Magento\Eav\Model\Cache\Type as EavCache;
use Magento\Eav\Model\Entity\Attribute;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\Request\Http as HttpRequest;
use Magento\Framework\Serialize\SerializerInterface;
use Magento\Search\Model\Search\PageSizeProvider;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCore\Model\Http\MarketingParameters;

/**
 * Knows which query parameters a listing request may carry: the filterable
 * attributes of the store (layered navigation in categories and in search),
 * the built-in `cat` and `price` filters, the toolbar parameters and the
 * marketing parameters the edge strips anyway (`MarketingParameters`).
 * Everything else (`?filtro1=x&filtro2=y`) is noise that would only multiply
 * cache keys and pollute URL building, so it is dropped from the request
 * before the layer or the search engine see it. The allowlist is cached per
 * store with the EAV tags: the check costs no query.
 *
 * The toolbar parameters are known names with free values, and their values
 * are cache keys too: `normalizeToolbar()` drops every value the toolbar
 * would not act on (an unknown sort order, a page size the store does not
 * offer, a direction that is neither `asc` nor `desc`), so the request that
 * reaches the action is the canonical one.
 *
 * It also keeps the page number inside the search engine's result window
 * (`clampPage()`): a page beyond it is not a listing anyone can reach by
 * paginating, and core's adapter answers it with an exception.
 */
class FilterGuard
{
    public const XML_PATH_MAX_ACTIVE_FILTERS = 'hyperion/catalog/max_active_filters';
    public const DEFAULT_MAX_ACTIVE_FILTERS = 5;
    public const XML_PATH_GRID_PER_PAGE = 'catalog/frontend/grid_per_page';
    public const XML_PATH_LIST_PER_PAGE = 'catalog/frontend/list_per_page';
    public const XML_PATH_GRID_PER_PAGE_VALUES = 'catalog/frontend/grid_per_page_values';
    public const XML_PATH_LIST_PER_PAGE_VALUES = 'catalog/frontend/list_per_page_values';
    public const XML_PATH_LIST_ALLOW_ALL = 'catalog/frontend/list_allow_all';
    public const XML_PATH_LIST_MODE = 'catalog/frontend/list_mode';
    public const XML_PATH_REMEMBER_PAGINATION = 'catalog/frontend/remember_pagination';
    /** Core's default robots directive of a frontend page (Magento\Framework\View\Page\Config::getRobots()). */
    public const XML_PATH_DEFAULT_ROBOTS = 'design/search_engine_robots/default_robots';
    public const ROBOTS_NOINDEX = 'NOINDEX,NOFOLLOW';
    private const DEFAULT_ROBOTS = 'INDEX,FOLLOW';
    private const PAGE_PARAM = 'p';
    private const LIMIT_PARAM = 'product_list_limit';
    private const ORDER_PARAM = 'product_list_order';
    private const DIRECTION_PARAM = 'product_list_dir';
    private const MODE_PARAM = 'product_list_mode';
    private const APPEND_PARAM = 'append';
    private const LIMIT_ALL = 'all';
    private const MODES = ['grid', 'list'];
    private const DIRECTIONS = ['asc', 'desc'];
    /** The sort order of the search results, which the catalog configuration does not list. */
    private const ORDER_RELEVANCE = 'relevance';
    private const TOOLBAR_PARAMS = [
        self::MODE_PARAM, self::DIRECTION_PARAM, self::ORDER_PARAM, self::LIMIT_PARAM, self::APPEND_PARAM, self::PAGE_PARAM,
    ];
    private const DEFAULT_PER_PAGE = 12;
    private const CACHE_KEY = 'hyperion_filter_guard_';
    private const CACHE_LIFETIME = 3600;
    private const BUILT_IN_FILTERS = ['cat', 'price'];
    private const SYSTEM_PARAMS = [
        'id', 'p', 'q', 'append', 'product_list_order', 'product_list_dir', 'product_list_limit', 'product_list_mode',
        '___store', '___from_store', 'form_key',
    ];

    /** @var array<int, string[]> */
    private array $filterable = [];

    public function __construct(
        private readonly AttributeCollectionFactory $attributeCollectionFactory,
        private readonly CacheInterface $cache,
        private readonly SerializerInterface $serializer,
        private readonly StoreManagerInterface $storeManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly PageSizeProvider $pageSizeProvider,
        private readonly CatalogConfig $catalogConfig,
        private readonly MarketingParameters $marketingParameters
    ) {
    }

    /**
     * Attribute codes a listing may filter on, `cat` and `price` included.
     *
     * @return string[]
     */
    public function getFilterableCodes(?int $storeId = null): array
    {
        $storeId ??= (int) $this->storeManager->getStore()->getId();
        if (isset($this->filterable[$storeId])) {
            return $this->filterable[$storeId];
        }
        $key = self::CACHE_KEY . $storeId;
        $cached = $this->cache->load($key);
        if (is_string($cached) && $cached !== '') {
            $codes = $this->serializer->unserialize($cached);
            if (is_array($codes)) {
                return $this->filterable[$storeId] = array_values(array_map('strval', $codes));
            }
        }

        $codes = self::BUILT_IN_FILTERS;
        foreach ([true, false] as $inSearch) {
            $collection = $this->attributeCollectionFactory->create();
            if ($inSearch) {
                $collection->addIsFilterableInSearchFilter();
            } else {
                $collection->addIsFilterableFilter();
            }
            foreach ($collection as $attribute) {
                $code = (string) $attribute->getAttributeCode();
                if ($code !== '') {
                    $codes[] = $code;
                }
            }
        }
        $codes = array_values(array_unique($codes));
        $this->cache->save(
            $this->serializer->serialize($codes),
            $key,
            [EavCache::CACHE_TAG, Attribute::CACHE_TAG],
            self::CACHE_LIFETIME
        );

        return $this->filterable[$storeId] = $codes;
    }

    /**
     * @param array<string, mixed> $params
     * @return string[] the filter codes the request activates (one per attribute, however many values)
     */
    public function activeFilters(array $params): array
    {
        return array_values(array_intersect(array_map('strval', array_keys($params)), $this->getFilterableCodes()));
    }

    /**
     * @param array<string, mixed> $params
     * @return string[] the parameter names that are neither filters nor system parameters
     */
    public function unknownParams(array $params): array
    {
        $filterable = $this->getFilterableCodes();
        $unknown = [];
        foreach (array_keys($params) as $name) {
            $name = (string) $name;
            if (in_array($name, $filterable, true) || $this->isSystemParam($name)) {
                continue;
            }
            $unknown[] = $name;
        }

        return $unknown;
    }

    /**
     * Drops the unknown parameters from the request (query string and action
     * parameters), so every later reader of the request never sees them.
     *
     * @return string[] the names that were removed
     */
    public function stripUnknown(HttpRequest $request): array
    {
        $unknown = $this->unknownParams($request->getParams());
        if ($unknown === []) {
            return [];
        }
        $query = $request->getQuery();
        foreach ($unknown as $name) {
            $request->setParam($name, null);
            if (isset($query[$name])) {
                unset($query[$name]);
            }
        }

        return $unknown;
    }

    /**
     * Drops every toolbar parameter whose value the toolbar would not act on,
     * from the request parameters and from the query, so the block cache key,
     * the pushed URL and every later reader see the canonical request:
     *
     *   - `product_list_mode`: `grid` or `list`;
     *   - `product_list_dir`: `asc` or `desc`, in any case;
     *   - `product_list_order`: a sort order of the catalog configuration
     *     (`Magento\Catalog\Model\Config::getAttributeUsedForSortByArray()`)
     *     or `relevance`. The guard runs before the layout exists, so an order
     *     that only a plugin on the toolbar block adds is not known here;
     *   - `product_list_limit`: a value of the grid or list "per page" lists
     *     of the store, or `all` while "Allow All Products per Page" is on;
     *   - `append`: `1`;
     *   - `p`: digits, greater than 0.
     *
     * A dropped parameter is removed, never rewritten to a default: core then
     * applies its own.
     *
     * @return string[] the names that were removed
     */
    public function normalizeToolbar(HttpRequest $request): array
    {
        $dropped = [];
        foreach (self::TOOLBAR_PARAMS as $name) {
            $value = $request->getParam($name);
            if ($value !== null && !$this->isToolbarValue($name, $value)) {
                $dropped[] = $name;
            }
        }
        if ($dropped === []) {
            return [];
        }
        $query = $request->getQuery();
        foreach ($dropped as $name) {
            $request->setParam($name, null);
            if (isset($query[$name])) {
                unset($query[$name]);
            }
        }

        return $dropped;
    }

    private function isToolbarValue(string $name, mixed $value): bool
    {
        if (!is_scalar($value)) {
            return false;
        }
        $value = (string) $value;

        return match ($name) {
            self::MODE_PARAM => in_array($value, self::MODES, true),
            self::DIRECTION_PARAM => in_array(strtolower($value), self::DIRECTIONS, true),
            self::ORDER_PARAM => $value === self::ORDER_RELEVANCE
                || array_key_exists($value, $this->catalogConfig->getAttributeUsedForSortByArray()),
            self::LIMIT_PARAM => in_array($value, $this->getPerPageValues(self::MODES), true)
                || ($value === self::LIMIT_ALL && $this->isAllAllowed()),
            self::APPEND_PARAM => $value === '1',
            self::PAGE_PARAM => ctype_digit($value) && (int) $value > 0,
            default => true,
        };
    }

    /**
     * Clamps `p` so that the page stays inside the search engine's result
     * window (`PageSizeProvider::getMaxPageSize()`, 10000 on OpenSearch, its
     * `index.max_result_window`). Past it core's adapter paginates with a
     * point in time and `search_after`, a path that throws once the page is
     * also past the hits (`Undefined array key "sort"`, HTTP 500 in developer
     * mode). The page size is the one the toolbar will use (`getPageSize()`).
     * Call `normalizeToolbar()` first: the size is resolved from the mode and
     * the limit the request still carries.
     *
     * @return int|null the page the request was clamped to, null when it was left alone
     */
    public function clampPage(HttpRequest $request): ?int
    {
        $page = (int) $request->getParam(self::PAGE_PARAM, 0);
        if ($page <= 1) {
            return null;
        }
        $maxPage = max(1, intdiv($this->pageSizeProvider->getMaxPageSize(), max(1, $this->getPageSize($request))));
        if ($page <= $maxPage) {
            return null;
        }
        $request->setParam(self::PAGE_PARAM, (string) $maxPage);
        $query = $request->getQuery();
        if (isset($query[self::PAGE_PARAM])) {
            $query[self::PAGE_PARAM] = (string) $maxPage;
        }

        return $maxPage;
    }

    /**
     * The page size core's toolbar will page by, resolved the way the toolbar
     * does it, without a layout:
     *
     *   - the mode is the request's `product_list_mode` when the store offers
     *     it, otherwise the first mode of `catalog/frontend/list_mode`;
     *   - a requested limit that is in that mode's "per page" list is the
     *     size; any other limit is ignored by the toolbar, which then uses the
     *     mode's default (`grid_per_page` / `list_per_page`, or the first
     *     value of the list when the default is not in it);
     *   - `all` (while allowed) is one page: the whole result window;
     *   - with `catalog/frontend/remember_pagination` on, the toolbar may take
     *     the mode and the limit from the session, which the guard cannot
     *     see: the largest value of both lists is used. A larger size clamps
     *     earlier, never later.
     */
    private function getPageSize(HttpRequest $request): int
    {
        if ($this->scopeConfig->isSetFlag(self::XML_PATH_REMEMBER_PAGINATION, ScopeInterface::SCOPE_STORE)) {
            $sizes = array_map('intval', $this->getPerPageValues(self::MODES));
            $sizes[] = self::DEFAULT_PER_PAGE;

            return max($sizes);
        }

        $mode = $this->getMode($request);
        $values = $this->getPerPageValues([$mode]);
        $requested = $request->getParam(self::LIMIT_PARAM);
        $requested = is_scalar($requested) ? (string) $requested : '';
        if ($requested === self::LIMIT_ALL && $this->isAllAllowed()) {
            return $this->pageSizeProvider->getMaxPageSize();
        }
        if (in_array($requested, $values, true)) {
            return (int) $requested;
        }
        $default = (string) $this->scopeConfig->getValue(
            $mode === 'list' ? self::XML_PATH_LIST_PER_PAGE : self::XML_PATH_GRID_PER_PAGE,
            ScopeInterface::SCOPE_STORE
        );
        if (!in_array($default, $values, true)) {
            $default = (string) ($values[0] ?? '');
        }

        return (int) $default > 0 ? (int) $default : self::DEFAULT_PER_PAGE;
    }

    /**
     * The view mode the toolbar will use for the request (`grid` or `list`).
     */
    private function getMode(HttpRequest $request): string
    {
        $available = array_values(array_intersect(
            explode('-', (string) $this->scopeConfig->getValue(self::XML_PATH_LIST_MODE, ScopeInterface::SCOPE_STORE)),
            self::MODES
        ));
        if ($available === []) {
            $available = [self::MODES[0]];
        }
        $requested = $request->getParam(self::MODE_PARAM);

        return is_string($requested) && in_array($requested, $available, true) ? $requested : $available[0];
    }

    /**
     * The positive "per page" values the store offers for the given modes, as strings.
     *
     * @param string[] $modes
     * @return string[]
     */
    private function getPerPageValues(array $modes): array
    {
        $values = [];
        foreach ($modes as $mode) {
            $path = $mode === 'list' ? self::XML_PATH_LIST_PER_PAGE_VALUES : self::XML_PATH_GRID_PER_PAGE_VALUES;
            foreach (explode(',', (string) $this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE)) as $value) {
                $value = trim($value);
                if (ctype_digit($value) && (int) $value > 0) {
                    $values[] = $value;
                }
            }
        }

        return array_values(array_unique($values));
    }

    private function isAllAllowed(): bool
    {
        return $this->scopeConfig->isSetFlag(self::XML_PATH_LIST_ALLOW_ALL, ScopeInterface::SCOPE_STORE);
    }

    public function getMaxActiveFilters(): int
    {
        $value = $this->scopeConfig->getValue(self::XML_PATH_MAX_ACTIVE_FILTERS, ScopeInterface::SCOPE_STORE);

        return $value === null || $value === '' ? self::DEFAULT_MAX_ACTIVE_FILTERS : max(0, (int) $value);
    }

    /**
     * The robots meta directive of a listing that activates $activeFilters
     * filters: two or more filters are a crawl trap (`NOINDEX,NOFOLLOW`),
     * otherwise the store's default directive. The full page renders it in
     * its head; the grid fragment hands it to the page as an HTMX trigger
     * because the head is outside every swap target.
     */
    public function getRobots(int $activeFilters): string
    {
        if ($activeFilters >= 2) {
            return self::ROBOTS_NOINDEX;
        }
        $default = (string) $this->scopeConfig->getValue(self::XML_PATH_DEFAULT_ROBOTS, ScopeInterface::SCOPE_STORE);

        return $default === '' ? self::DEFAULT_ROBOTS : $default;
    }

    /**
     * A parameter the listing routes always accept: their own (`id`, `q`, the
     * toolbar and store switch parameters) and the marketing parameters of
     * the shared list, the same names the edge removes from the cache key.
     */
    public function isSystemParam(string $name): bool
    {
        return in_array($name, self::SYSTEM_PARAMS, true) || $this->marketingParameters->isMarketing($name);
    }
}
