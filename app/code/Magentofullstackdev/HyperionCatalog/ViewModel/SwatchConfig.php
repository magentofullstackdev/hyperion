<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Catalog\Model\Product;
use Magento\Framework\Json\EncoderInterface;
use Magento\Framework\Registry;
use Magento\Swatches\Block\Product\Renderer\ConfigurableFactory as SwatchesRendererFactory;
use Magento\Swatches\Model\SwatchAttributesProvider;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Framework\Module\Manager as ModuleManager;
use Magento\Framework\ObjectManagerInterface;
use Psr\Log\LoggerInterface;

class SwatchConfig implements ArgumentInterface
{
    /**
     * The config array built per product and mode (the skeleton reads it after the attribute).
     *
     * @var array<string, array<string, mixed>>
     */
    private array $lastConfig = [];

    /**
     * @param SwatchesRendererFactory $swatchesBlockFactory
     * @param EncoderInterface $jsonEncoder
     * @param Registry $registry
     * @param SwatchAttributesProvider $swatchAttributesProvider
     * @param LoggerInterface $logger
     * @param ModuleManager $moduleManager
     * @param ObjectManagerInterface $objectManager
     * @param Stock $stock
     */
    public function __construct(
        private readonly SwatchesRendererFactory $swatchesBlockFactory,
        private readonly EncoderInterface $jsonEncoder,
        private readonly Registry $registry,
        private readonly SwatchAttributesProvider $swatchAttributesProvider,
        private readonly LoggerInterface $logger,
        private readonly ModuleManager $moduleManager,
        private readonly ObjectManagerInterface $objectManager,
        private readonly Stock $stock
    ) {
    }

    private const MSRP_HELPER_CLASS = 'Magento\Msrp\Helper\Data';

    /**
     * MAP state of the variants whose price must stay hidden: `{childId:
     * {gesture: bool, message: string}}`. `optionPrices[child].msrpPrice`
     * (core) carries the amount. Empty when Magento_Msrp is absent or no
     * variant hides its price.
     *
     * @param \Magento\Swatches\Block\Product\Renderer\Configurable $swatchBlock
     * @return array<int, array{gesture: bool, message: string}>
     */
    private function getMsrpConfig($swatchBlock): array
    {
        if (!$this->moduleManager->isEnabled('Magento_Msrp') || !class_exists(self::MSRP_HELPER_CLASS)) {
            return [];
        }
        $helper = $this->objectManager->get(self::MSRP_HELPER_CLASS);
        $msrp = [];
        foreach ($swatchBlock->getAllowProducts() as $child) {
            if (!$helper->canApplyMsrp($child) || !$helper->isMinimalPriceLessMsrp($child)) {
                continue;
            }
            $msrp[(int) $child->getId()] = [
                'gesture' => (bool) $helper->isShowPriceOnGesture($child),
                'message' => (string) $helper->getMsrpPriceMessage($child),
            ];
        }

        return $msrp;
    }

    /**
     * "Only N left" per variant, `{childId: message}`, for the children whose
     * stock is within `cataloginventory/options/stock_threshold_qty`: the same
     * rule and the same stock source as the notice of a simple product
     * (ViewModel\Stock). Empty when no threshold is configured, so the
     * component shows nothing. Skipped for the compact tile config: a tile
     * has no stock line and the variants of every tile would cost a stock
     * read each.
     *
     * @param \Magento\Swatches\Block\Product\Renderer\Configurable $swatchBlock
     * @return array<int, string>
     */
    private function getStockNotices($swatchBlock): array
    {
        if ($this->stock->getThresholdQty() <= 0) {
            return [];
        }
        $notices = [];
        foreach ($swatchBlock->getAllowProducts() as $child) {
            if (!$this->stock->isLowStockVisible($child)) {
                continue;
            }
            $left = rtrim(rtrim(number_format($this->stock->getStockQtyLeft($child), 2, '.', ''), '0'), '.');
            $notices[(int) $child->getId()] = (string) __('Only %1 left', $left);
        }

        return $notices;
    }

