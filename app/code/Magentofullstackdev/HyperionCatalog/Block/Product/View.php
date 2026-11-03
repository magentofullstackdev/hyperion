<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\Block\Product;

use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Block\Product\Context;
use Magento\Catalog\Helper\Product as ProductHelper;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\ProductTypes\ConfigInterface;
use Magento\Framework\App\Http\Context as HttpContext;
use Magento\Framework\Json\EncoderInterface;
use Magento\Framework\Locale\FormatInterface;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\Stdlib\StringUtils;
use Magento\Framework\Url\EncoderInterface as UrlEncoderInterface;
use Magento\Customer\Model\Session as CustomerSession;
use Psr\Log\LoggerInterface;

class View extends \Magento\Catalog\Block\Product\View
{
    /**
     * @param Context $context
     * @param UrlEncoderInterface $urlEncoder
     * @param EncoderInterface $jsonEncoder
     * @param StringUtils $string
     * @param ProductHelper $productHelper
     * @param ConfigInterface $productTypeConfig
     * @param FormatInterface $localeFormat
     * @param CustomerSession $customerSession
     * @param ProductRepositoryInterface $productRepository
     * @param PriceCurrencyInterface $priceCurrency
     * @param LoggerInterface $logger
     * @param HttpContext $httpContext
     * @param array $data
     */
    public function __construct(
        Context $context,
        UrlEncoderInterface $urlEncoder,
        EncoderInterface $jsonEncoder,
        StringUtils $string,
        ProductHelper $productHelper,
        ConfigInterface $productTypeConfig,
        FormatInterface $localeFormat,
        CustomerSession $customerSession,
        ProductRepositoryInterface $productRepository,
        PriceCurrencyInterface $priceCurrency,
        private readonly LoggerInterface $logger,
        private readonly HttpContext $httpContext,
        array $data = []
    ) {
        parent::__construct(
            $context,
            $urlEncoder,
            $jsonEncoder,
            $string,
            $productHelper,
            $productTypeConfig,
            $localeFormat,
            $customerSession,
            $productRepository,
            $priceCurrency,
            $data
        );
    }

    /**
     * @return Product|null
     */
    public function getProduct(): ?Product
    {
        try {
            return parent::getProduct();
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: getProduct failed -- ' . $e->getMessage());
            return null;
        }
    }

    /**
     * @return string
     */
    public function getAddToCartFormKey(): string
    {
        try {
            return (string) $this->getBlockHtml('formkey');
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: getAddToCartFormKey failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * Return the `checkout/cart/add` endpoint URL for the current product.
     *
     * We intentionally do NOT call Magento\Catalog\Block\Product\AbstractProduct::getAddToCartUrl().
     * For product types whose `isPossibleBuyFromList()` returns false (configurable,
     * bundle, grouped...), that helper returns the PDP URL with `?options=cart`
     * instead of the cart-add endpoint -- so an HTMX POST to it re-renders the
     * full PDP into the notification target.
     * The Hyperion PDP already surfaces the swatches inline, so the form must
     * always submit to the real cart-add controller and let the Hyperion
     * AddPlugin shape the HTMX response.
     *
     * @return string
     */
    public function getAddToCartActionUrl(): string
    {
        try {
            $product = $this->getProduct();
            if ($product === null) {
                return '';
            }
            $routeParams = [
                'product' => (int) $product->getId(),
                '_secure' => $this->getRequest()->isSecure(),
            ];
            return (string) $this->getUrl('checkout/cart/add', $routeParams);
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: getAddToCartActionUrl failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @return bool
     */
    public function hasOptions(): bool
    {
        try {
            $product = $this->getProduct();
            if ($product === null) {
                return false;
            }
            return (bool) $product->getTypeInstance()->hasRequiredOptions($product);
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: hasOptions failed -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * @return bool
     */
    public function isConfigurable(): bool
    {
        try {
            $product = $this->getProduct();
            return $product !== null && $product->getTypeId() === 'configurable';
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: isConfigurable failed -- ' . $e->getMessage());
            return false;
        }
    }

    /**
     * @return array<int, array{large: string, medium: string, small: string, label: string}>
     */
    public function getGalleryImageIds(): array
    {
        try {
            $product = $this->getProduct();
            if ($product === null) {
                return [];
            }

            $images = [];
            foreach ($product->getMediaGalleryImages() as $image) {
                $url = (string) $image->getData('url');
                $images[] = [
                    'large' => $url,
                    'medium' => $url,
                    'small' => $url,
                    'label' => (string) $image->getData('label'),
                ];
            }

            return $images;
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: getGalleryImageIds failed -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * @return string
     */
    public function getFragmentTargetId(): string
    {
        return 'hyperion-product-info';
    }

    /**
     * @return string
     */
    public function getAddToCartFragmentUrl(): string
    {
        try {
            return (string) $this->_urlBuilder->getUrl('checkout/cart/add');
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: getAddToCartFragmentUrl failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * True on PageBuilder's "Product - Full Width" page layout, where the
     * description and the PageBuilder attributes span the page. The layout of
     * a product is applied to the page config, not to the layout merge.
     *
     * @return bool
     */
    public function isFullWidthLayout(): bool
    {
        return $this->pageConfig->getPageLayout() === 'product-full-width';
    }

    /**
     * No block cache in configure mode (wish list / cart item edit): the
     * item's buy request preselects the options and the quantity, so the
     * cached HTML of the plain product page would show none of it.
     *
     * @return int|bool|null
     */
    protected function getCacheLifetime()
    {
        try {
            if ($this->getProduct()?->getData('configure_mode')) {
                return null;
            }
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog View: getCacheLifetime failed -- ' . $e->getMessage());
        }

        return parent::getCacheLifetime();
    }


    /**
     * Block cache varies by: parent info + current product id. Without the
     * product id, the Magento block cache pins the first-rendered PDP's
     * HTML and serves it for every subsequent product page.
     *
     * @return array<int|string, mixed>
     */
    public function getCacheKeyInfo(): array
    {
        $productKey = 'product=0';
        try {
            $product = $this->getProduct();
            if ($product !== null) {
                $productKey = 'product=' . (int) $product->getId();
            }
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog View: cache-key product resolution failed -- ' . $e->getMessage()
            );
        }

        return array_merge(
            parent::getCacheKeyInfo(),
            [
                $productKey,
                'layout=' . (string) $this->pageConfig->getPageLayout(),
                // Currency, customer group and login state, as the page cache varies.
                'vary=' . (string) $this->httpContext->getVaryString(),
                'hyperion_pdp_v1',
            ]
        );
    }
}
