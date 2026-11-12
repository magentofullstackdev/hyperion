<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Bundle\Model\Option;
use Magento\Bundle\Model\Product\Price as BundlePrice;
use Magento\Bundle\Pricing\Price\BundleOptionPrice;
use Magento\Bundle\Pricing\Price\FinalPrice as BundleFinalPrice;
use Magento\Catalog\Model\Product;
use Magento\Framework\Locale\ResolverInterface as LocaleResolver;
use Magento\Framework\Pricing\PriceCurrencyInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\StoreManagerInterface;
use Psr\Log\LoggerInterface;

/**
 * Prices and formatting for the server-rendered bundle option form
 * (Magento_Bundle::catalog/product/view/type/bundle/options.phtml).
 */
class BundleOptions implements ArgumentInterface
{
    public function __construct(
        private readonly PriceCurrencyInterface $priceCurrency,
        private readonly StoreManagerInterface $storeManager,
        private readonly LocaleResolver $localeResolver,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Price a single selection adds to the bundle for its default quantity:
     * the amount of core's bundle option price (the one its own option block
     * renders), so it carries the catalog tax display adjustment, special
     * prices and catalog rules, and is already in the display currency.
     */
    public function getSelectionPrice(Product $bundle, Product $selection): float
    {
        try {
            $optionPrice = $bundle->getPriceInfo()->getPrice(BundleOptionPrice::PRICE_CODE);
            if (!$optionPrice instanceof BundleOptionPrice) {
                return 0.0;
            }
            $qty = (float) $selection->getData('selection_qty') ?: 1.0;

            // Core documents the selection model here but passes, and reads, the selection product.
            // @phpstan-ignore-next-line argument.type
            return (float) $optionPrice->getOptionSelectionAmount($selection)->getValue() * $qty;
        } catch (\Throwable $e) {
            $this->logger->error('BundleOptions::getSelectionPrice', ['exception' => $e]);
            return 0.0;
        }
    }

    /**
     * Fixed-price bundles start from the bundle's own price (the price info
     * amount without options, display currency, tax display applied);
     * dynamic ones from zero.
     */
    public function getBasePrice(Product $bundle): float
    {
        try {
            if ((int) $bundle->getData('price_type') !== BundlePrice::PRICE_TYPE_FIXED) {
                return 0.0;
            }
            $finalPrice = $bundle->getPriceInfo()->getPrice(BundleFinalPrice::PRICE_CODE);

            return $finalPrice instanceof BundleFinalPrice
                ? (float) $finalPrice->getPriceWithoutOption()->getValue()
                : (float) $finalPrice->getAmount()->getValue();
        } catch (\Throwable $e) {
            $this->logger->error('BundleOptions::getBasePrice', ['exception' => $e]);
            return 0.0;
        }
    }

    /**
     * Format an amount that is already in the display currency (what
     * getSelectionPrice() and getBasePrice() return): no conversion.
     */
    public function format(float $amount): string
    {
        try {
            return (string) $this->priceCurrency->format($amount, false);
        } catch (\Throwable $e) {
            $this->logger->error('BundleOptions::format', ['exception' => $e]);
            return (string) $amount;
        }
    }

    public function getCurrencyCode(): string
    {
        try {
            $store = $this->storeManager->getStore();
            return $store instanceof \Magento\Store\Model\Store ? (string) $store->getCurrentCurrencyCode() : '';
        } catch (\Throwable $e) {
            $this->logger->warning('BundleOptions::getCurrencyCode', ['exception' => $e]);
            return '';
        }
    }

    public function getLocale(): string
    {
        return str_replace('_', '-', (string) $this->localeResolver->getLocale());
    }

    /**
     * The selections the buy request of the item being edited (cart line
     * "Edit", wish list item edit) chose for an option, as selection ids;
     * an empty list when the shopper chose none of them. Null when the
     * product carries no buy request: the admin defaults apply then.
     *
     * @param Product $bundle
     * @param Option $option
     * @return string[]|null
     */
    public function getPreselectedSelectionIds(Product $bundle, Option $option): ?array
    {
        if (!$bundle->hasData('preconfigured_values')) {
            return null;
        }
        $chosen = $bundle->getPreconfiguredValues()->getData('bundle_option/' . (int) $option->getOptionId());
        $ids = [];
        foreach ((array) $chosen as $selectionId) {
            if (is_scalar($selectionId) && (int) $selectionId > 0) {
                $ids[] = (string) (int) $selectionId;
            }
        }

        return $ids;
    }

    /**
     * The quantity the buy request of the item being edited set for an
     * option, null when it carries none (the selection's own quantity applies).
     *
     * @param Product $bundle
     * @param Option $option
     * @return float|null
     */
    public function getPreselectedQty(Product $bundle, Option $option): ?float
    {
        if (!$bundle->hasData('preconfigured_values')) {
            return null;
        }
        $qty = $bundle->getPreconfiguredValues()->getData('bundle_option_qty/' . (int) $option->getOptionId());

        return is_numeric($qty) && (float) $qty > 0 ? (float) $qty : null;
    }
}
