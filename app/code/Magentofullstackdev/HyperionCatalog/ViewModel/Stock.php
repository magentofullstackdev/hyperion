<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\CatalogInventory\Api\Data\StockItemInterface;
use Magento\CatalogInventory\Api\StockRegistryInterface;
use Magento\CatalogInventory\Api\StockStateInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Stock notices and quantity rules of a product page.
 *
 * Mirrors core's Stockqty block ("Only N left" under
 * `cataloginventory/options/stock_threshold_qty`), the quantity increments
 * block ("%1 is available to buy in increments of %2") and the quantity
 * validators core attaches to the qty input (min / max sale qty, increment),
 * which all live in containers the theme does not render. Stock amounts go
 * through the stock state / registry APIs, which MSI plugs into.
 */
class Stock implements ArgumentInterface
{
    public const XML_PATH_STOCK_THRESHOLD_QTY = 'cataloginventory/options/stock_threshold_qty';

    /**
     * @param StockRegistryInterface $stockRegistry
     * @param StockStateInterface $stockState
     * @param ScopeConfigInterface $scopeConfig
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly StockRegistryInterface $stockRegistry,
        private readonly StockStateInterface $stockState,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return float
     */
    public function getThresholdQty(): float
    {
        return (float) $this->scopeConfig->getValue(self::XML_PATH_STOCK_THRESHOLD_QTY, ScopeInterface::SCOPE_STORE);
    }

    /**
     * Units that can still be sold (stock minus the out-of-stock threshold of the item).
     *
     * @param Product $product
     * @return float
     */
    public function getStockQtyLeft(Product $product): float
    {
        try {
            $websiteId = $this->getWebsiteId();
            $qty = (float) $this->stockState->getStockQty((int) $product->getId(), $websiteId);
            $item = $this->getStockItem($product);

            return max(0.0, $qty - ($item ? (float) $item->getMinQty() : 0.0));
        } catch (\Throwable $e) {
            $this->logger->error('Stock::getStockQtyLeft -- ' . $e->getMessage());

            return 0.0;
        }
    }

    /**
     * Whether "Only N left" applies: a threshold is set, the product is a
     * simple type that is in stock and manages stock, and what is left is
     * within the threshold.
     *
     * @param Product $product
     * @return bool
     */
    public function isLowStockVisible(Product $product): bool
    {
        try {
            $threshold = $this->getThresholdQty();
            if ($threshold <= 0 || $product->getTypeInstance()->isComposite($product) || !$product->isSaleable()) {
                return false;
            }
            $item = $this->getStockItem($product);
            if ($item && !$item->getManageStock()) {
                return false;
            }
            $left = $this->getStockQtyLeft($product);

            return $left > 0 && $left <= $threshold;
        } catch (\Throwable $e) {
            $this->logger->error('Stock::isLowStockVisible -- ' . $e->getMessage());

            return false;
        }
    }

    /**
     * The increment the product must be bought in, 0 when increments are off.
     *
     * @param Product $product
     * @return float
     */
    public function getQtyIncrements(Product $product): float
    {
        $item = $this->getStockItem($product);
        if (!$item || !$item->getEnableQtyIncrements()) {
            return 0.0;
        }
        $increment = (float) $item->getQtyIncrements();

        return $increment > 1 ? $increment : 0.0;
    }

    /**
     * @param Product $product
     * @return float
     */
    public function getMinSaleQty(Product $product): float
    {
        $item = $this->getStockItem($product);

        return max(1.0, $item ? (float) $item->getMinSaleQty() : 1.0);
    }

    /**
     * @param Product $product
     * @return float 0 when unlimited
     */
    public function getMaxSaleQty(Product $product): float
    {
        $item = $this->getStockItem($product);

        return $item ? (float) $item->getMaxSaleQty() : 0.0;
    }

    /**
     * `min`, `max`, `step` and `value` for the quantity input: the minimum is
     * raised to the first multiple of the increment, the default value is
     * the minimum.
     *
     * @param Product $product
     * @return array{min: float, max: float, step: float, value: float}
     */
    public function getQtyInputAttributes(Product $product): array
    {
        try {
            $step = $this->getQtyIncrements($product);
            $min = $this->getMinSaleQty($product);
            if ($step > 0) {
                $min = ceil($min / $step) * $step;
            }
            $max = $this->getMaxSaleQty($product);
            if ($max > 0 && $max < $min) {
                $max = $min;
            }

            return ['min' => $min, 'max' => $max, 'step' => $step, 'value' => $min];
        } catch (\Throwable $e) {
            $this->logger->error('Stock::getQtyInputAttributes -- ' . $e->getMessage());

            return ['min' => 1.0, 'max' => 0.0, 'step' => 0.0, 'value' => 1.0];
        }
    }

    /**
     * @param Product $product
     * @return StockItemInterface|null
     */
    private function getStockItem(Product $product): ?StockItemInterface
    {
        try {
            return $this->stockRegistry->getStockItem((int) $product->getId(), $this->getWebsiteId());
        } catch (\Throwable $e) {
            $this->logger->error('Stock::getStockItem -- ' . $e->getMessage());

            return null;
        }
    }

    /**
     * @return int
     */
    private function getWebsiteId(): int
    {
        return (int) $this->storeManager->getStore()->getWebsiteId();
    }
}
