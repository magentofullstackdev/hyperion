<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Model\Layer\Filter\FilterInterface;
use Magento\Catalog\Model\ResourceModel\Eav\Attribute;
use Magento\Framework\DataObject;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Swatches\Helper\Data as SwatchHelper;
use Magento\Swatches\Helper\Media as SwatchMediaHelper;
use Magento\Swatches\Model\Swatch;
use Psr\Log\LoggerInterface;

/**
 * Swatch data of a layered navigation filter: whether the filter's attribute
 * is a swatch attribute (visual or text) and, per option, what the chip shows.
 *
 * The layered navigation templates decide the markup and the classes; this
 * view model only hands them data: a `color` chip carries a validated hex
 * value (with `light` set for colours that need an inner ring on a white
 * card), an `image` chip the `swatch_thumb` media URL, a `text` chip the
 * swatch text (the option label when the option has no swatch of its own).
 */
class LayerFilterSwatches implements ArgumentInterface
{
    public const TYPE_COLOR = 'color';
    public const TYPE_IMAGE = 'image';
    public const TYPE_TEXT = 'text';

    /**
     * Relative luminance (0 black, 1 white) from which a colour chip gets an inner ring.
     */
    public const LIGHT_LUMINANCE = 0.8;

    /**
     * @param SwatchHelper $swatchHelper
     * @param SwatchMediaHelper $mediaHelper
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly SwatchHelper $swatchHelper,
        private readonly SwatchMediaHelper $mediaHelper,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Whether the filter belongs to a swatch attribute (visual or text).
     *
     * @param FilterInterface $filter
     * @return bool
     */
    public function isSwatchFilter(FilterInterface $filter): bool
    {
        $attribute = $this->getAttribute($filter);
        if ($attribute === null) {
            return false;
        }
        try {
            return $this->swatchHelper->isSwatchAttribute($attribute);
        } catch (\Throwable $e) {
            $this->logger->error('LayerFilterSwatches::isSwatchFilter -- ' . $e->getMessage());

            return false;
        }
    }

    /**
     * Whether the swatch attribute is a visual one (colour or image chips); text swatches render as pills.
     *
     * @param FilterInterface $filter
     * @return bool
     */
    public function isVisualSwatchFilter(FilterInterface $filter): bool
    {
        $attribute = $this->getAttribute($filter);
        if ($attribute === null) {
            return false;
        }
        try {
            return $this->swatchHelper->isVisualSwatch($attribute);
        } catch (\Throwable $e) {
            $this->logger->error('LayerFilterSwatches::isVisualSwatchFilter -- ' . $e->getMessage());

            return false;
        }
    }

    /**
     * The attribute code of the filter, '' when it has no attribute model.
     *
     * @param FilterInterface $filter
     * @return string
     */
    public function getAttributeCode(FilterInterface $filter): string
    {
        return (string) ($this->getAttribute($filter)?->getAttributeCode() ?? '');
    }

    /**
     * One entry per filter item, keyed by option id and in the filter's own order.
     *
     * @param FilterInterface $filter
     * @return array<int, array{type: string, value: string, label: string, count: int, light: bool}>
     */
    public function getSwatches(FilterInterface $filter): array
    {
        $items = [];
        foreach ($filter->getItems() as $item) {
            if (!$item instanceof DataObject) {
                continue;
            }
            $optionId = (int) $item->getData('value');
            if ($optionId > 0) {
                $items[$optionId] = $item;
            }
        }
        if ($items === []) {
            return [];
        }

        $swatches = [];
        try {
            $swatches = $this->swatchHelper->getSwatchesByOptionsId(array_keys($items));
        } catch (\Throwable $e) {
            $this->logger->error('LayerFilterSwatches::getSwatches -- ' . $e->getMessage());
        }

        $result = [];
        foreach ($items as $optionId => $item) {
            $label = trim(strip_tags((string) $item->getData('label')));
            $row = $swatches[$optionId] ?? null;
            [$type, $value] = $this->describe(is_array($row) ? $row : null, $label);
            $result[$optionId] = [
                'type' => $type,
                'value' => $value,
                'label' => $label,
                'count' => (int) $item->getData('count'),
                'light' => $type === self::TYPE_COLOR && $this->isLight($value),
            ];
        }

        return $result;
    }

    /**
     * Whether a hex colour is light enough to need an inner ring on a white card.
     *
     * @param string $hex `#rgb` or `#rrggbb`
     * @return bool
     */
    public function isLight(string $hex): bool
    {
        $digits = ltrim($hex, '#');
        if (strlen($digits) === 3) {
            $digits = $digits[0] . $digits[0] . $digits[1] . $digits[1] . $digits[2] . $digits[2];
        }
        if (!preg_match('/^[0-9a-f]{6}$/i', $digits)) {
            return false;
        }
        $channel = static function (string $pair): float {
            $value = hexdec($pair) / 255;

            return $value <= 0.03928 ? $value / 12.92 : (($value + 0.055) / 1.055) ** 2.4;
        };
        $luminance = 0.2126 * $channel(substr($digits, 0, 2))
            + 0.7152 * $channel(substr($digits, 2, 2))
            + 0.0722 * $channel(substr($digits, 4, 2));

        return $luminance >= self::LIGHT_LUMINANCE;
    }

    /**
     * Type and value of a chip from the swatch row of its option, the text label when there is none usable.
     *
     * @param array<string, mixed>|null $row a row of `eav_attribute_option_swatch` (`type`, `value`)
     * @param string $label
     * @return array{0: string, 1: string}
     */
    private function describe(?array $row, string $label): array
    {
        $value = trim((string) ($row['value'] ?? ''));
        if ($row === null || $value === '') {
            return [self::TYPE_TEXT, $label];
        }
        switch ((int) ($row['type'] ?? Swatch::SWATCH_TYPE_EMPTY)) {
            case Swatch::SWATCH_TYPE_VISUAL_COLOR:
                if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/i', $value)) {
                    return [self::TYPE_COLOR, strtolower($value)];
                }

                return [self::TYPE_TEXT, $label];
            case Swatch::SWATCH_TYPE_VISUAL_IMAGE:
                $url = $this->getImageUrl($value);

                return $url === '' ? [self::TYPE_TEXT, $label] : [self::TYPE_IMAGE, $url];
            case Swatch::SWATCH_TYPE_TEXTUAL:
                return [self::TYPE_TEXT, $value];
            default:
                return [self::TYPE_TEXT, $label];
        }
    }

    /**
     * The `swatch_thumb` URL of a swatch image file, '' when it cannot be resolved.
     *
     * @param string $file
     * @return string
     */
    private function getImageUrl(string $file): string
    {
        try {
            return (string) $this->mediaHelper->getSwatchAttributeImage(Swatch::SWATCH_THUMBNAIL_NAME, $file);
        } catch (\Throwable $e) {
            $this->logger->error('LayerFilterSwatches::getImageUrl -- ' . $e->getMessage());

            return '';
        }
    }

    /**
     * The EAV attribute of the filter, null for filters without one (category, price, decimal).
     *
     * `attribute_model` is read as data: core's `getAttributeModel()` throws
     * for the category filter, which is the expected case here, not an error.
     *
     * @param FilterInterface $filter
     * @return Attribute|null
     */
    private function getAttribute(FilterInterface $filter): ?Attribute
    {
        if (!$filter instanceof DataObject) {
            return null;
        }
        $attribute = $filter->getData('attribute_model');

        return $attribute instanceof Attribute ? $attribute : null;
    }
}
