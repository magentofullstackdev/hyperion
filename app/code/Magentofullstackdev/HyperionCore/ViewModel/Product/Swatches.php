<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel\Product;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Helper\Image as ImageHelper;
use Magento\Catalog\Model\Product as CatalogProduct;
use Magento\ConfigurableProduct\Model\Product\Type\Configurable as ConfigurableType;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Swatches\Helper\Data as SwatchesHelper;
use Magento\Swatches\Helper\Media as SwatchesMediaHelper;
use Psr\Log\LoggerInterface;

/**
 * Provides swatch data for configurable products rendered on listings.
 *
 * Two usage modes:
 *  - Visual preview strip (getVisualSwatches): compact color/image indicator linking to PDP.
 *  - Add-to-Cart panel (getListingTileData): full size + color options with
 *    super-attribute IDs and a color->image map for in-tile image swapping.
 */
class Swatches implements ArgumentInterface
{
    /** Max visible options in a row before overflow ellipsis. */
    public const MAX_VISIBLE_OPTIONS = 5;

    /** Magento swatch type constants (mirror \Magento\Swatches\Model\Swatch). */
    private const TYPE_TEXT          = 0;
    private const TYPE_VISUAL_COLOR  = 1;
    private const TYPE_VISUAL_IMAGE  = 2;

