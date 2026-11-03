<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Helper\Output as OutputHelper;
use Magento\Catalog\Model\Product;
use Magento\Catalog\Model\Product\Image\UrlBuilder as ImageUrlBuilder;
use Magento\Catalog\Model\View\Asset\PlaceholderFactory;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\Framework\Data\Helper\PostHelper;
use Magento\Framework\Escaper;
use Magento\Framework\Pricing\Render as PriceRender;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Magentofullstackdev\HyperionImage\ViewModel\ImageConfig;
use Psr\Log\LoggerInterface;

class ProductView implements ArgumentInterface
{
    /**
     * Image roles the PDP gallery consumes. Each role is defined in
     * `etc/view.xml` with explicit width/height -- Magento writes
     * cache-resized files at those dimensions, which is what the PDP
     * should serve so a 5 MB original upload doesn't tank LCP.
     *
     *   small  -> tile thumbnails under the main stage (~=150 px)
     *   medium -> main-stage display image (~=700 px)
     *   large  -> fullscreen lightbox / hover-zoom backdrop (~=800 px+)
     */
    private const IMAGE_ROLE_THUMB  = 'product_page_image_small';
    private const IMAGE_ROLE_MEDIUM = 'product_page_image_medium';
    private const IMAGE_ROLE_LARGE  = 'product_page_image_large';

    /**
     * Set once a price failed to render in this request (the page then
     * carries the `--` fallback). The PDP block reads it to keep that
     * degraded HTML out of the block cache; see `Block\Product\View::_saveCache()`.
     */
    private bool $priceRenderFailed = false;

