<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item as QuoteItem;
use Magento\Sales\Model\Order;
use Magento\Store\Model\ScopeInterface;
use Magento\Store\Model\Store;
use Magento\Store\Model\StoreManagerInterface;
use Magentofullstackdev\HyperionCore\ViewModel\Catalog\ProductSummary;
use Psr\Log\LoggerInterface;

/**
 * Google Analytics 4 and Google Ads configuration plus the GA4 ecommerce
 * event payloads for the `<hyperion-gtag>` element.
 *
 * Reads the configuration paths of Magento_GoogleGtag (whose own blocks
 * are RequireJS only; the theme removes them by name) without depending
 * on that module: the paths simply read as empty when it is absent.
 * Templates print the payloads as `data-hyperion-gtag-event` /
 * `data-hyperion-gtag-payload` attributes; the element pushes them to the
 * dataLayer and loads gtag.js lazily, after consent when the cookie
 * restriction mode is on.
 */
class GoogleGtag implements ArgumentInterface
{
    public const XML_PATH_GA4_ACTIVE = 'google/gtag/analytics4/active';
    public const XML_PATH_GA4_MEASUREMENT_ID = 'google/gtag/analytics4/measurement_id';
    public const XML_PATH_ADS_ACTIVE = 'google/gtag/adwords/active';
    public const XML_PATH_ADS_CONVERSION_ID = 'google/gtag/adwords/conversion_id';
    public const XML_PATH_ADS_CONVERSION_LABEL = 'google/gtag/adwords/conversion_label';
    public const XML_PATH_COOKIE_RESTRICTION = 'web/cookie/cookie_restriction';

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param StoreManagerInterface $storeManager
     * @param ProductSummary $productSummary
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly StoreManagerInterface $storeManager,
        private readonly ProductSummary $productSummary,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * @return bool
     */
    public function isEnabled(): bool
    {
        return $this->isAnalyticsEnabled() || $this->isAdsEnabled();
    }

    /**
     * @return bool
     */
    public function isAnalyticsEnabled(): bool
    {
        return $this->flag(self::XML_PATH_GA4_ACTIVE) && $this->getMeasurementId() !== '';
    }

    /**
     * @return bool
     */
    public function isAdsEnabled(): bool
    {
        return $this->flag(self::XML_PATH_ADS_ACTIVE) && $this->getAdsConversionId() !== '';
    }

    /**
     * @return string
     */
    public function getMeasurementId(): string
    {
        return $this->value(self::XML_PATH_GA4_MEASUREMENT_ID);
    }

    /**
     * @return string
     */
    public function getAdsConversionId(): string
    {
        return $this->value(self::XML_PATH_ADS_CONVERSION_ID);
    }

    /**
     * @return string
     */
    public function getAdsConversionLabel(): string
    {
        return $this->value(self::XML_PATH_ADS_CONVERSION_LABEL);
    }

    /**
     * @return bool
     */
    public function isCookieRestrictionEnabled(): bool
    {
        return $this->flag(self::XML_PATH_COOKIE_RESTRICTION);
    }