    public function __construct(
        private readonly SwatchesHelper $swatchesHelper,
        private readonly ImageHelper $imageHelper,
        private readonly SwatchesMediaHelper $swatchesMediaHelper,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Get visual swatches for the first swatch attribute of a configurable product.
     *
     * @return array<int, array{option_id: int, label: string, type: int, value: string}>
     */
    public function getVisualSwatches(ProductInterface $product): array
    {
        if (!$product instanceof CatalogProduct || $product->getTypeId() !== ConfigurableType::TYPE_CODE) {
            return [];
        }

        $swatchAttributes = $this->swatchesHelper->getSwatchAttributesAsArray($product);
        if (empty($swatchAttributes)) {
            return [];
        }

        foreach ($swatchAttributes as $attribute) {
            $options = $attribute['options'] ?? [];
            if (empty($options)) {
                continue;
            }

            $swatchData = $this->swatchesHelper->getSwatchesByOptionsId(array_keys($options));
            $visual = [];
            foreach ($options as $optionId => $optionLabel) {
                $swatch = $swatchData[$optionId] ?? null;
                $type = (int) ($swatch['type'] ?? self::TYPE_TEXT);
                $rawValue = (string) ($swatch['value'] ?? '');
                if ($type !== self::TYPE_VISUAL_COLOR && $type !== self::TYPE_VISUAL_IMAGE) {
                    continue;
                }
                $visual[] = [
                    'option_id' => (int) $optionId,
                    'label' => (string) $optionLabel,
                    'type' => $type,
                    'value' => $type === self::TYPE_VISUAL_IMAGE
                        ? $this->resolveSwatchImageUrl($rawValue)
                        : $rawValue,
                ];
            }

            if (!empty($visual)) {
                return $visual;
            }
        }

        return [];
    }

    /**
     * Full data needed to render an in-tile Add-to-Cart panel for configurables.
     *
     * Returns null for non-configurable products or configurables whose attributes
     * we cannot resolve (missing size/color, empty options).
     *
     * @return array{
     *     sizes: array{attribute_id:int, code:string, options: array<int, array{option_id:int, label:string}>}|null,
     *     colors: array{attribute_id:int, code:string, options: array<int, array{option_id:int, label:string, type:int, value:string}>}|null,
     *     color_images: array<int, string>
     * }|null
     */
    public function getListingTileData(ProductInterface $product): ?array
    {
        if (!$product instanceof CatalogProduct || $product->getTypeId() !== ConfigurableType::TYPE_CODE) {
            return null;
        }

        $typeInstance = $product->getTypeInstance();
        if (!$typeInstance instanceof ConfigurableType) {
            return null;
        }

        $attributes = $typeInstance->getConfigurableAttributesAsArray($product);
        if (empty($attributes)) {
            return null;
        }

        $sizes = null;
        $colors = null;

        foreach ($attributes as $attr) {
            $code = (string) ($attr['attribute_code'] ?? '');
            $attrId = (int) ($attr['attribute_id'] ?? 0);
            $options = $attr['options'] ?? [];
            if ($attrId <= 0 || empty($options)) {
                continue;
            }

            if ($this->isSizeCode($code) && $sizes === null) {
                $sizes = [
                    'attribute_id' => $attrId,
                    'code' => $code,
                    'options' => array_values(array_map(
                        static fn(array $o): array => [
                            'option_id' => (int) ($o['value_index'] ?? 0),
                            'label' => (string) ($o['label'] ?? ''),
                        ],
                        $options
                    )),
                ];
                continue;
            }

            if ($this->isColorCode($code) && $colors === null) {
                $optionIds = array_map(static fn(array $o) => (int) ($o['value_index'] ?? 0), $options);
                $swatchData = $this->swatchesHelper->getSwatchesByOptionsId($optionIds);
                $colorOpts = [];
                foreach ($options as $o) {
                    $optionId = (int) ($o['value_index'] ?? 0);
                    $swatch = $swatchData[$optionId] ?? null;
                    $type = (int) ($swatch['type'] ?? self::TYPE_TEXT);
                    $rawValue = (string) ($swatch['value'] ?? '');
                    // Image swatches store a relative path -- resolve to the full media URL
                    // so the template can render `background-image: url(...)`.
                    $value = $type === self::TYPE_VISUAL_IMAGE
                        ? $this->resolveSwatchImageUrl($rawValue)
                        : $rawValue;
                    $colorOpts[] = [
                        'option_id' => $optionId,
                        'label' => (string) ($o['label'] ?? ''),
                        'type' => $type,
                        'value' => $value,
                    ];
                }
                $colors = [
                    'attribute_id' => $attrId,
                    'code' => $code,
                    'options' => $colorOpts,
                ];
            }
        }

        if ($sizes === null && $colors === null) {
            return null;
        }

        $colorImages = [];
        if ($colors !== null) {
            $colorCode = $colors['code'];
            try {
                $children = $typeInstance->getUsedProducts($product);
            } catch (\Throwable $e) {
                $this->logger->error(
                    'Swatches::getListingTileData failed to load children of product ' . $product->getId(),
                    ['exception' => $e]
                );
                $children = [];
            }
            foreach ($children as $child) {
                if (!$child instanceof CatalogProduct) {
                    continue;
                }
                $colorValue = (int) $child->getData($colorCode);
                if ($colorValue <= 0 || isset($colorImages[$colorValue])) {
                    continue;
                }
                $image = (string) $child->getImage();
                if ($image === '' || $image === 'no_selection') {
                    continue;
                }
                try {
                    $colorImages[$colorValue] = $this->imageHelper
                        ->init($child, 'category_page_grid')
                        ->getUrl();
                } catch (\Throwable $e) {
                    $this->logger->error(
                        'Swatches::getListingTileData failed to resolve image of child product ' . $child->getId(),
                        ['exception' => $e]
                    );
                }
            }
        }

        return [
            'sizes' => $sizes,
            'colors' => $colors,
            'color_images' => $colorImages,
        ];
    }

    private function isSizeCode(string $code): bool
    {
        return $code === 'size' || str_contains(strtolower($code), 'size');
    }

    private function isColorCode(string $code): bool
    {
        return $code === 'color' || str_contains(strtolower($code), 'color');
    }

    /**
     * Resolve an image-swatch value (relative path like `/b/r/brown.jpg`) to a full
     * media URL via Magento\Swatches\Helper\Media. Returns empty string on failure.
     */
    private function resolveSwatchImageUrl(string $value): string
    {
        if ($value === '') {
            return '';
        }
        try {
            return (string) $this->swatchesMediaHelper->getSwatchAttributeImage('swatch_thumb', $value);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Swatches::resolveSwatchImageUrl failed for swatch image ' . $value,
                ['exception' => $e]
            );
            return '';
        }
    }
}
