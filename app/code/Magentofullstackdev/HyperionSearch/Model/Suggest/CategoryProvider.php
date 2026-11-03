<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionSearch\Model\Suggest;

use Magento\Catalog\Model\Category;
use Magento\Catalog\Model\ResourceModel\Category\CollectionFactory as CategoryCollectionFactory;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Active categories of the current store root whose name contains the
 * query, each with its path ("Men / Tops / Hoodies & Sweatshirts") built
 * from one extra load of the parent names.
 */
class CategoryProvider
{
    public function __construct(
        private readonly CategoryCollectionFactory $collectionFactory,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return array<int, array{id: int, name: string, path: string, url: string}>
     */
    public function search(string $query, int $limit): array
    {
        $query = trim($query);
        if ($limit < 1 || $query === '') {
            return [];
        }
        try {
            $store = $this->storeManager->getStore();
            $rootId = $store instanceof Store ? (int) $store->getRootCategoryId() : 0;
            if ($rootId < 1) {
                return [];
            }
            $collection = $this->collectionFactory->create();
            $collection->setStoreId((int) $store->getId())
                ->addAttributeToSelect(['name', 'url_key', 'url_path', 'is_active'])
                ->addAttributeToFilter('name', ['like' => '%' . $this->escapeLike($query) . '%'])
                ->addIsActiveFilter()
                ->addPathFilter('^' . Category::TREE_ROOT_ID . '/' . $rootId . '/')
                ->setOrder('level', 'ASC')
                ->setPageSize($limit);
            $categories = [];
            $parentIds = [];
            foreach ($collection as $category) {
                /** @var Category $category */
                $categories[] = $category;
                foreach ($category->getParentIds() as $parentId) {
                    $parentId = (int) $parentId;
                    if ($parentId > $rootId || ($parentId !== $rootId && $parentId !== Category::TREE_ROOT_ID)) {
                        $parentIds[$parentId] = true;
                    }
                }
            }
            if ($categories === []) {
                return [];
            }
            $names = $this->loadNames(array_keys($parentIds), (int) $store->getId());
            $result = [];
            foreach ($categories as $category) {
                $path = [];
                foreach ($category->getParentIds() as $parentId) {
                    $parentId = (int) $parentId;
                    if (isset($names[$parentId])) {
                        $path[] = $names[$parentId];
                    }
                }
                $path[] = (string) $category->getName();
                $result[] = [
                    'id' => (int) $category->getId(),
                    'name' => (string) $category->getName(),
                    'path' => implode(' / ', $path),
                    'url' => (string) $category->getUrl(),
                ];
            }

            return $result;
        } catch (\Throwable $e) {
            $this->logger->error('Hyperion search: category suggestions failed: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @param int[] $ids
     * @return array<int, string>
     */
    private function loadNames(array $ids, int $storeId): array
    {
        if ($ids === []) {
            return [];
        }
        $names = [];
        $collection = $this->collectionFactory->create();
        $collection->setStoreId($storeId)->addAttributeToSelect('name')->addIdFilter($ids);
        foreach ($collection as $category) {
            /** @var Category $category */
            $names[(int) $category->getId()] = (string) $category->getName();
        }

        return $names;
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
