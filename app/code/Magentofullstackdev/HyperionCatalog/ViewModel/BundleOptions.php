<?php
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev
declare(strict_types=1);

namespace Magentofullstackdev\HyperionCatalog\ViewModel;

use Magento\Bundle\Model\Option;
use Magento\Bundle\Model\Product\Price as BundlePrice;
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
     * Price a single selection adds to the bundle for its default quantity,
     * through Magento's bundle price model so fixed-price bundles, special
     * prices and catalog rules are honoured.
     */
    public function getSelectionPrice(Product $bundle, Product $selection): float
    {
        try {
            $priceModel = $bundle->getPriceModel();
            if (!$priceModel instanceof BundlePrice) {
                return (float) $selection->getFinalPrice();
            }
            $qty = (float) $selection->getData('selection_qty') ?: 1.0;
            // Display currency, like the formatted labels and the running total the component computes.
            return (float) $this->priceCurrency->convertAndRound(
                $priceModel->getSelectionFinalTotalPrice($bundle, $selection, 1.0, $qty, false)
            );
        } catch (\Throwable $e) {
            $this->logger->error('BundleOptions::getSelectionPrice', ['exception' => $e]);
            return 0.0;
        }
    }

    /**
     * Fixed-price bundles start from the bundle's own price; dynamic ones
     * from zero.
     */
    public function getBasePrice(Product $bundle): float
    {
        return (int) $bundle->getData('price_type') === BundlePrice::PRICE_TYPE_FIXED
            ? (float) $this->priceCurrency->convertAndRound($bundle->getFinalPrice())
            : 0.0;
    }

    public function format(float $amount): string
    {
        try {
            return (string) $this->priceCurrency->convertAndFormat($amount, false);
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