    /**
     * @return int
     */
    public function getWebsiteId(): int
    {
        try {
            return (int) $this->storeManager->getWebsite()->getId();
        } catch (\Throwable $e) {
            $this->logger->error('GoogleGtag::getWebsiteId -- ' . $e->getMessage());

            return 0;
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
            $this->logger->error('GoogleGtag::getCurrencyCode -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * `view_item` for a product page.
     *
     * @param Product $product
     * @return array<string, mixed>
     */
    public function viewItem(Product $product): array
    {
        $item = $this->productItem($product);

        return ['currency' => $this->getCurrencyCode(), 'value' => $item['price'], 'items' => [$item]];
    }

    /**
     * `view_item_list` for a listing (category, search, widget).
     *
     * @param iterable<Product> $products
     * @param string $listId
     * @param string $listName
     * @return array<string, mixed>
     */
    public function viewItemList(iterable $products, string $listId, string $listName): array
    {
        $items = [];
        $index = 0;
        foreach ($products as $product) {
            if (!$product instanceof Product) {
                continue;
            }
            $items[] = $this->productItem($product) + ['index' => $index++];
        }

        return ['item_list_id' => $listId, 'item_list_name' => $listName, 'items' => $items];
    }

    /**
     * `add_to_cart` for the quote item an Add to Cart request created or increased.
     *
     * @param QuoteItem $item
     * @param float $qty the quantity of this request, not the line total
     * @return array<string, mixed>
     */
    public function addToCart(QuoteItem $item, float $qty): array
    {
        $line = $this->quoteItem($item, $qty);

        return ['currency' => $this->getCurrencyCode(), 'value' => round($line['price'] * $qty, 2), 'items' => [$line]];
    }

    /**
     * `begin_checkout` for the quote entering the checkout.
     *
     * @param Quote $quote
     * @return array<string, mixed>
     */
    public function beginCheckout(Quote $quote): array
    {
        $items = [];
        foreach ($quote->getAllVisibleItems() as $item) {
            $items[] = $this->quoteItem($item, (float) $item->getQty());
        }
        $payload = [
            'currency' => (string) $quote->getQuoteCurrencyCode(),
            'value' => round((float) $quote->getGrandTotal(), 2),
            'items' => $items,
        ];
        if ((string) $quote->getCouponCode() !== '') {
            $payload['coupon'] = (string) $quote->getCouponCode();
        }

        return $payload;
    }

    /**
     * `purchase` for the order of the success page (same figures as core's `getOrdersTrackingData()`).
     *
     * @param Order $order
     * @return array<string, mixed>
     */
    public function purchase(Order $order): array
    {
        $items = [];
        foreach ($order->getAllVisibleItems() as $item) {
            $items[] = [
                'item_id' => (string) $item->getSku(),
                'item_name' => (string) $item->getName(),
                'price' => round((float) $item->getPrice(), 2),
                'quantity' => (int) $item->getQtyOrdered(),
            ];
        }
        $payload = [
            'transaction_id' => (string) $order->getIncrementId(),
            'value' => round((float) $order->getGrandTotal(), 2),
            'tax' => round((float) $order->getTaxAmount(), 2),
            'shipping' => round((float) $order->getShippingAmount(), 2),
            'currency' => (string) $order->getOrderCurrencyCode(),
            'items' => $items,
        ];
        if ((string) $order->getCouponCode() !== '') {
            $payload['coupon'] = (string) $order->getCouponCode();
        }

        return $payload;
    }

    /**
     * @param array<string, mixed> $payload
     * @return string
     */
    public function toJson(array $payload): string
    {
        return $this->productSummary->toJson($payload);
    }

    /**
     * @param Product $product
     * @param float $quantity
     * @return array<string, mixed>
     */
    private function productItem(Product $product, float $quantity = 1): array
    {
        return [
            'item_id' => (string) $product->getSku(),
            'item_name' => (string) $product->getName(),
            'price' => $this->productSummary->getFinalPrice($product),
            'quantity' => $quantity,
        ];
    }

    /**
     * @param QuoteItem $item
     * @param float $qty
     * @return array<string, mixed>
     */
    private function quoteItem(QuoteItem $item, float $qty): array
    {
        return [
            'item_id' => (string) $item->getSku(),
            'item_name' => (string) $item->getName(),
            'price' => round((float) $item->getPrice(), 2),
            'quantity' => $qty,
        ];
    }

    /**
     * @param string $path
     * @return bool
     */
    private function flag(string $path): bool
    {
        return $this->scopeConfig->isSetFlag($path, ScopeInterface::SCOPE_STORE);
    }

    /**
     * @param string $path
     * @return string
     */
    private function value(string $path): string
    {
        return trim((string) $this->scopeConfig->getValue($path, ScopeInterface::SCOPE_STORE));
    }
}
