<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionMegaMenu\Model\Menu;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Attribute\Source\Status;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory as CategoryCollectionFactory;
use Magento\Catalog\Model\ResourceModel\Product\CollectionFactory as ProductCollectionFactory;
use Magento\Cms\Helper\Page as PageHelper;
use Magento\Cms\Model\Block;
use Magento\Cms\Model\Page;
use Magento\Cms\Model\ResourceModel\Block\CollectionFactory as BlockCollectionFactory;
use Magento\Cms\Model\ResourceModel\Page\CollectionFactory as PageCollectionFactory;
use Magento\Cms\Model\Template\Filter as CmsFilter;
use Magento\Cms\Model\Template\FilterProvider;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\UrlInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionMegaMenu\Model\Item;
use Psr\Log\LoggerInterface;

/**
 * Resolves the targets of a whole tree in batch: one category collection
 * (plus one for the live subcategories of items with a children depth),
 * one product collection by SKU, one CMS page collection, one CMS block
 * collection rendered through the block filter. Every collection carries
 * the store's URL rewrites, so no model is loaded one by one. A failure of
 * one batch is logged and its items disappear from the menu.
 */
class TargetResolver
{
    public function __construct(
        private readonly CategoryCollectionFactory $categoryCollectionFactory,
        private readonly ProductCollectionFactory $productCollectionFactory,
        private readonly PageCollectionFactory $pageCollectionFactory,
        private readonly BlockCollectionFactory $blockCollectionFactory,
        private readonly FilterProvider $filterProvider,
        private readonly UrlInterface $urlBuilder,
        private readonly StoreManagerInterface $storeManager,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param array<int, array<string, mixed>> $rows the loader rows
     */
    public function resolve(array $rows, int $storeId): Targets
    {
        $categoryIds = [];
        $liveRoots = [];
        $skus = [];
        $pageKeys = [];
        $blockIds = [];
        foreach ($rows as $row) {
            $value = trim((string) ($row['item_target_value'] ?? ''));
            if ($value === '') {
                continue;
            }
            switch ((string) $row['item_type']) {
                case Item::TYPE_CATEGORY:
                    $categoryIds[(int) $value] = (int) $value;
                    if ((int) ($row['children_depth'] ?? 0) > 0) {
                        $liveRoots[(int) $value] = max($liveRoots[(int) $value] ?? 0, (int) $row['children_depth']);
                    }
                    break;
                case Item::TYPE_PRODUCT:
                    $skus[$value] = $value;
                    break;
                case Item::TYPE_CMS_PAGE:
                    $pageKeys[$value] = $value;
                    break;
                case Item::TYPE_CMS_BLOCK:
                    $blockIds[$value] = $value;
                    break;
                default:
                    break;
            }
        }
        $identities = [];
        $categories = $this->resolveCategories(array_values($categoryIds), $liveRoots, $storeId, $identities);
        $products = $this->resolveProducts(array_values($skus), $storeId, $identities);
        $pages = $this->resolvePages(array_values($pageKeys), $storeId, $identities);
        $blocks = $this->resolveBlocks(array_values($blockIds), $storeId, $identities);

        return new Targets($categories, $products, $pages, $blocks, array_values(array_unique($identities)));
    }

    /**
     * @param int[] $ids
     * @param array<int, int> $liveRoots category id => depth of live children
     * @param string[] $identities
     * @return array<int, array{id: int, name: string, url: string, level: int, parent_id: int, children: int[]}>
     */
    private function resolveCategories(array $ids, array $liveRoots, int $storeId, array &$identities): array
    {
        if ($ids === []) {
            return [];
        }
        try {
            $collection = $this->categoryCollectionFactory->create();
            $collection->setStoreId($storeId)
                ->addAttributeToSelect(['name', 'url_key', 'url_path'])
                ->addIsActiveFilter()
                ->addIdFilter($ids)
                ->addUrlRewriteToResult();
            $found = [];
            $paths = [];
            foreach ($collection->getItems() as $category) {
                /** @var Category $category */
                $id = (int) $category->getId();
                $found[$id] = $this->categoryRecord($category);
                $identities[] = Category::CACHE_TAG . '_' . $id;
                if (isset($liveRoots[$id])) {
                    $paths[$id] = ['path' => (string) $category->getPath(), 'level' => (int) $category->getLevel(), 'depth' => $liveRoots[$id]];
                }
            }
            if ($paths !== []) {
                $this->addLiveChildren($found, $paths, $storeId, $identities);
            }

            return $found;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: categories could not be resolved: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * The live subcategories (active, shown in the menu, limited to the depth) of the category items that ask for them.
     *
     * @param array<int, array<string, mixed>> $found
     * @param array<int, array{path: string, level: int, depth: int}> $paths
     * @param string[] $identities
     */
    private function addLiveChildren(array &$found, array $paths, int $storeId, array &$identities): void
    {
        $collection = $this->categoryCollectionFactory->create();
        $collection->setStoreId($storeId)
            ->addAttributeToSelect(['name', 'url_key', 'url_path', 'include_in_menu'])
            ->addIsActiveFilter()
            ->addPathsFilter(array_map(static fn (array $p): string => $p['path'] . '/', $paths))
            ->addAttributeToFilter('include_in_menu', ['eq' => 1])
            ->addAttributeToSort('level', 'ASC')
            ->addAttributeToSort('position', 'ASC')
            ->addUrlRewriteToResult();
        foreach ($collection->getItems() as $category) {
            /** @var Category $category */
            $id = (int) $category->getId();
            $pathIds = array_map('intval', explode('/', (string) $category->getPath()));
            $root = null;
            foreach ($paths as $rootId => $info) {
                if (in_array($rootId, $pathIds, true) && (int) $category->getLevel() <= $info['level'] + $info['depth']) {
                    $root = $rootId;
                    break;
                }
            }
            if ($root === null) {
                continue;
            }
            if (!isset($found[$id])) {
                $found[$id] = $this->categoryRecord($category);
                $identities[] = Category::CACHE_TAG . '_' . $id;
            }
            $parentId = (int) $category->getParentId();
            if (isset($found[$parentId]) && !in_array($id, $found[$parentId]['children'], true)) {
                $found[$parentId]['children'][] = $id;
            }
        }
    }

    /**
     * @return array{id: int, name: string, url: string, level: int, parent_id: int, children: int[]}
     */
    private function categoryRecord(Category $category): array
    {
        return [
            'id' => (int) $category->getId(),
            'name' => (string) $category->getName(),
            'url' => (string) $category->getUrl(),
            'level' => (int) $category->getLevel(),
            'parent_id' => (int) $category->getParentId(),
            'children' => [],
        ];
    }

    /**
     * @param string[] $skus
     * @param string[] $identities
     * @return array<string, string>
     */
    private function resolveProducts(array $skus, int $storeId, array &$identities): array
    {
        if ($skus === []) {
            return [];
        }
        try {
            $collection = $this->productCollectionFactory->create();
            $collection->setStoreId($storeId)
                ->addAttributeToSelect(['name', 'url_key'])
                ->addAttributeToFilter('sku', ['in' => $skus])
                ->addAttributeToFilter('status', ['eq' => Status::STATUS_ENABLED])
                ->setVisibility([Visibility::VISIBILITY_IN_CATALOG, Visibility::VISIBILITY_IN_SEARCH, Visibility::VISIBILITY_BOTH])
                ->addStoreFilter($storeId)
                ->addUrlRewrite();
            $urls = [];
            foreach ($collection->getItems() as $product) {
                /** @var Product $product */
                $urls[(string) $product->getSku()] = (string) $product->getProductUrl();
                $identities[] = Product::CACHE_TAG . '_' . (int) $product->getId();
            }

            return $urls;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: products could not be resolved: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @param string[] $keys identifiers or numeric ids
     * @param string[] $identities
     * @return array<string, string>
     */
    private function resolvePages(array $keys, int $storeId, array &$identities): array
    {
        if ($keys === []) {
            return [];
        }
        try {
            $ids = array_values(array_filter($keys, 'is_numeric'));
            $identifiers = array_values(array_filter($keys, static fn (string $k): bool => !is_numeric($k)));
            $collection = $this->pageCollectionFactory->create();
            $collection->addStoreFilter($storeId)->addFieldToFilter('is_active', 1);
            $conditions = [];
            $fields = [];
            if ($ids !== []) {
                $conditions[] = ['in' => array_map('intval', $ids)];
                $fields[] = 'page_id';
            }
            if ($identifiers !== []) {
                $conditions[] = ['in' => $identifiers];
                $fields[] = 'identifier';
            }
            $collection->addFieldToFilter($fields, $conditions);
            $homeIdentifier = (string) $this->scopeConfig->getValue(PageHelper::XML_PATH_HOME_PAGE, ScopeInterface::SCOPE_STORE, $storeId);
            $urls = [];
            foreach ($collection->getItems() as $page) {
                /** @var Page $page */
                $identifier = (string) $page->getIdentifier();
                $url = $identifier === $homeIdentifier
                    ? $this->baseUrl($storeId)
                    : $this->urlBuilder->getUrl(null, ['_direct' => $identifier]);
                $urls[$identifier] = $url;
                $urls[(string) $page->getId()] = $url;
                $identities[] = Page::CACHE_TAG . '_' . (int) $page->getId();
            }

            return $urls;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: CMS pages could not be resolved: ' . $e->getMessage());
            return [];
        }
    }

    private function baseUrl(int $storeId): string
    {
        $store = $this->storeManager->getStore($storeId);

        return $store instanceof Store ? (string) $store->getBaseUrl() : '';
    }

    /**
     * @param string[] $identifiers
     * @param string[] $identities
     * @return array<string, string> rendered HTML by identifier
     */
    private function resolveBlocks(array $identifiers, int $storeId, array &$identities): array
    {
        if ($identifiers === []) {
            return [];
        }
        try {
            $collection = $this->blockCollectionFactory->create();
            $collection->addStoreFilter($storeId)
                ->addFieldToFilter('is_active', 1)
                ->addFieldToFilter('identifier', ['in' => $identifiers]);
            $filter = $this->filterProvider->getBlockFilter();
            if ($filter instanceof CmsFilter) {
                $filter->setStoreId($storeId);
            }
            $html = [];
            foreach ($collection->getItems() as $block) {
                /** @var Block $block */
                $html[(string) $block->getIdentifier()] = (string) $filter->filter((string) $block->getContent());
                $identities[] = Block::CACHE_TAG . '_' . (int) $block->getId();
            }

            return $html;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion mega menu: CMS blocks could not be rendered: ' . $e->getMessage());
            return [];
        }
    }
}
