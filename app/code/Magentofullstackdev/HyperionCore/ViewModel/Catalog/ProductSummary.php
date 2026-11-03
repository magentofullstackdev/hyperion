<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel\Catalog;

use Magento\Catalog\Model\Product;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * A product as a small JSON-able record for the client side.
 *
 * Shared by the wishlist / compare header fragments (sidebar items), the
 * `data-hyperion-product-meta` attribute of product pages and tiles (the
 * recently viewed / compared history in localStorage) and the Lit
 * components that render product cards from that data. Prices are in the
 * display currency; `scope` (store code + currency) is what the client
 * keys its storage on, so a currency switch never shows stale amounts.
 */
class ProductSummary implements ArgumentInterface
{
    /**
     * @param ImageRenderer $imageRenderer
     * @param PriceCurrencyInterface $priceCurrency
     * @param StoreManagerInterface $storeManager
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ImageRenderer $imageRenderer,
        private readonly PriceCurrencyInterface $priceCurrency,
        private readonly StoreManagerInterface $storeManager,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @param Product $product
     * @param string $imageId catalog image id, e.g. `product_small_image`, `category_page_grid`
     * @return array<string, mixed>
     */
    public function fromProduct(Product $product, string $imageId = 'product_small_image'): array
    {
        $price = $this->getFinalPrice($product);

        return [
            'id' => (int) $product->getId(),
            'sku' => (string) $product->getSku(),
            'name' => (string) $product->getName(),
            'url' => (string) $product->getProductUrl(),
            'image' => $this->getImageUrl($product, $imageId),
            'price' => $price,
            'price_formatted' => $this->priceCurrency->format($price, false),
            'currency' => $this->getCurrencyCode(),
            'scope' => $this->getScope(),
            'saleable' => (bool) $product->isSaleable(),
            'buy_from_list' => $this->canBuyFromList($product),
        ];
    }

    /**
     * Store code + display currency: the storage scope of the client-side product history.
     *
     * @return string
     */
    public function getScope(): string
    {
        try {
            $store = $this->storeManager->getStore();

            return $store->getCode() . '-' . $this->getCurrencyCode();
        } catch (\Throwable $e) {
            $this->logger->error('ProductSummary::getScope -- ' . $e->getMessage());

            return 'default';
        }
    }

    /**
     * @return string
     */
    public function getCurrencyCode(): string
    {
        try {
            $store = $this->storeManager->getStore();

            return $store instanceof Store ? (string) $store->getCurrentCurrencyCode() : '';
        } catch (\Throwable $e) {
            $this->logger->error('ProductSummary::getCurrencyCode -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * Final price in the display currency, tax rules of the price info applied.
     *
     * @param Product $product
     * @return float
     */
    public function getFinalPrice(Product $product): float
    {
        try {
            return round((float) $product->getPriceInfo()->getPrice(FinalPrice::PRICE_CODE)->getAmount()->getValue(), 2);
        } catch (\Throwable $e) {
            $this->logger->error('ProductSummary::getFinalPrice -- ' . $e->getMessage());

            return round((float) $product->getFinalPrice(), 2);
        }
    }

    /**
     * JSON for an HTML attribute or a `<script type="application/json">` block (escape the attribute, not the block).
     *
     * @param array<mixed> $data
     * @return string
     */
    public function toJson(array $data): string
    {
        return (string) json_encode(
            $data,
            JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );
    }

    /**
     * Whether a plain Add to Cart POST (no options) is enough: composite types
     * and products with required options need the product page.
     *
     * @param Product $product
     * @return bool
     */
    private function canBuyFromList(Product $product): bool
    {
        try {
            return !$product->canConfigure() && $product->getTypeInstance()->isPossibleBuyFromList($product);
        } catch (\Throwable $e) {
            $this->logger->error('ProductSummary::canBuyFromList -- ' . $e->getMessage());

            return false;
        }
    }

    /**
     * @param Product $product
     * @param string $imageId
     * @return string
     */
    private function getImageUrl(Product $product, string $imageId): string
    {
        try {
            return $this->imageRenderer->getUrl($product, $imageId);
        } catch (\Throwable $e) {
            $this->logger->error('ProductSummary::getImageUrl -- ' . $e->getMessage());

            return '';
        }
    }
}
