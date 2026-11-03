<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Model;

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

/**
 * Knows which query parameters a listing request may carry: the filterable
 * attributes of the store (layered navigation in categories and in search),
 * the built-in `cat` and `price` filters, and the toolbar / tracking
 * parameters. Everything else (`?filtro1=x&filtro2=y`) is noise that would
 * only multiply cache keys and pollute URL building, so it is dropped from
 * the request before the layer or the search engine see it. The allowlist is
 * cached per store with the EAV tags: the check costs no query.
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
    /** Core's default robots directive of a frontend page (Magento\Framework\View\Page\Config::getRobots()). */
    public const XML_PATH_DEFAULT_ROBOTS = 'design/search_engine_robots/default_robots';
    public const ROBOTS_NOINDEX = 'NOINDEX,NOFOLLOW';
    private const DEFAULT_ROBOTS = 'INDEX,FOLLOW';
    private const PAGE_PARAM = 'p';
    private const LIMIT_PARAM = 'product_list_limit';
    private const DEFAULT_PER_PAGE = 12;
    private const CACHE_KEY = 'hyperion_filter_guard_';
    private const CACHE_LIFETIME = 3600;
    private const BUILT_IN_FILTERS = ['cat', 'price'];
    private const SYSTEM_PARAMS = [
        'id', 'p', 'q', 'append', 'product_list_order', 'product_list_dir', 'product_list_limit', 'product_list_mode',
        'gclid', 'fbclid', 'msclkid', 'dclid', '___store', '___from_store', 'form_key',
    ];
    private const SYSTEM_PARAM_PREFIXES = ['utm_', 'mc_'];

    /** @var array<int, string[]> */
    private array $filterable = [];

    public function __construct(
        private readonly AttributeCollectionFactory $attributeCollectionFactory,
        private readonly CacheInterface $cache,
        private readonly SerializerInterface $serializer,
        private readonly StoreManagerInterface $storeManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly PageSizeProvider $pageSizeProvider
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
     * Clamps `p` so that the page stays inside the search engine's result
     * window (`PageSizeProvider::getMaxPageSize()`, 10000 on OpenSearch, its
     * `index.max_result_window`). Past it core's adapter paginates with a
     * point in time and `search_after`, a path that throws once the page is
     * also past the hits (`Undefined array key "sort"`, HTTP 500 in developer
     * mode). The page size is the requested limit, or the larger of the
     * configured grid and list sizes when the request names none: a larger
     * size clamps earlier, never later.
     *
     * @return int|null the page the request was clamped to, null when it was left alone
     */
    public function clampPage(HttpRequest $request): ?int
    {
        $page = (int) $request->getParam(self::PAGE_PARAM, 0);
        if ($page <= 1) {
            return null;
        }
        $maxPage = max(1, intdiv($this->pageSizeProvider->getMaxPageSize(), $this->getPageSize($request)));
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

    private function getPageSize(HttpRequest $request): int
    {
        $requested = $request->getParam(self::LIMIT_PARAM);
        if (is_numeric($requested) && (int) $requested > 0) {
            return (int) $requested;
        }
        $sizes = [self::DEFAULT_PER_PAGE];
        foreach ([self::XML_PATH_GRID_PER_PAGE, self::XML_PATH_LIST_PER_PAGE] as $path) {
            $size = (int) $this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE);
            if ($size > 0) {
                $sizes[] = $size;
            }
        }

        return max($sizes);
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

    public function isSystemParam(string $name): bool
    {
        if (in_array($name, self::SYSTEM_PARAMS, true)) {
            return true;
        }
        foreach (self::SYSTEM_PARAM_PREFIXES as $prefix) {
            if (str_starts_with($name, $prefix)) {
                return true;
            }
        }

        return false;
    }
}
