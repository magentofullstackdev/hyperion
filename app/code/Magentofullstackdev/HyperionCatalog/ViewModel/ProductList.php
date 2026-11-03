<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Helper\Product\Compare as CompareHelper;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Checkout\Helper\Cart as CartHelper;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Data\Helper\PostHelper;
use Magento\Framework\Escaper;
use Magento\Framework\Pricing\Render as PriceRender;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;
use Magento\Swatches\Model\SwatchAttributesProvider;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionCore\Model\Purchase\Availability;
use Magento\Wishlist\Helper\Data as WishlistHelper;
use Psr\Log\LoggerInterface;

class ProductList implements ArgumentInterface
{
    private const XML_PATH_ADD_TO_CART_FROM_LISTING = 'hyperion/catalog/add_to_cart_from_listing';

    /**
     * Set once a price failed to render in this request (the tile then
     * carries the `--` fallback). The list block reads it to keep that
     * degraded HTML out of the block cache; see `Block\Product\ListProduct::_saveCache()`.
     */
    private bool $priceRenderFailed = false;

    public function __construct(
        private readonly ImageHelper $imageHelper,
        private readonly PriceRender $priceRender,
        private readonly CartHelper $cartHelper,
        private readonly PostHelper $postHelper,
        private readonly UrlInterface $urlBuilder,
        private readonly Escaper $escaper,
        private readonly LoggerInterface $logger,
        private readonly SwatchConfig $swatchConfig,
        private readonly CompareHelper $compareHelper,
        private readonly WishlistHelper $wishlistHelper,
        private readonly SwatchAttributesProvider $swatchAttributesProvider,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly Availability $availability,
        private readonly DegradedResponse $degradedResponse
    ) {
    }

