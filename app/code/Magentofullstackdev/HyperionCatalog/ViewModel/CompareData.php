<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Helper\Product\Compare as CompareHelper;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Psr\Log\LoggerInterface;

class CompareData implements ArgumentInterface
{
    /**
     * @param CompareHelper $compareHelper
     * @param UrlInterface $urlBuilder
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly CompareHelper $compareHelper,
        private readonly UrlInterface $urlBuilder,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Ids of the products currently in the visitor's / customer's compare list.
     *
     * @return int[]
     */
    public function getCompareProductIds(): array
    {
        try {
            $ids = [];
            foreach ($this->compareHelper->getItemCollection() as $item) {
                $ids[] = (int) $item->getId();
            }
            return $ids;
        } catch (\Throwable $e) {
            $this->logger->error('CompareData::getCompareProductIds -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * The compared products as `{id, name, url}` records for the client-side
     * sidebar (`<hyperion-compare-sidebar>`); the helper collection already
     * carries the name and the URL rewrite.
     *
     * @return array<int, array{id: int, name: string, url: string}>
     */
    public function getCompareItems(): array
    {
        try {
            $items = [];
            foreach ($this->compareHelper->getItemCollection() as $product) {
                $items[] = [
                    'id' => (int) $product->getId(),
                    'name' => (string) $product->getName(),
                    'url' => (string) $product->getProductUrl(),
                ];
            }
            return $items;
        } catch (\Throwable $e) {
            $this->logger->error('CompareData::getCompareItems -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return int
     */
    public function getCompareItemCount(): int
    {
        try {
            return (int) $this->compareHelper->getItemCount();
        } catch (\Throwable $e) {
            $this->logger->error('CompareData::getCompareItemCount -- ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * @return string
     */
    public function getCompareUrl(): string
    {
        try {
            return (string) $this->compareHelper->getListUrl();
        } catch (\Throwable $e) {
            $this->logger->error('CompareData::getCompareUrl -- ' . $e->getMessage());
            return '/catalog/product_compare';
        }
    }

    /**
     * POST URL of the core remove controller; the `product` id travels as a
     * request parameter (`Magento\Catalog\Controller\Product\Compare\Remove`
     * reads `getParam('product')`). The previous implementation returned
     * `CompareHelper::getPostDataRemove()`, a JSON blob for Luma's
     * data-post widget, not a URL.
     *
     * @param int $productId
     * @return string
     */
    public function getRemoveCompareUrl(int $productId): string
    {
        try {
            return (string) $this->urlBuilder->getUrl(
                'catalog/product_compare/remove',
                $productId > 0 ? ['product' => $productId] : []
            );
        } catch (\Throwable $e) {
            $this->logger->error('CompareData::getRemoveCompareUrl -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param int $productId
     * @return string
     */
    public function getAddCompareUrl(int $productId): string
    {
        try {
            return (string) $this->compareHelper->getAddUrl();
        } catch (\Throwable $e) {
            $this->logger->error('CompareData::getAddCompareUrl -- ' . $e->getMessage());
            return '/catalog/product_compare/add';
        }
    }
}