    /**
     * Swatch + configurable config for <hyperion-swatches>.
     *
     * `$compact` is for product list tiles: a tile only swaps its single image
     * when a variant is picked, so each variant keeps just the main image URL
     * instead of the whole gallery in three sizes. On a 12 product page that
     * is well over 100 KB of HTML less.
     *
     * @param Product $product
     * @param bool $compact
     * @return string
     */
    public function getSerializedConfig(Product $product, bool $compact = false): string
    {
        try {
            if ($product->getTypeId() !== 'configurable') {
                return '{}';
            }

            $registeredProduct = $this->registry->registry('current_product');
            $wasRegistered = $registeredProduct !== null;

            if (!$wasRegistered) {
                $this->registry->register('current_product', $product, true);
            }

            $swatchBlock = $this->swatchesBlockFactory->create();
            $swatchBlock->setProduct($product);

            $jsonConfig = $swatchBlock->getJsonConfig();
            $jsonSwatch = $swatchBlock->getJsonSwatchConfig();

            $config = (array) json_decode($jsonConfig, true);
            $swatches = (array) json_decode($jsonSwatch, true);
            $defaultValues = $this->getDefaultValues($product, $config);

            $merged = [
                'productId' => (string) $product->getId(),
                'sku' => (string) $product->getSku(),
                'currencyFormat' => (string) ($config['currencyFormat'] ?? ''),
                // Core's number format of the store view and currency (pattern, decimal and group
                // symbols, precision): the component rewrites a server-rendered price and must print
                // it the way PHP did.
                'priceFormat' => is_array($config['priceFormat'] ?? null) ? $config['priceFormat'] : null,
                'attributes' => $config['attributes'] ?? [],
                'optionPrices' => $config['optionPrices'] ?? [],
                'images' => $compact ? $this->mainImagesOnly($config['images'] ?? []) : ($config['images'] ?? []),
                'index' => $config['index'] ?? [],
                'swatches' => $swatches,
                // Labels the component prints itself (shadow DOM), translated here.
                'labels' => [
                    'regularPrice' => (string) __('Regular Price'),
                    'clickForPrice' => (string) __('Click for price'),
                ],
            ];
            if ($defaultValues !== []) {
                $merged['defaultValues'] = $defaultValues;
            }
            $msrp = $this->getMsrpConfig($swatchBlock);
            if ($msrp !== []) {
                $merged['msrp'] = $msrp;
            }
            $stockNotices = $compact ? [] : $this->getStockNotices($swatchBlock);
            if ($stockNotices !== []) {
                $merged['stockNotices'] = $stockNotices;
            }

            $this->lastConfig[$this->configKey($product, $compact)] = $merged;

            return (string) $this->jsonEncoder->encode($merged);
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog SwatchConfig: getSerializedConfig failed -- ' . $e->getMessage());
            return '{}';
        }
    }

    /**
     * Options preselected by a buy request, `{attributeId: optionId}`.
     *
     * A product initialized with a buy request (wish list item edit) carries
     * its options as preconfigured values; core's configurable block adds
     * them to its JSON config as `defaultValues`, the buy request itself is
     * the fallback. <hyperion-swatches> applies them on first render.
     *
     * @param Product $product
     * @param array<string, mixed> $config
     * @return array<string, string>
     */
    private function getDefaultValues(Product $product, array $config): array
    {
        $values = (array) ($config['defaultValues'] ?? []);
        if ($values === []) {
            $values = (array) $product->getPreconfiguredValues()->getData('super_attribute');
        }

        $result = [];
        foreach ($values as $attributeId => $optionId) {
            if ($optionId !== null && $optionId !== '' && !is_array($optionId)) {
                $result[(string) $attributeId] = (string) $optionId;
            }
        }

        return $result;
    }