    /**
     * Whether product tiles (category, search, widgets) carry an Add to Cart
     * button: the "Add to Cart from Listing Page" setting and the purchase
     * restrictions (catalog mode) both have to allow it. The product page
     * only follows the restrictions.
     *
     * @return bool
     */
    public function canAddToCartFromListing(): bool
    {
        try {
            return $this->availability->canPurchase()
                && $this->scopeConfig->isSetFlag(self::XML_PATH_ADD_TO_CART_FROM_LISTING, ScopeInterface::SCOPE_STORE);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: listing add-to-cart check failed -- ' . $e->getMessage()
            );
            return true;
        }
    }

    /**
     * @param Product $product
     * @param string $imageId
     * @return string
     */
    public function getProductImageUrl(Product $product, string $imageId = 'category_page_grid'): string
    {
        try {
            return (string) $this->imageHelper->init($product, $imageId)->getUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductList: image URL failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getProductName(Product $product): string
    {
        try {
            return $this->escaper->escapeHtml((string) $product->getName());
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductList: product name failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getProductUrl(Product $product): string
    {
        try {
            return (string) $product->getProductUrl();
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductList: product URL failed -- ' . $e->getMessage());
            return '#';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getPriceHtml(Product $product): string
    {
        try {
            return $this->priceRender->render(
                FinalPrice::PRICE_CODE,
                $product,
                [
                    'display_minimal_price' => true,
                    'use_link_for_as_low_as' => true,
                    'zone' => PriceRender::ZONE_ITEM_LIST,
                ]
            );
        } catch (\Throwable $e) {
            $this->priceRenderFailed = true;
            $this->logger->error('Magentofullstackdev\Catalog ProductList: price render failed -- ' . $e->getMessage());
            $this->degradedResponse->mark();
            return '<span class="price">--</span>';
        }
    }

    /**
     * Whether `getPriceHtml()` returned the `--` fallback at least once in
     * this request.
     *
     * @return bool
     */
    public function hasPriceRenderFailed(): bool
    {
        return $this->priceRenderFailed;
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getAddToCartUrl(Product $product): string
    {
        try {
            return (string) $this->cartHelper->getAddUrl($product);
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductList: add-to-cart URL failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getAddToCartPostData(Product $product): string
    {
        try {
            return (string) $this->postHelper->getPostData(
                $this->getAddToCartUrl($product),
                ['product' => $product->getId()]
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: add-to-cart POST data failed -- ' . $e->getMessage()
            );
            return '';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getHtmxAttributes(Product $product): string
    {
        try {
            $url = $this->escaper->escapeHtmlAttr($this->getAddToCartUrl($product));
            return implode(' ', [
                'hx-post="' . $url . '"',
                'hx-target="#hyperion-notification"',
                'hx-swap="outerHTML"',
                'hx-include="[name=form_key]"',
            ]);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: HTMX attributes build failed -- ' . $e->getMessage()
            );
            return '';
        }
    }

    /**
     * @param Product $product
     * @return bool
     */
    public function isSaleable(Product $product): bool
    {
        try {
            return (bool) $product->isSaleable();
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductList: isSaleable failed -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Returns true for configurable products that expose swatch attributes.
     *
     * @param Product $product
     * @return bool
     */
    public function isConfigurableWithSwatches(Product $product): bool
    {
        try {
            return $this->swatchConfig->isConfigurableWithSwatches($product);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: swatch check failed -- ' . $e->getMessage()
            );
            return false;
        }
    }

    /**
     * Pre-escaped swatch config JSON for the `<hyperion-swatches config="...">` attribute.
     *
     * @param Product $product
     * @return string
     */
    /**
     * Server side skeleton rows of the tile's swatches (SwatchConfig::getSkeletonRows, compact).
     *
     * @return array<int, array{label: string, options: array<int, array{text: string, visual: bool}>}>
     */
    public function getSwatchSkeletonRows(Product $product): array
    {
        return $this->swatchConfig->getSkeletonRows($product, true);
    }

    public function getSwatchConfigAttribute(Product $product): string
    {
        try {
            return $this->swatchConfig->getEncodedConfigAttribute($product, true);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: swatch config failed -- ' . $e->getMessage()
            );
            return '{}';
        }
    }

    /**
     * Super-attribute ids so the Add-to-Cart form can pre-declare the hidden
     * inputs the swatches component will fill in as the shopper picks options.
     *
     * @param Product $product
     * @return int[]
     */
    public function getSuperAttributeIds(Product $product): array
    {
        try {
            if ($product->getTypeId() !== 'configurable') {
                return [];
            }
            return array_map(
                static fn ($a) => (int) $a->getAttributeId(),
                $this->swatchAttributesProvider->provide($product)
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: super attribute ids failed -- ' . $e->getMessage()
            );
            return [];
        }
    }

    /**
     * Native Magento wishlist-add endpoint. Magentofullstackdev\HyperionCore\Plugin\Wishlist
     * returns an HTMX notification fragment when HX-Request is present and
     * falls back to the standard 302 redirect otherwise.
     *
     * @return string
     */
    public function getAddToWishlistUrl(): string
    {
        try {
            return (string) $this->urlBuilder->getUrl('wishlist/index/add');
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: wishlist URL failed -- ' . $e->getMessage()
            );
            return '/wishlist/index/add';
        }
    }

    /**
     * Native Magento compare-add endpoint. Magentofullstackdev\HyperionCore\Plugin\Catalog
     * Compare\AddPlugin returns an HTMX fragment when HX-Request is present.
     *
     * @return string
     */
    public function getAddToCompareUrl(): string
    {
        try {
            return (string) $this->compareHelper->getAddUrl();
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: compare URL failed -- ' . $e->getMessage()
            );
            return '/catalog/product_compare/add';
        }
    }

    /**
     * Returns true when the wishlist feature is globally enabled for the
     * current store. Mirrors Magento_Wishlist\Helper\Data::isAllow().
     *
     * @return bool
     */
    public function isWishlistEnabled(): bool
    {
        try {
            return (bool) $this->wishlistHelper->isAllow();
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: wishlist enable check failed -- ' . $e->getMessage()
            );
            return false;
        }
    }

    /**
     * Returns true when the compare feature is enabled for the current store.
     *
     * @return bool
     */
    public function isCompareEnabled(): bool
    {
        try {
            return (bool) $this->compareHelper->getAllowUsedFlat();
        } catch (\Throwable $e) {
            // getAllowUsedFlat is a flat-table optimization toggle, not a
            // feature switch -- fall through and assume compare is available
            // since Magento ships it enabled by default.
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductList: compare enable check failed -- ' . $e->getMessage()
            );
            return true;
        }
    }
}
