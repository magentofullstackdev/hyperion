<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCore\ViewModel;

use Magento\Catalog\Api\Data\ProductInterface;
use Magento\Catalog\Model\Product as CatalogProduct;
use Magento\Catalog\Pricing\Price\FinalPrice;
use Magento\ConfigurableProduct\Model\Product\Type\Configurable as ConfigurableType;
use Magento\Framework\Pricing\Helper\Data as PricingHelper;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magentofullstackdev\HyperionCore\Model\Cache\DegradedResponse;
use Psr\Log\LoggerInterface;

class Pricing implements ArgumentInterface
{
    /** @var array<int, array{0:float,1:float}> */
    private array $lowestPriceCache = [];

    public function __construct(
        private readonly PricingHelper $pricingHelper,
        private readonly LoggerInterface $logger,
        private readonly DegradedResponse $degradedResponse
    ) {
    }

    public function currency(float $amount, bool $format = true, bool $includeContainer = true): string
    {
        return (string) $this->pricingHelper->currency($amount, $format, $includeContainer);
    }

    /**
     * Render a product's price.
     *
     * Behavior:
     *  - Configurable: bare lowest child final price (Hyva style, no "From" prefix).
     *  - Grouped / bundle: "Starting at" / "From" the minimal final price of the price index.
     *  - Discounted (catalog rule / special price): final bolder + regular struck-through.
     *  - Simple / everything else: single price.
     */
    public function getProductPriceHtml(ProductInterface $product): string
    {
        try {
            return $this->renderProductPrice($product);
        } catch (\Throwable $e) {
            $this->logger->error(
                'Magentofullstackdev\HyperionCore Pricing: render failed for product '
                . (int) $product->getId() . ' -- ' . $e->getMessage()
            );
            // Shown once, never stored: see DegradedResponse.
            $this->degradedResponse->mark();
            return '<span class="price">--</span>';
        }
    }

    private function renderProductPrice(ProductInterface $product): string
    {
        if (!$product instanceof CatalogProduct) {
            // Only the catalog model carries final prices and type instances.
            return $this->renderSingle((float) $product->getPrice());
        }

        if ($product->getTypeId() === ConfigurableType::TYPE_CODE) {
            $prices = $this->getLowestChildPricePair($product);
            if ($prices === null) {
                return $this->renderSingle((float) $product->getFinalPrice());
            }
            [$final, $regular] = $prices;
            if ($regular > 0 && $final > 0 && $final < $regular) {
                return $this->renderDiscounted($final, $regular);
            }
            return $this->renderSingle($final);
        }

        // Types whose own price is 0: the price to show is the lowest price the
        // shopper can pay, from the price index, behind core's label for the type.
        $label = match ($product->getTypeId()) {
            'grouped' => __('Starting at'),
            'bundle' => __('From'),
            default => null,
        };
        if ($label !== null) {
            $minimal = $this->getMinimalFinalPrice($product);
            if ($minimal !== null) {
                return $this->renderFrom($minimal, (string) $label);
            }
        }

        $regular = (float) $product->getPrice();
        $final = (float) $product->getFinalPrice();

        if ($regular <= 0 && $final <= 0) {
            return $this->renderSingle(0.0);
        }

        if ($final > 0 && $regular > 0 && $final < $regular) {
            return $this->renderDiscounted($final, $regular);
        }

        return $this->renderSingle($final > 0 ? $final : $regular);
    }

    /**
     * Lowest child final/regular price pair for a configurable product.
     * Returns [final, regular] so callers can detect discounts.
     *
     * @return array{0:float,1:float}|null
     */
    private function getLowestChildPricePair(CatalogProduct $product): ?array
    {
        $productId = (int) $product->getId();
        if (isset($this->lowestPriceCache[$productId])) {
            return $this->lowestPriceCache[$productId];
        }

        $typeInstance = $product->getTypeInstance();
        if (!$typeInstance instanceof ConfigurableType) {
            return null;
        }

        $children = $typeInstance->getUsedProducts($product);
        if (empty($children)) {
            return null;
        }

        $lowestFinal = null;
        $matchedRegular = 0.0;
        foreach ($children as $child) {
            if (!$child instanceof CatalogProduct) {
                continue;
            }
            $childFinal = (float) $child->getFinalPrice();
            $childRegular = (float) $child->getPrice();
            if ($childFinal <= 0) {
                continue;
            }
            if ($lowestFinal === null || $childFinal < $lowestFinal) {
                $lowestFinal = $childFinal;
                $matchedRegular = $childRegular;
            }
        }

        if ($lowestFinal === null) {
            return null;
        }

        $pair = [$lowestFinal, $matchedRegular];
        $this->lowestPriceCache[$productId] = $pair;
        return $pair;
    }

    /**
     * Lowest final price of a grouped or bundle product (the cheapest
     * associated product, the cheapest valid bundle selection), null when the
     * price index has none.
     */
    private function getMinimalFinalPrice(CatalogProduct $product): ?float
    {
        $finalPrice = $product->getPriceInfo()->getPrice(FinalPrice::PRICE_CODE);
        if (!$finalPrice instanceof FinalPrice) {
            return null;
        }
        $minimal = (float) $finalPrice->getMinimalPrice()->getValue();

        return $minimal > 0 ? $minimal : null;
    }

    private function renderFrom(float $price, string $label): string
    {
        return sprintf(
            '<span class="hyperion-price inline-flex items-baseline gap-1">'
                . '<span class="text-sm font-normal text-muted">%s</span>'
                . '<span>%s</span>'
            . '</span>',
            $this->escape($label),
            $this->escape($this->currency($price, true, false))
        );
    }

    private function renderSingle(float $price): string
    {
        return sprintf(
            '<span class="hyperion-price">%s</span>',
            $this->escape($this->currency($price, true, false))
        );
    }

    private function renderDiscounted(float $final, float $regular): string
    {
        return sprintf(
            '<span class="hyperion-price hyperion-price--sale inline-flex items-baseline gap-2">'
                . '<span class="text-secondary font-extrabold">%s</span>'
                . '<span class="text-muted line-through font-normal">%s</span>'
            . '</span>',
            $this->escape($this->currency($final, true, false)),
            $this->escape($this->currency($regular, true, false))
        );
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