    public function __construct(
        private readonly PriceRender $priceRender,
        private readonly Escaper $escaper,
        private readonly UrlInterface $urlBuilder,
        private readonly PostHelper $postHelper,
        private readonly LoggerInterface $logger,
        private readonly ImageUrlBuilder $imageUrlBuilder,
        private readonly ImageConfig $imageConfig,
        private readonly OutputHelper $outputHelper,
        private readonly DegradedResponse $degradedResponse,
        private readonly PlaceholderFactory $placeholderFactory
    ) {
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getPriceHtml(Product $product): string
    {
        try {
            return (string) $this->priceRender->render(
                FinalPrice::PRICE_CODE,
                $product,
                [
                    'display_minimal_price' => true,
                    'zone' => PriceRender::ZONE_ITEM_VIEW,
                ]
            );
        } catch (\Throwable $e) {
            $this->priceRenderFailed = true;
            $this->logger->error('Magentofullstackdev\Catalog ProductView: getPriceHtml failed -- ' . $e->getMessage());
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
     * Build the PDP gallery payload. Each entry carries three role
     * URLs (thumb / img / full) resolved through Magento's role-aware
     * `UrlBuilder`, plus their WebP and AVIF companion URLs whenever
     * the companion file actually exists on disk.
     *
     * Why ship the companion URLs in the gallery JSON?
     *
     * The static `<picture>` we emit in `view.phtml` covers the LCP
     * fallback image only. The moment `<hyperion-gallery>` upgrades,
     * the Lit component takes over the main stage and renders its
     * own `<img>` tags inside Shadow DOM -- those wouldn't get the
     * WebP source unless we hand the companion URLs through. Same
     * goes for the PhotoSwipe lightbox, which loads images via
     * JavaScript and never sees the page's `<picture>` markup.
     *
     * Companions are gated on `file_exists()` (memoised inside
     * ImageConfig) because browsers don't fall through `<picture>`
     * to the `<img>` baseline on a 404 -- emitting a `<source>` to
     * a missing file produces a broken image rather than a JPG
     * fallback. Empty string => JS treats the format as unavailable
     * and renders only the `<img>` baseline for that slide.
     *
     * Disabled gallery entries are filtered out. A product without a single
     * usable image gets one entry built on the catalog placeholder image
     * (`catalog/placeholder/image_placeholder` or the theme's default), so the
     * page never prints `<img src="">` and the gallery shows the placeholder
     * instead of an empty stage.
     *
     * @return array<int, array{
     *     thumb: string,
     *     img: string,
     *     full: string,
     *     thumbWebp: string,
     *     imgWebp: string,
     *     fullWebp: string,
     *     thumbAvif: string,
     *     imgAvif: string,
     *     fullAvif: string,
     *     label: string,
     *     position: int,
     *     isMain: bool,
     *     type: string,
     *     videoUrl: string,
     *     videoTitle: string
     * }>
     */
    public function getGalleryImages(Product $product): array
    {
        try {
            $result = [];
            $mainFile = (string) $product->getImage();
            foreach ($product->getMediaGalleryImages() as $image) {
                if ((int) $image->getData('disabled') === 1) {
                    continue;
                }
                $file = (string) $image->getData('file');
                if ($file === '') {
                    continue;
                }
                // Magento_ProductVideo entries: the file is the preview frame, the video plays in the stage.
                $isVideo = (string) $image->getData('media_type') === 'external-video'
                    && (string) $image->getData('video_url') !== '';

                $thumbUrl = (string) $this->imageUrlBuilder->getUrl($file, self::IMAGE_ROLE_THUMB);
                $imgUrl = (string) $this->imageUrlBuilder->getUrl($file, self::IMAGE_ROLE_MEDIUM);
                $fullUrl = (string) $this->imageUrlBuilder->getUrl($file, self::IMAGE_ROLE_LARGE);

                $result[] = [
                    'thumb' => $thumbUrl,
                    'img' => $imgUrl,
                    'full' => $fullUrl,
                    'thumbWebp' => $this->imageConfig->hasWebpCompanion($thumbUrl)
                        ? $this->imageConfig->getWebpUrl($thumbUrl)
                        : '',
                    'imgWebp' => $this->imageConfig->hasWebpCompanion($imgUrl)
                        ? $this->imageConfig->getWebpUrl($imgUrl)
                        : '',
                    'fullWebp' => $this->imageConfig->hasWebpCompanion($fullUrl)
                        ? $this->imageConfig->getWebpUrl($fullUrl)
                        : '',
                    'thumbAvif' => $this->imageConfig->hasAvifCompanion($thumbUrl)
                        ? $this->imageConfig->getAvifUrl($thumbUrl)
                        : '',
                    'imgAvif' => $this->imageConfig->hasAvifCompanion($imgUrl)
                        ? $this->imageConfig->getAvifUrl($imgUrl)
                        : '',
                    'fullAvif' => $this->imageConfig->hasAvifCompanion($fullUrl)
                        ? $this->imageConfig->getAvifUrl($fullUrl)
                        : '',
                    'label' => (string) $image->getData('label'),
                    'position' => (int) $image->getData('position'),
                    'isMain' => $file === $mainFile,
                    'type' => $isVideo ? 'video' : 'image',
                    'videoUrl' => $isVideo ? (string) $image->getData('video_url') : '',
                    'videoTitle' => $isVideo ? (string) $image->getData('video_title') : '',
                ];
            }

            return $result === [] ? [$this->placeholderEntry()] : $result;
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductView: getGalleryImages failed -- ' . $e->getMessage());
            return [];
        }
    }

    /**
     * The gallery entry of a product without images: the `image` placeholder
     * for every role, no companions (the placeholder is a theme or media
     * asset, never a cache resize with a WebP / AVIF sibling).
     *
     * @return array<string, mixed>
     */
    private function placeholderEntry(): array
    {
        $url = (string) $this->placeholderFactory->create(['type' => 'image'])->getUrl();

        return [
            'thumb' => $url,
            'img' => $url,
            'full' => $url,
            'thumbWebp' => '',
            'imgWebp' => '',
            'fullWebp' => '',
            'thumbAvif' => '',
            'imgAvif' => '',
            'fullAvif' => '',
            'label' => '',
            'position' => 0,
            'isMain' => true,
            'type' => 'image',
            'videoUrl' => '',
            'videoTitle' => '',
        ];
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
            $this->logger->error('Magentofullstackdev\Catalog ProductView: getProductName failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getSku(Product $product): string
    {
        try {
            return $this->escaper->escapeHtml((string) $product->getSku());
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductView: getSku failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getShortDescription(Product $product): string
    {
        try {
            return $this->renderAttribute($product, 'short_description');
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductView: getShortDescription failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getDescription(Product $product): string
    {
        try {
            return $this->renderAttribute($product, 'description');
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductView: getDescription failed -- ' . $e->getMessage());
            return '';
        }
    }

    /**
     * HTML attributes go through the catalog output helper, as in core's
     * attribute templates: it runs the template filter (media / widget
     * directives) and the PageBuilder filter that turns stored inline styles
     * into `data-pb-style` rules. The raw attribute value renders neither.
     *
     * @param Product $product
     * @param string $attributeCode
     * @return string
     */
    private function renderAttribute(Product $product, string $attributeCode): string
    {
        return $this->renderAttributeValue($product, (string) $product->getData($attributeCode), $attributeCode);
    }

    /**
     * Same processing for a value the caller already holds (attribute lists).
     *
     * @param Product $product
     * @param string $value
     * @param string $attributeCode
     * @return string
     */
    public function renderAttributeValue(Product $product, string $value, string $attributeCode): string
    {
        if ($value === '') {
            return '';
        }

        return (string) $this->outputHelper->productAttribute($product, $value, $attributeCode);
    }

    /**
     * @param Product $product
     * @return string
     */
    public function getAddToCartPostData(Product $product): string
    {
        try {
            return (string) $this->postHelper->getPostData(
                $this->urlBuilder->getUrl('checkout/cart/add'),
                ['product' => (int) $product->getId()]
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog ProductView: getAddToCartPostData failed -- ' . $e->getMessage()
            );
            return '';
        }
    }

    /**
     * @return string
     */
    public function getFormKey(): string
    {
        return '';
    }

    /**
     * @param int $attributeId
     * @return string
     */
    public function getSuperAttributeInputName(int $attributeId): string
    {
        return 'super_attribute[' . $attributeId . ']';
    }

    /**
     * @param Product $product
     * @return bool
     */
    public function isConfigurable(Product $product): bool
    {
        try {
            return $product->getTypeId() === 'configurable';
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog ProductView: isConfigurable failed -- ' . $e->getMessage());
            return false;
        }
    }
}