    /**
     * Keep one `{img, caption, isMain}` entry per variant.
     *
     * @param array<int|string, array<int, array<string, mixed>>> $images
     * @return array<int|string, array<int, array<string, mixed>>>
     */
    private function mainImagesOnly(array $images): array
    {
        $result = [];
        foreach ($images as $variantId => $gallery) {
            $main = null;
            foreach ((array) $gallery as $image) {
                if (!empty($image['isMain'])) {
                    $main = $image;
                    break;
                }
                $main ??= $image;
            }
            if ($main !== null) {
                $result[$variantId] = [[
                    'img' => (string) ($main['img'] ?? $main['full'] ?? $main['thumb'] ?? ''),
                    'caption' => (string) ($main['caption'] ?? ''),
                    'isMain' => true,
                ]];
            }
        }

        return $result;
    }

    /**
     * @param Product $product
     * @return bool
     */
    public function isConfigurableWithSwatches(Product $product): bool
    {
        try {
            if ($product->getTypeId() !== 'configurable') {
                return false;
            }

            $swatchAttributes = $this->swatchAttributesProvider->provide($product);
            return count($swatchAttributes) > 0;
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog SwatchConfig: isConfigurableWithSwatches failed -- ' . $e->getMessage()
            );
            return false;
        }
    }

    /**
     * The serialized config, escaped for use as an HTML attribute value.
     *
     * @param Product $product
     * @param bool $compact see getSerializedConfig()
     * @return string
     */
    /**
     * The swatch rows of a product as the component will render them, for the
     * server side skeleton that holds the tile's final height before the
     * component's chunk arrives (no layout shift): one row per attribute, every
     * option with the text the component prints (textual swatch value or
     * label) and whether it is a visual chip.
     *
     * @return array<int, array{label: string, options: array<int, array{text: string, visual: bool}>}>
     */
    public function getSkeletonRows(Product $product, bool $compact = false): array
    {
        try {
            $key = $this->configKey($product, $compact);
            if (!isset($this->lastConfig[$key])) {
                $this->getSerializedConfig($product, $compact);
            }
            $config = $this->lastConfig[$key] ?? [];
            $attributes = (array) ($config['attributes'] ?? []);
            $swatches = (array) ($config['swatches'] ?? []);
            $rows = [];
            uasort($attributes, static fn ($a, $b) => (int) ($a['position'] ?? 0) <=> (int) ($b['position'] ?? 0));
            foreach ($attributes as $attribute) {
                $attributeId = (string) ($attribute['id'] ?? '');
                $options = [];
                foreach ((array) ($attribute['options'] ?? []) as $option) {
                    $optionId = (string) ($option['id'] ?? '');
                    $meta = (array) ($swatches[$attributeId][$optionId] ?? []);
                    $type = (string) ($meta['type'] ?? '');
                    $value = (string) ($meta['value'] ?? '');
                    $visual = in_array($type, ['1', '2'], true) && $value !== '';
                    $options[] = [
                        'text' => $visual ? '' : ($type === '0' && $value !== '' ? $value : (string) ($option['label'] ?? '')),
                        'visual' => $visual,
                    ];
                }
                if ($options !== []) {
                    $rows[] = ['label' => (string) ($attribute['label'] ?? ''), 'options' => $options];
                }
            }

            return $rows;
        } catch (\Throwable $e) {
            $this->logger->error('Magentofullstackdev\Catalog SwatchConfig: getSkeletonRows failed -- ' . $e->getMessage());

            return [];
        }
    }

    private function configKey(Product $product, bool $compact): string
    {
        return (int) $product->getId() . ($compact ? ':compact' : ':full');
    }

    public function getEncodedConfigAttribute(Product $product, bool $compact = false): string
    {
        try {
            return htmlspecialchars(
                $this->getSerializedConfig($product, $compact),
                ENT_QUOTES | ENT_SUBSTITUTE,
                'UTF-8'
            );
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\Catalog SwatchConfig: getEncodedConfigAttribute failed -- ' . $e->getMessage()
            );
            return '{}';
        }
    }
}
